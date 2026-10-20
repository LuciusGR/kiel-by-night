-- Kiel by Night · Storage v1.0
-- Privater Bucket "documents". Pfad: <uploader-uuid>/<zufall>-<dateiname>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 20971520,
        array['application/pdf','image/png','image/jpeg','image/webp','image/gif','text/plain','text/markdown'])
on conflict (id) do nothing;

-- Lesen: eigene Dateien, ST alles, sonst nur Dateien zu freigegebenen Dokumenten.
create policy kbn_docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_st())
      or ((select public.is_member()) and exists (select 1 from public.documents d where d.storage_path = objects.name and not d.draft))
    )
  );

-- Hochladen: nur in den eigenen Ordner.
create policy kbn_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (select public.is_member()) and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Löschen: eigene Dateien oder ST.
create policy kbn_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_st())
    )
  );
