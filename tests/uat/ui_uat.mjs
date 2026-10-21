// Kiel by Night · Browser-UAT (Chrome, Playwright) gegen die echte Website-Dateien mit In-Memory-Supabase (ohne RLS)
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = REPO + "/web";
const BR = REPO + "/tests/browser";
const OUT = HERE + "/out";
const SHOTS = OUT + "/shots";
fs.mkdirSync(SHOTS, { recursive: true });

// ---------- Fake-Supabase mit Spionen ----------
let fake = fs.readFileSync(BR + "/fake-supabase.js", "utf8");
const rep = (a, b) => { if (!fake.includes(a)) throw new Error("Fake-Patch nicht gefunden: " + a.slice(0, 40)); fake = fake.replace(a, b); };
rep('const me = ROLE === "st" ? ST : P1;', 'const me = ROLE === "st" ? ST : ROLE === "noprofile" ? "99999999-9999-9999-9999-999999999999" : P1;');
rep("upload: async () => ({ error: null })", "upload: async (p, f, o) => { (window.__uploads = window.__uploads || []).push({ path: p, type: o && o.contentType, size: f && f.size }); return window.__UPLOAD_ERROR ? { error: { message: 'boom' } } : { error: null }; }");
rep("signInWithPassword: async () => ({ error: { message: \"Invalid login credentials\" } }),", "signInWithPassword: async (a) => { (window.__signins = window.__signins || []).push(a); return window.__SIGNIN_NET ? { error: { message: 'Failed to fetch' } } : { error: { message: 'Invalid login credentials' } }; },");
rep("signOut: async () => ({}), updateUser: async () => ({ error: null })", "signOut: async () => { window.__log && window.__log('signOut'); return {}; }, updateUser: async (a) => { window.__log && window.__log('updateUser'); return { error: null }; }");
rep("functions: { invoke: async () => ({ data: { ...NOTION, fetched_at: now(), source: \"cache\" }, error: null }) }",
  "functions: { invoke: async (n, o) => { (window.__invokes = window.__invokes || []).push({ n, o }); const m = window.__NOTION_MODE || 'ok'; if (m === 'error') return { data: null, error: { context: { json: async () => ({ error: 'notion_failed', message: 'Notion 401: unauthorized' }) } } }; return { data: { ...NOTION, fetched_at: now(), source: m === 'fresh' || (o && o.body && o.body.refresh) ? 'notion' : 'cache', warning: m === 'warn' ? 'Cache nicht gespeichert' : undefined }, error: null }; } }");
