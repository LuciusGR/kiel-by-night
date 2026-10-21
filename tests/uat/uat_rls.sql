-- Kiel by Night · UAT der Rechte (RLS/GRANT/Storage).
-- Läuft lokal mit `node run_rls.mjs` (PGlite mit Nachbau von auth/storage). NICHT gegen die echte Datenbank
-- ausführen: Das Skript legt Testkonten in auth.users an und wird von der Plattform zu Recht blockiert.
-- Alles läuft in EINER Transaktion und endet absichtlich mit einer Exception (Rollback).
-- Ergebnis steht in der Fehlermeldung "UAT total=… pass=… fail=…".
create temp table res(tid text, descr text, expect text, got text, pass boolean);

create function pg_temp.q(tid text, descr text, uid uuid, rl text, sql text, expect text) returns void language plpgsql as $f$
declare got text; n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', rl)::text, true);
  execute 'set local role ' || rl;
  begin
    if left(lower(sql), 6) = 'select' then execute sql into n; got := 'n=' || n;
    else execute sql; get diagnostics n = row_count; got := 'rows=' || n; end if;
  exception when others then got := 'err:' || sqlstate;
  end;
  execute 'reset role';
  insert into pg_temp.res values (tid, descr, expect, got,
    exists (select 1 from unnest(string_to_array(expect, '|')) e where got = e or (e = 'err' and got like 'err:%')));
end $f$;

do $uat$
declare
  st uuid := '11111111-1111-1111-1111-111111111111'; -- Platzhalter-ST für den lokalen Test
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); nop uuid := gen_random_uuid();
  catpub uuid; catst uuid; pg_pub uuid; pg_st uuid; pg_p1 uuid; sn1 uuid; sn2 uuid;
  ch1 uuid; ch2 uuid; ch3 uuid; nA uuid; nB uuid; eAB uuid;
  nchars int; nprof int; nnodes int; ncatpub int;
  chr_run uuid; chr_draft uuid; chap_run uuid; chap_draft uuid; sc1 uuid;
  rep text;
