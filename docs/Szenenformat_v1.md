# Szenenformat `kbn-scenes/1`

Stand 22.10.2026. Dieses Format beschreibt Szenenkarten für **eine Session** als JSON-Datei. Der Storyteller lädt sie in der Session-Ansicht über „Szenen importieren“ hoch. Claude kann die Datei aus Stichpunkten, Notion-Seiten oder Kapiteltexten vorbereiten (der Skill `kiel-by-night-website` enthält diese Regeln).

## Aufbau

```json
{
  "format": "kbn-scenes/1",
  "chronik": "Kiel by Night",
  "session": 18,
  "szenen": [
    {
      "titel": "Treffen im Hafen",
      "reihenfolge": 1,
      "ort": "Hafen",
      "stimmung": "Neblig, angespannt, Möwenschreie, Geruch nach Diesel",
      "ziel": "Was die Gruppe erreichen soll",
      "gegenspieler": "Wer oder was dagegen steht",
      "npcs": [
        { "name": "Aniq", "motivation": "Will wissen, wem die Gruppe wirklich dient" },
        { "name": "Mara", "motivation": "Will unbemerkt bleiben" }
      ],
      "faeden": ["Faden A"],
      "ausgaenge": ["Erfolg: …", "Teilerfolg: …", "Fehlschlag: …"],
      "text": "Ablauf der Szene in Stichpunkten",
      "details": "Weitere Details und Infos: Hintergründe, Regelhinweise, Zitate, Handout-Verweise"
    }
  ]
}
```

## Felder

| Feld | Pflicht | Typ | Bedeutung |
|---|---|---|---|
| `format` | ja | Text | immer `kbn-scenes/1` |
| `chronik` | nein | Text | nur zur Information, die Session-Nummer entscheidet |
| `session` | nein | ganze Zahl ab 1 | Session, zu der die Datei gehört. Ohne Angabe ist die Datei für den Vorrat gedacht. Beim Import im Tab Szenen kommen die Szenen immer in den Vorrat, in der Ansicht einer Session immer in diese Session |
| `szenen` | ja | Liste, 1 bis 100 Einträge | die Szenenkarten |
| `titel` | ja | Text | Name der Szene |
| `reihenfolge` | nein | ganze Zahl | Sortierung innerhalb der Datei. Ohne Angabe gilt die Reihenfolge in der Liste |
| `ort` | nein | Text | Schauplatz |
| `stimmung` | nein | Text | Grundstimmung der Szene |
| `ziel` | nein | Text | was die Gruppe erreichen soll |
| `gegenspieler` | nein | Text | Gegner oder Hindernis |
| `npcs` | nein | Liste aus Text oder Objekten | beteiligte NPCs. Objekt: `name` (Pflicht), `motivation` (optional). Ein reiner Text zählt als Name ohne Motivation |
| `faeden` | nein | Liste aus Text | Plotfäden, die in der Szene berührt werden |
| `ausgaenge` | nein | Liste aus Text | mögliche Ausgänge |
| `text` | nein | Text | Ablauf |
| `details` | nein | Text | weitere Details und Infos, die Karte zeigt sie eingeklappt |

Texte dürfen höchstens 20 000 Zeichen lang sein, Listen höchstens 50 Einträge (NPCs, Fäden, Ausgänge). Die Datei darf höchstens 2 MB groß sein. Unbekannte Felder werden ignoriert.

## NPC-Verknüpfung mit der ST-Karte

- Die App gleicht jeden NPC-Namen mit den Einträgen der ST-Karte ab (Name oder Map-Label aus Notion, ohne Beachtung der Groß-/Kleinschreibung). Bei keinem exakten Treffer zählt ein **eindeutiger** Teiltreffer als „ähnlich“.
- Gespeichert wird die **Notion-ID**, nicht der Name. Eine Umbenennung in Notion zerstört die Verknüpfung nicht. Der Name bleibt als Rückfall.
- In der Import-Vorschau lässt sich die Verknüpfung je NPC ändern oder abwählen. Nicht gefundene NPCs werden mit dem Namen gespeichert und beim Bearbeiten der Szene erneut abgeglichen.
- Die **Motivation** gehört zur Szene. Derselbe NPC kann in jeder Szene etwas anderes wollen.
- Auf der ST-Karte zeigt ein verknüpfter NPC unter „Kommt vor in“ alle Szenen mit der jeweiligen Motivation.

## Verhalten beim Import

- Die Datei wird zuerst **vollständig geprüft**. Bei Fehlern erscheint eine Liste, es wird nichts gespeichert.
- Danach zeigt die Vorschau jede Szene mit ihren NPC-Treffern. Einzelne Szenen lassen sich abwählen.
- **Vorhandene Szenen bleiben unverändert.** Neue Szenen werden hinten angehängt. Szenen, deren Titel in der Session schon vorkommt, sind in der Vorschau abgewählt (Hinweis „Titel gibt es schon“). Ein zweiter Import ersetzt also nichts von allein.
- **Vorrat:** Im Tab Szenen landet jeder Import im Vorrat, also bei Szenen ohne Session. Von dort ordnest du sie einer Session zu, sobald du weißt, wann du sie spielst. Eine in der Datei genannte Session wird in der Vorschau nur erwähnt.
- Die Szenen sind nur für den Storyteller sichtbar (Rechte in der Datenbank, nicht nur in der Anzeige).

## Hinweise für die Vorbereitung durch Claude

1. Eine Datei je Session (dann `session` setzen) oder eine Datei für den Vorrat (ohne `session`), wenn die Szenen noch keiner Session zugeordnet sind. `format` immer setzen.
2. NPC-Namen so schreiben wie in der ST-Karte (Notion), damit die Verknüpfung klappt. Bei Zweifel das Map-Label verwenden.
3. Motivation kurz und aus Sicht des NPC formulieren („Will …“, „Fürchtet …“).
4. Nichts erfinden: Fehlende Angaben weglassen statt füllen. Alle Felder außer `titel` sind optional.
5. Die Datei ist reines JSON: kein Kommentar, keine Zeilenumbrüche in Texten außer als `\n`.

## Änderungen

- **22.10.2026 (Version 1.1):** `session` ist optional, Import in den Vorrat.
- **22.10.2026 (Version 1):** Erste Fassung.