const cyto = fs.readFileSync(HERE + "/node_modules/cytoscape/dist/cytoscape.min.js", "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const results = [];
const live = [];

async function openApp(role, hash = "start", o = {}) {
  const page = await browser.newPage({ viewport: o.viewport || { width: 1280, height: 900 }, colorScheme: o.scheme || "light", acceptDownloads: false });
  page.errors = []; page.logs = [];
  page.on("pageerror", e => page.errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push("console: " + m.text().slice(0, 160)); });
  await page.exposeFunction("__log", s => page.logs.push(s));
  await page.addInitScript(([r, lo, mode, extra]) => { window.__KBN_ROLE = r; if (lo) window.__KBN_LOGGED_OUT = true; if (mode) window.__NOTION_MODE = mode; if (extra) eval(extra); }, [role, !!o.loggedOut, o.notion || null, o.init || null]);
  await page.route("**/*", async route => {
    const u = new URL(route.request().url());
    if (u.hostname === "kbn.test") {
      const p = u.pathname === "/" ? "/index.html" : u.pathname;
      if (p === "/js/config.js") return route.fulfill({ contentType: "text/javascript", body: `export const SUPABASE_URL="${o.url || "https://x.supabase.co"}";export const SUPABASE_ANON_KEY="k";export const APP_VERSION="uat";` });
      const f = path.join(WEB, p);
      if (fs.existsSync(f)) return route.fulfill({ contentType: types[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
      return route.fulfill({ status: 404, body: "" });
    }
    if (u.href.includes("supabase-js")) return route.fulfill({ contentType: "text/javascript", body: fake });
    if (u.href.includes("cytoscape")) return route.fulfill({ contentType: "text/javascript", body: cyto });
    if (o.blockApi && u.hostname.endsWith(".supabase.co")) return route.abort();
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto("https://kbn.test/#" + hash);
  await page.waitForTimeout(o.wait ?? 700);
  return page;
}
const nav = async (page, label, wait = 500) => { await page.locator("#nav button", { hasText: new RegExp("^" + label + "$") }).click(); await page.waitForTimeout(wait); };
const db = (page, t) => page.evaluate(t => JSON.parse(JSON.stringify(window.__db[t])), t);
const toast = page => page.locator(".toast").allInnerTexts();
const waitToast = async (page, re, ms = 3000) => { const t0 = Date.now(); for (;;) { const all = (await toast(page)).join(" | "); if (re.test(all)) return all; if (Date.now() - t0 > ms) throw new Error("Toast nicht gefunden: " + re + " (war: " + all + ")"); await page.waitForTimeout(100); } };
const cyEval = (page, fn, arg) => page.evaluate(([f, a]) => { const cy = document.querySelector(".map-canvas")._cyreg.cy; return (new Function("cy", "a", "return (" + f + ")(cy,a)"))(cy, a); }, [fn.toString(), arg]);

const AREAS = {};
function T(id, area, name, fn, o = {}) { (AREAS[area] = AREAS[area] || []).push(1); results.push({ id, area, name, fn, o, status: "?", detail: "" }); }

// =====================================================================
// A · Anmeldung, Navigation, Rahmen
// =====================================================================
T("U01", "Anmeldung", "Ohne Sitzung erscheint das Login-Formular mit beschrifteten Feldern", async () => {
  const p = await openApp("st", "", { loggedOut: true });
  assert.equal(await p.locator("#login-user[type=text][autocomplete=username][required]").count(), 1); assert.equal(await p.locator("input[type=email]").count(), 0, "kein E-Mail-Feld mehr");
  assert.equal(await p.locator("#login-pw[type=password][autocomplete=current-password][required]").count(), 1);
  assert.equal(await p.locator("label[for=login-user]").innerText(), "Benutzername"); assert.equal(await p.locator("label[for=login-pw]").count(), 1);
  assert.equal(await p.locator("#nav button").count(), 0, "Navigation darf ohne Login leer sein");
  return p;
});
T("U02", "Anmeldung", "Falsches Passwort: verständliche Meldung, Button wieder bedienbar", async () => {
  const p = await openApp("st", "", { loggedOut: true });
  await p.fill("#login-user", "anna"); await p.fill("#login-pw", "falsch"); await p.click("button[type=submit]");
  await waitToast(p, /Benutzername oder Passwort falsch\./);
  assert.equal(await p.locator("button[type=submit]").isEnabled(), true); assert.equal(await p.locator("button[type=submit]").innerText(), "Anmelden");
  return p;
});
const signin = async (p, u, pw = "geheim-geheim") => { await p.fill("#login-user", u); await p.fill("#login-pw", pw); await p.click("button[type=submit]"); await p.waitForTimeout(250); return p.evaluate(() => window.__signins || []); };
const netLogin = async (o, offline) => {
  const p = await openApp("st", "", { loggedOut: true, init: "window.__SIGNIN_NET = true", ...o }); if (offline) await p.context().setOffline(true);
  await p.fill("#login-user", "anna"); await p.fill("#login-pw", "geheim-geheim"); await p.click("button[type=submit]"); await p.waitForTimeout(1500); return p;
};
T("U02f", "Anmeldung", "Netzfehler beim Anmelden, Server von diesem Gerät nicht erreichbar: Hinweis auf Werbeblocker, VPN, privates DNS und anderes Netz", async () => {
  const p = await netLogin({ blockApi: true }); const t = await waitToast(p, /supabase\.co/); assert.match(t, /Werbeblocker/); assert.match(t, /VPN/); assert.match(t, /privates DNS/); assert.match(t, /anderes Netz/);
  assert.equal(await p.locator("button[type=submit]").isEnabled(), true); return p;
});
T("U02g", "Anmeldung", "Netzfehler, Server aber erreichbar: kein Hinweis auf Werbeblocker, sondern Neuladen und Melden", async () => {
  const p = await netLogin({}); const t = await waitToast(p, /Server ist erreichbar/); assert.match(t, /neu laden/); assert.doesNotMatch(t, /Werbeblocker|VPN/); return p;
});
T("U02h", "Anmeldung", "Netzfehler ohne Internet: Hinweis 'Kein Internet', kein Hinweis auf Werbeblocker", async () => {
  const p = await netLogin({}, true); const t = await waitToast(p, /Kein Internet/); assert.doesNotMatch(t, /Werbeblocker|VPN/); return p;
});
T("U02a", "Anmeldung", "Benutzername wird intern zu name@kbn.invalid (Kleinbuchstaben, ohne Leerzeichen am Rand)", async () => {
  const p = await openApp("st", "", { loggedOut: true }); const s = await signin(p, "  Anna.K-2_x  "); assert.equal(s.length, 1); assert.deepEqual(s[0], { email: "anna.k-2_x@kbn.invalid", password: "geheim-geheim" }); return p;
});
T("U02b", "Anmeldung", "Bestehende Konten: eine eingetippte E-Mail-Adresse geht unverändert (kleingeschrieben) durch", async () => {
  const p = await openApp("st", "", { loggedOut: true }); const s = await signin(p, "R.Krifft@Web.de"); assert.equal(s[0].email, "r.krifft@web.de"); return p;
});
T("U02c", "Anmeldung", "Ungültige Benutzernamen werden mit Hinweis abgewiesen, ohne Anfrage an Supabase", async () => {
  const p = await openApp("st", "", { loggedOut: true });
  for (const bad of ["a", "ä ö", "mit leerzeichen", "x".repeat(33), "na!me", "a@", "@b"]) { const s = await signin(p, bad); assert.equal(s.length, 0, "Anfrage trotz ungültigem Namen: " + bad); await waitToast(p, /Benutzername: 2 bis 32 Zeichen/); await p.waitForTimeout(100); }
  return p;
});
T("U02d", "Anmeldung", "Passwort bleibt unverändert (keine Kürzung, keine Kleinschreibung)", async () => {
  const p = await openApp("st", "", { loggedOut: true }); const s = await signin(p, "anna", " ÄÖü Pass-WORT 123 "); assert.equal(s[0].password, " ÄÖü Pass-WORT 123 "); return p;
});
T("U02e", "Anmeldung", "Anmeldeformular: Passwortmanager-tauglich und ohne Auto-Großschreibung am Handy", async () => {
  const p = await openApp("st", "", { loggedOut: true, viewport: { width: 390, height: 800 } }); const a = await p.evaluate(() => { const u = document.querySelector("#login-user"); return { ac: u.autocomplete, cap: u.getAttribute("autocapitalize"), sp: u.spellcheck, pw: document.querySelector("#login-pw").autocomplete }; });
  assert.deepEqual(a, { ac: "username", cap: "none", sp: false, pw: "current-password" }); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); return p;
});
T("U03", "Anmeldung", "Konto ohne Profil: klare Meldung, kein Zugriff auf Inhalte", async () => {
  const p = await openApp("noprofile", "start", {});
  const t = await p.locator("main").innerText();
  assert.match(t, /kein Profil/); assert.equal(await p.locator("#nav button").count(), 0);
  return p;
});
T("U04", "Navigation", "ST sieht 7 Bereiche plus Storyteller, aber nicht Privat", async () => {
  const p = await openApp("st"); const l = await p.locator("#nav button").allInnerTexts();
  assert.deepEqual(l, ["Übersicht", "Charaktere", "Chroniken", "Sessions", "Spielerkarte", "Wiki", "Dokumente", "Storyteller"]); return p;
});
T("U05", "Navigation", "Spieler sieht 7 Bereiche plus Privat, aber nicht Storyteller", async () => {
  const p = await openApp("player"); const l = await p.locator("#nav button").allInnerTexts();
  assert.deepEqual(l, ["Übersicht", "Charaktere", "Chroniken", "Sessions", "Spielerkarte", "Wiki", "Dokumente", "Privat"]); return p;
});
T("U06", "Navigation", "Kopfzeile zeigt Rolle und Namen", async () => {
  const a = await openApp("st"); assert.match(await a.locator("#who").innerText(), /Storyteller · Roland/); await a.close();
  const b = await openApp("player"); assert.match(await b.locator("#who").innerText(), /Spieler · Anna/); return b;
});
T("U07", "Navigation", "Theme-Schalter wechselt Auto → Hell → Dunkel → Auto und merkt sich die Wahl", async () => {
  const p = await openApp("st"); const b = p.locator("#who .hbtn", { hasText: /^Theme:/ });
  const th = () => p.evaluate(() => [document.documentElement.dataset.theme || "auto", localStorage.getItem("kbn-theme")]);
  assert.deepEqual(await th(), ["auto", null]);
  await b.click(); assert.deepEqual(await th(), ["light", "light"]); assert.match(await b.innerText(), /Hell/);
  await b.click(); assert.deepEqual(await th(), ["dark", "dark"]); assert.match(await b.innerText(), /Dunkel/);
  await b.click(); assert.deepEqual(await th(), ["auto", null]);
  await b.click(); await p.reload(); await p.waitForTimeout(600); assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), "light", "Wahl überlebt Neuladen");
  return p;
});
T("U08", "Navigation", "Spieler ruft #st auf: Hinweis 'nur für den Storyteller', keine Notion-Anfrage", async () => {
  const p = await openApp("player", "st"); assert.match(await p.locator("main .notice.bad").innerText(), /nur für den Storyteller/);
  assert.equal((await p.evaluate(() => window.__invokes || [])).length, 0); return p;
});
T("U09", "Navigation", "ST ruft #private auf: Hinweis auf den Storyteller-Bereich", async () => {
  const p = await openApp("st", "private"); assert.match(await p.locator("main .notice").innerText(), /Als Storyteller liest du private Notizen/); return p;
});
T("U10", "Navigation", "Unbekannter Hash führt zur Übersicht", async () => {
  const p = await openApp("st", "gibtsnicht"); assert.equal(await p.locator("main h2").first().innerText(), "Übersicht"); return p;
});
T("U11", "Navigation", "Hash-Wechsel von Hand wird übernommen (#wiki)", async () => {
  const p = await openApp("player"); await p.evaluate(() => { location.hash = "#wiki"; }); await p.waitForTimeout(600);
  assert.equal(await p.locator("main h2").first().innerText(), "Wiki"); assert.equal(await p.locator("#nav [aria-current=page]").innerText(), "Wiki"); return p;
});
T("U12", "Navigation", "Aktueller Bereich ist in der Navigation markiert (aria-current)", async () => {
  const p = await openApp("player", "docs"); assert.equal(await p.locator("#nav [aria-current=page]").innerText(), "Dokumente"); return p;
});
T("U13", "Konto", "Passwort ändern: zu kurz, ungleich, gültig", async () => {
  const p = await openApp("player"); await p.getByRole("button", { name: "Passwort" }).click();
  await p.fill("#pw1", "abc"); await p.fill("#pw2", "abc"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Mindestens 8 Zeichen\./);
  await p.fill("#pw1", "abcdefgh"); await p.fill("#pw2", "abcdefgX"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /stimmen nicht überein/);
  await p.fill("#pw2", "abcdefgh"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Passwort geändert\./);
  assert.equal(await p.locator("dialog").count(), 0); assert.ok(p.logs.includes("updateUser")); return p;
});
T("U14", "Konto", "Passwort-Dialog: Abbrechen schließt ohne Änderung", async () => {
  const p = await openApp("player"); await p.getByRole("button", { name: "Passwort" }).click(); await p.getByRole("button", { name: "Abbrechen" }).click();
  assert.equal(await p.locator("dialog").count(), 0); assert.ok(!p.logs.includes("updateUser")); return p;
});
T("U15", "Konto", "Abmelden ruft signOut auf und lädt neu", async () => {
  const p = await openApp("player"); await Promise.all([p.waitForNavigation({ waitUntil: "load" }).catch(() => {}), p.getByRole("button", { name: "Abmelden" }).click()]);
  assert.ok(p.logs.includes("signOut")); return p;
});
T("U16", "Konfiguration", "Platzhalter in config.js: verständliche Fehlermeldung statt leerer Seite", async () => {
  const p = await openApp("st", "start", { url: "https://DEIN-PROJECT-REF.supabase.co" }); assert.match(await p.locator("main").innerText(), /config\.js ist noch nicht ausgefüllt/); return p;
});

// =====================================================================
// B · Übersicht
// =====================================================================
T("U20", "Übersicht", "Drei Charakterkarten und Verlauf 'Letzte Änderungen' erscheinen", async () => {
  const p = await openApp("player"); assert.equal(await p.locator(".cards .pc").count(), 3);
  assert.ok(await p.locator(".feed .item").count() >= 2); return p;
});
T("U21", "Übersicht", "Verlaufseintrag Wiki führt direkt zur Seite", async () => {
  const p = await openApp("player"); await p.locator(".feed").getByRole("button", { name: "Prinz", exact: true }).click(); await p.waitForTimeout(600);
  assert.equal(await p.locator(".article h2").innerText(), "Prinz"); assert.equal(await p.locator("#nav [aria-current=page]").innerText(), "Wiki"); return p;
});
T("U22", "Übersicht", "Verlaufseintrag Session-Notiz führt zur Session", async () => {
  const p = await openApp("player"); await p.locator(".feed .linkbtn", { hasText: "Wir trafen" }).click(); await p.waitForTimeout(600);
  assert.equal(await p.locator(".article h2").innerText(), "Session 1"); return p;
});
T("U23", "Übersicht", "Karte zeigt Hunger- und Health-Kästchen passend zum Bogen", async () => {
  const p = await openApp("player"); const card = p.locator(".pc", { hasText: "Lukas" });
  assert.equal(await card.locator(".boxes").first().locator(".hunger").count(), 2); return p;
});
T("U24", "Übersicht", "Leerer Verlauf ohne Daten zeigt freundlichen Hinweis", async () => {
  const p = await openApp("player", "start", { init: "" });
  await p.evaluate(() => { window.__db.wiki_pages.length = 0; window.__db.documents.length = 0; window.__db.session_notes.length = 0; });
  await p.evaluate(() => { location.hash = "#chars"; }); await p.waitForTimeout(300); await nav(p, "Übersicht");
  assert.match(await p.locator(".feed").innerText(), /Noch nichts passiert/); return p;
});

// =====================================================================
// C · Charaktere
// =====================================================================
T("U30", "Charaktere", "Liste zeigt alle Bögen mit Clan und Spielername", async () => {
  const p = await openApp("player", "chars"); const t = await p.locator(".cards").textContent();
  assert.match(t, /Tremere · Anna/i); assert.match(t, /Ventrue · ohne Spieler/i); return p;
});
T("U31", "Charaktere", "Spieler: eigener Bogen startet in Ansicht (gesperrt), Umschalten auf Bearbeitung entsperrt; fremder Bogen hat keinen Schalter", async () => {
  const p = await openApp("player", "chars"); await p.locator(".pc", { hasText: "Lukas" }).click(); await p.waitForTimeout(400);
  assert.equal(await p.locator("#f-concept").isDisabled(), true); assert.equal(await p.locator('.toggle button[aria-pressed="true"]').innerText(), "Ansicht"); assert.match(await p.locator(".head p").innerText(), /Ansicht: Bearbeiten ist gesperrt/);
  await p.getByRole("button", { name: "Bearbeitung", exact: true }).click(); assert.equal(await p.locator("#f-concept").isEnabled(), true); assert.match(await p.locator(".head p").innerText(), /automatisch gespeichert/);
  await p.getByRole("button", { name: "Ansicht", exact: true }).click(); assert.equal(await p.locator("#f-concept").isDisabled(), true);
  await p.getByRole("button", { name: "← Alle Charaktere" }).click(); await p.waitForTimeout(300);
  await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400);
  assert.equal(await p.locator(".toggle").count(), 0, "kein Modus-Schalter bei fremdem Bogen"); assert.equal(await p.locator("#f-concept").isDisabled(), true); assert.match(await p.locator(".head p").innerText(), /Nur Lesen/);
  assert.equal(await p.locator(".sheet button:not([disabled])").count(), 0, "keine aktiven Bedienelemente im Lesemodus"); return p;
});
T("U31a", "Charaktere", "Ansicht sperrt alle Bedienelemente; Klick auf gesperrte Punkte ändert nichts", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400);
  assert.equal(await p.locator(".sheet button:not([disabled])").count(), 0); assert.equal(await p.locator(".sheet input:not([disabled]), .sheet textarea:not([disabled])").count(), 0);
  await p.locator('button[aria-label="Hunger 4"]').click({ force: true }).catch(() => {}); await p.waitForTimeout(1300); assert.equal(((await db(p, "characters"))[1].sheet || {}).hunger ?? 0, 0); return p;
});
T("U31b", "Charaktere", "Zurück auf Ansicht speichert ausstehende Änderungen sofort und sperrt wieder", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.locator('button[aria-label="Hunger 3"]').click(); await p.getByRole("button", { name: "Ansicht", exact: true }).click(); await p.waitForTimeout(500);
  assert.equal((await db(p, "characters"))[1].sheet.hunger, 3); assert.equal(await p.locator("#f-concept").isDisabled(), true); return p;
});
T("U31c", "Charaktere", "Beim erneuten Öffnen eines Bogens ist wieder Ansicht eingestellt (Standard)", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.getByRole("button", { name: "← Alle Charaktere" }).click(); await p.waitForTimeout(300); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400);
  assert.equal(await p.locator('.toggle button[aria-pressed="true"]').innerText(), "Ansicht"); assert.equal(await p.locator("#f-concept").isDisabled(), true); return p;
});
T("U32", "Charaktere", "ST darf jeden Bogen bearbeiten", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  assert.equal(await p.locator("#f-concept").isEnabled(), true); return p;
});
T("U33", "Charaktere", "Hunger setzen speichert automatisch (Status Ungespeichert → Gespeichert) und lässt sich zurücknehmen", async () => {
  const p = await openApp("player", "chars"); await p.locator(".pc", { hasText: "Lukas" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.locator('button[aria-label="Hunger 4"]').click(); assert.match(await p.locator(".save-state").innerText(), /Ungespeichert/);
  await p.waitForTimeout(1400); assert.equal(await p.locator(".save-state").innerText(), "Gespeichert");
  assert.equal((await db(p, "characters"))[0].sheet.hunger, 4);
  await p.locator('button[aria-label="Hunger 4"]').click(); await p.waitForTimeout(1400); assert.equal((await db(p, "characters"))[0].sheet.hunger, 3); return p;
});
T("U34", "Charaktere", "Stamina 5 ergibt Health (8)", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Lukas" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.locator('button[aria-label="Stamina: 5 Punkte"]').click(); assert.ok(await p.locator("h4", { hasText: "Health (8)" }).count()); return p;
});
T("U35", "Charaktere", "Willpower = Composure + Resolve", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Lukas" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.locator('button[aria-label="Composure: 3 Punkte"]').click(); await p.locator('button[aria-label="Resolve: 2 Punkte"]').click();
  assert.ok(await p.locator("h4", { hasText: "Willpower (5)" }).count()); return p;
});
T("U36", "Charaktere", "Stains: Stain + zählt hoch, Humanity-Kästchen wechseln auf Stain", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.getByRole("button", { name: "Stain +" }).click(); await p.getByRole("button", { name: "Stain +" }).click();
  assert.ok(await p.locator("h4", { hasText: "Humanity 7 · Stains 2" }).count());
  assert.equal(await p.locator('button.hum[aria-label^="Humanity"]').count(), 7); assert.equal(await p.locator('button.stain[aria-label^="Humanity"]').count(), 2);
  await p.getByRole("button", { name: "Stain −" }).click(); await p.getByRole("button", { name: "Stain −" }).click(); await p.getByRole("button", { name: "Stain −" }).click();
  assert.ok(await p.locator("h4", { hasText: "Stains 0" }).count(), "Stains nicht unter 0"); return p;
});
T("U37", "Charaktere", "Health-Kästchen wechseln leer → oberflächlich → schwer → leer", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  const b = p.locator('button[aria-label^="Health Kästchen 1"]'); const cls = async () => (await b.getAttribute("class")) || "";
  assert.equal(await cls(), ""); await b.click(); assert.equal(await cls(), "s1"); await b.click(); assert.equal(await cls(), "s2"); await b.click(); assert.equal(await cls(), ""); return p;
});
T("U38", "Charaktere", "Disziplin anlegen, benennen, Stufe, Kräfte, entfernen", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.getByRole("button", { name: "Disziplin hinzufügen" }).click(); await p.fill("#disc-0", "Auspex");
  await p.locator(".disc .dots button").nth(2).click(); await p.fill("#discp-0", "Heightened Senses"); await p.waitForTimeout(1400);
  const d = (await db(p, "characters"))[1].sheet.disc; assert.deepEqual(d[0], { name: "Auspex", lvl: 3, powers: "Heightened Senses" });
  await p.locator('button[aria-label="Disziplin entfernen"]').click(); await p.waitForTimeout(1400); assert.deepEqual((await db(p, "characters"))[1].sheet.disc, []); return p;
});
T("U39", "Charaktere", "XP: frei = gesamt − ausgegeben; Werte werden auf 0..9999 begrenzt", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.fill("#n-xpTotal", "10"); await p.keyboard.press("Tab"); await p.waitForTimeout(200); await p.fill("#n-xpSpent", "3"); await p.keyboard.press("Tab"); await p.waitForTimeout(200);
  assert.match(await p.locator(".mono.muted").innerText(), /XP frei: 7/);
  await p.fill("#n-xpTotal", "99999"); await p.keyboard.press("Tab"); await p.waitForTimeout(200); assert.equal(await p.inputValue("#n-xpTotal"), "9999");
  await p.fill("#n-bp", "-5"); await p.keyboard.press("Tab"); await p.waitForTimeout(200); assert.equal(await p.inputValue("#n-bp"), "0");
  await p.fill("#n-bp", "99"); await p.keyboard.press("Tab"); await p.waitForTimeout(200); assert.equal(await p.inputValue("#n-bp"), "10"); return p;
});
T("U39b", "Charaktere", "Fokuswechsel von einem Zahlenfeld direkt in ein anderes (Klick) behält Eingabe und Fokus", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.click("#n-xpTotal"); await p.keyboard.type("10"); await p.click("#n-xpSpent"); await p.keyboard.type("3"); await p.waitForTimeout(300);
  assert.equal(Number(await p.inputValue("#n-xpSpent")), 3, "Eingabe im zweiten Feld ging verloren (Bogen wird beim Verlassen des ersten Feldes neu gezeichnet)");
  assert.equal(await p.inputValue("#n-xpTotal"), "10", "erstes Feld behält seinen Wert"); assert.match(await p.locator(".mono.muted").innerText(), /XP frei: 7/);
  await p.keyboard.press("Tab"); await p.waitForTimeout(200); assert.equal(await p.inputValue("#n-xpSpent"), "3", "Wert wird nach dem Verlassen normalisiert"); return p;
});
T("U40", "Charaktere", "Name ändern: Speichern und Liste zeigt neuen Namen", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.fill("#f-name", "Johana Neu"); await p.waitForTimeout(1400); await p.getByRole("button", { name: "← Alle Charaktere" }).click(); await p.waitForTimeout(400);
  assert.ok(await p.locator(".pc", { hasText: "Johana Neu" }).count()); return p;
});
T("U41", "Charaktere", "Schnelles Verlassen des Bogens speichert die letzte Änderung noch (Flush beim Wechsel)", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  await p.locator('button[aria-label="Hunger 5"]').click(); await nav(p, "Sessions", 300); await p.waitForTimeout(600);
  assert.equal((await db(p, "characters"))[1].sheet.hunger, 5); return p;
});
T("U42", "Charaktere", "Text in Bogen-Feldern erscheint als Text (kein HTML)", async () => {
  const p = await openApp("st", "chars"); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  const x = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'; await p.fill("#f-notes", x); await p.fill("#f-concept", x); await p.waitForTimeout(1400);
  await nav(p, "Charaktere", 400); await p.locator(".pc", { hasText: "Johana" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  assert.equal(await p.inputValue("#f-notes"), x); assert.equal(await p.evaluate(() => window.__xss), undefined); return p;
});
T("U43", "Charaktere", "Bogen eines gelöschten/unbekannten Eintrags zeigt Hinweis", async () => {
  const p = await openApp("st", "chars"); await p.evaluate(() => { window.__db.characters.length = 0; });
  await p.evaluate(() => { location.hash = "#start"; }); await p.waitForTimeout(300); await nav(p, "Charaktere", 400);
  assert.match(await p.locator("main").innerText(), /Noch keine Charaktere/); return p;
});

// =====================================================================
// D · Sessions
// =====================================================================
T("U50", "Sessions", "Session 1 mit Titel, Datum und Notiz der Spielerin wird angezeigt", async () => {
  const p = await openApp("player", "sessions"); assert.match(await p.locator(".sessions-list").innerText(), /Session 1 · Auftakt/);
  assert.match(await p.locator(".entry").innerText(), /Wir trafen \[\[Prinz\]\]\./); assert.match(await p.locator(".entry .by").innerText(), /Feller/); return p;
});
T("U51", "Sessions", "Neue Notiz anlegen (Session 2) erscheint in der Liste", async () => {
  const p = await openApp("player", "sessions"); await p.getByRole("button", { name: "Neue Notiz" }).click(); assert.equal(await p.inputValue("#note-session"), "1");
  await p.fill("#note-session", "2"); await p.fill("#note-body", "Zweite Nacht"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Notiz angelegt\./);
  assert.match(await p.locator(".sessions-list").innerText(), /Session 2/); assert.match(await p.locator(".article").innerText(), /Zweite Nacht/); return p;
});
T("U52", "Sessions", "Ungültige Session-Nummer wird abgewiesen", async () => {
  const p = await openApp("player", "sessions"); await p.getByRole("button", { name: "Neue Notiz" }).click();
  for (const v of ["0", "-1", "1.5", ""]) { await p.fill("#note-session", v); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Session-Nummer/); await p.waitForTimeout(150); }
  assert.equal((await db(p, "session_notes")).length, 1); return p;
});
T("U53", "Sessions", "Fremde Notizen haben keinen Bearbeiten-Knopf, eigene schon", async () => {
  const a = await openApp("st", "sessions"); assert.equal(await a.locator(".entry button", { hasText: "Bearbeiten" }).count(), 0); await a.close();
  const b = await openApp("player", "sessions"); assert.equal(await b.locator(".entry button", { hasText: "Bearbeiten" }).count(), 1); return b;
});
T("U54", "Sessions", "'Nur meine' zeigt nur eigene Notizen, 'Alle' kehrt zurück", async () => {
  const p = await openApp("player", "sessions"); await p.getByRole("button", { name: "Nur meine" }).click();
  assert.ok(await p.locator("h3", { hasText: "Meine Notizen" }).count()); assert.equal(await p.locator(".entry").count(), 1);
  await p.getByRole("button", { name: "Alle", exact: true }).click(); assert.ok(await p.locator("h2", { hasText: "Session 1" }).count()); return p;
});
T("U55", "Sessions", "Titel und Spieldatum der Session speichern", async () => {
  const p = await openApp("player", "sessions"); await p.locator("details[data-meta] summary").click(); await p.fill("#sess-title", "Neuer Titel"); await p.fill("#sess-date", "2026-10-05");
  await p.locator("details[data-meta]").getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Gespeichert\./);
  assert.match(await p.locator(".sessions-list").innerText(), /Session 1 · Neuer Titel/); assert.match(await p.locator("details[data-meta] summary").innerText(), /05\.10\.2026/); return p;
});
T("U56", "Sessions", "Eigene Notiz bearbeiten und löschen (mit Rückfrage)", async () => {
  const p = await openApp("player", "sessions"); await p.locator(".entry button", { hasText: "Bearbeiten" }).click(); await p.fill("#note-body", "Geändert"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Gespeichert\./);
  assert.match(await p.locator(".entry").innerText(), /Geändert/);
  await p.locator(".entry button", { hasText: "Bearbeiten" }).click(); await p.getByRole("button", { name: "Löschen", exact: true }).click(); assert.ok(await p.getByText("Wirklich?").count());
  await p.getByRole("button", { name: "Ja, löschen" }).click(); await waitToast(p, /Gelöscht\./); assert.equal((await db(p, "session_notes")).length, 0); return p;
});
T("U57", "Sessions", "Löschen abbrechen lässt die Notiz stehen", async () => {
  const p = await openApp("player", "sessions"); await p.locator(".entry button", { hasText: "Bearbeiten" }).click(); await p.getByRole("button", { name: "Löschen", exact: true }).click();
  await p.getByRole("button", { name: "Abbrechen" }).first().click(); assert.equal((await db(p, "session_notes")).length, 1); return p;
});
T("U58", "Sessions", "Notiztext mit HTML/Script wird nur als Text dargestellt", async () => {
  const p = await openApp("player", "sessions"); await p.getByRole("button", { name: "Neue Notiz" }).click(); const x = '<img src=x onerror="window.__xss=1"><b>fett</b><script>window.__xss=2</script>';
  await p.fill("#note-body", x); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /angelegt/);
  assert.equal(await p.evaluate(() => window.__xss), undefined); assert.equal(await p.locator(".article b").count(), 0); assert.match(await p.locator(".article").innerText(), /<b>fett<\/b>/); return p;
});
T("U59", "Sessions", "Bearbeiten-Abbrechen verwirft Änderungen", async () => {
  const p = await openApp("player", "sessions"); await p.locator(".entry button", { hasText: "Bearbeiten" }).click(); await p.fill("#note-body", "Verworfen"); await p.getByRole("button", { name: "Abbrechen" }).click();
  assert.equal((await db(p, "session_notes"))[0].body, "Wir trafen [[Prinz]]."); return p;
});
const manySessions = "(() => { const db = window.__db; for (const n of [2, 3, 4, 5]) { db.sessions.push({ number: n, title: 'Nacht ' + n, play_date: null }); db.session_notes.push({ id: crypto.randomUUID(), session_number: n, author_id: '11111111-1111-1111-1111-111111111111', body: 'Notiz zu ' + n, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); } })()";
const openItems = p => p.locator("details.session-item[open]");
T("U61", "Sessions", "Sessions sind aufklappbar in der Liste: neueste offen, andere zu, höchstens eine offen, Zuklappen lässt alle zu", async () => {
  const p = await openApp("player", "sessions", { init: "" }); await p.evaluate(manySessions); await nav(p, "Charaktere", 300); await nav(p, "Sessions", 700);
  assert.equal(await p.locator("details.session-item").count(), 5); assert.equal(await openItems(p).count(), 1); assert.equal(await p.locator("details.session-item").first().evaluate(e => e.open), true, "neueste Session ist offen");
  assert.equal(await p.locator("details.session-item .article").count(), 1, "nur die offene Session baut ihren Inhalt auf");
  await p.locator('details[data-session="2"] > summary').click(); await p.waitForTimeout(300);
  assert.equal(await openItems(p).count(), 1); assert.equal(await p.locator('details[data-session="2"]').evaluate(e => e.open), true); assert.match(await p.locator(".article").innerText(), /Notiz zu 2/);
  await p.locator('details[data-session="2"] > summary').click(); await p.waitForTimeout(300); assert.equal(await openItems(p).count(), 0); assert.equal(await p.locator(".article").count(), 0); return p;
});
T("U62", "Sessions", "Die Liste bleibt kurz: aufgeklappter Inhalt steht in der Zeile der Session, nicht am Seitenende", async () => {
  const p = await openApp("player", "sessions", { init: "" }); await p.evaluate(manySessions); await nav(p, "Charaktere", 300); await nav(p, "Sessions", 700);
  await p.locator('details[data-session="2"] > summary').click(); await p.waitForTimeout(300);
  const order = await p.evaluate(() => [...document.querySelectorAll("details.session-item")].map(d => d.dataset.session + ":" + !!d.querySelector(".article")));
  assert.deepEqual(order, ["5:false", "4:false", "3:false", "2:true", "1:false"], "Inhalt steckt in der Zeile der Session 2"); return p;
});
T("U60", "Sessions", "Mehrere Notizen: eigener Abschnitt steht zuerst", async () => {
  const p = await openApp("player", "sessions"); await p.evaluate(() => window.__db.session_notes.push({ id: crypto.randomUUID(), session_number: 1, author_id: "11111111-1111-1111-1111-111111111111", body: "ST-Notiz", created_at: "2020-01-01T00:00:00Z", updated_at: "2020-01-01T00:00:00Z" }));
  await nav(p, "Charaktere", 300); await nav(p, "Sessions", 500); const first = await p.locator(".entry").first().innerText(); assert.match(first, /Wir trafen/); return p;
});

