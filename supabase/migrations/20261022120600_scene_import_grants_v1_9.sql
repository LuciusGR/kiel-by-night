-- Kiel by Night · Rechte für die Edge Function scene-import (v1.9)
-- In diesem Projekt bekommt service_role neue Tabellen nicht automatisch (siehe 20261020120400).
-- scene-import braucht genau das, nicht mehr: Chroniken und Session-Infos lesen, Szenen und deren NPCs anlegen,
-- eine halb angelegte Szene zurücknehmen. Kein UPDATE, kein DELETE auf scene_npcs, nichts an anderen Tabellen.
-- (Den NPC-Cache liest die Function über das bestehende Recht aus 20261020120400.)

grant select on public.chronicles, public.session_info to service_role;
grant select, insert, delete on public.scenes to service_role;
grant select, insert on public.scene_npcs to service_role;
