-- Kiel by Night · Sekte an Knoten der Spielerkarte (v1.9)
-- Die Form eines Knotens richtet sich nach der Sekte (wie auf der Storytellerkarte). '' = keine Angabe (Kreis).
-- Rechte und Policies ändern sich nicht: player_map_nodes hat Tabellenrechte und die Policies pmn_* für Mitglieder.

alter table public.player_map_nodes
  add column sect text not null default ''
  check (sect in ('', 'Camarilla', 'Anarch', 'Sabbat', 'Unabhängig', 'Second Inquisition'));