// =====================================================================
// E · Private Notizen
// =====================================================================
T("U70", "Privat", "Spieler legt private Notiz an, bearbeitet und löscht sie", async () => {
  const p = await openApp("player", "private"); await p.getByRole("button", { name: "Neue private Notiz" }).click(); await p.fill("#rec-title", "Mein Verdacht"); await p.fill("#rec-body", "Text eins");
  await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Angelegt\./); assert.match(await p.locator(".article").innerText(), /Text eins/);
  await p.getByRole("button", { name: "Bearbeiten" }).click(); await p.fill("#rec-body", "Text zwei"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Gespeichert\./);
  await p.getByRole("button", { name: "Bearbeiten" }).click(); await p.getByRole("button", { name: "Löschen", exact: true }).click(); await p.getByRole("button", { name: "Ja, löschen" }).click(); await waitToast(p, /Gelöscht\./);
  assert.equal((await db(p, "private_notes")).filter(n => n.title === "Mein Verdacht").length, 0); return p;
});
T("U71", "Privat", "Notiz ohne Titel heißt 'Ohne Titel'", async () => {
  const p = await openApp("player", "private"); await p.getByRole("button", { name: "Neue private Notiz" }).click(); await p.fill("#rec-body", "nur Text"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Angelegt/);
  assert.ok(await p.locator(".list button", { hasText: "Ohne Titel" }).count()); return p;
});
T("U72", "Privat", "ST: Bereich 'Storyteller → Private Spielernotizen' listet Notizen je Spieler", async () => {
  const p = await openApp("st", "st"); await p.getByRole("button", { name: "Private Spielernotizen" }).click(); await p.waitForTimeout(500);
  const t = await p.locator("main").innerText(); assert.match(t, /Feller/); assert.match(t, /Verdacht/); return p;
});
T("U73", "Privat", "Notiztext mit HTML wird nur als Text dargestellt", async () => {
  const p = await openApp("player", "private"); await p.getByRole("button", { name: "Neue private Notiz" }).click(); await p.fill("#rec-title", "<img src=x onerror=\"window.__xss=1\">"); await p.fill("#rec-body", "<script>window.__xss=2</script>");
  await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Angelegt/); assert.equal(await p.evaluate(() => window.__xss), undefined); return p;
});

