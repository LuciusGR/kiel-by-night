-- Kiel by Night · Storyteller als Administrator (v1.1)
-- Der ST darf alles sehen, ändern und löschen: auch private Notizen und Session-Notizen anderer,
-- Profile und Rollen, den Notion-Cache und Dateien in fremden Ordnern.
-- Sicherungen: Nur der ST ändert Rollen. Die eigene Rolle und das eigene Profil lassen sich nicht
-- ändern bzw. löschen (kein Aussperren). Spieler behalten ihre bisherigen Rechte.

-- ---------- Profile ----------
grant update (role) on public.profiles to authenticated;
grant insert, delete on public.profiles to authenticated;

create policy profiles_update_st on public.profiles
  for update to authenticated using ((select public.is_st())) with check ((select public.is_st()));
create policy profiles_insert_st on public.profiles
  for insert to authenticated with check ((select public.is_st()));
create policy profiles_delete_st on public.profiles
  for delete to authenticated using ((select public.is_st()) and id <> (select auth.uid()));

-- Spalten-GRANT allein schützt "role" nicht mehr (die Selbst-Policy erlaubt UPDATE der eigenen Zeile), daher dieser Trigger.
-- Ohne Anmeldung (SQL-Editor, service_role) greift er nicht.
create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    if not public.is_st() then
      raise exception 'Nur der Storyteller darf Rollen ändern' using errcode = '42501';
    end if;
    if old.id = auth.uid() then
      raise exception 'Die eigene Rolle lässt sich nicht ändern' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.profiles_guard() from public, anon, authenticated;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- Session-Notizen und private Notizen ----------
create policy session_notes_insert_st on public.session_notes
  for insert to authenticated with check ((select public.is_st()));
create policy session_notes_update_st on public.session_notes
  for update to authenticated using ((select public.is_st())) with check ((select public.is_st()));
create policy session_notes_delete_st on public.session_notes
  for delete to authenticated using ((select public.is_st()));

create policy private_notes_insert_st on public.private_notes
  for insert to authenticated with check ((select public.is_st()));
create policy private_notes_update_st on public.private_notes
  for update to authenticated using ((select public.is_st())) with check ((select public.is_st()));
create policy private_notes_delete_st on public.private_notes
  for delete to authenticated using ((select public.is_st()));

-- ---------- Notion-Cache ----------
grant insert, update, delete on public.notion_cache to authenticated;
create policy notion_cache_insert_st on public.notion_cache
  for insert to authenticated with check ((select public.is_st()));
create policy notion_cache_update_st on public.notion_cache
  for update to authenticated using ((select public.is_st())) with check ((select public.is_st()));
create policy notion_cache_delete_st on public.notion_cache
  for delete to authenticated using ((select public.is_st()));

-- ---------- Dateien ----------
-- Lesen und Löschen darf der ST schon überall. Neu: Hochladen in jeden Ordner.
create policy kbn_docs_insert_st on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (select public.is_st()));
