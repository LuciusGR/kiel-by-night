// Kiel by Night · Start, Anmeldung, Navigation
import { h, toast, errMsg, store, diagnoseNetwork } from "./lib.js";
import { sb, S, go, loadProfiles, loadChars, setNavRenderer, personName } from "./core.js";
import { SUPABASE_URL, APP_VERSION } from "./config.js";
import "./views/overview.js";
import "./views/characters.js";
import "./views/chronicles.js";
import "./views/sessions.js";
import "./views/scenepool.js";
import "./views/private.js";
import "./views/playermap.js";
import "./views/wiki.js";
import "./views/docs.js";
import "./views/storyteller.js";

const NAV = [["start", "Übersicht"], ["chars", "Charaktere"], ["chronicles", "Chroniken"], ["sessions", "Sessions"], ["map", "Spielerkarte"], ["wiki", "Wiki"], ["docs", "Dokumente"]];
const VALID = new Set(["start", "chars", "chronicles", "sessions", "scenes", "map", "wiki", "docs", "private", "st"]);

// Supabase Auth braucht eine E-Mail als Kennung. Die Gruppe meldet sich mit einem Benutzernamen an, intern wird
// daraus name@kbn.invalid (".invalid" kann nie eine echte Adresse sein, es werden keine Mails verschickt).
// Eine eingetippte Adresse mit @ geht unverändert durch, so bleiben bestehende Konten nutzbar.
const LOGIN_DOMAIN = "kbn.invalid";
export function toLoginEmail(input) {
  const v = String(input || "").trim().toLowerCase();
  if (v.includes("@")) return /^[^\s@]+@[^\s@]+$/.test(v) ? v : null;
  return /^[a-z0-9._-]{2,32}$/.test(v) ? v + "@" + LOGIN_DOMAIN : null;
}

function renderNav() {
  const nav = document.getElementById("nav");
  nav.replaceChildren();
  if (!S.user) return;
  const items = [...NAV];
  if (S.isST) items.splice(4, 0, ["scenes", "Szenen"]); // Szenenvorrat, nur Storyteller
  if (!S.isST) items.push(["private", "Privat"]);
  for (const [v, l] of items) nav.append(h("button", { type: "button", "aria-current": S.view === v ? "page" : null, onclick: () => go(v) }, l));
  if (S.isST) nav.append(h("button", { type: "button", class: "st", "aria-current": S.view === "st" ? "page" : null, onclick: () => go("st") }, "Storyteller"));
}
setNavRenderer(renderNav);

// ---------- Theme ----------
function themeLabel() { const t = document.documentElement.dataset.theme; return t === "dark" ? "Dunkel" : t === "light" ? "Hell" : "Auto"; }
function cycleTheme(btn) {
  const cur = document.documentElement.dataset.theme || "auto";
  const next = { auto: "light", light: "dark", dark: "auto" }[cur];
  if (next === "auto") { delete document.documentElement.dataset.theme; store("kbn-theme", null); }
  else { document.documentElement.dataset.theme = next; store("kbn-theme", next); }
  btn.textContent = "Theme: " + themeLabel();
}

function renderWho() {
  const who = document.getElementById("who");
  const themeBtn = h("button", { class: "hbtn", type: "button", title: "Hell / Dunkel / Automatisch" }, "Theme: " + themeLabel());
  themeBtn.addEventListener("click", () => cycleTheme(themeBtn));
  if (!S.user) { who.replaceChildren(themeBtn); return; }
  who.replaceChildren(
    h("span", {}, (S.isST ? "Storyteller" : "Spieler") + " · " + personName(S.user.id)),
    themeBtn,
    h("button", { class: "hbtn", type: "button", onclick: passwordDialog }, "Passwort"),
    h("button", { class: "hbtn", type: "button", onclick: async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); } }, "Abmelden"));
}

