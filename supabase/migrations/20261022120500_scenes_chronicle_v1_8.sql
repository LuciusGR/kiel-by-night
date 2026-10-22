-- Kiel by Night · Szenen einer Chronik zuordnen (v1.8)
-- Eine Szene gehört optional zu einer Chronik, auch im Vorrat ohne Session. null = ohne Chronik.
-- Löscht man die Chronik, bleibt die Szene erhalten (set null).
-- Rechte und Policies ändern sich nicht: scenes bleibt nur für den Storyteller (Policy scenes_st, Grants aus v1_4).

alter table public.scenes add column chronicle_id uuid references public.chronicles(id) on delete set null;
create index on public.scenes(chronicle_id);
