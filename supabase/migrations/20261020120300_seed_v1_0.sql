-- Kiel by Night · Startdaten v1.0
-- Ersetzt den Umzug aus dem alten Artifact (Übergabe Abschnitt 7: neu anlegen statt migrieren).
-- Besitzer der Charaktere setzt Roland nach dem Anlegen der Konten (docs/Setup_Anleitung).

insert into public.characters (name, clan, sort, sheet) values
  ('Dr. Lucas „Lukas“ Feller',               'Tremere',   1, '{}'::jsonb),
  ('Johana Talschmidt',                      'Ventrue',   2, '{}'::jsonb),
  ('Steven „Damien Dark“ Felsenheimer',      'Malkavian', 3, '{}'::jsonb);

insert into public.player_map_nodes (label, type, tags, is_pc, character_id, created_by)
select c.name, 'Kindred', array['Spielercharakter'], true, c.id, null
from public.characters c;

insert into public.wiki_categories (name, sort, st_only, created_by) values
  ('Personen',             1, false, null),
  ('Orte',                 2, false, null),
  ('Fraktionen',           3, false, null),
  ('Gerüchte & Theorien',  4, false, null),
  ('ST-Notizen',          90, true,  null);
