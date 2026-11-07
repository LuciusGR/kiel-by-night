# Kiel by Night · Konzept Kartenansicht (v0.1)

Stand: 07.11.2026 · Status: **Entwurf zur Abstimmung.** Es wurde nichts an `web/`, `supabase/` oder den Tests geändert. Das Mockup liegt in `docs/mockups/Kartenansicht_Mockup_v0_1.html` und lässt sich lokal im Browser öffnen (Schriften kommen aus `web/fonts/`, kein Aufruf nach außen).

Dieses Dokument wird nicht überschrieben. Änderungen kommen als `Konzept_Kartenansicht_v0_2.md` usw.

## 1. Ziel

Die Beziehungskarte zeigt heute nur, wer mit wem verbunden ist. Neu soll sie auch zeigen, **wo in Kiel** die Figuren sitzen: durch Platzieren der Figuren auf einer Karte der Stadt. Daraus lassen sich Reviere, Wege, Nähe und Konfliktlinien ablesen, die der Graph nicht zeigt.

Nicht Ziel: ein vollwertiges Kartenprogramm, Routenplanung, Echtzeit-Standorte.

## 2. Leitidee

- Jede Figur bekommt **zwei Positionen**: die bisherige im Graph und eine neue auf der Karte.
- Ein Umschalter „Graph | Karte“ wechselt die Ansicht. Figuren, Formen, Farben, Verbindungen und Detailfeld bleiben gleich. Im Mockup gleiten die Figuren beim Umschalten von einer Position zur anderen.
- Der Graph bleibt unverändert nutzbar. Wer die Karte nicht braucht, merkt keinen Unterschied.

## 3. Bedienkonzept (im Mockup ausprobierbar)

### 3.1 Drei Zustände der Verortung

| Zustand | Bedeutung | Darstellung |
|---|---|---|
| Verankert | Figur gehört zu einem benannten Ort (Elysium, Refugium, Jagdgebiet …) | Figuren am selben Ort ordnen sich im Kreis um die Markierung |
| Frei | Figur steht an einer Koordinate ohne Ort | Stadtteil wird aus der Koordinate berechnet |
| Nicht verortet | noch keine Kartenposition | liegt in der **Ablage** unter der Karte |

### 3.2 Platzieren

- Nur im Modus „Bearbeitung“ (wie auf der Spielerkarte heute). In „Ansehen“ ist alles gesperrt.
- Figur aus der Ablage auf die Karte ziehen. Wird sie näher als etwa 36 Kartenpunkte an einer Ortsmarkierung losgelassen, **rastet sie dort ein**.
- Figur zurück in die Ablage ziehen entfernt sie von der Karte.
- Im Wasser lässt sich nichts ablegen. Die Figur springt an die alte Stelle zurück.
- Alternative ohne Ziehen (für das Handy): im Detailfeld „Anker setzen“ per Auswahlliste.

### 3.3 Ebenen und Filter

- Ebenen: **Stadtteile** (Umrisse und Namen), **Orte** (Markierungen), **Herrschaft** (Stadtteile nach Sekte gefärbt, umstritten schraffiert), **Namen**.
- Typ-Filter wie heute.
- Beziehungslinien: **Auswahl** (Standard: nur die der angewählten Figur, beschriftet), **Alle**, **Aus**. Zu viele Linien über eine Stadtkarte sind unlesbar, deshalb ist „Auswahl“ der Standard.
- Im Detailfeld steht je Verbindung die **geschätzte Luftlinie** in km. Das beantwortet Fragen wie „Schafft der das in einer Nacht?“.

### 3.4 Detailfeld

- Figur: Zustand, Ort, Stadtteil, Herrschaft, Kartenpunkt, Verbindungen mit Entfernung.
- Ort: Art, Stadtteil, wer ist anwesend.
- Stadtteil: Herrschaft (im Modus Bearbeitung änderbar), Orte, Figuren darin.

### 3.5 Perspektive

Der Schalter „Perspektive: Storyteller | Spieler“ ist nur im Mockup. Er zeigt, was passiert, wenn Figuren mit Vermerk „nur ST“ ausgeblendet werden: Figuren und ihre Verbindungen verschwinden. In der Website entscheidet die Karte (ST-Karte oder Spielerkarte) und die Rolle, nicht ein Schalter.

## 4. Datenmodell (Vorschlag)

### 4.1 Positionen

Heute: `map_positions(scope, node_key, x, y)` mit `scope in ('player','st')`, Schlüssel = Knoten-ID bzw. Notion-ID (siehe `supabase/migrations/20261020120000_schema_v1_0.sql`).