// =====================================================================
// F · Wiki
// =====================================================================
T("U80", "Wiki", "Kategorien mit Seitenzahl; ST-Kategorie trägt 'versteckt'", async () => {
  const p = await openApp("st", "wiki"); const t = await p.locator(".cat-list").innerText(); assert.match(t, /Personen\s*1/); assert.match(t, /ST-Notizen/); assert.ok(await p.locator(".cat-list .badge.st").count()); return p;
});
T("U81", "Wiki", "Neue Seite: Titel ist Pflicht; Tags werden bereinigt (#, Leerzeichen)", async () => {
  const p = await openApp("player", "wiki"); await p.getByRole("button", { name: "Neue Seite" }).click(); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Titel/);
  await p.fill("#wp-title", "Testseite"); await p.fill("#wp-tags", "#a, b ,, #c"); await p.fill("#wp-body", "Inhalt"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Seite angelegt\./);
  assert.equal(await p.locator(".article h2").innerText(), "Testseite"); assert.deepEqual(await p.locator(".article .chip").allInnerTexts(), ["#a", "#b", "#c"]); return p;
});
T("U82", "Wiki", "[[Verweise]]: vorhandene Seite = Knopf, fehlende = markierter Text mit Hinweis", async () => {
  const p = await openApp("player", "wiki"); await p.locator(".list button", { hasText: "Prinz" }).click();
  assert.equal(await p.locator(".article .wlink.missing").getAttribute("title"), "Seite existiert noch nicht");
  await p.getByRole("button", { name: "Neue Seite" }).click(); await p.fill("#wp-title", "Elysium"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /angelegt/);
  await p.locator(".list button", { hasText: "Prinz" }).click(); await p.locator(".article button.wlink", { hasText: "Elysium" }).click(); assert.equal(await p.locator(".article h2").innerText(), "Elysium"); return p;
});
T("U83", "Wiki", "Verweis ohne Beachtung der Groß-/Kleinschreibung", async () => {
  const p = await openApp("player", "wiki"); await p.locator(".list button", { hasText: "Prinz" }).click(); await p.getByRole("button", { name: "Bearbeiten" }).click(); await p.fill("#wp-body", "[[prinz]] und [[PRINZ]]");
  await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Gespeichert/); assert.equal(await p.locator(".article button.wlink").count(), 2); return p;
});
T("U84", "Wiki", "Suche und Tag-Filter grenzen die Liste ein", async () => {
  const p = await openApp("player", "wiki"); await p.fill("#wiki-search", "zzz"); assert.match(await p.locator(".wiki-grid").innerText(), /Keine Seiten\./);
  await p.fill("#wiki-search", "prinz"); assert.ok(await p.locator(".list button", { hasText: "Prinz" }).count());
  await p.fill("#wiki-search", ""); await p.locator(".chip", { hasText: "#camarilla" }).click(); assert.ok(await p.locator(".list button", { hasText: "Prinz" }).count()); return p;
});
T("U85", "Wiki", "Seite bearbeiten, Kategorie wechseln, löschen (Ersteller)", async () => {
  const p = await openApp("player", "wiki"); await p.getByRole("button", { name: "Kategorie hinzufügen" }).click(); await p.fill("#newcat", "Orte"); await p.getByRole("button", { name: "Anlegen" }).click(); await waitToast(p, /Kategorie angelegt/);
  await p.locator(".cat-list button", { hasText: "Personen" }).click(); await p.locator(".list button", { hasText: "Prinz" }).click(); await p.getByRole("button", { name: "Bearbeiten" }).click();
  await p.selectOption("#wp-cat", { label: "Orte" }); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Gespeichert/);
  assert.match(await p.locator(".cat-list .current, .cat-list [aria-current=true]").innerText(), /Orte/);
  await p.getByRole("button", { name: "Bearbeiten" }).click(); await p.getByRole("button", { name: "Löschen", exact: true }).click(); await p.getByRole("button", { name: "Ja, löschen" }).click(); await waitToast(p, /Gelöscht/); return p;
});
T("U86", "Wiki", "Spieler sieht keine Kategorie-Verwaltung (Umbenennen/Löschen)", async () => {
  const p = await openApp("player", "wiki"); assert.equal(await p.locator("summary", { hasText: "Kategorie verwalten" }).count(), 0); return p;
});
T("U87", "Wiki", "ST: Kategorie umbenennen; leere löschen; belegte nicht", async () => {
  const p = await openApp("st", "wiki"); await p.locator(".cat-list button", { hasText: "ST-Notizen" }).click(); await p.locator("summary", { hasText: "Kategorie verwalten" }).click();
  await p.fill("#cat-rename", "Geheim"); await p.getByRole("button", { name: "Umbenennen" }).click(); await waitToast(p, /Umbenannt/); assert.ok(await p.locator(".cat-list button", { hasText: "Geheim" }).count());
  await p.locator("summary", { hasText: "Kategorie verwalten" }).click(); await p.getByRole("button", { name: "Löschen", exact: true }).click(); await p.getByRole("button", { name: "Ja, löschen" }).click(); await waitToast(p, /Gelöscht/);
  await p.locator(".cat-list button", { hasText: "Personen" }).click(); await p.locator("summary", { hasText: "Kategorie verwalten" }).click(); assert.match(await p.locator("details").innerText(), /Löschen erst, wenn die Kategorie leer ist/); return p;
});
T("U88", "Wiki", "HTML/Script in Titel, Tags, Text und Kategorie wird nicht ausgeführt", async () => {
  const p = await openApp("st", "wiki"); const x = '<img src=x onerror="window.__xss=1">';
  await p.getByRole("button", { name: "Kategorie hinzufügen" }).click(); await p.fill("#newcat", x); await p.getByRole("button", { name: "Anlegen" }).click(); await waitToast(p, /Kategorie angelegt/);
  await p.getByRole("button", { name: "Neue Seite" }).click(); await p.fill("#wp-title", x); await p.fill("#wp-tags", x); await p.fill("#wp-body", x + "[[" + x + "]]<script>window.__xss=2</script>");
  await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /angelegt/); assert.equal(await p.evaluate(() => window.__xss), undefined); assert.equal(await p.locator("main img").count(), 0); return p;
});
T("U89", "Wiki", "Leeres Kategoriename-Feld legt nichts an", async () => {
  const p = await openApp("player", "wiki"); const n = (await db(p, "wiki_categories")).length; await p.getByRole("button", { name: "Kategorie hinzufügen" }).click(); await p.fill("#newcat", "   "); await p.getByRole("button", { name: "Anlegen" }).click();
  await p.waitForTimeout(300); assert.equal((await db(p, "wiki_categories")).length, n); return p;
});
T("U90", "Wiki", "Sehr lange Seite (200 KB) lässt sich speichern und anzeigen", async () => {
  const p = await openApp("player", "wiki"); await p.getByRole("button", { name: "Neue Seite" }).click(); await p.fill("#wp-title", "Lang"); await p.fill("#wp-body", "x".repeat(200000));
  const t0 = Date.now(); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /angelegt/); assert.ok(Date.now() - t0 < 4000); return p;
});

// =====================================================================
// G · Dokumente
// =====================================================================
const upl = (p, name, mime, size = 10) => p.setInputFiles("#up-file", { name, mimeType: mime, buffer: Buffer.alloc(size, 1) });
T("U100", "Dokumente", "Upload ohne Datei, mit unzulässigem Typ und über 20 MB wird abgewiesen", async () => {
  const p = await openApp("player", "docs"); await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /Datei wählen/);
  await p.setInputFiles("#up-file", { name: "x.exe", mimeType: "application/x-msdownload", buffer: Buffer.alloc(5) }); await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /nicht unterstützt/);
  await upl(p, "gross.pdf", "application/pdf", 21 * 1024 * 1024); await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /zu groß/);
  assert.equal((await p.evaluate(() => window.__uploads || [])).length, 0); return p;
});
T("U101", "Dokumente", "PDF, PNG und Markdown (ohne MIME) werden akzeptiert; Pfad = <uid>/<uuid>-<name>", async () => {
  const p = await openApp("player", "docs");
  for (const [n, m] of [["a.pdf", "application/pdf"], ["b.png", "image/png"], ["c.md", ""]]) { await upl(p, n, m); await p.fill("#up-title", "T " + n); await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /Hochgeladen\./); await p.waitForTimeout(300); }
  const u = await p.evaluate(() => window.__uploads); assert.equal(u.length, 3); assert.ok(u.every(x => /^22222222-2222-2222-2222-222222222222\/[0-9a-f-]{36}-[\w.\-]+$/.test(x.path)), JSON.stringify(u));
  assert.equal(u[2].type, "text/markdown"); const rows = await db(p, "documents"); assert.equal(rows.filter(r => r.title.startsWith("T ")).length, 3); return p;
});
T("U102", "Dokumente", "Dateinamen mit Umlauten, Leerzeichen und Pfadtricks werden bereinigt", async () => {
  const p = await openApp("player", "docs"); await upl(p, "Ärger über ß ../../x y.pdf", "application/pdf"); await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /Hochgeladen/);
  const path0 = (await p.evaluate(() => window.__uploads))[0].path; assert.equal(path0.split("/").length, 2, "genau ein Ordner: " + path0); assert.ok(!path0.split("/").some(seg => seg === ".."), path0); assert.match(path0, /^[\w\-/.]+$/); return p;
});
T("U103", "Dokumente", "Upload-Fehler: Meldung, Button wieder bedienbar, kein Dokumenteintrag", async () => {
  const p = await openApp("player", "docs", { init: "window.__UPLOAD_ERROR = true" }); await upl(p, "a.pdf", "application/pdf"); const n = (await db(p, "documents")).length; await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /Fehler/);
  assert.equal(await p.getByRole("button", { name: "Hochladen" }).isEnabled(), true); assert.equal((await db(p, "documents")).length, n); return p;
});
T("U104", "Dokumente", "ST: Entwurf hochladen, erscheint unter 'ST-Entwürfe', 'Freigeben' macht ihn öffentlich", async () => {
  const p = await openApp("st", "docs"); await upl(p, "e.pdf", "application/pdf"); await p.fill("#up-title", "Entwurf X"); await p.check("#up-draft"); await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /Hochgeladen/);
  assert.ok(await p.locator("h3", { hasText: "ST-Entwürfe" }).count()); const card = p.locator(".doc", { hasText: "Entwurf X" }); await card.getByRole("button", { name: "Freigeben" }).click(); await waitToast(p, /freigegeben/);
  assert.equal((await db(p, "documents")).find(d => d.title === "Entwurf X").draft, false); return p;
});
T("U105", "Dokumente", "Spieler hat keine Entwurf-Option; Löschen nur bei eigenen Dokumenten", async () => {
  const p = await openApp("player", "docs"); assert.equal(await p.locator("#up-draft").count(), 0);
  await p.evaluate(() => window.__db.documents.push({ id: crypto.randomUUID(), title: "Fremd", description: "", storage_path: "x/y.pdf", file_name: "y.pdf", content_type: "application/pdf", size_bytes: 1, draft: false, uploader_id: "11111111-1111-1111-1111-111111111111", created_at: new Date().toISOString() }));
  await upl(p, "m.pdf", "application/pdf"); await p.fill("#up-title", "Meins"); await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /Hochgeladen/);
  assert.equal(await p.locator(".doc", { hasText: "Fremd" }).getByRole("button", { name: "Löschen" }).count(), 0); assert.equal(await p.locator(".doc", { hasText: "Meins" }).getByRole("button", { name: "Löschen" }).count(), 1); return p;
});
T("U106", "Dokumente", "Dokument löschen: Rückfrage, Datenbank und Speicher werden bereinigt", async () => {
  const p = await openApp("player", "docs"); await upl(p, "m.pdf", "application/pdf"); await p.fill("#up-title", "Weg"); await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /Hochgeladen/);
  const card = p.locator(".doc", { hasText: "Weg" }); await card.getByRole("button", { name: "Löschen" }).click(); await card.getByRole("button", { name: "Ja, löschen" }).click(); await waitToast(p, /Gelöscht/);
  assert.equal((await db(p, "documents")).filter(d => d.title === "Weg").length, 0); return p;
});
T("U107", "Dokumente", "Dokumenttitel mit HTML wird nur als Text angezeigt", async () => {
  const p = await openApp("player", "docs"); await upl(p, "m.pdf", "application/pdf"); await p.fill("#up-title", '<img src=x onerror="window.__xss=1">'); await p.fill("#up-desc", "<script>window.__xss=2</script>");
  await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /Hochgeladen/); assert.equal(await p.evaluate(() => window.__xss), undefined); assert.equal(await p.locator(".docs img[src='x']").count(), 0); return p;
});
T("U108", "Dokumente", "Bild-Dokument zeigt Vorschau mit Alternativtext", async () => {
  const p = await openApp("player", "docs"); await upl(p, "b.png", "image/png"); await p.fill("#up-title", "Karte Kiel"); await p.getByRole("button", { name: "Hochladen" }).click(); await waitToast(p, /Hochgeladen/);
  assert.equal(await p.locator('.doc img[alt="Karte Kiel"]').count(), 1); return p;
});

