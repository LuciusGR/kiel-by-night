-- RLS-Tests für Kiel by Night. Läuft nach mock_supabase.sql + allen Migrationen.
-- Konten: ST = 1111…, Spieler P1 = 2222…, Spieler P2 = 3333…

\set st '\'11111111-1111-1111-1111-111111111111\''
\set p1 '\'22222222-2222-2222-2222-222222222222\''
\set p2 '\'33333333-3333-3333-3333-333333333333\''

\set outsider '\'44444444-4444-4444-4444-444444444444\''
insert into auth.users (id, email) values (:st, 'roland@x.de'), (:p1, 'p1@x.de'), (:p2, 'p2@x.de'), (:outsider, 'fremd@x.de');
-- Kein Auto-Profil: Fremdkonto (z. B. Selbstregistrierung) bekommt keines
do $$ begin if (select count(*) from public.profiles) <> 0 then raise exception 'Auto-Profil angelegt'; end if; end $$;
-- so legt Roland die Profile an (docs/Setup_Anleitung)
insert into public.profiles (id, display_name, role) values (:st, 'Roland', 'st'), (:p1, 'Spieler 1', 'player'), (:p2, 'Spieler 2', 'player');
update public.characters set owner_id = :p1 where clan = 'Tremere';
update public.characters set owner_id = :p2 where clan = 'Ventrue';

