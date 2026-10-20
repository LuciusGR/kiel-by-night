-- Kiel by Night · Rechte (GRANT + Row Level Security) v1.0
-- Grundsatz: anon darf nichts außer ping(). authenticated bekommt Tabellenrechte,
-- RLS schränkt zeilenweise ein. Mitglied = hat ein Profil (public.is_member()),
-- der ST wird über public.is_st() erkannt. Angemeldet ohne Profil = sieht nichts.

-- ---------- GRANTs (Projekt ohne "Automatically expose new tables") ----------
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

grant usage on schema public to anon, authenticated;
grant execute on function public.ping() to anon, authenticated;
grant execute on function public.is_st() to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.wiki_category_visible(uuid) to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, insert, update, delete on
  public.characters, public.sessions, public.session_notes, public.private_notes,
  public.wiki_categories, public.wiki_pages, public.documents,
  public.player_map_nodes, public.player_map_edges, public.map_positions
to authenticated;

grant select on public.notion_cache to authenticated;

-- ---------- RLS einschalten ----------
alter table public.profiles         enable row level security;
alter table public.characters       enable row level security;
alter table public.sessions         enable row level security;
alter table public.session_notes    enable row level security;
alter table public.private_notes    enable row level security;
alter table public.wiki_categories  enable row level security;
alter table public.wiki_pages       enable row level security;
alter table public.documents        enable row level security;
alter table public.player_map_nodes enable row level security;
alter table public.player_map_edges enable row level security;
alter table public.map_positions    enable row level security;
alter table public.notion_cache     enable row level security;

-- ---------- profiles ----------
create policy profiles_select on public.profiles
  for select to authenticated using ((select public.is_member()));
-- nur eigener Anzeigename; role ist per Spalten-GRANT gesperrt
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------- characters: alle lesen, Besitzer und ST bearbeiten ----------
create policy characters_select on public.characters
  for select to authenticated using ((select public.is_member()));
create policy characters_insert_st on public.characters
  for insert to authenticated with check ((select public.is_st()));
create policy characters_update on public.characters
  for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_st()))
  with check (owner_id = (select auth.uid()) or (select public.is_st()));
create policy characters_delete_st on public.characters
  for delete to authenticated using ((select public.is_st()));

-- ---------- sessions (Titel/Datum): alle lesen und pflegen ----------
create policy sessions_select on public.sessions
  for select to authenticated using ((select public.is_member()));
create policy sessions_insert on public.sessions
  for insert to authenticated with check ((select public.is_member()));
create policy sessions_update on public.sessions
  for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy sessions_delete_st on public.sessions
  for delete to authenticated using ((select public.is_st()));

-- ---------- session_notes: alle lesen, jede Person schreibt nur ihren Abschnitt ----------
create policy session_notes_select on public.session_notes
  for select to authenticated using ((select public.is_member()));
create policy session_notes_insert on public.session_notes
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy session_notes_update on public.session_notes
  for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy session_notes_delete on public.session_notes
  for delete to authenticated using (author_id = (select auth.uid()));

-- ---------- private_notes: Besitzer schreibt, Besitzer und ST lesen ----------
create policy private_notes_select on public.private_notes
  for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_st()));
create policy private_notes_insert on public.private_notes
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy private_notes_update on public.private_notes
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy private_notes_delete on public.private_notes
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------- wiki_categories: alle anlegen, nur ST umbenennen/löschen ----------
create policy wiki_categories_select on public.wiki_categories
  for select to authenticated using ((select public.is_member()) and (not st_only or (select public.is_st())));
create policy wiki_categories_insert on public.wiki_categories
  for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()) and (not st_only or (select public.is_st())));
create policy wiki_categories_update_st on public.wiki_categories
  for update to authenticated using ((select public.is_st())) with check ((select public.is_st()));
create policy wiki_categories_delete_st on public.wiki_categories
  for delete to authenticated using ((select public.is_st()));

-- ---------- wiki_pages: sichtbar je Kategorie; löschen nur Ersteller oder ST ----------
create policy wiki_pages_select on public.wiki_pages
  for select to authenticated using (public.wiki_category_visible(category_id));
create policy wiki_pages_insert on public.wiki_pages
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.wiki_category_visible(category_id));
create policy wiki_pages_update on public.wiki_pages
  for update to authenticated
  using (public.wiki_category_visible(category_id))
  with check (public.wiki_category_visible(category_id));
create policy wiki_pages_delete on public.wiki_pages
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.is_st()));

-- ---------- documents: Entwürfe nur für ST; löschen Uploader oder ST ----------
create policy documents_select on public.documents
  for select to authenticated using ((select public.is_member()) and (not draft or (select public.is_st())));
create policy documents_insert on public.documents
  for insert to authenticated
  with check (uploader_id = (select auth.uid()) and (not draft or (select public.is_st())));
create policy documents_update_st on public.documents
  for update to authenticated using ((select public.is_st())) with check ((select public.is_st()));
create policy documents_delete on public.documents
  for delete to authenticated
  using (uploader_id = (select auth.uid()) or (select public.is_st()));

-- ---------- Spielerkarte: gemeinsam bearbeitbar ----------
create policy pmn_select on public.player_map_nodes for select to authenticated using ((select public.is_member()));
create policy pmn_insert on public.player_map_nodes for insert to authenticated with check ((select public.is_member()));
create policy pmn_update on public.player_map_nodes for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy pmn_delete on public.player_map_nodes for delete to authenticated using ((select public.is_member()));

create policy pme_select on public.player_map_edges for select to authenticated using ((select public.is_member()));
create policy pme_insert on public.player_map_edges for insert to authenticated with check ((select public.is_member()));
create policy pme_update on public.player_map_edges for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy pme_delete on public.player_map_edges for delete to authenticated using ((select public.is_member()));

-- ---------- map_positions: Spielerkarte alle, ST-Karte nur ST ----------
create policy pos_select on public.map_positions
  for select to authenticated using ((scope = 'player' and (select public.is_member())) or (select public.is_st()));
create policy pos_insert on public.map_positions
  for insert to authenticated with check ((scope = 'player' and (select public.is_member())) or (select public.is_st()));
create policy pos_update on public.map_positions
  for update to authenticated
  using ((scope = 'player' and (select public.is_member())) or (select public.is_st()))
  with check ((scope = 'player' and (select public.is_member())) or (select public.is_st()));
create policy pos_delete on public.map_positions
  for delete to authenticated using ((scope = 'player' and (select public.is_member())) or (select public.is_st()));

-- ---------- notion_cache: nur ST liest; geschrieben wird per service_role ----------
create policy notion_cache_select_st on public.notion_cache
  for select to authenticated using ((select public.is_st()));

-- ---------- Realtime für die gemeinsame Spielerkarte ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.player_map_nodes, public.player_map_edges;
  end if;
end $$;
