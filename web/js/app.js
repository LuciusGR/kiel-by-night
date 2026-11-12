// Kiel by Night · Start, Anmeldung, Navigation
import { h, toast, errMsg, store, diagnoseNetwork } from "./lib.js";
import { sb, S, go, parseHash, loadProfiles, loadChars, setNavRenderer, personName } from "./core.js";
import { SUPABASE_URL, APP_VERSION } from "./config.js";
import { mountFooter } from "./legal.js";
import { mountSwipe } from "./swipe.js";
import "./views/overview.js";
import "./views/characters.js";
import "./views/chronicles.js";
import "./views/sessions.js";
import "./views/scenepool.js";
import "./views/private.js";
import "./views/playermap.js";
import "./views/wiki.js";
import "./views/docs.js";
import "./views/search.js";
import "./views/manual.js";
import "./views/storyteller.js";

const NAV = [["start", "Übersicht"], ["chars", "Charaktere"], ["chronicles", "Chroniken"], ["sessions", "Sessions"], ["map", "Spielerkarte"], ["wiki", "Wiki"], ["docs", "Dokumente"], ["search", "Suche"], ["manual", "Anleitung"]];
const VALID = new Set(["start", "chars", "chronicles", "sessions", "scenes", "map", "wiki", "docs", "search", "manual", "private", "st"]);

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
  closeWhoMenu();
  if (!S.user) { document.title = "Kiel by Night"; return; }
  const items = [...NAV];
  if (S.isST) items.splice(4, 0, ["scenes", "Szenen"]); // Szenenvorrat, nur Storyteller
  if (!S.isST) items.push(["private", "Privat"]);
  for (const [v, l] of items) nav.append(h("button", { type: "button", "aria-current": S.view === v ? "page" : null, onclick: () => go(v) }, l));
  if (S.isST) nav.append(h("button", { type: "button", class: "st", "aria-current": S.view === "st" ? "page" : null, onclick: () => go("st") }, "Storyteller"));
  // Am Handy scrollt die Reiterleiste seitlich: den aktuellen Reiter in die Mitte holen, Ränder mit Verlauf zeigen, dass es weitergeht
  const cur = nav.querySelector('[aria-current="page"]');
  if (cur) { nav.scrollLeft = cur.offsetLeft - nav.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2; document.title = cur.textContent + " · Kiel by Night"; }
  navFade();
}
function navFade() {
  const nav = document.getElementById("nav"); if (!nav) return;
  const max = nav.scrollWidth - nav.clientWidth;
  nav.classList.toggle("more-left", nav.scrollLeft > 4);
  nav.classList.toggle("more-right", nav.scrollLeft < max - 4);
}
setNavRenderer(renderNav);

// ---------- Theme ----------
// Ein Knopf schaltet alle Darstellungsmodi durch: Stil (Rulebook = Look der V5-Regelbücher, voreingestellt, oder Klassisch) mal Farbmodus (Auto, Hell, Dunkel).
// Reihenfolge: Rulebook Auto → Hell → Dunkel → Klassisch Auto → Hell → Dunkel → Rulebook Auto. Gespeichert wird getrennt:
// kbn-theme ("light"/"dark", sonst Auto) und kbn-style ("classic", sonst Rulebook). Das <head>-Skript in index.html setzt beides vor dem ersten Rendern.
const MODES = [["rulebook", "auto"], ["rulebook", "light"], ["rulebook", "dark"], ["classic", "auto"], ["classic", "light"], ["classic", "dark"]];
const COLOR = { auto: "Auto", light: "Hell", dark: "Dunkel" };
function currentMode() { const d = document.documentElement.dataset; return [d.style === "rulebook" ? "rulebook" : "classic", d.theme === "light" || d.theme === "dark" ? d.theme : "auto"]; }
function themeLabel() { const [st, co] = currentMode(); return (st === "rulebook" ? "Rulebook" : "Klassisch") + " · " + COLOR[co]; }
function applyMode([st, co]) {
  const d = document.documentElement.dataset;
  if (st === "rulebook") { d.style = "rulebook"; store("kbn-style", null); } else { delete d.style; store("kbn-style", "classic"); }
  if (co === "auto") { delete d.theme; store("kbn-theme", null); } else { d.theme = co; store("kbn-theme", co); }
}
function cycleTheme(btn) {
  const [st, co] = currentMode();
  const i = MODES.findIndex(m => m[0] === st && m[1] === co);
  applyMode(MODES[(i + 1) % MODES.length]);
  btn.textContent = "Theme: " + themeLabel();
}

// Konto-Knöpfe: am Desktop stehen sie nebeneinander in der Kopfzeile, am Handy hinter dem Knopf "Menü" (spart Höhe)
function closeWhoMenu() {
  const who = document.getElementById("who"); if (!who) return;
  who.classList.remove("open");
  const t = who.querySelector(".who-toggle"); if (t) t.setAttribute("aria-expanded", "false");
}
function renderWho() {
  const who = document.getElementById("who");
  const themeBtn = h("button", { class: "hbtn", type: "button", title: "Darstellung durchschalten: Rulebook oder Klassisch, jeweils Auto, Hell, Dunkel" }, "Theme: " + themeLabel());
  themeBtn.addEventListener("click", () => cycleTheme(themeBtn));
  who.classList.remove("open");
  if (!S.user) { who.classList.remove("has-menu"); who.replaceChildren(themeBtn); return; }
  who.classList.add("has-menu");
  const toggle = h("button", { class: "hbtn who-toggle", type: "button", "aria-expanded": "false", "aria-controls": "who-items", onclick: () => {
    const open = who.classList.toggle("open"); toggle.setAttribute("aria-expanded", String(open));
  } }, "Menü");
  who.replaceChildren(toggle, h("div", { class: "who-items", id: "who-items" },
    h("span", {}, (S.isST ? "Storyteller" : "Spieler") + " · " + personName(S.user.id)),
    themeBtn,
    h("button", { class: "hbtn", type: "button", onclick: () => { closeWhoMenu(); passwordDialog(); } }, "Passwort"),
    h("button", { class: "hbtn", type: "button", onclick: async () => { await sb.auth.signOut(); location.hash = ""; location.reload(); } }, "Abmelden")));
}
document.addEventListener("click", ev => { const who = document.getElementById("who"); if (who && who.classList.contains("open") && !who.contains(ev.target)) closeWhoMenu(); });
document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeWhoMenu(); });

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
  const r = parseHash(location.hash);
  if (VALID.has(r.view)) go(r.view, r.arg, { replace: true }); else go("start", null, { replace: true });
}

(async function boot() {
  mountFooter();
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
  // Zurück- und Vor-Taste des Browsers sowie von Hand geänderte Adressen: den Bereich zur Adresse zeigen
  const syncFromHash = () => {
    if (!started || location.hash === S.route) return;
    const r = parseHash(location.hash);
    if (VALID.has(r.view)) go(r.view, r.arg, { replace: true });
  };
  window.addEventListener("popstate", syncFromHash);
  window.addEventListener("hashchange", syncFromHash);
  // Höhe der festen Kopfzeile für Sprungziele (scroll-margin) bereitstellen
  const top = document.querySelector("header.top");
  const setTopH = () => document.documentElement.style.setProperty("--top-h", Math.round(top.getBoundingClientRect().height) + "px");
  setTopH(); try { new ResizeObserver(setTopH).observe(top); } catch (_) {}
  const nav = document.getElementById("nav");
  nav.addEventListener("scroll", navFade, { passive: true }); window.addEventListener("resize", navFade);
  mountSwipe(nav);
  console.info("Kiel by Night v" + APP_VERSION);
})();