-- Hilfsfunktion: erwarteter Fehler
create or replace function pg_temp.expect_denied(sql text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ERWARTET VERWEIGERT, aber erlaubt: %', sql;
exception when insufficient_privilege or check_violation or foreign_key_violation then null;
end $$;
create or replace function pg_temp.rows(sql text) returns int language plpgsql as $$
declare n int; begin execute sql; get diagnostics n = row_count; return n; end $$;
create or replace function pg_temp.eq(a bigint, b bigint, msg text) returns void language plpgsql as $$
begin if a is distinct from b then raise exception 'FEHLER %: % <> %', msg, a, b; end if; end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- ================= anon =================
begin;
set local role anon;
select pg_temp.expect_denied('select * from public.profiles');
select pg_temp.expect_denied('select * from public.characters');
select public.ping();
rollback;

-- ================= Spieler P1 =================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select pg_temp.eq(public.is_st()::int, 0, 'P1 ist nicht ST');
-- Rolle nicht eskalierbar
select pg_temp.expect_denied($q$update public.profiles set role = 'st' where id = auth.uid()$q$);
select pg_temp.eq(pg_temp.rows($q$update public.profiles set display_name = 'Lukas-Spieler' where id = auth.uid()$q$), 1, 'eigener Anzeigename');
select pg_temp.eq(pg_temp.rows($q$update public.profiles set display_name = 'x' where id <> auth.uid()$q$), 0, 'fremder Anzeigename');

-- Charaktere: alle lesen, nur eigenen bearbeiten
select pg_temp.eq((select count(*) from public.characters), 3, 'P1 sieht 3 Bögen');
select pg_temp.eq(pg_temp.rows($q$update public.characters set sheet = '{"hunger":2}' where clan = 'Tremere'$q$), 1, 'eigener Bogen');
select pg_temp.eq(pg_temp.rows($q$update public.characters set sheet = '{"hunger":5}' where clan = 'Ventrue'$q$), 0, 'fremder Bogen');
select pg_temp.expect_denied($q$update public.characters set owner_id = '33333333-3333-3333-3333-333333333333' where clan = 'Tremere'$q$);
select pg_temp.expect_denied($q$insert into public.characters (name) values ('Fake')$q$);

-- Session-Notizen
insert into public.session_notes (session_number, body) values (1, 'P1 Notiz');
select pg_temp.expect_denied($q$insert into public.session_notes (session_number, body, author_id) values (1, 'gefälscht', '33333333-3333-3333-3333-333333333333')$q$);
insert into public.sessions (number, title) values (1, 'Auftakt');

-- Private Notizen
insert into public.private_notes (title, body) values ('geheim P1', 'nur ST darf das lesen');

-- Wiki: normale Kategorie anlegen ja, versteckte nein; ST-Notizen unsichtbar
select pg_temp.eq((select count(*) from public.wiki_categories), 4, 'P1 sieht 4 Kategorien (ohne ST-Notizen)');
insert into public.wiki_categories (name, created_by) values ('Clans', auth.uid());
select pg_temp.expect_denied($q$insert into public.wiki_categories (name, st_only, created_by) values ('heimlich', true, auth.uid())$q$);
select pg_temp.eq(pg_temp.rows($q$update public.wiki_categories set name = 'Leute' where name = 'Personen'$q$), 0, 'Spieler benennt nicht um');
select pg_temp.eq(pg_temp.rows($q$delete from public.wiki_categories where name = 'Clans'$q$), 0, 'Spieler löscht keine Kategorie');
insert into public.wiki_pages (category_id, title, body, created_by)
  select id, 'Prinz', 'Gerücht', auth.uid() from public.wiki_categories where name = 'Personen';

-- Dokumente: kein Entwurf als Spieler
insert into public.documents (title, storage_path) values ('P1 Handout', '22222222-2222-2222-2222-222222222222/a-handout.pdf');
select pg_temp.expect_denied($q$insert into public.documents (title, storage_path, draft) values ('x', '22222222-2222-2222-2222-222222222222/b.pdf', true)$q$);
insert into storage.objects (bucket_id, name) values ('documents', '22222222-2222-2222-2222-222222222222/a-handout.pdf');
select pg_temp.expect_denied($q$insert into storage.objects (bucket_id, name) values ('documents', '33333333-3333-3333-3333-333333333333/fremd.pdf')$q$);

-- Spielerkarte: alle schreiben; ST-Positionen nein
insert into public.player_map_nodes (label, type) values ('Prinz Aniq', 'Kindred');
insert into public.map_positions (scope, node_key, x, y) values ('player', 'abc', 1, 2);
select pg_temp.expect_denied($q$insert into public.map_positions (scope, node_key, x, y) values ('st', 'abc', 1, 2)$q$);
select pg_temp.eq((select count(*) from public.notion_cache), 0, 'P1 sieht keinen Notion-Cache');
commit;

-- ================= Storyteller =================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.eq(public.is_st()::int, 1, 'ST erkannt');
select pg_temp.eq((select count(*) from public.private_notes), 1, 'ST liest private Notizen');
select pg_temp.eq(pg_temp.rows($q$update public.private_notes set body = 'ST schreibt'$q$), 0, 'ST schreibt keine fremden privaten Notizen');
select pg_temp.eq(pg_temp.rows($q$update public.characters set sheet = '{"hunger":3}' where clan = 'Ventrue'$q$), 1, 'ST bearbeitet jeden Bogen');
select pg_temp.eq((select count(*) from public.wiki_categories), 6, 'ST sieht alle Kategorien inkl. ST-Notizen');
select pg_temp.eq(pg_temp.rows($q$update public.wiki_categories set name = 'Gerüchte' where name = 'Gerüchte & Theorien'$q$), 1, 'ST benennt um');
insert into public.wiki_pages (category_id, title, body, created_by)
  select id, 'Plan Akt 2', 'geheim', auth.uid() from public.wiki_categories where st_only;
insert into public.documents (title, storage_path, draft) values ('Annales Isarnhoenses', '11111111-1111-1111-1111-111111111111/annales.pdf', true);
insert into storage.objects (bucket_id, name) values ('documents', '11111111-1111-1111-1111-111111111111/annales.pdf');
insert into public.map_positions (scope, node_key, x, y) values ('st', 'npc1', 5, 5);
reset role;
insert into public.notion_cache (id, payload) values (1, '{"npcs":[],"rels":[]}');  -- wie service_role
set local role authenticated;
select pg_temp.eq((select count(*) from public.notion_cache), 1, 'ST liest Notion-Cache');
-- Kategorie mit Seiten nicht löschbar
select pg_temp.expect_denied($q$delete from public.wiki_categories where name = 'Personen'$q$);
commit;

-- ================= Spieler P2 =================
select id as stcat from public.wiki_categories where st_only \gset
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select pg_temp.eq((select count(*) from public.private_notes), 0, 'P2 sieht keine fremden privaten Notizen');
select pg_temp.eq((select count(*) from public.wiki_pages), 1, 'P2 sieht ST-Seite nicht');
select pg_temp.eq((select count(*) from public.documents), 1, 'P2 sieht ST-Entwurf nicht');
select pg_temp.eq((select count(*) from storage.objects), 1, 'P2 sieht nur Datei des freigegebenen Dokuments');
select pg_temp.eq((select count(*) from public.map_positions), 1, 'P2 sieht keine ST-Positionen');
select pg_temp.eq(pg_temp.rows($q$update public.session_notes set body = 'überschrieben'$q$), 0, 'P2 ändert keine fremde Notiz');
select pg_temp.eq(pg_temp.rows($q$delete from public.documents$q$), 0, 'P2 löscht kein fremdes Dokument');
select pg_temp.eq(pg_temp.rows($q$delete from storage.objects$q$), 0, 'P2 löscht keine fremde Datei');
-- Wiki-Seite von P1 bearbeiten ja, löschen nein, Ersteller fälschen nein
select pg_temp.eq(pg_temp.rows($q$update public.wiki_pages set body = 'ergänzt von P2', created_by = auth.uid()$q$), 1, 'P2 bearbeitet Wiki-Seite');
select pg_temp.eq((select count(*) from public.wiki_pages where created_by = '22222222-2222-2222-2222-222222222222'), 1, 'created_by unverändert');
select pg_temp.eq(pg_temp.rows($q$delete from public.wiki_pages$q$), 0, 'P2 löscht fremde Wiki-Seite nicht');
-- Seite in versteckte Kategorie verschieben: verboten
select pg_temp.expect_denied('update public.wiki_pages set category_id = ' || quote_literal(:'stcat') || '::uuid');
commit;

-- ST gibt Entwurf frei → P2 sieht Dokument und Datei
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update public.documents set draft = false where title = 'Annales Isarnhoenses';
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select pg_temp.eq((select count(*) from public.documents), 2, 'P2 sieht freigegebenes Dokument');
select pg_temp.eq((select count(*) from storage.objects), 2, 'P2 sieht freigegebene Datei');
commit;

-- ================= Angemeldet, aber ohne Profil (Selbstregistrierung) =================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select pg_temp.eq((select count(*) from public.profiles), 0, 'Fremd: keine Profile');
select pg_temp.eq((select count(*) from public.characters), 0, 'Fremd: keine Bögen');
select pg_temp.eq((select count(*) from public.session_notes), 0, 'Fremd: keine Notizen');
select pg_temp.eq((select count(*) from public.wiki_categories), 0, 'Fremd: keine Kategorien');
select pg_temp.eq((select count(*) from public.wiki_pages), 0, 'Fremd: keine Wiki-Seiten');
select pg_temp.eq((select count(*) from public.documents), 0, 'Fremd: keine Dokumente');
select pg_temp.eq((select count(*) from storage.objects), 0, 'Fremd: keine Dateien');
select pg_temp.eq((select count(*) from public.player_map_nodes), 0, 'Fremd: keine Karte');
select pg_temp.eq((select count(*) from public.map_positions), 0, 'Fremd: keine Positionen');
select pg_temp.eq((select count(*) from public.sessions), 0, 'Fremd: keine Sessions');
select pg_temp.expect_denied($q$insert into public.player_map_nodes (label) values ('Spam')$q$);
select pg_temp.expect_denied($q$insert into public.sessions (number) values (99)$q$);
select pg_temp.expect_denied($q$insert into public.wiki_categories (name, created_by) values ('Spam', auth.uid())$q$);
select pg_temp.expect_denied($q$insert into storage.objects (bucket_id, name) values ('documents', '44444444-4444-4444-4444-444444444444/x.pdf')$q$);
select pg_temp.eq(pg_temp.rows($q$update public.player_map_nodes set label = 'x'$q$), 0, 'Fremd: Karte nicht änderbar');
commit;

-- Seed geprüft
do $$ begin
  if (select count(*) from public.player_map_nodes where is_pc) <> 3 then raise exception 'Seed: 3 SC-Knoten fehlen'; end if;
end $$;
