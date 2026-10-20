-- Kiel by Night · service_role darf den Notion-Cache lesen und schreiben (v1.0)
-- Die Edge Function notion-proxy speichert ihr Ergebnis mit dem service_role-Schlüssel in
-- public.notion_cache. Ohne dieses Recht meldet die ST-Karte "Cache nicht gespeichert".
-- Bei Projekten ohne "Automatically expose new tables" bekommt service_role es nicht automatisch.

grant select, insert, update, delete on public.notion_cache to service_role;