// =====================================================================
// H · Spielerkarte
// =====================================================================
T("U110", "Spielerkarte", "Karte zeigt Knoten, Verbindungen und Statuszeile", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); assert.equal(await cyEval(p, cy => cy.nodes().length), 3); assert.match(await p.locator("main").innerText(), /3 Knoten · 1 Verbindungen/); return p;
});
T("U110f", "Spielerkarte", "Suche mit mehreren Treffern: alle als Liste, zugeklappt; Aufklappen zeigt den Inhalt", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.fill("#map-search", "a"); await p.waitForTimeout(600);
  assert.equal(await p.locator(".map-panel details").count(), 3); assert.equal(await p.locator(".map-panel details[open]").count(), 0, "mehrere Treffer = zugeklappt");
  assert.match(await p.locator(".map-panel [role=status]").innerText(), /3 Treffer/i);
  await p.locator(".map-panel summary", { hasText: "Prinz Aniq" }).click(); await p.waitForTimeout(300);
  assert.equal(await p.locator(".map-panel details[open]").count(), 1); assert.match(await p.locator(".map-panel details[open]").innerText(), /Verbindungen \(1\)/i); return p;
});
T("U110g", "Spielerkarte", "Suche: Nicht-Treffer werden ausgeblendet; leere Suche stellt alles wieder her", async () => {
  const p = await openApp("player", "map", { wait: 1800 });
  await p.fill("#map-search", "a"); await p.waitForTimeout(600); assert.equal(await cyEval(p, cy => cy.nodes(".faded").length), 0, "alle drei sind Treffer");
  await p.fill("#map-search", "johana"); await p.waitForTimeout(600); assert.equal(await cyEval(p, cy => cy.nodes(".faded").length), 2, "Rest ausgeblendet");
  await p.fill("#map-search", ""); await p.waitForTimeout(500); assert.equal(await cyEval(p, cy => cy.elements(".faded").length), 0); assert.match(await p.locator(".map-panel").innerText(), /Die Suche zeigt alle Treffer als Liste/); return p;
});
T("U110h", "Spielerkarte", "Suche ohne Treffer meldet 'Keine Treffer'", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.fill("#map-search", "zzz"); await p.waitForTimeout(500); assert.match(await p.locator(".map-panel").innerText(), /keine treffer/i); assert.equal(await p.locator(".map-panel details").count(), 0); return p;
});
T("U110i", "Spielerkarte", "Treffer wechselt von mehreren auf einen: Eintrag ist aufgeklappt", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.fill("#map-search", "a"); await p.waitForTimeout(500); assert.equal(await p.locator(".map-panel details[open]").count(), 0);
  await p.fill("#map-search", "aniq"); await p.waitForTimeout(500); assert.equal(await p.locator(".map-panel details").count(), 1); assert.equal(await p.locator(".map-panel details[open]").count(), 1); return p;
});
T("U110j", "Spielerkarte", "Suche findet Teilwörter ohne Beachtung der Großschreibung", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.fill("#map-search", "TALSCH"); await p.waitForTimeout(500); assert.ok(await p.locator(".map-panel summary", { hasText: "Johana" }).count()); return p;
});
T("U110k", "Spielerkarte", "Knoten auf der Karte antippen beendet die Trefferliste und zeigt die Einzelansicht", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.fill("#map-search", "a"); await p.waitForTimeout(500);
  await cyEval(p, cy => cy.nodes()[0].emit("tap")); await p.waitForTimeout(300); assert.equal(await p.locator(".map-panel details").count(), 0); assert.ok(await p.locator(".map-panel h3").count()); return p;
});
T("U111", "Spielerkarte", "Knoten antippen zeigt Details und Verbindungen; Bearbeiten/Löschen erst im Bearbeitungsmodus", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await cyEval(p, cy => cy.nodes().filter(n => n.data("label") === "Prinz Aniq")[0].emit("tap")); const t = await p.locator(".map-panel").innerText();
  assert.match(t, /Prinz Aniq/); assert.match(t, /verbindungen \(1\)/i);
  assert.equal(await p.locator(".map-panel button", { hasText: /^(Bearbeiten|Löschen)$/ }).count(), 0, "in Ansicht keine Bearbeiten/Löschen-Knöpfe");
  await p.getByRole("button", { name: "Bearbeitung", exact: true }).click(); assert.ok(await p.locator(".map-panel button", { hasText: /^Bearbeiten$/ }).count()); assert.ok(await p.locator(".map-panel button", { hasText: /^Löschen$/ }).count()); return p;
});
T("U110b", "Spielerkarte", "Standard ist Ansicht: Schalter vorhanden, Anlegen/Neu anordnen ausgeblendet, Knoten nicht verschiebbar", async () => {
  const p = await openApp("player", "map", { wait: 1800 });
  assert.equal(await p.locator('.toggle button[aria-pressed="true"]').innerText(), "Ansicht");
  for (const n of ["Person/Ort hinzufügen", "Verbindung hinzufügen", "Neu anordnen"]) assert.equal(await p.getByRole("button", { name: n }).isVisible(), false, n + " sichtbar in Ansicht");
  const n = await cyEval(p, cy => { const x = cy.nodes()[1]; return { id: x.id(), rx: x.renderedPosition().x, ry: x.renderedPosition().y, grab: x.grabbable() }; }); assert.equal(n.grab, false);
  const before = JSON.stringify((await db(p, "map_positions")).map(x => [x.node_key, x.x, x.y]).sort()); const box = await p.locator(".map-canvas").boundingBox();
  await p.mouse.move(box.x + n.rx, box.y + n.ry); await p.mouse.down(); await p.mouse.move(box.x + n.rx + 60, box.y + n.ry + 40, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(1300);
  const after = await cyEval(p, (cy, id) => { const q = cy.getElementById(id).position(); return [Math.round(q.x), Math.round(q.y)]; }, n.id); assert.deepEqual(JSON.stringify((await db(p, "map_positions")).map(x => [x.node_key, x.x, x.y]).sort()), before, "Positionen in Ansicht unverändert");
  assert.ok(Array.isArray(after)); return p;
});
T("U110c", "Spielerkarte", "Bearbeitung zeigt die Knöpfe; Zurück auf Ansicht schließt offene Formulare und sperrt wieder", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  for (const n of ["Person/Ort hinzufügen", "Verbindung hinzufügen", "Neu anordnen"]) assert.equal(await p.getByRole("button", { name: n }).isVisible(), true, n + " fehlt in Bearbeitung");
  await p.getByRole("button", { name: "Person/Ort hinzufügen" }).click(); assert.equal(await p.locator("#nf-label").count(), 1);
  await p.getByRole("button", { name: "Ansicht", exact: true }).click(); assert.equal(await p.locator("#nf-label").count(), 0, "Formular geschlossen"); assert.equal(await p.getByRole("button", { name: "Person/Ort hinzufügen" }).isVisible(), false);
  assert.equal(await cyEval(p, cy => cy.nodes()[0].grabbable()), false); return p;
});
T("U110d", "Spielerkarte", "Suche, Filter und Auswahl funktionieren auch in Ansicht", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.fill("#map-search", "prinz"); await p.waitForTimeout(500); assert.equal(await p.locator(".map-panel details").count(), 1); assert.equal(await p.locator(".map-panel details[open]").count(), 1, "ein Treffer = aufgeklappt"); assert.ok(await p.locator(".map-panel summary", { hasText: "Prinz Aniq" }).count());
  const chip = p.locator(".chips .chip", { hasText: "Kindred" }); await chip.click(); assert.ok(await cyEval(p, cy => cy.nodes(".hide").length) >= 1); return p;
});
T("U110e", "Spielerkarte", "Modus bleibt beim Wechsel der Ansicht nicht stehen: neu geöffnet = Ansicht", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click(); await nav(p, "Charaktere", 400); await nav(p, "Spielerkarte", 1800);
  assert.equal(await p.locator('.toggle button[aria-pressed="true"]').innerText(), "Ansicht"); return p;
});
T("U112", "Spielerkarte", "Neuen Knoten anlegen (Name Pflicht, Tags bereinigt) und auswählen", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click(); await p.getByRole("button", { name: "Person/Ort hinzufügen" }).click(); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Namen/);
  await p.fill("#nf-label", "Hafenmeister"); await p.fill("#nf-type", "Sterblicher"); await p.fill("#nf-tags", "#hafen, ,Zoll"); await p.fill("#nf-desc", "Kennt jeden."); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Hinzugefügt/);
  assert.equal(await cyEval(p, cy => cy.nodes().length), 4); const row = (await db(p, "player_map_nodes")).find(n => n.label === "Hafenmeister"); assert.deepEqual(row.tags, ["hafen", "Zoll"]); return p;
});
T("U113", "Spielerkarte", "Verbindung anlegen: gleiche Knoten werden abgewiesen, gültige gespeichert", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click(); await p.getByRole("button", { name: "Verbindung hinzufügen" }).click(); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /zwei verschiedene/);
  const opts = await p.locator("#ef-from option").evaluateAll(o => o.map(x => x.value).filter(Boolean)); await p.selectOption("#ef-from", opts[0]); await p.selectOption("#ef-to", opts[0]); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /zwei verschiedene/);
  await p.selectOption("#ef-to", opts[1]); await p.fill("#ef-label", "kennt"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Verbindung angelegt/); assert.equal((await db(p, "player_map_edges")).length, 2); return p;
});
T("U114", "Spielerkarte", "Knoten löschen: Rückfrage, Kanten und Position verschwinden", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click(); await cyEval(p, cy => cy.nodes()[2].emit("tap")); const id = await cyEval(p, cy => cy.nodes()[2].id());
  await p.locator(".map-panel").getByRole("button", { name: "Löschen", exact: true }).click(); assert.ok(await p.getByText("Wirklich?").count()); await p.getByRole("button", { name: "Ja, löschen" }).click(); await p.waitForTimeout(700);
  assert.equal((await db(p, "player_map_nodes")).find(n => n.id === id), undefined); assert.equal((await db(p, "map_positions")).find(x => x.node_key === id), undefined); return p;
});
T("U115", "Spielerkarte", "Suche springt zum Treffer; Typ-Filter blendet Knoten aus und ein", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.fill("#map-search", "prinz"); await p.waitForTimeout(500); assert.equal(await p.locator(".map-panel details").count(), 1); assert.equal(await p.locator(".map-panel details[open]").count(), 1, "ein Treffer = aufgeklappt"); assert.ok(await p.locator(".map-panel summary", { hasText: "Prinz Aniq" }).count());
  const chip = p.locator(".chips .chip", { hasText: "Kindred" }); await chip.click(); assert.ok(await cyEval(p, cy => cy.nodes(".hide").length) >= 1); await chip.click(); assert.equal(await cyEval(p, cy => cy.nodes(".hide").length), 0); return p;
});
T("U116", "Spielerkarte", "Knoten ziehen: Position wird gespeichert und bleibt nach Ansichtswechsel erhalten (Regression)", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click(); const n = await cyEval(p, cy => { const x = cy.nodes()[1]; return { id: x.id(), rx: x.renderedPosition().x, ry: x.renderedPosition().y }; });
  const box = await p.locator(".map-canvas").boundingBox(); await p.mouse.move(box.x + n.rx, box.y + n.ry); await p.mouse.down(); await p.mouse.move(box.x + n.rx + 50, box.y + n.ry + 40, { steps: 6 }); await p.mouse.move(box.x + n.rx + 120, box.y + n.ry + 90, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(1500);
  const moved = await cyEval(p, (cy, id) => { const q = cy.getElementById(id).position(); return [Math.round(q.x), Math.round(q.y)]; }, n.id); const saved = (await db(p, "map_positions")).find(x => x.node_key === n.id); assert.deepEqual([saved.x, saved.y], moved);
  await nav(p, "Charaktere", 500); await nav(p, "Spielerkarte", 1800); const back = await cyEval(p, (cy, id) => { const q = cy.getElementById(id).position(); return [Math.round(q.x), Math.round(q.y)]; }, n.id); assert.deepEqual(back, moved); return p;
});
T("U117", "Spielerkarte", "Mehrfach ziehen: alle Verschiebungen werden gespeichert", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click();
  for (let i = 0; i < 3; i++) { const n = await cyEval(p, (cy, i) => { const x = cy.nodes()[i]; return { rx: x.renderedPosition().x, ry: x.renderedPosition().y }; }, i); const box = await p.locator(".map-canvas").boundingBox(); await p.mouse.move(box.x + n.rx, box.y + n.ry); await p.mouse.down(); await p.mouse.move(box.x + n.rx + 30 * (i + 1), box.y + n.ry + 20, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(120); }
  await p.waitForTimeout(1500); const pos = await cyEval(p, cy => cy.nodes().map(n => [n.id(), Math.round(n.position("x")), Math.round(n.position("y"))])); const rows = await db(p, "map_positions");
  for (const [id, x, y] of pos) { const r = rows.find(z => z.node_key === id); assert.deepEqual([r.x, r.y], [x, y], id); } return p;
});
T("U118", "Spielerkarte", "'Neu anordnen' speichert die neue Anordnung", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click(); const before = JSON.stringify((await db(p, "map_positions")).map(x => [x.node_key, x.x, x.y]).sort()); await p.getByRole("button", { name: "Neu anordnen" }).click(); await p.waitForTimeout(1800);
  const pos = await cyEval(p, cy => cy.nodes().map(n => [n.id(), Math.round(n.position("x")), Math.round(n.position("y"))])); const rows = await db(p, "map_positions"); for (const [id, x, y] of pos) { const r = rows.find(z => z.node_key === id); assert.deepEqual([r.x, r.y], [x, y]); } return p;
});
T("U119", "Spielerkarte", "Spielerkarte: alle Knoten sind Kreise (Form nur auf ST-Karte)", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); assert.deepEqual(await cyEval(p, cy => [...new Set(cy.nodes().map(n => n.data("shape")))]), ["ellipse"]); return p;
});
T("U120", "Spielerkarte", "Knotenname mit HTML wird nur als Text gezeigt", async () => {
  const p = await openApp("player", "map", { wait: 1800 }); await p.getByRole("button", { name: "Bearbeitung", exact: true }).click(); await p.getByRole("button", { name: "Person/Ort hinzufügen" }).click(); await p.fill("#nf-label", '<img src=x onerror="window.__xss=1">'); await p.fill("#nf-desc", "<script>window.__xss=2</script>");
  await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Hinzugefügt/); assert.equal(await p.evaluate(() => window.__xss), undefined); assert.equal(await p.locator(".map-panel img").count(), 0); return p;
});
T("U121", "Spielerkarte", "Erstanordnung wird beim ersten Öffnen gespeichert (alle Knoten haben eine Position)", async () => {
  const p = await openApp("player", "map", { wait: 2000 }); assert.equal((await db(p, "map_positions")).filter(x => x.scope === "player").length, 3); return p;
});
T("U122", "Spielerkarte", "Leere Spielerkarte zeigt Hinweis statt Fehler", async () => {
  const p = await openApp("player", "map", { wait: 1000 }); await p.evaluate(() => { window.__db.player_map_nodes.length = 0; window.__db.player_map_edges.length = 0; });
  await nav(p, "Charaktere", 300); await nav(p, "Spielerkarte", 1000); assert.match(await p.locator(".map-canvas").innerText(), /Die Karte ist leer/); return p;
});

