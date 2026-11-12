-- Kiel by Night · Schutz der Spielercharakter-Knoten, Versionsverlauf im Wiki, Realtime für Sessions und Wiki (v1.15)
-- Die Website 1.15.0 läuft auch ohne diese Migration: Der Verlauf bleibt dann leer, Änderungen anderer erscheinen erst
-- nach dem Neuladen, und der Schutz der Spielercharakter-Knoten gilt nur in der Oberfläche.

-- ---------- 1) Knoten von Spielercharakteren löscht nur der Storyteller ----------
drop policy pmn_delete on public.player_map_nodes;
create policy pmn_delete on public.player_map_nodes
  for delete to authenticated
  using ((select public.is_member()) and (not is_pc or (select public.is_st())));

-- Sonst könnte ein Spieler das Kennzeichen entfernen und den Knoten danach löschen
create or replace function public.player_map_nodes_guard_pc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_pc is distinct from old.is_pc and auth.uid() is not null and not public.is_st() then
    raise exception 'Nur der Storyteller ändert, ob ein Knoten ein Spielercharakter ist.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.player_map_nodes_guard_pc() from public, anon, authenticated;
create trigger player_map_nodes_guard_pc before update on public.player_map_nodes
  for each row execute function public.player_map_nodes_guard_pc();

-- ---------- 2) Versionsverlauf der Wiki-Seiten ----------
-- Bei jeder Änderung von Titel, Text oder Tags wandert der alte Stand hierher. Je Seite bleiben die letzten 30 Stände.
create table public.wiki_page_versions (
  id       uuid primary key default gen_random_uuid(),
  page_id  uuid not null references public.wiki_pages(id) on delete cascade,
  title    text not null,
  body     text not null default '',
  tags     text[] not null default '{}',
  saved_at timestamptz not null default now(), -- Zeitpunkt, zu dem dieser Stand gespeichert worden war
  saved_by uuid                                 -- wer ihn geschrieben hatte
);
create index wiki_page_versions_page on public.wiki_page_versions(page_id, saved_at desc);

-- Neue Tabellen bekommen in Supabase automatisch alle Rechte: sofort entziehen, nur Lesen erlauben
revoke all on public.wiki_page_versions from anon, authenticated;
grant select on public.wiki_page_versions to authenticated;
alter table public.wiki_page_versions enable row level security;

-- Einen alten Stand sieht, wer die Seite selbst sieht (die Unterabfrage läuft mit den Rechten der abfragenden Person,
-- also gelten dort Kategorie-Sichtbarkeit und st_only der Seite)
create policy wiki_page_versions_select on public.wiki_page_versions
  for select to authenticated
  using (exists (select 1 from public.wiki_pages p where p.id = page_id));

-- security definer: Mitglieder haben kein Schreibrecht auf den Verlauf, der Trigger schreibt für sie
create or replace function public.wiki_pages_keep_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body or new.tags is distinct from old.tags then
    insert into public.wiki_page_versions(page_id, title, body, tags, saved_at, saved_by)
      values (old.id, old.title, old.body, old.tags, old.updated_at, old.updated_by);
    delete from public.wiki_page_versions v
      where v.page_id = old.id
        and v.id not in (select x.id from public.wiki_page_versions x where x.page_id = old.id order by x.saved_at desc, x.id limit 30);
  end if;
  return new;
end;
$$;
revoke execute on function public.wiki_pages_keep_version() from public, anon, authenticated;
create trigger wiki_pages_keep_version before update on public.wiki_pages
  for each row execute function public.wiki_pages_keep_version();

-- ---------- 3) Realtime: Änderungen anderer erscheinen ohne Neuladen ----------
-- Realtime prüft für jede Empfängerin die Lese-Policy der Tabelle, versteckte Wiki-Seiten bleiben also versteckt.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.session_notes, public.sessions, public.session_info, public.wiki_pages, public.characters;
  end if;
end $$;
