# Kiel by Night · Setup-Anleitung v1.1

Stand: 21.10.2026 · Für: Roland · Alles hier braucht Konten oder Secrets und wird deshalb von dir erledigt.

Der Weg führt über das Supabase-Dashboard und die GitHub-Weboberfläche. Eine lokale Installation ist nicht nötig. Die CLI-Variante steht jeweils als Alternative dabei.

> **Hinweis zu Links:** In der Bauumgebung war der Internetzugang gesperrt. Kein Link in diesem Dokument wurde am 20.10.2026 abgerufen. Die Menünamen entsprechen meinem Wissensstand (bis Mitte 2026) und können im Dashboard leicht anders heißen.

---

## A. GitHub

1. **Repo:** `kiel-by-night`, öffentlich, leer. Erledigt, sofern „Privat" ausgeschaltet war.
2. **Code ins Repo bringen.** Wähle einen Weg:
   - **a) Über Claude Code (empfohlen):** Verbinde in claude.ai unter *Einstellungen → Connectors* dein GitHub-Konto und nenne mir in der nächsten Sitzung `besitzer/kiel-by-night`. Dann pushe ich.
   - **b) Selbst:** Lade das Archiv `kiel-by-night_v1_0.tar.gz` herunter und entpacke es. Dann `git init`, `git remote add origin https://github.com/<du>/kiel-by-night.git`, `git add . && git commit -m "v1.0" && git push -u origin main`.
3. **Pages einschalten:** Repo → *Settings → Pages → Build and deployment → Source: „GitHub Actions"*. Der Workflow `.github/workflows/pages.yml` veröffentlicht danach den Ordner `web/` bei jedem Push.
   Die Adresse lautet dann `https://<du>.github.io/kiel-by-night/`.

## B. Supabase-Projekt

4. **Projekt anlegen.** Das läuft bereits:
   - Passwort generieren und im Passwortmanager speichern.
   - Region Europe, Frankfurt falls wählbar.
   - *Enable Data API*: an.
   - *Automatically expose new tables*: **aus**.
   - *Enable automatic RLS*: **an**.
5. **Selbstregistrierung abschalten:** *Authentication → Sign In / Providers* (ältere Oberfläche: *Providers → Email*) → **„Allow new users to sign up" aus**.
   Selbst wenn das vergessen wird, sieht ein fremdes Konto dank RLS nichts, weil es kein Profil hat. Trotzdem abschalten.
6. **Datenbank einrichten.** Öffne *SQL Editor → New query* und führe die vier Dateien aus `supabase/migrations/` **genau in dieser Reihenfolge** aus. Jede Datei kopierst du komplett hinein und klickst auf *Run*:
   1. `20261020120000_schema_v1_0.sql`
   2. `20261020120100_rls_v1_0.sql`
   3. `20261020120200_storage_v1_0.sql`
   4. `20261020120300_seed_v1_0.sql`

   *CLI-Alternative:* `npx supabase@latest login`, `npx supabase link --project-ref <ref>`, dann `npx supabase db push`. Das erfordert Node.js.
7. **Konten anlegen:** *Authentication → Users → Add user → Create new user*. Trage als E-Mail `benutzername@kbn.invalid` ein. Der Teil vor dem @ ist der **Benutzername**, mit dem man sich auf der Website anmeldet (2 bis 32 Zeichen: Kleinbuchstaben, Zahlen, Punkt, Minus, Unterstrich). Die Adresse existiert nicht, es werden keine Mails verschickt. Vergib ein Passwort und hake **„Auto Confirm User"** an. Lege 1× ST und 3× Spieler an. Notiere die **User UIDs** (Spalte UID).
   Bestehende Konten mit echter E-Mail-Adresse funktionieren weiter. Zum Umstellen: *Users → Konto öffnen → E-Mail ändern* auf `benutzername@kbn.invalid`. Danach meldet sich die Person mit dem Benutzernamen an.
8. **Profile und Charakterzuordnung:** *SQL Editor* → Platzhalter ersetzen → *Run*:
   ```sql
   insert into public.profiles (id, display_name, role) values
     ('UID-ROLAND',   'Roland',  'st'),
     ('UID-SPIELER1', 'Name 1',  'player'),
     ('UID-SPIELER2', 'Name 2',  'player'),
     ('UID-SPIELER3', 'Name 3',  'player');

   update public.characters set owner_id = 'UID-SPIELER1' where clan = 'Tremere';    -- Dr. Lucas „Lukas" Feller
   update public.characters set owner_id = 'UID-SPIELER2' where clan = 'Ventrue';    -- Johana Talschmidt
   update public.characters set owner_id = 'UID-SPIELER3' where clan = 'Malkavian';  -- Steven „Damien Dark" Felsenheimer
   ```
   Ohne Profil zeigt die Website nach dem Login „kein Profil". Das ist so gewollt.
   Die Spieler können ihr Passwort später selbst über „Passwort" in der Kopfleiste ändern.
9. **Schlüssel notieren:** *Project Settings → API* (bzw. *API Keys*). Du brauchst:
   - **Project URL**, z. B. `https://abcd1234.supabase.co`
   - **anon public** key (bzw. **publishable** key, `sb_publishable_…`). Er ist öffentlich und darf ins Repo.
   - **Niemals** den `service_role`- bzw. `secret`-Key ins Repo oder in den Browser.