// =====================================================================
// I · ST-Karte (Notion)
// =====================================================================
T("U130", "ST-Karte", "Karte lädt NPCs und Beziehungen aus der Function; Statuszeile zeigt Stand und Cache", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); assert.equal(await cyEval(p, cy => cy.nodes().length), 5); const t = await p.locator("main").innerText(); assert.match(t, /Stand .* \(Cache\)/); assert.match(t, /5 Knoten · 3 Verbindungen/);
  assert.equal((await p.evaluate(() => window.__invokes))[0].o.body.refresh, false); return p;
});
T("U131", "ST-Karte", "Form je Sekte: Camarilla Sechseck, Anarch Dreieck, Second Inquisition Stern, ohne Sekte Kreis", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); const m = await cyEval(p, cy => Object.fromEntries(cy.nodes().map(n => [n.data("label"), n.data("shape")]))); assert.equal(m["Aniq"], "hexagon"); assert.equal(m["Mara"], "triangle"); assert.equal(m["Jäger"], "star"); assert.equal(m["Lukas"], "ellipse"); return p;
});
T("U132", "ST-Karte", "Spielercharakter, Tote und Platzhalter sind erkennbar", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); const m = await cyEval(p, cy => Object.fromEntries(cy.nodes().map(n => [n.data("label"), { pc: n.data("pc"), dead: n.data("dead"), type: n.data("type") }]))); assert.equal(m["Lukas"].pc, true); assert.equal(m["Mara"].dead, true); assert.equal(m["Hafenamt"].type, "Ohne NPC-Eintrag"); return p;
});
T("U133", "ST-Karte", "ST-Karte ist schreibgeschützt: keine Hinzufügen-/Löschen-Knöpfe", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); assert.equal(await p.getByRole("button", { name: "Person/Ort hinzufügen" }).count(), 0); await cyEval(p, cy => cy.nodes()[0].emit("tap")); assert.equal(await p.locator(".map-panel").getByRole("button", { name: "Löschen" }).count(), 0); return p;
});
T("U134", "ST-Karte", "'Aus Notion neu laden' ruft die Function mit refresh=true auf", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); await p.getByRole("button", { name: "Aus Notion neu laden" }).click(); await p.waitForTimeout(1500);
  const inv = await p.evaluate(() => window.__invokes); assert.equal(inv.at(-1).o.body.refresh, true); assert.match(await p.locator("main").innerText(), /\(frisch\)/); return p;
});
T("U135", "ST-Karte", "Notion-Fehler: verständliche Meldung mit Hinweis auf Function und Secret", async () => {
  const p = await openApp("st", "st", { wait: 1500, notion: "error" }); const t = await p.locator(".map-canvas").innerText(); assert.match(t, /Notion konnte nicht gelesen werden: Notion 401/); assert.match(t, /NOTION_TOKEN/); return p;
});
T("U136", "ST-Karte", "Warnung der Function (z. B. Cache nicht gespeichert) erscheint als Hinweis", async () => {
  const p = await openApp("st", "st", { wait: 2000, notion: "warn" }); await waitToast(p, /Hinweis Notion: Cache nicht gespeichert/); return p;
});
T("U137", "ST-Karte", "'Auf Spielerkarte': nur der Name, Typ leer (tragen die Spieler selbst ein), ohne Beschreibung/Tags; zweiter Klick legt kein Duplikat an", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); await cyEval(p, cy => cy.nodes().filter(n => n.data("label") === "Aniq")[0].emit("tap"));
  await p.locator(".map-panel").getByRole("button", { name: "Auf Spielerkarte" }).click(); await waitToast(p, /steht auf der Spielerkarte/); await p.waitForTimeout(2800); await p.locator(".map-panel").getByRole("button", { name: "Auf Spielerkarte" }).click(); await p.waitForTimeout(500);
  const rows = (await db(p, "player_map_nodes")).filter(n => n.label === "Aniq"); assert.equal(rows.length, 1); assert.equal(rows[0].type, "", "Typ wird nicht übertragen"); assert.equal(rows[0].description, ""); assert.deepEqual(rows[0].tags, []); return p;
});
T("U138", "ST-Karte", "'Auf Spielerkarte' für Verbindung: ohne Beschriftung und Beschreibung, kein Duplikat", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); await p.evaluate(() => { window.__db.player_map_edges.length = 0; }); await cyEval(p, cy => cy.edges()[0].emit("tap")); await p.locator(".map-panel").getByRole("button", { name: "Auf Spielerkarte" }).click(); await waitToast(p, /geschoben/);
  await p.waitForTimeout(2800); await p.locator(".map-panel").getByRole("button", { name: "Auf Spielerkarte" }).click(); await p.waitForTimeout(600);
  const e = (await db(p, "player_map_edges")); assert.ok(e.every(x => x.label !== "Herrin von")); return p;
});
T("U139", "ST-Karte", "Beschreibung: <br> wird zu Zeilenumbruch, maskierte Pipes bleiben Tags", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); await cyEval(p, cy => cy.nodes().filter(n => n.data("label") === "Aniq")[0].emit("tap")); const t = await p.locator(".map-panel").innerText(); assert.match(t, /Alt\s+sehr alt/); assert.match(t, /Prinz/); assert.match(t, /Elysium/); return p;
});
T("U140", "ST-Karte", "Erstanordnung und Ziehen werden für scope 'st' gespeichert", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); assert.equal((await db(p, "map_positions")).filter(x => x.scope === "st").length, 5);
  const n = await cyEval(p, cy => { const x = cy.nodes()[1]; return { id: x.id(), rx: x.renderedPosition().x, ry: x.renderedPosition().y }; }); const box = await p.locator(".map-canvas").boundingBox();
  await p.mouse.move(box.x + n.rx, box.y + n.ry); await p.mouse.down(); await p.mouse.move(box.x + n.rx + 80, box.y + n.ry + 60, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(1500);
  const q = await cyEval(p, (cy, id) => { const z = cy.getElementById(id).position(); return [Math.round(z.x), Math.round(z.y)]; }, n.id); const r = (await db(p, "map_positions")).find(x => x.node_key === n.id && x.scope === "st"); assert.deepEqual([r.x, r.y], q);
  await p.getByRole("button", { name: "Private Spielernotizen" }).click(); await p.waitForTimeout(400); await p.getByRole("button", { name: "Beziehungskarte" }).click(); await p.waitForTimeout(2500);
  const back = await cyEval(p, (cy, id) => { const z = cy.getElementById(id).position(); return [Math.round(z.x), Math.round(z.y)]; }, n.id); assert.deepEqual(back, q); return p;
});
T("U141c", "ST-Karte", "ST-Karte: Suche zeigt mehrere Treffer zugeklappt, ein Treffer aufgeklappt mit 'Auf Spielerkarte'", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); await p.fill("#map-search", "a"); await p.waitForTimeout(600);
  assert.ok(await p.locator(".map-panel details").count() >= 3); assert.equal(await p.locator(".map-panel details[open]").count(), 0);
  await p.fill("#map-search", "mara"); await p.waitForTimeout(600); assert.equal(await p.locator(".map-panel details").count(), 1); assert.equal(await p.locator(".map-panel details[open]").count(), 1);
  assert.ok(await p.locator(".map-panel details[open]").getByRole("button", { name: "Auf Spielerkarte" }).count()); return p;
});
T("U141d", "ST-Karte", "ST-Karte: Suche zeigt mehrere Personen mit gemeinsamem Buchstaben (kein 'Find first')", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); await p.fill("#map-search", "a"); await p.waitForTimeout(500); const names = await p.locator(".map-panel summary").allInnerTexts();
  assert.ok(names.some(n => /Aniq/.test(n)) && names.some(n => /Mara/.test(n)), names.join(" | ")); return p;
});
T("U141b", "ST-Karte", "ST-Karte hat keinen Modus-Schalter (schreibgeschützt), Knoten bleiben verschiebbar", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); assert.equal(await p.locator(".toggle button", { hasText: /^(Ansicht|Bearbeitung)$/ }).count(), 0);
  assert.equal(await cyEval(p, cy => cy.nodes()[0].grabbable()), true); assert.equal(await p.getByRole("button", { name: "Neu anordnen" }).isVisible(), true); return p;
});
T("U141", "ST-Karte", "Legende der Formen ist sichtbar", async () => {
  const p = await openApp("st", "st", { wait: 2500 }); assert.match(await p.locator(".shape-legend").innerText(), /Camarilla[\s\S]*Anarch[\s\S]*Sabbat/); return p;
});

// =====================================================================
// K · Chroniken, Session-Infos, Szenenkarten
// =====================================================================
const SAMPLE = { format: "kbn-scenes/1", chronik: "Kiel by Night", session: 1, szenen: [
  { titel: "Treffen im Hafen", reihenfolge: 1, ort: "Hafen", stimmung: "Neblig und angespannt", ziel: "Kontakt herstellen", gegenspieler: "Zoll",
    npcs: [{ name: "Aniq", motivation: "Will die Loyalität der Gruppe prüfen" }, { name: "Unbekannter Händler", motivation: "Will Geld" }],
    faeden: ["Faden A"], ausgaenge: ["Erfolg: a", "Fehlschlag: b"], text: "Ablauf der Szene", details: "Weitere Infos zur Szene" },
  { titel: "Elysium", reihenfolge: 2, npcs: ["Mara"] },
  { titel: "Rückweg", reihenfolge: 3 }] };
