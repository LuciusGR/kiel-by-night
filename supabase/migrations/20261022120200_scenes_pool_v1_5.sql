-- Kiel by Night · Szenen ohne Session, der Szenen-Vorrat (v1.5)
-- Szenenkarten lassen sich sammeln, ohne sie vorab einer Session zuzuordnen. session_number = null heißt Vorrat.
-- Die Prüfung (session_number > 0) bleibt: null ist erlaubt, 0 und negative Zahlen nicht.
-- Rechte und Policies ändern sich nicht (Szenen bleiben nur für den Storyteller).

alter table public.scenes alter column session_number drop not null;
