-- Kiel by Night · Dokumente umbenennen und beschreiben (v1.6)
-- Der Uploader und der ST dürfen Titel und Beschreibung eines Dokuments ändern. Alles andere bleibt gesperrt:
-- Das Spalten-GRANT erlaubt nur title, description und draft (nicht Speicherpfad, Uploader, Dateiname, Größe).
-- Der Uploader ändert nur eigene, veröffentlichte Dokumente und kann sie nicht zum Entwurf machen (Entwürfe setzt nur der ST).

revoke update on public.documents from authenticated;
grant update (title, description, draft) on public.documents to authenticated;

create policy documents_update_own on public.documents
  for update to authenticated
  using (uploader_id = (select auth.uid()) and not draft)
  with check (uploader_id = (select auth.uid()) and not draft);