const importFile = async (p, obj, name = "szenen.json") => {
  await p.getByRole("button", { name: "Szenen importieren", exact: true }).first().click();
  await p.setInputFiles("#sc-file", { name, mimeType: "application/json", buffer: Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj)) }); await p.waitForTimeout(600);
};
const stSession = async () => openApp("st", "sessions", { wait: 1000 });
const scn = p => db(p, "scenes");
T("U200", "Chroniken", "Spieler sieht die laufende Chronik mit Sessions, aktuellem Kapitel und ohne Verwaltungsknöpfe", async () => {
  const p = await openApp("player", "chronicles"); const t = await p.locator("section[data-chronicle]").innerText();
  assert.equal(await p.locator("section[data-chronicle]").count(), 1); assert.match(t, /Kiel by Night/); assert.match(t, /laufend/i); assert.match(t, /1 Session/); assert.match(t, /Kapitel 1 · Auftakt/);
  assert.equal(await p.getByRole("button", { name: "Neue Chronik" }).count(), 0); return p;
});
T("U201", "Chroniken", "ST legt Chronik an: Titel ist Pflicht, Entwurf wird gespeichert", async () => {
  const p = await openApp("st", "chronicles"); await p.getByRole("button", { name: "Neue Chronik", exact: true }).click(); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Titel/);
  await p.fill("#ch-title", "Zweite Chronik"); await p.selectOption("#ch-status", "draft"); await p.getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Chronik angelegt/); await p.waitForTimeout(400);
  assert.equal(await p.locator("section[data-chronicle]").count(), 2); const r = (await db(p, "chronicles")).find(c => c.title === "Zweite Chronik"); assert.equal(r.status, "draft"); assert.match(await p.locator("main").innerText(), /entwurf/i); return p;
});
T("U202", "Chroniken", "Detail: Zeitleiste mit Kapitel, Session, Ingame-Datum und Zusammenfassung; Spieler ohne Bearbeiten-Knöpfe", async () => {
  const a = await openApp("player", "chronicles"); await a.locator(".linkbtn", { hasText: "Kiel by Night" }).click(); await a.waitForTimeout(300);
  const t = await a.locator("main").innerText(); assert.match(t, /Kapitel 1 · Auftakt/); assert.match(t, /Session 1 · Auftakt/); assert.match(t, /Ingame Nacht vom 11\. März/); assert.match(t, /Die Gruppe trifft den Prinzen\./);
  assert.equal(await a.locator("details[data-chapter]").first().evaluate(e => e.open), true, "neuestes Kapitel ist aufgeklappt");
  for (const n of ["Chronik bearbeiten", "Kapitel verwalten"]) assert.equal(await a.getByRole("button", { name: n }).count(), 0, n); return a;
});
T("U203", "Chroniken", "ST: Kapitel anlegen; doppelte Nummer und Nummer 0 werden abgewiesen", async () => {
  const p = await openApp("st", "chronicles"); await p.locator(".linkbtn", { hasText: "Kiel by Night" }).click(); await p.getByRole("button", { name: "Kapitel verwalten" }).click();
  assert.equal(await p.inputValue("#kn-nr"), "2"); await p.fill("#kn-title", "Zweites"); await p.getByRole("button", { name: "Kapitel anlegen" }).click(); await waitToast(p, /Kapitel angelegt/); await p.waitForTimeout(300);
  assert.equal((await db(p, "chapters")).length, 2);
  if (!(await p.locator("#kn-nr").count())) await p.getByRole("button", { name: "Kapitel verwalten" }).click();
  await p.fill("#kn-nr", "1"); await p.getByRole("button", { name: "Kapitel anlegen" }).click(); await waitToast(p, /gibt es schon/); await p.fill("#kn-nr", "0"); await p.getByRole("button", { name: "Kapitel anlegen" }).click(); await waitToast(p, /ab 1/);
  assert.equal((await db(p, "chapters")).length, 2); return p;
});
T("U204", "Chroniken", "ST: nicht zugeordnete Session wird der Chronik zugeordnet und erscheint in der Zeitleiste", async () => {
  const p = await openApp("st", "chronicles"); await p.evaluate(() => window.__db.sessions.push({ number: 2, title: "Zwei", play_date: null }));
  await nav(p, "Charaktere", 300); await nav(p, "Chroniken", 600); assert.match(await p.locator("main").innerText(), /noch keiner Chronik zugeordnet/);
  await p.locator(".linkbtn", { hasText: "Kiel by Night" }).click(); await p.waitForTimeout(300); assert.equal(await p.locator("[data-unassigned]").count(), 1);
  await p.getByRole("button", { name: "Dieser Chronik zuordnen" }).click(); await waitToast(p, /Zugeordnet/); await p.waitForTimeout(400);
  assert.equal(await p.locator("[data-unassigned]").count(), 0); assert.ok(await p.locator('[data-session="2"]').count()); return p;
});
T("U205", "Sessions", "Zusammenfassung ist für Spieler sichtbar; Bearbeiten-Formular und Szenenkarten nur für den ST", async () => {
  const a = await openApp("player", "sessions"); assert.match(await a.locator("[data-info=summary]").innerText(), /Die Gruppe trifft den Prinzen\./); assert.match(await a.locator("[data-info=where]").innerText(), /Kiel by Night · Kapitel 1 Auftakt/);
  assert.equal(await a.locator("[data-info=edit]").count(), 0); assert.equal(await a.locator("#si-summary").count(), 0); assert.equal(await a.getByText("Szenenkarten").count(), 0); await a.close();
  const b = await stSession(); assert.equal(await b.locator("[data-info=edit]").count(), 1); assert.ok(await b.getByText("Szenenkarten").count()); return b;
});
T("U206", "Sessions", "ST speichert Chronik, Ingame-Datum und Zusammenfassung der Session", async () => {
  const p = await stSession(); await p.locator("[data-info=edit] summary").click(); await p.fill("#si-ingame", "Nacht vom 13. März"); await p.fill("#si-summary", "Neue Zusammenfassung"); await p.locator("[data-info=edit]").getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Gespeichert/);
  const i = (await db(p, "session_info")).find(x => x.session_number === 1); assert.equal(i.summary, "Neue Zusammenfassung"); assert.equal(i.ingame_date, "Nacht vom 13. März"); assert.ok(i.chronicle_id && i.chapter_id); return p;
});
T("U210", "Szenenkarten", "Neue Szene mit NPC und Motivation: NPC wird mit der ST-Karte verknüpft (Notion-ID)", async () => {
  const p = await stSession(); assert.match(await p.locator("section[aria-labelledby=scenes-h]").innerText(), /Noch keine Szenenkarten/);
  await p.getByRole("button", { name: "Neue Szene", exact: true }).click(); await p.locator("section[aria-labelledby=scenes-h]").getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Titel/);
  await p.fill("#sc-title", "Hafen"); await p.fill("#sc-place", "Dock 4"); await p.fill("#sc-mood", "Neblig"); await p.getByRole("button", { name: "NPC hinzufügen" }).click();
  await p.fill('input[aria-label="NPC-Name"]', "aniq"); await p.fill('input[aria-label="Motivation"]', "Will prüfen"); await p.fill("#sc-det", "Details hier");
  await p.locator("section[aria-labelledby=scenes-h]").getByRole("button", { name: "Speichern" }).click(); await waitToast(p, /Szene angelegt/); await p.waitForTimeout(500);
  const s = (await scn(p))[0], n = (await db(p, "scene_npcs"))[0]; assert.equal(s.title, "Hafen"); assert.equal(s.details, "Details hier"); assert.equal(n.notion_id, "a1"); assert.equal(n.motivation, "Will prüfen");
  const t = await p.locator("[data-scene]").innerText(); assert.match(t, /Neblig/); assert.match(t, /Will prüfen/); assert.match(t, /Weitere Details und Infos/); return p;
});
T("U211", "Szenenkarten", "Import: Vorschau zeigt Szenen und NPC-Treffer, danach stehen alle Felder in den Karten", async () => {
  const p = await stSession(); await importFile(p, SAMPLE);
  assert.match(await p.locator("[role=status]").first().innerText(), /Vorschau: 3 Szenen in der Datei, 3 werden importiert/); assert.equal(await p.locator("[data-import]").count(), 3);
  assert.ok(await p.locator(".badge", { hasText: /^verknüpft: Aniq$/i }).count()); assert.ok(await p.locator(".badge", { hasText: /^nicht verknüpft$/i }).count()); assert.equal((await scn(p)).length, 0, "Vorschau speichert noch nichts");
  await p.getByRole("button", { name: "3 Szenen importieren" }).click(); await waitToast(p, /3 Szenen importiert/); await p.waitForTimeout(500);
  const s = (await scn(p)).sort((a, b) => a.position - b.position); assert.deepEqual(s.map(x => x.title), ["Treffen im Hafen", "Elysium", "Rückweg"]); assert.deepEqual(s.map(x => x.position), [1, 2, 3]);
  assert.equal(s[0].mood, "Neblig und angespannt"); assert.equal(s[0].details, "Weitere Infos zur Szene"); assert.deepEqual(s[0].outcomes, ["Erfolg: a", "Fehlschlag: b"]); assert.deepEqual(s[0].threads, ["Faden A"]);
  const n = await db(p, "scene_npcs"); const by = x => n.find(r => r.name === x); assert.equal(by("Aniq").notion_id, "a1"); assert.equal(by("Aniq").motivation, "Will die Loyalität der Gruppe prüfen"); assert.equal(by("Unbekannter Händler").notion_id, ""); assert.equal(by("Mara").notion_id, "a2");
  assert.equal(await p.locator("[data-scene]").count(), 3); return p;
});
T("U212", "Szenenkarten", "Zweiter Import ersetzt nichts: doppelte Titel sind abgewählt, vorhandene Szenen bleiben", async () => {
  const p = await stSession(); await importFile(p, SAMPLE); await p.getByRole("button", { name: "3 Szenen importieren" }).click(); await waitToast(p, /3 Szenen importiert/); await p.waitForTimeout(500);
  await importFile(p, SAMPLE); assert.match(await p.locator("[role=status]").first().innerText(), /0 werden importiert/); assert.equal(await p.locator(".badge", { hasText: /Titel gibt es schon/i }).count(), 3);
  assert.equal(await p.getByRole("button", { name: "0 Szenen importieren" }).isDisabled(), true); assert.equal((await scn(p)).length, 3, "nichts doppelt, nichts ersetzt");
  await p.getByLabel("Szene importieren: Elysium").check(); await p.getByRole("button", { name: "1 Szene importieren" }).click(); await waitToast(p, /1 Szene importiert/); await p.waitForTimeout(500);
  const s = await scn(p); assert.equal(s.length, 4); assert.equal(Math.max(...s.map(x => x.position)), 4, "neue Szene wird hinten angehängt"); return p;
});
T("U213", "Szenenkarten", "Fehlerhafte Dateien: verständliche Fehlerliste, es wird nichts gespeichert", async () => {
  const p = await stSession();
  const cases = [["{kaputt", /kein gültiges JSON/], [{ format: "x", session: 1, szenen: [{ titel: "a" }] }, /Unbekanntes Format/], [{ format: "kbn-scenes/1", session: 0, szenen: [{ titel: "a" }] }, /"session" muss/],
    [{ format: "kbn-scenes/1", session: 1, szenen: [] }, /mindestens einer Szene/], [{ format: "kbn-scenes/1", session: 1, szenen: [{ ort: "x" }, { titel: "b", npcs: "x" }, { titel: "c", ausgaenge: [1] }] }, /Szene 1: "titel" fehlt[\s\S]*"npcs" muss eine Liste[\s\S]*"ausgaenge" muss eine Liste/]];
  for (const [c, re] of cases) { await importFile(p, c); assert.match(await p.locator(".notice.bad").first().innerText(), re); assert.match(await p.locator(".notice.bad").first().innerText(), /nichts gespeichert/); assert.equal((await scn(p)).length, 0); }
  return p;
});
T("U214", "Szenenkarten", "Status ändern, Reihenfolge tauschen, Szene löschen (mit Rückfrage)", async () => {
  const p = await stSession(); await importFile(p, SAMPLE); await p.getByRole("button", { name: "3 Szenen importieren" }).click(); await waitToast(p, /3 Szenen importiert/); await p.waitForTimeout(500);
  const card = t => p.locator("[data-scene]", { hasText: t });
  await card("Elysium").locator("summary").click(); await card("Elysium").getByRole("button", { name: "Gespielt", exact: true }).click(); await p.waitForTimeout(500);
  assert.equal((await scn(p)).find(s => s.title === "Elysium").status, "played"); assert.match(await card("Elysium").locator("summary").innerText(), /gespielt/i);
  if (!(await card("Elysium").evaluate(e => e.open))) await card("Elysium").locator("summary").click();
  await card("Elysium").getByRole("button", { name: "Szene nach oben" }).click(); await p.waitForTimeout(600);
  const o = (await scn(p)).sort((a, b) => a.position - b.position).map(s => s.title); assert.deepEqual(o, ["Elysium", "Treffen im Hafen", "Rückweg"]);
  await card("Rückweg").locator("summary").click(); await card("Rückweg").getByRole("button", { name: "Löschen", exact: true }).click(); await card("Rückweg").getByRole("button", { name: "Ja, löschen" }).click(); await waitToast(p, /Gelöscht/); await p.waitForTimeout(400);
  assert.equal((await scn(p)).length, 2); return p;
});
T("U215", "Szenenkarten", "ST-Karte: Knoten zeigt 'Kommt vor in' mit der Motivation aus der Szene; Klick auf den NPC in der Szene springt zum Knoten", async () => {
  const p = await stSession(); await importFile(p, SAMPLE); await p.getByRole("button", { name: "3 Szenen importieren" }).click(); await waitToast(p, /3 Szenen importiert/); await p.waitForTimeout(500);
  await p.locator("[data-scene]", { hasText: "Treffen im Hafen" }).locator(":scope > summary").click(); await p.locator("[data-scene] button.chip", { hasText: "Aniq" }).click(); await p.waitForTimeout(2800);
  assert.match(await p.locator(".map-panel").innerText(), /Aniq/); assert.match(await p.locator(".map-panel").innerText(), /kommt vor in \(1\)/i); assert.match(await p.locator(".map-panel").innerText(), /Will die Loyalität der Gruppe prüfen/);
  assert.ok(await p.locator(".map-panel h3", { hasText: "Aniq" }).count(), "Knoten ist ausgewählt");
  await p.locator(".map-panel").getByRole("button", { name: /Session 1 · Treffen im Hafen/ }).click(); await p.waitForTimeout(700); assert.equal(await p.locator(".article h2").innerText(), "Session 1"); return p;
});
T("U217", "Szenenkarten", "Szenenblock und Chroniken zeigen nie den Text 'null' (leere Bausteine werden übersprungen)", async () => {
  const p = await stSession(); assert.doesNotMatch(await p.locator("section[aria-labelledby=scenes-h]").innerText(), /null/);
  await importFile(p, SAMPLE); assert.doesNotMatch(await p.locator("section[aria-labelledby=scenes-h]").innerText(), /null/);
  await p.getByRole("button", { name: "3 Szenen importieren" }).click(); await waitToast(p, /3 Szenen importiert/); await p.waitForTimeout(500); assert.doesNotMatch(await p.locator("section[aria-labelledby=scenes-h]").innerText(), /null/);
  await nav(p, "Chroniken", 600); assert.doesNotMatch(await p.locator("main").innerText(), /null/); await p.locator(".linkbtn", { hasText: "Kiel by Night" }).click(); await p.waitForTimeout(300); assert.doesNotMatch(await p.locator("main").innerText(), /null/); return p;
});
T("U163", "Handy 390 px", "Session aufgeklappt mit Szenenkarte: Status-Knöpfe und Inhalt passen in die Breite, kein horizontales Scrollen", async () => {
  const p = await openApp("st", "sessions", { viewport: { width: 390, height: 800 }, wait: 1000 }); await importFile(p, SAMPLE); await p.getByRole("button", { name: "3 Szenen importieren" }).click(); await waitToast(p, /3 Szenen importiert/); await p.waitForTimeout(500);
  await p.locator("[data-scene]").first().locator(":scope > summary").click(); await p.waitForTimeout(300);
  const r = await p.evaluate(() => { const w = innerWidth; const bad = [...document.querySelectorAll(".toggle.wrap button, [data-scene] .btn, .session-item")].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > w + 1 || b.left < -1); }).map(e => e.textContent.trim().slice(0, 20)); return { bad, scroll: document.documentElement.scrollWidth <= w }; });
  assert.deepEqual(r.bad, []); assert.equal(r.scroll, true); return p;
});
T("U216", "Szenenkarten", "Spieler: kein Szenenblock und keine Import-Knöpfe", async () => {
  const p = await openApp("player", "sessions"); assert.equal(await p.getByText("Szenenkarten").count(), 0); assert.equal(await p.getByRole("button", { name: "Szenen importieren" }).count(), 0); return p;
});