function passwordDialog() {
  const p1 = h("input", { type: "password", id: "pw1", autocomplete: "new-password", minlength: "8" });
  const p2 = h("input", { type: "password", id: "pw2", autocomplete: "new-password", minlength: "8" });
  const dlg = h("dialog", {},
    h("form", { method: "dialog", class: "stack" },
      h("h3", {}, "Passwort ändern"),
      h("div", { class: "field" }, h("label", { for: "pw1" }, "Neues Passwort (mind. 8 Zeichen)"), p1),
      h("div", { class: "field" }, h("label", { for: "pw2" }, "Wiederholen"), p2),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: async () => {
          if (p1.value.length < 8) return toast("Mindestens 8 Zeichen.", true);
          if (p1.value !== p2.value) return toast("Die Passwörter stimmen nicht überein.", true);
          const { error } = await sb.auth.updateUser({ password: p1.value });
          if (error) return toast(errMsg(error), true);
          toast("Passwort geändert."); dlg.close(); dlg.remove();
        } }, "Speichern"),
        h("button", { class: "btn", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Abbrechen"))));
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- Login ----------
function renderLogin(msg) {
  const main = document.getElementById("main");
  const user = h("input", { type: "text", id: "login-user", autocomplete: "username", autocapitalize: "none", autocorrect: "off", spellcheck: "false", required: true });
  const pw = h("input", { type: "password", id: "login-pw", autocomplete: "current-password", required: true });
  const btn = h("button", { class: "btn primary", type: "submit" }, "Anmelden");
  const form = h("form", { class: "panel stack login" },
    h("h2", {}, "Anmelden"),
    h("p", { class: "muted" }, "Zugang nur für die Chronik-Gruppe. Konten vergibt der Storyteller."),
    msg ? h("div", { class: "notice bad" }, msg) : null,
    h("div", { class: "field" }, h("label", { for: "login-user" }, "Benutzername"), user),
    h("div", { class: "field" }, h("label", { for: "login-pw" }, "Passwort"), pw),
    h("div", {}, btn));
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const loginEmail = toLoginEmail(user.value);
    if (!loginEmail) { toast("Benutzername: 2 bis 32 Zeichen, nur Buchstaben, Zahlen, Punkt, Minus und Unterstrich.", true); return; }
    btn.disabled = true; btn.textContent = "Prüfe …";
    const { error } = await sb.auth.signInWithPassword({ email: loginEmail, password: pw.value });
    if (error) {
      let msg = /invalid/i.test(error.message) ? "Benutzername oder Passwort falsch." : errMsg(error);
      if (/Failed to fetch|NetworkError|Load failed/i.test(error.message)) { btn.textContent = "Prüfe Verbindung …"; msg = await diagnoseNetwork(); }
      btn.disabled = false; btn.textContent = "Anmelden"; toast(msg, true); return;
    }
    btn.disabled = false; btn.textContent = "Anmelden";
    // weiter geht es über onAuthStateChange
  });
  main.replaceChildren(form);
  user.focus();
}

// ---------- Start ----------
let started = false, entering = false;
async function enter(user) {
  if (entering || started) return;
  entering = true;
  try { await enterInner(user); } finally { entering = false; }
}
async function enterInner(user) {
  S.user = user;
  try { await Promise.all([loadProfiles(), loadChars()]); }
  catch (e) { renderLogin("Daten konnten nicht geladen werden: " + errMsg(e)); return; }
  if (!S.profiles.has(user.id)) { renderLogin("Für dieses Konto gibt es kein Profil. Der Storyteller muss es anlegen."); return; }
  started = true;
  renderWho();
  const t = (location.hash || "").slice(1);
  go(VALID.has(t) ? t : "start");
}

(async function boot() {
  if (SUPABASE_URL.includes("DEIN-PROJECT-REF")) {
    document.getElementById("main").replaceChildren(h("div", { class: "notice bad" }, "web/js/config.js ist noch nicht ausgefüllt (Supabase-URL und anon key)."));
    return;
  }
  renderWho();
  const { data } = await sb.auth.getSession();
  if (data.session) await enter(data.session.user); else renderLogin();
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === "SIGNED_IN" && session && !started) enter(session.user);
    if (ev === "SIGNED_OUT") { started = false; S.user = null; renderNav(); renderWho(); renderLogin(); }
  });
  window.addEventListener("hashchange", () => {
    const t = location.hash.slice(1);
    if (started && VALID.has(t) && t !== S.view) go(t);
  });
  console.info("Kiel by Night v" + APP_VERSION);
})();
