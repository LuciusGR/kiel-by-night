// Kiel by Night · Fußzeile mit Datenschutz und Hinweis zu Marken
import { h } from "./lib.js";
import { LEGAL } from "./config.js";

const placeholders = L => Object.values(L).some(v => /^\[.*\]$/.test(v));

function show(title, ...body) {
  const dlg = h("dialog", { class: "legal" },
    h("h3", {}, title),
    placeholders(LEGAL) ? h("div", { class: "notice bad" }, "Angaben fehlen noch: Platzhalter in web/js/config.js (LEGAL) ersetzen.") : null,
    ...body,
    h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Schließen")));
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

const P = t => h("p", {}, t);
const H = t => h("h3", {}, t);

function datenschutz() {
  show("Datenschutzerklärung",
    H("1. Verantwortlicher"), P(LEGAL.name + ", E-Mail: " + LEGAL.email),
    H("2. Zweck und Zugang"),
    P("Die Seite dient der Chronik-Gruppe zum Verwalten von Charakteren, Notizen, Dokumenten und Karten. Zugang haben nur Personen, für die der Storyteller ein Konto angelegt hat. Ein Konto kann nicht selbst angelegt werden."),
    H("3. Verarbeitete Daten"),
    h("ul", {},
      h("li", {}, "Konto: Benutzername (technisch als Pseudo-E-Mail-Adresse gespeichert, keine echte Adresse), Anzeigename, Rolle, Passwort (nur als Hash)."),
      h("li", {}, "Inhalte, die du eingibst: Charakterbögen, Notizen, Wiki-Beiträge, hochgeladene Dokumente und Bilder, Kartenelemente, jeweils mit Zeitstempel und Urheber."),
      h("li", {}, "Technische Daten beim Aufruf: IP-Adresse, Datum und Uhrzeit, aufgerufene Datei, Browserkennung. Sie fallen bei den Hosting-Anbietern (Punkt 4) in Server-Protokollen an.")),
    P("Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Nutzung der Seite durch die Gruppe) und lit. f DSGVO (sicherer, stabiler Betrieb). Eine Pflicht zur Bereitstellung besteht nicht, ohne die Daten ist die Nutzung aber nicht möglich."),
    H("4. Empfänger und Auftragsverarbeiter"),
    h("ul", {},
      h("li", {}, "GitHub Pages (GitHub, Inc., USA, Teil von Microsoft): liefert die Seite aus. Dabei wird deine IP-Adresse verarbeitet."),
      h("li", {}, "Supabase (Supabase, Inc.): Anmeldung, Datenbank und Dateispeicher. Projektregion: " + LEGAL.supabaseRegion + "."),
      h("li", {}, "raw.githubusercontent.com (GitHub): nur beim Öffnen des Bereichs „Anleitung“, lädt das Handbuch."),
      h("li", {}, "Notion (Notion Labs, Inc.): nur für den Storyteller, über eine Serverfunktion. Spieler lösen keine Verbindung zu Notion aus.")),
    P("Bei Anbietern mit Sitz in den USA erfolgt die Übermittlung auf Grundlage des EU-US Data Privacy Framework oder von Standardvertragsklauseln (Art. 45, 46 DSGVO). Für die Auftragsverarbeitung (Art. 28 DSGVO) gelten die Vertragsbedingungen (Data Processing Addendum) von Supabase."),
    P("Schriften und Skripte (Schriftarten, Kartenbibliothek, Datenbank-Client) liegen auf dieser Seite selbst. Es werden keine Google Fonts und keine CDN-Dienste von Dritten geladen."),
    H("5. Speicher im Browser"),
    P("Die Seite setzt keine Cookies und nutzt kein Tracking. Im lokalen Speicher des Browsers liegen nur technisch notwendige Werte: die Anmelde-Sitzung (damit du angemeldet bleibst) und die Wahl von hellem oder dunklem Aussehen. Dafür ist nach § 25 Abs. 2 Nr. 2 TDDDG keine Einwilligung nötig. Mit dem Abmelden wird die Sitzung entfernt."),
    H("6. Speicherdauer"),
    P("Konto und Inhalte bleiben, solange die Chronik läuft oder bis du die Löschung verlangst. Server-Protokolle löschen die Anbieter nach ihren eigenen Fristen."),
    H("7. Deine Rechte"),
    P("Du hast das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO). Wende dich dafür an die oben genannte E-Mail-Adresse."),
    P("Du kannst dich außerdem bei einer Aufsichtsbehörde beschweren, in Schleswig-Holstein beim Unabhängigen Landeszentrum für Datenschutz (ULD), Kiel."));
}

export function mountFooter() {
  if (document.querySelector(".site-foot")) return;
  document.body.append(h("footer", { class: "site-foot" },
    h("button", { type: "button", onclick: datenschutz }, "Datenschutz"),
    h("span", {}, "Inoffizielles Fan-Projekt, nicht verbunden mit den Rechteinhabern von Vampire: Die Maskerade.")));
}