Vorschlag: zwei neue Scopes `player_geo` und `st_geo` in derselben Tabelle. Keine neue Tabelle für Koordinaten nötig.

- **Koordinaten als Längen- und Breitengrad** (`x` = Länge, `y` = Breite, beide `double precision`, reichen dafür). Damit bleibt die Kartenquelle austauschbar. Wer später eine bessere Karte einsetzt, verschiebt keine Figur.
- Migration: Check-Constraint auf `scope` erweitern.
- **Rechte:** Die bestehenden Policies lauten sinngemäß „`scope = 'player'` für alle Mitglieder, sonst nur ST“ (`20261020120100_rls_v1_0.sql`, Abschnitt `map_positions`). Ein neuer Scope `player_geo` wäre damit **nur für den ST** zugänglich. Die Policies müssen daher auf `scope in ('player','player_geo')` erweitert werden. Das gehört in dieselbe Migration und in `tests/rls_test.sql`.

### 4.2 Anker (Orte)

Neue Tabelle `map_places`: `id`, `name`, `kind` (Elysium, Refugium, Jagdgebiet, Treffpunkt, Ereignisort, erweiterbar), `x`, `y` (Länge/Breite), `description`, `st_only` (bool), `created_by`.

Verankerung einer Figur: Spalte `place_id` an den Positionen der Geo-Scopes (nullable). Ist `place_id` gesetzt, zählt der Ort, nicht die Koordinate der Figur. Wird ein Ort verschoben, ziehen alle verankerten Figuren mit.

### 4.3 Herrschaft

Neue Tabelle oder Spalte je Stadtteil: `district_id`, `owner` (Camarilla, Anarchen, Sabbat, umstritten, ungeklärt), `st_only`. Stadtteile selbst kommen mit der Kartenquelle (Abschnitt 6) als Polygone.

### 4.4 Notion

Es ändert sich nichts an Notion. Die Verortung wird wie die Graph-Positionen heute **nur in Supabase** gespeichert, Schlüssel ist die Notion-ID. Eine spätere Option wäre ein Notion-Feld „Ort“, das beim Laden als Vorschlag für den Anker dient. Das bräuchte eine Änderung an `supabase/functions/notion-proxy/index.ts` und ist nicht Teil von Phase 1.

## 5. Rechte

| Karte | Wer sieht Figuren | Wer verortet |
|---|---|---|
| ST-Karte | nur ST (alle Notion-Figuren) | nur ST |
| Spielerkarte | alle Mitglieder (nur eingetragene Figuren) | alle Mitglieder |

- Verortungen sind **je Karte getrennt**. Der ST kann einen NPC verorten, ohne dass die Spieler es sehen.
- Orte und Herrschaft mit `st_only` erscheinen nur dem ST.
- Spielerkarte: Orte legen Spieler selbst an (Vorschlag), Herrschaft pflegen sie gemeinsam wie die Verbindungen heute.

## 6. Kartenquelle

| Option | Vorteil | Nachteil |
|---|---|---|
| A · Eigene Schemakarte (SVG von Hand, wie im Mockup) | keine externen Aufrufe, Stil frei, sofort lesbar | nicht maßstäblich, von Hand gezeichnet |
| **B · OSM-Daten einmalig vereinfachen, als SVG oder GeoJSON ins Repository** | echte Geometrie, keine externen Aufrufe im Betrieb, Stil frei | einmalige Aufbereitung, Quellenangabe nötig |
| C · Live-Kacheln (z. B. Leaflet) | zoombar bis zur Straße | jeder Seitenaufruf fragt einen Kartenserver an |

**Empfehlung: B.** Option C widerspricht dem Grundsatz aus Version 1.12.0, Schriften und Bibliotheken lokal zu halten und beim Seitenaufruf nichts Externes zu laden (`CHANGELOG.md`, Abschnitt 1.12.0).