## C. Notion

10. **Integration anlegen:** `https://www.notion.so/profile/integrations` (alte Adresse `notion.so/my-integrations`). Wähle *New integration*, Typ **Internal**, Workspace mit „Kiel by Night". Unter Capabilities reicht **Read content**. Kopiere den **Internal Integration Secret** (`ntn_…` oder `secret_…`).
11. **Freigeben:** Notion-Seite „Kiel by Night" öffnen → `•••` → *Connections* (bzw. *Verbindungen*) → die Integration hinzufügen. Die Freigabe vererbt sich auf die Datenbanken NPCs und Beziehungen.

## D. Edge Function `notion-proxy`

12. **Function anlegen:** *Edge Functions → Deploy a new function → Via Editor*. Name: **`notion-proxy`**. Ersetze den Inhalt durch `supabase/functions/notion-proxy/index.ts` und klicke *Deploy*.
    *CLI-Alternative:* `npx supabase functions deploy notion-proxy`.
13. **JWT-Prüfung des Gateways ausschalten:** In den Details der Function unter *Settings* die Option **„Enforce JWT Verification" aus** stellen. Die Function prüft selbst, ob das ST-Konto anfragt. Bei der CLI erledigt das `supabase/config.toml`.
14. **Secrets setzen:** *Edge Functions → Secrets* (bzw. *Project Settings → Edge Functions*):
    - `NOTION_TOKEN` = Integration Secret aus Schritt 10
    - `ALLOWED_ORIGIN` = `https://<du>.github.io` (ohne Pfad, ohne Schrägstrich am Ende)

    *CLI-Alternative:* `npx supabase secrets set NOTION_TOKEN=… ALLOWED_ORIGIN=https://<du>.github.io`

    `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` stellt Supabase der Function automatisch bereit. Meldet die ST-Karte „config_missing", fehlen diese Variablen. Dann legst du sie als Secrets mit den Werten aus Schritt 9 an, dazu den service_role/secret-Key. Das ist **nur** dort erlaubt.

## E. Website verbinden

15. **`web/js/config.js` ausfüllen** (direkt auf GitHub: Datei öffnen → Stift → speichern):
    ```js
    export const SUPABASE_URL = "https://abcd1234.supabase.co";
    export const SUPABASE_ANON_KEY = "eyJ… oder sb_publishable_…";
    ```
    Der Commit löst den Pages-Deploy aus. Nach 1–2 Minuten ist die Seite online.
16. **Supabase-Auth auf die Seite einstellen:** *Authentication → URL Configuration → Site URL* = `https://<du>.github.io/kiel-by-night/`. Für Passwort-Login nicht zwingend, schadet aber nicht.

## F. Schutz gegen die 7-Tage-Pause

17. **Repo-Secrets** unter *Settings → Secrets and variables → Actions → New repository secret*:
    - `SUPABASE_URL` = Project URL
    - `SUPABASE_ANON_KEY` = anon/publishable key
18. **Einmal testen:** *Actions → „Supabase keepalive" → Run workflow*. Die Ausgabe muss `"ok:4"` zeigen.
    Danach läuft der Ping automatisch montags und donnerstags.
    GitHub deaktiviert geplante Workflows in öffentlichen Repos nach **60 Tagen ohne Repo-Aktivität**. Tritt das ein, schickt GitHub eine Mail, und du schaltest den Workflow unter *Actions* wieder ein.

## G. Abnahme (10 Minuten, mit zwei Browserfenstern)

19. Als **ST** anmelden. Die Navigation zeigt „Storyteller". Prüfe:
    - Die ST-Karte lädt aus Notion, Stand und Knotenzahl stehen oben.
    - Knoten zeigen eine Form je Sekte.
    - Knoten verschieben, Seite neu laden: Die Position bleibt.
20. Als ST ein PDF **„Als ST-Entwurf"** hochladen, z. B. `Handout_Annales_Isarnhoenses_v1_0.pdf`. Eine Wiki-Seite in „ST-Notizen" anlegen.
21. Im zweiten Fenster (privat/inkognito) als **Spieler** anmelden. Prüfe:
    - Entwurf und ST-Notizen sind **nicht** sichtbar.
    - Der eigene Bogen ist bearbeitbar, fremde Bögen sind nur lesbar.
    - Eine Session-Notiz und eine private Notiz lassen sich anlegen.
    - Ein Knoten auf der Spielerkarte lässt sich hinzufügen. Er erscheint ohne Neuladen im ST-Fenster.
22. Als ST den Entwurf **freigeben**. Danach sieht der Spieler das Dokument und kann es öffnen. Unter Storyteller → Private Spielernotizen erscheint die private Notiz.
23. ST-Karte → einen NPC → **„Auf Spielerkarte"**. Auf der Spielerkarte stehen nur Name und Typ, keine Beschreibung.

## H. Danach

24. Das alte Artifact (https://claude.ai/artifact/MZT72x992mWpbLAkPnjyA4) löschst du erst nach erfolgreicher Abnahme (Entscheidung vom 20.10.2026).

---

### Changelog
- **v1.1** (21.10.2026): Schritt 7 auf Benutzernamen umgestellt (intern Pseudo-Adresse `name@kbn.invalid`).
- **v1.0** (20.10.2026): Erste Fassung. Dashboard-Weg als Standard, CLI als Alternative.
