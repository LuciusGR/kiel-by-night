-- Kiel by Night · Rechte der Chroniken-Tabellen nachziehen (v1.4)
-- Supabase vergibt auf neue Tabellen im Schema public automatisch alle Rechte an anon und authenticated
-- (Default Privileges). Die Migration 20261020120100 hat das für die damaligen Tabellen zurückgenommen.
-- Hier dasselbe für die neuen Tabellen: anon bekommt nichts, authenticated nur lesen und schreiben.
-- Row Level Security blockte anon schon vorher, das hier ist die zweite Absicherung.

revoke all on public.chronicles, public.chapters, public.session_info, public.scenes, public.scene_npcs from anon, authenticated;
grant select, insert, update, delete on
  public.chronicles, public.chapters, public.session_info, public.scenes, public.scene_npcs
to authenticated;