Quellenangabe: Kartendaten von OpenStreetMap stehen unter der Open Database License. Erforderlich ist die Nennung „© OpenStreetMap-Mitwirkende“ (Hinweise: https://www.openstreetmap.org/copyright). Die Angabe gehört in die Fußzeile der Kartenansicht.

Das Mockup nutzt Option A, weil keine Geodaten abgerufen wurden. **Die Umrisse im Mockup sind aus dem Gedächtnis gezeichnet und nicht verlässlich.** Stadtteilnamen und Orte (z. B. Kieler Schloss, Südfriedhof, Schleuse Holtenau, Vinetaplatz) sind real, ihre Lage ist nur ungefähr.

## 7. Technische Umsetzung (Skizze)

- `MapView` in `web/js/views/map.js` bekommt einen zweiten Positionssatz und den Umschalter. Die Quelle `src` liefert zusätzlich `geoPositions` und `saveGeoPositions()` (Muster wie `loadPositions`/`savePositions` in `playermap.js`).
- Cytoscape bleibt. Die Karte liegt als SVG **hinter** dem Cytoscape-Fenster und wird über das Ereignis `viewport` (Pan und Zoom) mitgeführt (Dokumentation: https://js.cytoscape.org/). Dadurch bleiben Auswahl, Hervorhebung, Suche, Export und Realtime unverändert.
- Karten-Positionen in Längen-/Breitengrad werden beim Laden in Kartenpunkte projiziert (einfache Mercator-Näherung genügt für Stadtmaßstab).
- Verankerte Figuren: Ringanordnung um den Ort wird zur Laufzeit berechnet und nicht gespeichert.
- Stadtteil einer Figur: Punkt-in-Polygon gegen die Stadtteilumrisse, ebenfalls zur Laufzeit.
- Export (`export.js`): zusätzliche Spalten Ort, Stadtteil, Länge, Breite.
- Tests: neue UAT-Fälle für Umschalten, Einrasten, Ablage, Rechte (Spieler sieht keine ST-Verortung). RLS-Tests für die neuen Scopes.
- Dokumentation: `Technische_Doku.md` (Abschnitte 4.4, 5, 6), `Benutzerhandbuch.md`, `CHANGELOG.md` (MINOR-Version, weil Funktion und Schema).

## 8. Phasen

1. **Phase 1, Karte lesen und platzieren:** Umschalter, Kartenunterlage, freie Platzierung, Ablage, Stadtteil aus Koordinate, Rechte und Migration. Keine Orte, keine Herrschaft.
2. **Phase 2, Orte und Herrschaft:** `map_places`, Einrasten, Ebenen „Orte“ und „Herrschaft“, Luftlinie im Detailfeld.
3. **Phase 3, Zeit:** Zeitschieber je Session. Orte aus den Szenen (`scenes`) als Spur der Coterie. Erst nach Rückmeldung zu den Phasen 1 und 2.

## 9. Risiken

- **Unübersichtlichkeit:** viele Figuren an einem Ort. Gegenmittel: Ringanordnung, Namen abschaltbar, Zoom, Filter.
- **Handy:** Ziehen auf kleiner Karte ist mühsam. Gegenmittel: Anker per Auswahlliste, Karte horizontal scrollbar.
- **Spoiler:** Verortung eines NPC verrät, wo er sich aufhält. Deshalb getrennte Scopes und `st_only`.
- **Pflegeaufwand:** Zwei Positionen je Figur müssen gepflegt werden. Gegenmittel: fehlende Verortung ist normal (Ablage), nichts ist Pflicht.
- **Kartendaten:** Aufbereitung von OSM-Daten ist einmalige Arbeit und braucht Prüfung der Lizenzangabe.

## 10. Offene Entscheidungen

| # | Frage | Vorschlag |
|---|---|---|
| 1 | Stadtplan-Look oder Schemaplan (wie ein Netzplan)? | Schemaplan, weil lesbarer und leichter zu pflegen |
| 2 | Kartenquelle | B (OSM einmalig vereinfacht) |
| 3 | Wer pflegt Orte und Herrschaft? | Orte: ST und Spieler, Herrschaft: ST (Spielerkarte gemeinsam) |
| 4 | Herrschaft in Notion pflegen? | Nein, nur in Supabase, um Notion unangetastet zu lassen |
| 5 | Koordinaten als Länge/Breite? | Ja |
| 6 | Zeitschieber (Phase 3) | später entscheiden |
| 7 | Handy-Bedienung ohne Ziehen | Anker per Auswahlliste |

## 11. Beobachtungen aus der Vorarbeit

- **Farben im Stil Rulebook:** Auf der Website ist `--sea` (Sterblicher) im Rulebook-Stil Karmesinrot und `--blood` (Kindred) dunkles Karmesin (`web/css/theme-v5.css`). Beide sind auf der Karte schwer zu unterscheiden. Das Mockup nutzt für Sterbliche deshalb Blaugrau (`--slate`). Wenn die Karte kommt, sollte die Farbzuordnung in `map.js` (`TYPE_TOK`) geprüft werden.
- Alle Figuren, Orte und Herrschaftsverhältnisse im Mockup sind **Beispiele** und keine Aussagen über die Chronik.

## 12. Änderungen an diesem Dokument

- **07.11.2026 (v0.1):** Erstfassung mit Mockup `docs/mockups/Kartenansicht_Mockup_v0_1.html`.