begin
  -- ---------- Fixtures (als postgres, werden zurückgerollt) ----------
  insert into auth.users(id, aud, role, email) values
    (p1, 'authenticated', 'authenticated', 'uat-p1@example.invalid'),
    (p2, 'authenticated', 'authenticated', 'uat-p2@example.invalid'),
    (nop, 'authenticated', 'authenticated', 'uat-noprofile@example.invalid');
  insert into public.profiles(id, display_name, role) values (p1, 'UAT P1', 'player'), (p2, 'UAT P2', 'player');
  update public.characters set owner_id = p1 where clan = 'Tremere';
  update public.characters set owner_id = p2 where clan = 'Ventrue';
  update public.characters set owner_id = null where clan = 'Malkavian';
  select id into ch1 from public.characters where clan = 'Tremere';
  select id into ch2 from public.characters where clan = 'Ventrue';
  select id into ch3 from public.characters where clan = 'Malkavian';
  select id into catpub from public.wiki_categories where name = 'Personen';
  select id into catst from public.wiki_categories where st_only limit 1;
  insert into public.wiki_pages(category_id, title, body, created_by, updated_by) values (catpub, 'UAT pub', 'x', st, st) returning id into pg_pub;
  insert into public.wiki_pages(category_id, title, body, created_by, updated_by) values (catst, 'UAT st', 'x', st, st) returning id into pg_st;
  insert into public.wiki_pages(category_id, title, body, created_by, updated_by) values (catpub, 'UAT p1', 'x', p1, p1) returning id into pg_p1;
  insert into public.session_notes(session_number, author_id, body) values (1, p1, 'n1') returning id into sn1;
  insert into public.session_notes(session_number, author_id, body) values (1, p2, 'n2') returning id into sn2;
  insert into public.private_notes(owner_id, title, body) values (p1, 'UAT pn1', 'b'), (p2, 'UAT pn2', 'b');
  insert into public.documents(title, storage_path, draft, uploader_id) values
    ('UAT draft', st::text || '/draft.pdf', true, st),
    ('UAT pub', st::text || '/pub.pdf', false, st),
    ('UAT p1doc', p1::text || '/own.pdf', false, p1);
  insert into storage.objects(bucket_id, name) values
    ('documents', st::text || '/draft.pdf'), ('documents', st::text || '/pub.pdf'),
    ('documents', p1::text || '/own.pdf'), ('documents', p2::text || '/p2.pdf');
  insert into public.player_map_nodes(label) values ('UAT A') returning id into nA;
  insert into public.player_map_nodes(label) values ('UAT B') returning id into nB;
  insert into public.player_map_edges(from_node, to_node) values (nA, nB) returning id into eAB;
  insert into public.map_positions(scope, node_key, x, y) values ('player', 'uat-k', 1, 1), ('st', 'uat-s', 1, 1);
  select count(*) into nchars from public.characters;
  select count(*) into nprof from public.profiles;
  select count(*) into nnodes from public.player_map_nodes;
  select count(*) into ncatpub from public.wiki_categories where not st_only;
  insert into public.chronicles(title, status) values ('UAT laufend', 'running') returning id into chr_run;
  insert into public.chronicles(title, status) values ('UAT Entwurf', 'draft') returning id into chr_draft;
  insert into public.chapters(chronicle_id, number, title) values (chr_run, 1, 'UAT K1') returning id into chap_run;
  insert into public.chapters(chronicle_id, number, title) values (chr_draft, 1, 'UAT K1 Entwurf') returning id into chap_draft;
  insert into public.session_info(session_number, chronicle_id, chapter_id, summary) values
    (9201, chr_run, chap_run, 'UAT Zusammenfassung'), (9202, chr_draft, chap_draft, 'UAT geheim'), (9203, null, null, 'UAT ohne Chronik');
  insert into public.scenes(session_number, position, title) values (9201, 1, 'UAT Szene 1') returning id into sc1;
  insert into public.scenes(session_number, position, title) values (9201, 2, 'UAT Szene 2');
  insert into public.scenes(position, title) values (1, 'UAT Vorrat Fix');
  insert into public.scene_npcs(scene_id, notion_id, name, motivation) values (sc1, 'abc', 'UAT NPC', 'Motiv');

  -- ---------- A: anonym ----------
  perform pg_temp.q('R01', 'anon liest characters', null, 'anon', 'select count(*) from public.characters', 'err');
  perform pg_temp.q('R02', 'anon liest profiles', null, 'anon', 'select count(*) from public.profiles', 'err');
  perform pg_temp.q('R03', 'anon liest notion_cache', null, 'anon', 'select count(*) from public.notion_cache', 'err');
  perform pg_temp.q('R04', 'anon legt Wiki-Kategorie an', null, 'anon', $x$insert into public.wiki_categories(name) values ('x')$x$, 'err');
  perform pg_temp.q('R05', 'anon darf ping()', null, 'anon', 'select count(*) from (select public.ping() as v) s where v is not null', 'n=1');
  perform pg_temp.q('R06', 'anon darf is_st() nicht', null, 'anon', 'select count(*) from (select public.is_st() as v) s where v is not null', 'err');
  perform pg_temp.q('R07', 'anon liest storage.objects', null, 'anon', 'select count(*) from storage.objects', 'n=0|err');
  perform pg_temp.q('R08', 'anon liest documents', null, 'anon', 'select count(*) from public.documents', 'err');
  perform pg_temp.q('R09', 'anon liest map_positions', null, 'anon', 'select count(*) from public.map_positions', 'err');

  -- ---------- B: angemeldet ohne Profil ----------
  perform pg_temp.q('R10', 'ohne Profil: characters', nop, 'authenticated', 'select count(*) from public.characters', 'n=0');
  perform pg_temp.q('R11', 'ohne Profil: profiles', nop, 'authenticated', 'select count(*) from public.profiles', 'n=0');
  perform pg_temp.q('R12', 'ohne Profil: sessions', nop, 'authenticated', 'select count(*) from public.sessions', 'n=0');
  perform pg_temp.q('R13', 'ohne Profil: wiki_categories', nop, 'authenticated', 'select count(*) from public.wiki_categories', 'n=0');
  perform pg_temp.q('R14', 'ohne Profil: wiki_pages', nop, 'authenticated', 'select count(*) from public.wiki_pages', 'n=0');
  perform pg_temp.q('R15', 'ohne Profil: documents', nop, 'authenticated', 'select count(*) from public.documents', 'n=0');
  perform pg_temp.q('R16', 'ohne Profil: player_map_nodes', nop, 'authenticated', 'select count(*) from public.player_map_nodes', 'n=0');
  perform pg_temp.q('R17', 'ohne Profil: map_positions', nop, 'authenticated', 'select count(*) from public.map_positions', 'n=0');
  perform pg_temp.q('R18', 'ohne Profil: notion_cache', nop, 'authenticated', 'select count(*) from public.notion_cache', 'n=0');
  perform pg_temp.q('R19', 'ohne Profil: private_notes', nop, 'authenticated', 'select count(*) from public.private_notes', 'n=0');
  perform pg_temp.q('R20', 'ohne Profil: session_notes', nop, 'authenticated', 'select count(*) from public.session_notes', 'n=0');
  perform pg_temp.q('R21', 'ohne Profil: storage.objects', nop, 'authenticated', $x$select count(*) from storage.objects where bucket_id = 'documents'$x$, 'n=0');
  perform pg_temp.q('R22', 'ohne Profil: Wiki-Kategorie anlegen', nop, 'authenticated', $x$insert into public.wiki_categories(name) values ('x')$x$, 'err');
  perform pg_temp.q('R23', 'ohne Profil: Karten-Knoten anlegen', nop, 'authenticated', $x$insert into public.player_map_nodes(label) values ('x')$x$, 'err');
  perform pg_temp.q('R24', 'ohne Profil: Session anlegen', nop, 'authenticated', 'insert into public.sessions(number) values (9100)', 'err');
  perform pg_temp.q('R25', 'ohne Profil: Position schreiben', nop, 'authenticated', $x$insert into public.map_positions(scope,node_key,x,y) values ('player','z',1,1)$x$, 'err');
  perform pg_temp.q('R26', 'ohne Profil: private Notiz', nop, 'authenticated', $x$insert into public.private_notes(title) values ('x')$x$, 'err');
  perform pg_temp.q('R27', 'ohne Profil: is_member() ist false', nop, 'authenticated', 'select count(*) from (select 1 where public.is_member()) s', 'n=0');
  perform pg_temp.q('R28', 'ohne Profil: Upload in eigenen Ordner', nop, 'authenticated', format($x$insert into storage.objects(bucket_id,name) values ('documents', %L)$x$, nop::text || '/x.pdf'), 'err');

  -- ---------- C: Spieler 1 ----------
  perform pg_temp.q('R30', 'Spieler: sieht alle Bögen', p1, 'authenticated', 'select count(*) from public.characters', 'n=' || nchars);
  perform pg_temp.q('R31', 'Spieler: eigenen Bogen ändern', p1, 'authenticated', format($x$update public.characters set sheet = '{"hunger":3}' where id = %L$x$, ch1), 'rows=1');
  perform pg_temp.q('R32', 'Spieler: fremden Bogen ändern', p1, 'authenticated', format($x$update public.characters set sheet = '{"hunger":9}' where id = %L$x$, ch2), 'rows=0');
  perform pg_temp.q('R33', 'Spieler: fremden Bogen übernehmen', p1, 'authenticated', format('update public.characters set owner_id = %L where id = %L', p1, ch2), 'rows=0');
  perform pg_temp.q('R34', 'Spieler: eigenen Bogen verschenken', p1, 'authenticated', format('update public.characters set owner_id = %L where id = %L', p2, ch1), 'err');
  perform pg_temp.q('R35', 'Spieler: Bogen anlegen', p1, 'authenticated', $x$insert into public.characters(name) values ('x')$x$, 'err');
  perform pg_temp.q('R36', 'Spieler: Bogen löschen', p1, 'authenticated', format('delete from public.characters where id = %L', ch1), 'rows=0');
  perform pg_temp.q('R37', 'Spieler: Bogen ohne Besitzer ändern', p1, 'authenticated', format($x$update public.characters set sheet = '{"x":1}' where id = %L$x$, ch3), 'rows=0');
  perform pg_temp.q('R40', 'Spieler: sieht alle Profile', p1, 'authenticated', 'select count(*) from public.profiles', 'n=' || nprof);
  perform pg_temp.q('R41', 'Spieler: eigenen Anzeigenamen ändern', p1, 'authenticated', format($x$update public.profiles set display_name = 'neu' where id = %L$x$, p1), 'rows=1');
  perform pg_temp.q('R42', 'Spieler: eigene Rolle auf st setzen', p1, 'authenticated', format($x$update public.profiles set role = 'st' where id = %L$x$, p1), 'err');
  perform pg_temp.q('R43', 'Spieler: fremden Anzeigenamen ändern', p1, 'authenticated', format($x$update public.profiles set display_name = 'x' where id = %L$x$, p2), 'rows=0');
  perform pg_temp.q('R44', 'Spieler: Profil anlegen', p1, 'authenticated', format($x$insert into public.profiles(id,display_name,role) values (%L,'x','st')$x$, gen_random_uuid()), 'err');
  perform pg_temp.q('R45', 'Spieler: Profil löschen (kein Recht, 0 Zeilen)', p1, 'authenticated', format('delete from public.profiles where id = %L', p2), 'rows=0');
  perform pg_temp.q('R50', 'Spieler: Session anlegen', p1, 'authenticated', $x$insert into public.sessions(number, title) values (9001, 'UAT')$x$, 'rows=1');
  perform pg_temp.q('R51', 'Spieler: Session ändern', p1, 'authenticated', $x$update public.sessions set title = 'UAT2' where number = 9001$x$, 'rows=1');
  perform pg_temp.q('R52', 'Spieler: Session löschen', p1, 'authenticated', 'delete from public.sessions where number = 9001', 'rows=0');
  perform pg_temp.q('R53', 'Spieler: Session Nummer 0', p1, 'authenticated', 'insert into public.sessions(number) values (0)', 'err');
  perform pg_temp.q('R55', 'Spieler: sieht alle Session-Notizen', p1, 'authenticated', 'select count(*) from public.session_notes where body in (''n1'',''n2'')', 'n=2');
  perform pg_temp.q('R56', 'Spieler: eigene Session-Notiz anlegen', p1, 'authenticated', $x$insert into public.session_notes(session_number, body) values (1, 'neu')$x$, 'rows=1');
  perform pg_temp.q('R57', 'Spieler: Session-Notiz als anderer', p1, 'authenticated', format($x$insert into public.session_notes(session_number, author_id, body) values (1, %L, 'fake')$x$, p2), 'err');
  perform pg_temp.q('R58', 'Spieler: eigene Session-Notiz ändern', p1, 'authenticated', format($x$update public.session_notes set body = 'e' where id = %L$x$, sn1), 'rows=1');
  perform pg_temp.q('R59', 'Spieler: fremde Session-Notiz ändern', p1, 'authenticated', format($x$update public.session_notes set body = 'e' where id = %L$x$, sn2), 'rows=0');
  perform pg_temp.q('R60', 'Spieler: fremde Session-Notiz löschen', p1, 'authenticated', format('delete from public.session_notes where id = %L', sn2), 'rows=0');
  perform pg_temp.q('R61', 'Spieler: eigene Session-Notiz löschen', p1, 'authenticated', format('delete from public.session_notes where id = %L', sn1), 'rows=1');
  perform pg_temp.q('R65', 'Spieler: sieht nur eigene private Notizen', p1, 'authenticated', $x$select count(*) from public.private_notes where title like 'UAT%'$x$, 'n=1');
  perform pg_temp.q('R66', 'Spieler: private Notiz für anderen', p1, 'authenticated', format($x$insert into public.private_notes(owner_id, title) values (%L, 'x')$x$, p2), 'err');
  perform pg_temp.q('R67', 'Spieler: fremde private Notiz ändern', p1, 'authenticated', $x$update public.private_notes set body = 'x' where title = 'UAT pn2'$x$, 'rows=0');
  perform pg_temp.q('R68', 'Spieler: fremde private Notiz löschen', p1, 'authenticated', $x$delete from public.private_notes where title = 'UAT pn2'$x$, 'rows=0');
  perform pg_temp.q('R69', 'Spieler: eigene private Notiz anlegen', p1, 'authenticated', $x$insert into public.private_notes(title) values ('UAT neu')$x$, 'rows=1');
  perform pg_temp.q('R70', 'Spieler: sieht keine ST-Kategorien', p1, 'authenticated', 'select count(*) from public.wiki_categories where st_only', 'n=0');
  perform pg_temp.q('R71', 'Spieler: sieht öffentliche Kategorien', p1, 'authenticated', 'select count(*) from public.wiki_categories', 'n=' || ncatpub);
  perform pg_temp.q('R72', 'Spieler: sieht nur Seiten aus sichtbaren Kategorien', p1, 'authenticated', $x$select count(*) from public.wiki_pages where title like 'UAT%'$x$, 'n=2');
  perform pg_temp.q('R73', 'Spieler: Seite in ST-Kategorie anlegen', p1, 'authenticated', format($x$insert into public.wiki_pages(category_id, title) values (%L, 'UAT x')$x$, catst), 'err');
  perform pg_temp.q('R74', 'Spieler: Seite in öffentlicher Kategorie anlegen', p1, 'authenticated', format($x$insert into public.wiki_pages(category_id, title) values (%L, 'UAT neu')$x$, catpub), 'rows=1');
  perform pg_temp.q('R75', 'Spieler: Seite mit fremdem Ersteller anlegen', p1, 'authenticated', format($x$insert into public.wiki_pages(category_id, title, created_by) values (%L, 'UAT y', %L)$x$, catpub, p2), 'err');
  perform pg_temp.q('R76', 'Spieler: fremde Seite bearbeiten', p1, 'authenticated', format($x$update public.wiki_pages set body = 'e' where id = %L$x$, pg_pub), 'rows=1');
  perform pg_temp.q('R77', 'Spieler: Ersteller umschreiben (Versuch)', p1, 'authenticated', format('update public.wiki_pages set created_by = %L where id = %L', p1, pg_pub), 'rows=1');
  perform pg_temp.q('R78', 'Ersteller blieb unverändert', p1, 'authenticated', format('select count(*) from public.wiki_pages where id = %L and created_by = %L', pg_pub, st), 'n=1');
  perform pg_temp.q('R79', 'Spieler: fremde Seite löschen', p1, 'authenticated', format('delete from public.wiki_pages where id = %L', pg_pub), 'rows=0');
  perform pg_temp.q('R80', 'Spieler: eigene Seite löschen', p1, 'authenticated', format('delete from public.wiki_pages where id = %L', pg_p1), 'rows=1');
  perform pg_temp.q('R81', 'Spieler: Seite in ST-Kategorie bearbeiten', p1, 'authenticated', format($x$update public.wiki_pages set body = 'e' where id = %L$x$, pg_st), 'rows=0');
  perform pg_temp.q('R82', 'Spieler: normale Kategorie anlegen', p1, 'authenticated', $x$insert into public.wiki_categories(name) values ('UAT Kat')$x$, 'rows=1');
  perform pg_temp.q('R83', 'Spieler: ST-Kategorie anlegen', p1, 'authenticated', $x$insert into public.wiki_categories(name, st_only) values ('UAT st', true)$x$, 'err');
  perform pg_temp.q('R84', 'Spieler: Kategorie umbenennen', p1, 'authenticated', $x$update public.wiki_categories set name = 'UAT Kat2' where name = 'UAT Kat'$x$, 'rows=0');
  perform pg_temp.q('R85', 'Spieler: Kategorie löschen', p1, 'authenticated', $x$delete from public.wiki_categories where name = 'UAT Kat'$x$, 'rows=0');
  perform pg_temp.q('R86', 'Spieler: Kategorie mit fremdem Ersteller', p1, 'authenticated', format($x$insert into public.wiki_categories(name, created_by) values ('UAT z', %L)$x$, p2), 'err');
  perform pg_temp.q('R90', 'Spieler: sieht keine Entwürfe', p1, 'authenticated', $x$select count(*) from public.documents where title like 'UAT%'$x$, 'n=2');
  perform pg_temp.q('R91', 'Spieler: Entwurf hochladen', p1, 'authenticated', format($x$insert into public.documents(title, storage_path, draft) values ('UAT d', %L, true)$x$, p1::text || '/d.pdf'), 'err');
  perform pg_temp.q('R92', 'Spieler: Dokument anlegen', p1, 'authenticated', format($x$insert into public.documents(title, storage_path) values ('UAT new', %L)$x$, p1::text || '/new.pdf'), 'rows=1');
  perform pg_temp.q('R93', 'Spieler: Dokument mit fremdem Uploader', p1, 'authenticated', format($x$insert into public.documents(title, storage_path, uploader_id) values ('UAT f', %L, %L)$x$, p1::text || '/f.pdf', p2), 'err');
  perform pg_temp.q('R94', 'Spieler: Beschreibung des eigenen Dokuments ändern', p1, 'authenticated', $x$update public.documents set description = 'neu' where title = 'UAT new'$x$, 'rows=1');
  perform pg_temp.q('R95', 'Spieler: fremdes Dokument löschen', p1, 'authenticated', $x$delete from public.documents where title = 'UAT pub'$x$, 'rows=0');
  perform pg_temp.q('R96', 'Spieler: eigenes Dokument löschen', p1, 'authenticated', $x$delete from public.documents where title = 'UAT new'$x$, 'rows=1');
  perform pg_temp.q('R97', 'Spieler: Titel eines fremden Dokuments ändern', p1, 'authenticated', $x$update public.documents set title = 'UAT geklaut' where title = 'UAT pub'$x$, 'rows=0');
  perform pg_temp.q('R98', 'Spieler: eigenes Dokument zum Entwurf machen', p1, 'authenticated', $x$update public.documents set draft = true where title = 'UAT p1doc'$x$, 'err');
  perform pg_temp.q('R99', 'Spieler: Speicherpfad des eigenen Dokuments ändern', p1, 'authenticated', $x$update public.documents set storage_path = 'x/y.pdf' where title = 'UAT p1doc'$x$, 'err');
  perform pg_temp.q('R99a', 'Spieler: Titel des eigenen Dokuments ändern', p1, 'authenticated', $x$update public.documents set title = 'UAT p1doc', description = 'beschrieben' where title = 'UAT p1doc'$x$, 'rows=1');
  perform pg_temp.q('R99b', 'Spieler: Uploader des eigenen Dokuments ändern', p1, 'authenticated', format($x$update public.documents set uploader_id = %L where title = 'UAT p1doc'$x$, p2), 'err');
  perform pg_temp.q('R100', 'Spieler: Storage sieht eigene + freigegebene Dateien', p1, 'authenticated', $x$select count(*) from storage.objects where bucket_id = 'documents'$x$, 'n=2');
  perform pg_temp.q('R101', 'Spieler: Upload in eigenen Ordner', p1, 'authenticated', format($x$insert into storage.objects(bucket_id,name) values ('documents', %L)$x$, p1::text || '/x.pdf'), 'rows=1');
  perform pg_temp.q('R102', 'Spieler: Upload in fremden Ordner', p1, 'authenticated', format($x$insert into storage.objects(bucket_id,name) values ('documents', %L)$x$, p2::text || '/x.pdf'), 'err');
  perform pg_temp.q('R103', 'Spieler: fremde Datei löschen', p1, 'authenticated', format($x$delete from storage.objects where bucket_id='documents' and name = %L$x$, p2::text || '/p2.pdf'), 'rows=0|err');
  perform pg_temp.q('R104', 'Spieler: Upload in anderen Bucket', p1, 'authenticated', format($x$insert into storage.objects(bucket_id,name) values ('nope', %L)$x$, p1::text || '/x.pdf'), 'err');
  perform pg_temp.q('R110', 'Spieler: sieht Spielerkarte', p1, 'authenticated', 'select count(*) from public.player_map_nodes', 'n=' || nnodes);
  perform pg_temp.q('R111', 'Spieler: Knoten anlegen', p1, 'authenticated', $x$insert into public.player_map_nodes(label) values ('UAT n1')$x$, 'rows=1');
  perform pg_temp.q('R112', 'Spieler: doppelter Name (Groß/Klein)', p1, 'authenticated', $x$insert into public.player_map_nodes(label) values ('uat N1')$x$, 'err');
  perform pg_temp.q('R113', 'Spieler: Knoten ändern', p1, 'authenticated', $x$update public.player_map_nodes set description = 'd' where label = 'UAT n1'$x$, 'rows=1');
  perform pg_temp.q('R114', 'Spieler: Knoten löschen', p1, 'authenticated', $x$delete from public.player_map_nodes where label = 'UAT n1'$x$, 'rows=1');
  perform pg_temp.q('R115', 'Spieler: Kante anlegen', p1, 'authenticated', format('insert into public.player_map_edges(from_node,to_node) values (%L,%L)', nB, nA), 'rows=1');
  perform pg_temp.q('R116', 'Spieler: Kante auf sich selbst', p1, 'authenticated', format('insert into public.player_map_edges(from_node,to_node) values (%L,%L)', nA, nA), 'err');
  perform pg_temp.q('R117', 'Spieler: Kante löschen', p1, 'authenticated', format('delete from public.player_map_edges where id = %L', eAB), 'rows=1');
  perform pg_temp.q('R118', 'Spieler: Kante mit ungültiger Richtung', p1, 'authenticated', format($x$insert into public.player_map_edges(from_node,to_node,direction) values (%L,%L,'x')$x$, nA, nB), 'err');
  perform pg_temp.q('R120', 'Spieler: ST-Positionen sichtbar', p1, 'authenticated', $x$select count(*) from public.map_positions where scope = 'st'$x$, 'n=0');
  perform pg_temp.q('R121', 'Spieler: ST-Position schreiben', p1, 'authenticated', $x$insert into public.map_positions(scope,node_key,x,y) values ('st','z',1,1)$x$, 'err');
  perform pg_temp.q('R122', 'Spieler: Spielerkarten-Position schreiben', p1, 'authenticated', $x$insert into public.map_positions(scope,node_key,x,y) values ('player','uat-p1',1,1)$x$, 'rows=1');
  perform pg_temp.q('R123', 'Spieler: ST-Position ändern', p1, 'authenticated', $x$update public.map_positions set x = 5 where scope = 'st'$x$, 'rows=0');
  perform pg_temp.q('R124', 'Spieler: ST-Position löschen', p1, 'authenticated', $x$delete from public.map_positions where scope = 'st'$x$, 'rows=0');
  perform pg_temp.q('R125', 'Spieler: ungültiger Scope', p1, 'authenticated', $x$insert into public.map_positions(scope,node_key,x,y) values ('x','z',1,1)$x$, 'err');
  perform pg_temp.q('R130', 'Spieler: notion_cache lesen', p1, 'authenticated', 'select count(*) from public.notion_cache', 'n=0');
  perform pg_temp.q('R131', 'Spieler: notion_cache schreiben', p1, 'authenticated', $x$insert into public.notion_cache(id,payload) values (1,'{}')$x$, 'err');
  perform pg_temp.q('R135', 'Spieler: is_st() ist false', p1, 'authenticated', 'select count(*) from (select 1 where public.is_st()) s', 'n=0');
  perform pg_temp.q('R136', 'Spieler: is_member() ist true', p1, 'authenticated', 'select count(*) from (select 1 where public.is_member()) s', 'n=1');
  perform pg_temp.q('R137', 'Spieler: ping() liefert Daten', p1, 'authenticated', 'select count(*) from (select public.ping() as v) s where v is not null', 'n=1');
  perform pg_temp.q('R126', 'Spieler: Rolle eines anderen auf st setzen', p1, 'authenticated', format($x$update public.profiles set role = 'st' where id = %L$x$, p2), 'rows=0');
  perform pg_temp.q('R127', 'Spieler: notion_cache ändern', p1, 'authenticated', $x$update public.notion_cache set payload = '{}'$x$, 'rows=0|err');
  perform pg_temp.q('R128', 'Spieler: notion_cache löschen', p1, 'authenticated', 'delete from public.notion_cache', 'rows=0|err');
  perform pg_temp.q('R129', 'Spieler: Session-Notiz im Namen eines anderen als Spieler anlegen', p1, 'authenticated', format($x$insert into public.session_notes(session_number, author_id, body) values (1, %L, 'x')$x$, p2), 'err');
  perform pg_temp.q('R132', 'Spieler: eigenes Profil löschen', p1, 'authenticated', format('delete from public.profiles where id = %L', p1), 'rows=0');
  perform pg_temp.q('R133', 'Spieler: private Notiz im Namen eines anderen anlegen', p1, 'authenticated', format($x$insert into public.private_notes(owner_id, title) values (%L, 'x')$x$, p2), 'err');

  -- ---------- D: Storyteller ----------
  perform pg_temp.q('R140', 'ST: sieht alle Bögen', st, 'authenticated', 'select count(*) from public.characters', 'n=' || nchars);
  perform pg_temp.q('R141', 'ST: fremden Bogen ändern', st, 'authenticated', format($x$update public.characters set sheet = '{"hunger":1}' where id = %L$x$, ch2), 'rows=1');
  perform pg_temp.q('R142', 'ST: Bogen anlegen', st, 'authenticated', $x$insert into public.characters(name) values ('UAT Char')$x$, 'rows=1');
  perform pg_temp.q('R143', 'ST: Bogen löschen', st, 'authenticated', $x$delete from public.characters where name = 'UAT Char'$x$, 'rows=1');
  perform pg_temp.q('R144', 'ST: eigene Rolle ändern', st, 'authenticated', format($x$update public.profiles set role = 'player' where id = %L$x$, st), 'err');
  perform pg_temp.q('R145', 'ST: fremden Anzeigenamen ändern', st, 'authenticated', format($x$update public.profiles set display_name = 'x' where id = %L$x$, p2), 'rows=1');
  perform pg_temp.q('R146', 'ST: eigenen Anzeigenamen ändern', st, 'authenticated', format($x$update public.profiles set display_name = 'Roland' where id = %L$x$, st), 'rows=1');
  perform pg_temp.q('R150', 'ST: liest private Notizen der Spieler', st, 'authenticated', $x$select count(*) from public.private_notes where title like 'UAT%'$x$, 'n=3');
  perform pg_temp.q('R151', 'ST: ändert private Notiz eines Spielers', st, 'authenticated', $x$update public.private_notes set body = 'x' where title = 'UAT pn1'$x$, 'rows=1');
  perform pg_temp.q('R152', 'ST: löscht private Notiz eines Spielers', st, 'authenticated', $x$delete from public.private_notes where title = 'UAT pn1'$x$, 'rows=1');
  perform pg_temp.q('R153', 'ST: Session löschen', st, 'authenticated', 'delete from public.sessions where number = 9001', 'rows=1');
  perform pg_temp.q('R154', 'ST: sieht ST-Wiki-Seite', st, 'authenticated', format('select count(*) from public.wiki_pages where id = %L', pg_st), 'n=1');
  perform pg_temp.q('R155', 'ST: löscht fremde Wiki-Seite', st, 'authenticated', format('delete from public.wiki_pages where id = %L', pg_st), 'rows=1');
  perform pg_temp.q('R156', 'ST: benennt Kategorie um', st, 'authenticated', $x$update public.wiki_categories set name = 'UAT Kat2' where name = 'UAT Kat'$x$, 'rows=1');
  perform pg_temp.q('R157', 'ST: löscht Kategorie', st, 'authenticated', $x$delete from public.wiki_categories where name = 'UAT Kat2'$x$, 'rows=1');
  perform pg_temp.q('R158', 'ST: legt ST-Kategorie an', st, 'authenticated', $x$insert into public.wiki_categories(name, st_only) values ('UAT st2', true)$x$, 'rows=1');
  perform pg_temp.q('R159', 'ST: Kategorie mit Seiten löschen (restrict)', st, 'authenticated', format('delete from public.wiki_categories where id = %L', catpub), 'err');
  perform pg_temp.q('R160', 'ST: sieht Entwürfe', st, 'authenticated', $x$select count(*) from public.documents where title like 'UAT%'$x$, 'n=3');
  perform pg_temp.q('R161', 'ST: gibt Entwurf frei', st, 'authenticated', $x$update public.documents set draft = false where title = 'UAT draft'$x$, 'rows=1');
  perform pg_temp.q('R162', 'ST: lädt Entwurf hoch', st, 'authenticated', format($x$insert into public.documents(title, storage_path, draft) values ('UAT d2', %L, true)$x$, st::text || '/d2.pdf'), 'rows=1');
  perform pg_temp.q('R164', 'ST: Titel eines fremden Dokuments ändern', st, 'authenticated', $x$update public.documents set title = 'UAT pub', description = 'vom ST' where title = 'UAT pub'$x$, 'rows=1');
  perform pg_temp.q('R164a', 'ST: Speicherpfad ändern bleibt gesperrt', st, 'authenticated', $x$update public.documents set storage_path = 'x/z.pdf' where title = 'UAT pub'$x$, 'err');
  perform pg_temp.q('R163', 'ST: löscht Spieler-Dokument', st, 'authenticated', $x$delete from public.documents where title = 'UAT p1doc'$x$, 'rows=1');
  perform pg_temp.q('R165', 'ST: Storage sieht alle Dateien', st, 'authenticated', $x$select count(*) from storage.objects where bucket_id = 'documents' and name like '%.pdf'$x$, 'n=5');
  perform pg_temp.q('R166', 'ST: Upload in eigenen Ordner', st, 'authenticated', format($x$insert into storage.objects(bucket_id,name) values ('documents', %L)$x$, st::text || '/x.pdf'), 'rows=1');
  perform pg_temp.q('R167', 'ST: Upload in fremden Ordner', st, 'authenticated', format($x$insert into storage.objects(bucket_id,name) values ('documents', %L)$x$, p1::text || '/st.pdf'), 'rows=1');
  perform pg_temp.q('R170', 'ST: liest ST-Positionen', st, 'authenticated', $x$select count(*) from public.map_positions where scope = 'st' and node_key = 'uat-s'$x$, 'n=1');
  perform pg_temp.q('R171', 'ST: schreibt ST-Position', st, 'authenticated', $x$insert into public.map_positions(scope,node_key,x,y) values ('st','uat-s2',1,1)$x$, 'rows=1');
  perform pg_temp.q('R172', 'ST: ändert ST-Position', st, 'authenticated', $x$update public.map_positions set x = 9 where scope = 'st' and node_key = 'uat-s2'$x$, 'rows=1');
  perform pg_temp.q('R173', 'ST: löscht ST-Position', st, 'authenticated', $x$delete from public.map_positions where scope = 'st' and node_key = 'uat-s2'$x$, 'rows=1');
  perform pg_temp.q('R175', 'ST: liest notion_cache', st, 'authenticated', 'select count(*) from public.notion_cache', 'n=0|n=1');
  perform pg_temp.q('R176', 'ST: schreibt notion_cache', st, 'authenticated', $x$insert into public.notion_cache(id,payload) values (1,'{}')$x$, 'rows=1');
  perform pg_temp.q('R177', 'ST: ändert notion_cache', st, 'authenticated', $x$update public.notion_cache set payload = '{}'$x$, 'rows=1');
  perform pg_temp.q('R178', 'ST: löscht notion_cache', st, 'authenticated', 'delete from public.notion_cache', 'rows=1');
  perform pg_temp.q('R179', 'ST: is_st() ist true', st, 'authenticated', 'select count(*) from (select 1 where public.is_st()) s', 'n=1');
  perform pg_temp.q('R180', 'ST: Rolle eines Spielers ändern', st, 'authenticated', format($x$update public.profiles set role = 'st' where id = %L$x$, p2), 'rows=1');
  perform pg_temp.q('R181', 'ST: Rolle wieder zurücksetzen', st, 'authenticated', format($x$update public.profiles set role = 'player' where id = %L$x$, p2), 'rows=1');
  perform pg_temp.q('R182', 'ST: eigene Rolle ändern (gesperrt, kein Aussperren)', st, 'authenticated', format($x$update public.profiles set role = 'player' where id = %L$x$, st), 'err');
  perform pg_temp.q('R183', 'ST: eigenes Profil löschen (gesperrt)', st, 'authenticated', format('delete from public.profiles where id = %L', st), 'rows=0');
  perform pg_temp.q('R184', 'ST: Profil für ein Konto anlegen', st, 'authenticated', format($x$insert into public.profiles(id, display_name, role) values (%L, 'UAT neu', 'player')$x$, nop), 'rows=1');
  perform pg_temp.q('R185', 'ST: Profil eines Spielers löschen', st, 'authenticated', format('delete from public.profiles where id = %L', nop), 'rows=1');
  perform pg_temp.q('R186', 'ST: Session-Notiz eines Spielers ändern', st, 'authenticated', format($x$update public.session_notes set body = 'ST-Korrektur' where id = %L$x$, sn2), 'rows=1');
  perform pg_temp.q('R187', 'ST: Session-Notiz eines Spielers löschen', st, 'authenticated', format('delete from public.session_notes where id = %L', sn2), 'rows=1');
  perform pg_temp.q('R188', 'ST: Session-Notiz im Namen eines Spielers anlegen', st, 'authenticated', format($x$insert into public.session_notes(session_number, author_id, body) values (1, %L, 'Import')$x$, p1), 'rows=1');
  perform pg_temp.q('R189', 'ST: private Notiz im Namen eines Spielers anlegen', st, 'authenticated', format($x$insert into public.private_notes(owner_id, title) values (%L, 'UAT vom ST')$x$, p1), 'rows=1');

  -- ---------- F: Chroniken, Kapitel, Session-Infos, Szenen (v1.4) ----------
  perform pg_temp.q('R201', 'anon liest chronicles', null, 'anon', $x$select count(*) from public.chronicles$x$, 'err');
  perform pg_temp.q('R202', 'anon liest scenes', null, 'anon', $x$select count(*) from public.scenes$x$, 'err');
  perform pg_temp.q('R203', 'ohne Profil: chronicles', nop, 'authenticated', $x$select count(*) from public.chronicles$x$, 'n=0');
  perform pg_temp.q('R204', 'ohne Profil: chapters', nop, 'authenticated', $x$select count(*) from public.chapters$x$, 'n=0');
  perform pg_temp.q('R205', 'ohne Profil: session_info', nop, 'authenticated', $x$select count(*) from public.session_info$x$, 'n=0');
  perform pg_temp.q('R206', 'ohne Profil: scenes', nop, 'authenticated', $x$select count(*) from public.scenes$x$, 'n=0');
  perform pg_temp.q('R207', 'ohne Profil: scene_npcs', nop, 'authenticated', $x$select count(*) from public.scene_npcs$x$, 'n=0');
  perform pg_temp.q('R208', 'ohne Profil: Chronik anlegen', nop, 'authenticated', $x$insert into public.chronicles(title) values ('x')$x$, 'err');
  perform pg_temp.q('R210', 'Spieler: sieht laufende Chronik', p1, 'authenticated', $x$select count(*) from public.chronicles where title like 'UAT%'$x$, 'n=1');
  perform pg_temp.q('R211', 'Spieler: Entwurf ist unsichtbar', p1, 'authenticated', $x$select count(*) from public.chronicles where title = 'UAT Entwurf'$x$, 'n=0');
  perform pg_temp.q('R212', 'Spieler: Chronik anlegen', p1, 'authenticated', $x$insert into public.chronicles(title) values ('x')$x$, 'err');
  perform pg_temp.q('R213', 'Spieler: Chronik ändern', p1, 'authenticated', $x$update public.chronicles set title = 'x' where title = 'UAT laufend'$x$, 'rows=0');
  perform pg_temp.q('R214', 'Spieler: Chronik löschen', p1, 'authenticated', $x$delete from public.chronicles where title = 'UAT laufend'$x$, 'rows=0');
  perform pg_temp.q('R215', 'Spieler: sieht Kapitel der laufenden Chronik', p1, 'authenticated', $x$select count(*) from public.chapters where title like 'UAT%'$x$, 'n=1');
  perform pg_temp.q('R216', 'Spieler: Kapitel des Entwurfs unsichtbar', p1, 'authenticated', $x$select count(*) from public.chapters where title = 'UAT K1 Entwurf'$x$, 'n=0');
  perform pg_temp.q('R217', 'Spieler: Kapitel anlegen', p1, 'authenticated', format($x$insert into public.chapters(chronicle_id, number) values (%L, 2)$x$, chr_run), 'err');
  perform pg_temp.q('R218', 'Spieler: Kapitel ändern', p1, 'authenticated', $x$update public.chapters set title = 'x' where title = 'UAT K1'$x$, 'rows=0');
  perform pg_temp.q('R219', 'Spieler: Session-Infos ohne Entwurf', p1, 'authenticated', $x$select count(*) from public.session_info where session_number between 9201 and 9203$x$, 'n=2');
  perform pg_temp.q('R220', 'Spieler: Session-Info anlegen', p1, 'authenticated', $x$insert into public.session_info(session_number) values (9210)$x$, 'err');
  perform pg_temp.q('R221', 'Spieler: Session-Info ändern', p1, 'authenticated', $x$update public.session_info set summary = 'x' where session_number = 9201$x$, 'rows=0');
  perform pg_temp.q('R222', 'Spieler: Session-Info löschen', p1, 'authenticated', $x$delete from public.session_info where session_number = 9201$x$, 'rows=0');
  perform pg_temp.q('R223', 'Spieler: Szenen lesen', p1, 'authenticated', $x$select count(*) from public.scenes$x$, 'n=0');
  perform pg_temp.q('R224', 'Spieler: Szene anlegen', p1, 'authenticated', $x$insert into public.scenes(session_number, title) values (9201, 'x')$x$, 'err');
  perform pg_temp.q('R225', 'Spieler: Szene ändern', p1, 'authenticated', $x$update public.scenes set title = 'x'$x$, 'rows=0');
  perform pg_temp.q('R226', 'Spieler: Szene löschen', p1, 'authenticated', $x$delete from public.scenes$x$, 'rows=0');
  perform pg_temp.q('R227', 'Spieler: Szenen-NPCs lesen', p1, 'authenticated', $x$select count(*) from public.scene_npcs$x$, 'n=0');
  perform pg_temp.q('R228', 'Spieler: Szenen-NPC anlegen', p1, 'authenticated', format($x$insert into public.scene_npcs(scene_id, name) values (%L, 'x')$x$, sc1), 'err');
  perform pg_temp.q('R229', 'Spieler: Szenen-NPC ändern', p1, 'authenticated', $x$update public.scene_npcs set motivation = 'x'$x$, 'rows=0');
  perform pg_temp.q('R230', 'Spieler: Szenen-NPC löschen', p1, 'authenticated', $x$delete from public.scene_npcs$x$, 'rows=0');
  perform pg_temp.q('R231', 'Spieler: Szenen im Vorrat sind unsichtbar', p1, 'authenticated', $x$select count(*) from public.scenes where title = 'UAT Vorrat Fix'$x$, 'n=0');
  perform pg_temp.q('R240', 'ST: sieht alle Chroniken', st, 'authenticated', $x$select count(*) from public.chronicles where title like 'UAT%'$x$, 'n=2');
  perform pg_temp.q('R241', 'ST: sieht alle Kapitel', st, 'authenticated', $x$select count(*) from public.chapters where title like 'UAT%'$x$, 'n=2');
  perform pg_temp.q('R242', 'ST: sieht alle Session-Infos', st, 'authenticated', $x$select count(*) from public.session_info where session_number between 9201 and 9203$x$, 'n=3');
  perform pg_temp.q('R243', 'ST: Chronik anlegen', st, 'authenticated', $x$insert into public.chronicles(title) values ('UAT neu')$x$, 'rows=1');
  perform pg_temp.q('R244', 'ST: Chronik ändern', st, 'authenticated', $x$update public.chronicles set status = 'done' where title = 'UAT neu'$x$, 'rows=1');
  perform pg_temp.q('R245', 'ST: ungültiger Chronik-Status', st, 'authenticated', $x$insert into public.chronicles(title, status) values ('UAT x', 'x')$x$, 'err');
  perform pg_temp.q('R246', 'ST: Chronik ohne Titel', st, 'authenticated', $x$insert into public.chronicles(title) values ('  ')$x$, 'err');
  perform pg_temp.q('R247', 'ST: Kapitel anlegen', st, 'authenticated', $x$insert into public.chapters(chronicle_id, number, title) select id, 1, 'UAT KN' from public.chronicles where title = 'UAT neu'$x$, 'rows=1');
  perform pg_temp.q('R248', 'ST: doppelte Kapitelnummer', st, 'authenticated', $x$insert into public.chapters(chronicle_id, number, title) select id, 1, 'UAT KN2' from public.chronicles where title = 'UAT neu'$x$, 'err');
  perform pg_temp.q('R249', 'ST: Kapitelnummer 0', st, 'authenticated', $x$insert into public.chapters(chronicle_id, number) select id, 0 from public.chronicles where title = 'UAT neu'$x$, 'err');
  perform pg_temp.q('R250', 'ST: Chronik löschen', st, 'authenticated', $x$delete from public.chronicles where title = 'UAT neu'$x$, 'rows=1');
  perform pg_temp.q('R251', 'Kapitel der gelöschten Chronik sind weg', st, 'authenticated', $x$select count(*) from public.chapters where title = 'UAT KN'$x$, 'n=0');
  perform pg_temp.q('R252', 'ST: Session-Info anlegen', st, 'authenticated', $x$insert into public.session_info(session_number, summary) values (9210, 'x')$x$, 'rows=1');
  perform pg_temp.q('R253', 'ST: Session-Info ändern', st, 'authenticated', $x$update public.session_info set summary = 'y' where session_number = 9210$x$, 'rows=1');
  perform pg_temp.q('R254', 'ST: Session-Nummer 0', st, 'authenticated', $x$insert into public.session_info(session_number) values (0)$x$, 'err');
  perform pg_temp.q('R255', 'ST: Szene anlegen', st, 'authenticated', $x$insert into public.scenes(session_number, position, title, outcomes) values (9201, 3, 'UAT Szene 3', '["Erfolg"]')$x$, 'rows=1');
  perform pg_temp.q('R256', 'ST: Szene ohne Titel', st, 'authenticated', $x$insert into public.scenes(session_number, title) values (9201, '')$x$, 'err');
  perform pg_temp.q('R257', 'ST: ungültiger Szenenstatus', st, 'authenticated', $x$insert into public.scenes(session_number, title, status) values (9201, 'UAT y', 'x')$x$, 'err');
  perform pg_temp.q('R258', 'ST: Ausgänge müssen eine Liste sein', st, 'authenticated', $x$insert into public.scenes(session_number, title, outcomes) values (9201, 'UAT z', '{}')$x$, 'err');
  perform pg_temp.q('R259', 'ST: sieht alle Szenen (inkl. Vorrat)', st, 'authenticated', $x$select count(*) from public.scenes where title like 'UAT%'$x$, 'n=4');
  perform pg_temp.q('R260', 'ST: Szene ändern', st, 'authenticated', $x$update public.scenes set status = 'played' where title = 'UAT Szene 3'$x$, 'rows=1');
  perform pg_temp.q('R261', 'ST: NPC an Szene hängen', st, 'authenticated', format($x$insert into public.scene_npcs(scene_id, notion_id, name, motivation) values (%L, 'abd', 'UAT NPC2', 'will x')$x$, sc1), 'rows=1');
  perform pg_temp.q('R262', 'ST: NPC ohne Namen', st, 'authenticated', format($x$insert into public.scene_npcs(scene_id, name) values (%L, '')$x$, sc1), 'err');
  perform pg_temp.q('R263', 'ST: sieht Szenen-NPCs', st, 'authenticated', $x$select count(*) from public.scene_npcs where notion_id in ('abc','abd')$x$, 'n=2');
  perform pg_temp.q('R264', 'ST: Szene löschen', st, 'authenticated', format($x$delete from public.scenes where id = %L$x$, sc1), 'rows=1');
  perform pg_temp.q('R265', 'NPCs der gelöschten Szene sind weg', st, 'authenticated', $x$select count(*) from public.scene_npcs where notion_id in ('abc','abd')$x$, 'n=0');
  perform pg_temp.q('R266', 'ST: laufende Chronik löschen', st, 'authenticated', format($x$delete from public.chronicles where id = %L$x$, chr_run), 'rows=1');
  perform pg_temp.q('R267', 'Session-Info bleibt, Chronik und Kapitel sind leer', st, 'authenticated', $x$select count(*) from public.session_info where session_number = 9201 and chronicle_id is null and chapter_id is null$x$, 'n=1');
  perform pg_temp.q('R268', 'ST: Szene ohne Session (Vorrat) anlegen', st, 'authenticated', $x$insert into public.scenes(title) values ('UAT Vorrat neu')$x$, 'rows=1');
  perform pg_temp.q('R269', 'ST: Session 0 bleibt verboten', st, 'authenticated', $x$insert into public.scenes(session_number, title) values (0, 'UAT null')$x$, 'err');
  perform pg_temp.q('R270', 'ST: Szene aus einer Session in den Vorrat legen', st, 'authenticated', $x$update public.scenes set session_number = null where title = 'UAT Szene 3'$x$, 'rows=1');
  perform pg_temp.q('R271', 'ST: Szene aus dem Vorrat einer Session zuordnen', st, 'authenticated', $x$update public.scenes set session_number = 9201 where title = 'UAT Vorrat neu'$x$, 'rows=1');
  perform pg_temp.q('R272', 'ST: sieht die Vorrat-Szenen', st, 'authenticated', $x$select count(*) from public.scenes where session_number is null and title like 'UAT%'$x$, 'n=2');

  -- ---------- E: Konfiguration der Datenbank ----------
  perform pg_temp.q('R190', 'service_role darf notion_cache schreiben', null, 'postgres', $x$select count(*) from (select 1 where has_table_privilege('service_role','public.notion_cache','INSERT') and has_table_privilege('service_role','public.notion_cache','UPDATE')) s$x$, 'n=1');
  perform pg_temp.q('R191', 'anon hat keine Tabellenrechte in public', null, 'postgres', $x$select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'$x$, 'n=0');
  perform pg_temp.q('R192', 'authenticated ohne TRUNCATE/REFERENCES/TRIGGER', null, 'postgres', $x$select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')$x$, 'n=0');
  perform pg_temp.q('R193', 'Funktionsrechte nur wie vorgesehen (ping 2x, is_st, is_member, wiki_category_visible)', null, 'postgres', $x$select count(*) from information_schema.role_routine_grants where grantee in ('anon','authenticated') and routine_schema = 'public'$x$, 'n=5');
  perform pg_temp.q('R194', 'RLS auf allen public-Tabellen', null, 'postgres', $x$select count(*) from pg_tables where schemaname = 'public' and not rowsecurity$x$, 'n=0');
  perform pg_temp.q('R195', 'Anzahl Policies public', null, 'postgres', $x$select count(*) from pg_policies where schemaname = 'public'$x$, 'n=64');
  perform pg_temp.q('R196', 'security definer Funktionen mit festem search_path', null, 'postgres', $x$select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))$x$, 'n=0');
  perform pg_temp.q('R197', 'Bucket documents ist privat, Limit 20 MB', null, 'postgres', $x$select count(*) from storage.buckets where id = 'documents' and not public and file_size_limit = 20971520$x$, 'n=1');
  perform pg_temp.q('R198', 'profiles.role akzeptiert nur st/player', null, 'postgres', format($x$insert into public.profiles(id, role) values (%L, 'admin')$x$, nop), 'err');
  perform pg_temp.q('R199', 'Realtime nur für Spielerkarten-Tabellen', null, 'postgres', $x$select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'$x$, 'n=2');
  perform pg_temp.q('R200', 'Selbstregistrierung: Profile entstehen nicht automatisch', null, 'postgres', $x$select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal$x$, 'n=0');

  select format('UAT total=%s pass=%s fail=%s | %s', count(*), count(*) filter (where pass), count(*) filter (where not pass),
    string_agg(tid || '=' || got || case when pass then '' else '!FAIL(erwartet ' || expect || ')' end, '; ' order by (regexp_replace(tid, '\D', '', 'g'))::int))
  into rep from pg_temp.res;
  raise exception '%', rep;
end $uat$;
