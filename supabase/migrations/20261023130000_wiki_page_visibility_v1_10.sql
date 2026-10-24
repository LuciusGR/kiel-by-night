-- Kiel by Night · Sichtbarkeit einzelner Wiki-Seiten (v1.10)
-- Jede Seite kann nur für den ST sichtbar sein (st_only). Zusätzlich zur Kategorie-Sichtbarkeit.
-- Nur der ST setzt das Feld (Trigger). Bestehende Seiten bleiben sichtbar (Standard false).

alter table public.wiki_pages add column st_only boolean not null default false;

-- Lesen: Seite muss in sichtbarer Kategorie liegen; versteckte Seiten nur für den ST
drop policy wiki_pages_select on public.wiki_pages;
create policy wiki_pages_select on public.wiki_pages
  for select to authenticated
  using (public.wiki_category_visible(category_id) and (not st_only or (select public.is_st())));

-- Anlegen und Ändern: versteckte Seiten gelten nur für den ST (Spieler sehen sie nach dem Speichern sonst nicht)
drop policy wiki_pages_insert on public.wiki_pages;
create policy wiki_pages_insert on public.wiki_pages
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.wiki_category_visible(category_id) and (not st_only or (select public.is_st())));

drop policy wiki_pages_update on public.wiki_pages;
create policy wiki_pages_update on public.wiki_pages
  for update to authenticated
  using (public.wiki_category_visible(category_id) and (not st_only or (select public.is_st())))
  with check (public.wiki_category_visible(category_id) and (not st_only or (select public.is_st())));

-- Nur der ST darf die Sichtbarkeit ändern (sonst könnte ein Spieler eine Seite für alle verstecken)
create or replace function public.wiki_pages_guard_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.st_only) or (tg_op = 'UPDATE' and new.st_only is distinct from old.st_only) then
    if not public.is_st() then
      raise exception 'Nur der ST kann die Sichtbarkeit einer Wiki-Seite ändern.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger wiki_pages_guard_visibility before insert or update on public.wiki_pages
  for each row execute function public.wiki_pages_guard_visibility();