// =====================================================================
// J · Handy, Barrierefreiheit, Kontrast, Konsole
// =====================================================================
const VIEWS = { st: ["start", "chars", "chronicles", "sessions", "map", "wiki", "docs", "st"], player: ["start", "chars", "chronicles", "sessions", "map", "wiki", "docs", "private"] };
for (const role of ["st", "player"]) {
  T("U150" + (role === "st" ? "a" : "b"), "Handy 390 px", `${role}: kein horizontales Scrollen in allen Bereichen`, async () => {
    const p = await openApp(role, "start", { viewport: { width: 390, height: 800 } }); const bad = [];
    for (const v of VIEWS[role]) { await p.evaluate(v => { location.hash = "#" + v; }, v); await p.waitForTimeout(v === "map" || v === "st" ? 1800 : 500); const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); if (w[0] > w[1] + 1) bad.push(`${v}: ${w[0]}>${w[1]}`); }
    assert.equal(bad.length, 0, JSON.stringify(bad)); return p;
  });
  T("U151" + (role === "st" ? "a" : "b"), "Barrierefreiheit", `${role}: jede Schaltfläche und jedes Feld hat einen zugänglichen Namen`, async () => {
    const p = await openApp(role, "start"); const bad = [];
    for (const v of VIEWS[role]) {
      await p.evaluate(v => { location.hash = "#" + v; }, v); await p.waitForTimeout(v === "map" || v === "st" ? 1800 : 500);
      const r = await p.evaluate(() => [...document.querySelectorAll("main button, main input, main select, main textarea, header button")].filter(e => !e.closest(".map-canvas")).filter(e => {
        const name = (e.getAttribute("aria-label") || e.textContent || e.value || e.placeholder || "").trim(); const lab = e.id && document.querySelector(`label[for="${e.id}"]`); const wrap = e.closest("label");
        return !(name || lab || wrap || e.getAttribute("aria-labelledby") || e.title) && e.type !== "hidden"; }).map(e => e.tagName + "#" + e.id + "." + e.className));
      if (r.length) bad.push(v + ": " + r.slice(0, 4).join(", "));
    } assert.equal(bad.length, 0, JSON.stringify(bad)); return p;
  });
  T("U152" + (role === "st" ? "a" : "b"), "Konsole", `${role}: keine JavaScript-Fehler beim Durchklicken aller Bereiche (hell und dunkel)`, async () => {
    const p = await openApp(role, "start", { scheme: "dark" }); for (const v of VIEWS[role]) { await p.evaluate(v => { location.hash = "#" + v; }, v); await p.waitForTimeout(v === "map" || v === "st" ? 1800 : 450); }
    await p.evaluate(() => { document.documentElement.dataset.theme = "light"; }); await p.waitForTimeout(300); assert.deepEqual(p.errors, []); return p;
  });
}
T("U153", "Barrierefreiheit", "Dokument hat lang=de, Titel, genau eine h1, main-Bereich und Navigation mit Beschriftung", async () => {
  const p = await openApp("player"); const r = await p.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, h1: document.querySelectorAll("h1").length, main: document.querySelectorAll("main").length, nav: document.querySelector("nav")?.getAttribute("aria-label") }));
  assert.deepEqual(r, { lang: "de", title: "Kiel by Night", h1: 1, main: 1, nav: "Bereiche" }); return p;
});
T("U154", "Barrierefreiheit", "Tastatur: Tab erreicht Navigation und Fokus ist sichtbar (focus-visible Outline)", async () => {
  const p = await openApp("player"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.keyboard.press("Tab");
  const o = await p.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { tag: e.tagName, outline: s.outlineStyle, w: s.outlineWidth }; }); assert.ok(o.outline !== "none" && o.w !== "0px", JSON.stringify(o)); return p;
});
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
for (const scheme of ["light", "dark"]) T("U155" + (scheme === "light" ? "a" : "b"), "Kontrast", `Textkontrast (WCAG AA 4,5:1) im ${scheme === "light" ? "hellen" : "dunklen"} Modus`, async () => {
  const p = await openApp("st", "start", { scheme }); const rows = [];
  for (const v of ["start", "wiki", "sessions", "docs"]) {
    await p.evaluate(v => { location.hash = "#" + v; }, v); await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(",").map(x => parseFloat(x)); return { rgb: a.slice(0, 3), a: a[3] ?? 1 }; };
      const bgOf = e => { for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > .5) return c.rgb; } return [255, 255, 255]; };
      const out = []; for (const sel of ["main h2", "main p", ".muted", ".btn", ".btn.primary", ".badge", "#nav button", ".linkbtn", ".eyebrow", "label", ".list button", "input"]) { const e = document.querySelector(sel); if (!e) continue; const s = getComputedStyle(e); const c = parse(s.color); if (c) out.push({ sel, fg: c.rgb, bg: bgOf(e), size: parseFloat(s.fontSize) }); } return out;
    });
    for (const x of r) { const a = lum(x.fg), b = lum(x.bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); rows.push({ v, sel: x.sel, ratio: +ratio.toFixed(2), size: x.size }); }
  }
  live.push({ scheme, contrast: rows }); const bad = rows.filter(x => x.ratio < 4.5).map(x => `${x.v} ${x.sel} ${x.ratio}:1 (${x.size}px)`); assert.equal(bad.length, 0, bad.join('; ')); return p;
});
T("U156", "Leistung", "Start bis Übersicht sichtbar in unter 2 Sekunden (lokal, ohne Netz)", async () => {
  const p = await openApp("player", "start", { wait: 0 }); const t0 = Date.now(); await p.locator(".cards .pc").first().waitFor({ timeout: 4000 }); assert.ok(Date.now() - t0 < 2000, "Dauer " + (Date.now() - t0)); return p;
});
T("U157", "Sicherheit", "Keine Geheimnisse im ausgelieferten Frontend (service_role, secret, Notion-Token, JWT)", async () => {
  const bad = []; const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { const s = fs.readFileSync(f, "utf8"); for (const [n, re] of [["secret-key", /sb_secret_/], ["service_role-JWT", /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./], ["Notion-Token", /\b(ntn_|secret_)[A-Za-z0-9]{20,}/], ["privater Schlüssel", /BEGIN (RSA )?PRIVATE KEY/]]) if (re.test(s)) bad.push(n + " in " + f); } }); walk(WEB); assert.deepEqual(bad, []); return null;
});
T("U158", "Sicherheit", "Kein innerHTML/eval/document.write im Frontend-Code außer der festen SVG-Legende", async () => {
  const hits = []; const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith(".js") || f.endsWith(".html")) fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(l)) hits.push(path.basename(f) + ":" + (i + 1) + " " + l.trim().slice(0, 90)); }); }); walk(WEB);
  live.push({ innerHTML: hits }); assert.ok(hits.length <= 1 && hits.every(h => /shape-legend|SVG_SHAPE|s\.innerHTML/.test(h) || /map\.js/.test(h)), hits.join(" | ")); return null;
});
T("U159", "Sicherheit", "Externe Ressourcen: Skripte ohne Integritätsprüfung (SRI) und Google Fonts (Datenschutz) erfasst", async () => {
  const html = fs.readFileSync(WEB + "/index.html", "utf8"); const scripts = [...html.matchAll(/<script[^>]+src="(https:[^"]+)"[^>]*>/g)].map(m => ({ src: m[1], sri: /integrity=/.test(m[0]) }));
  const core = fs.readFileSync(WEB + "/js/core.js", "utf8"); const esm = [...core.matchAll(/from "(https:[^"]+)"/g)].map(m => m[1]); const fonts = /fonts\.googleapis\.com/.test(html); const csp = /Content-Security-Policy/i.test(html);
  live.push({ scripts, esm, googleFonts: fonts, csp }); assert.ok(scripts.every(s => /@\d+\.\d+\.\d+/.test(s.src)), "Versionen fest gepinnt"); return null;
});

// =====================================================================
// Ausführen
// =====================================================================
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const t of results) {
  if (only && !only.test(t.id)) { t.status = "SKIP"; continue; }
  let page = null; const t0 = Date.now();
  try { page = await t.fn(); if (page && page.errors && page.errors.length && !["U02", "U16"].includes(t.id)) { /* nur melden, wenn Test nicht selbst Fehler erwartet */ if (page.errors.some(e => !/Invalid|Failed to fetch/.test(e))) throw new Error("JS-Fehler: " + page.errors[0]); } t.status = "PASS"; }
  catch (e) { t.status = "FAIL"; t.detail = (e.message || String(e)).split("\n").slice(0, 3).join(" ⏎ ").slice(0, 400); try { if (page && page.screenshot) await page.screenshot({ path: `${SHOTS}/${t.id}.png` }); } catch (_) {} }
  t.ms = Date.now() - t0;
  try { for (const pg of browser.contexts().flatMap(c => c.pages())) await pg.close(); } catch (_) {}
  console.log(`${t.id}\t${t.status}\t${t.area}\t${t.name}${t.detail ? "\t→ " + t.detail : ""}`);
}
fs.writeFileSync(OUT + "/ui_results.json", JSON.stringify({ results: results.map(({ fn, ...r }) => r), live }, null, 1));
await browser.close();
const pass = results.filter(r => r.status === "PASS").length, fail = results.filter(r => r.status === "FAIL").length;
console.log(`\nUI-UAT total=${results.length} pass=${pass} fail=${fail}`);
