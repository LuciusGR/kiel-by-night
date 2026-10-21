-- Kiel by Night · Dokumente mit Karten-Elementen verknüpfen (v1.7)
-- Ein Dokument kann mit Knoten der Spielerkarte (scope 'player', node_key = player_map_nodes.id) und der
-- Storytellerkarte (scope 'st', node_key = Notion-ID des NPC) verknüpft werden, in beiden Richtungen sichtbar.
-- Rechte: Spielerkarten-Verknüpfungen lesen und anlegen alle Mitglieder (wie die Spielerkarte selbst), soweit sie das
-- Dokument sehen. Verknüpfungen der Storytellerkarte sehen und ändern nur ST (sie würden NPC-Namen verraten).
-- Ändern gibt es nicht (nur anlegen und löschen).

create table public.document_links (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  scope       text not null check (scope in ('player','st')),
  node_key    text not null check (length(node_key) > 0),
  label       text not null default '',
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (document_id, scope, node_key)
);
create index on public.document_links(scope, node_key);

-- Supabase gibt neue Tabellen automatisch für anon frei: entziehen und gezielt vergeben (siehe 20261022120100)
revoke all on public.document_links from anon, authenticated;
grant select, insert, delete on public.document_links to authenticated;

alter table public.document_links enable row level security;

-- Die Unterabfrage auf documents läuft unter RLS: Entwürfe und damit ihre Verknüpfungen bleiben für Spieler unsichtbar.
create policy document_links_select on public.document_links
  for select to authenticated using (
    (select public.is_member())
    and (scope = 'player' or (select public.is_st()))
    and exists (select 1 from public.documents d where d.id = document_id));
create policy document_links_insert on public.document_links
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.documents d where d.id = document_id)
    and ((scope = 'player' and (select public.is_member())) or (scope = 'st' and (select public.is_st()))));
create policy document_links_delete on public.document_links
  for delete to authenticated using (
    exists (select 1 from public.documents d where d.id = document_id)
    and ((scope = 'player' and (select public.is_member())) or (select public.is_st())));

-- Wird ein Knoten der Spielerkarte gelöscht, verschwinden seine Verknüpfungen.
create function public.player_node_links_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.document_links where scope = 'player' and node_key = old.id::text;
  return old;
end $$;
revoke execute on function public.player_node_links_cleanup() from public, anon, authenticated;
create trigger player_map_nodes_links_cleanup after delete on public.player_map_nodes
  for each row execute function public.player_node_links_cleanup();
