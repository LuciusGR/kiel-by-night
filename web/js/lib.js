// Kiel by Night · DOM- und Hilfsfunktionen (aus v1 übernommen, ohne window.claude)

import { SUPABASE_URL } from "./config.js";

// Leere Kinder (null, undefined, false) überspringen: replaceChildren/append/prepend schrieben sonst den Text "null" in die Seite.
for (const m of ["append", "prepend", "replaceChildren"]) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return orig.apply(this, kids.filter(k => k != null && k !== false)); };
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "value") el.value = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// action = { label, run }: Knopf in der Meldung (z. B. "Rückgängig"), die Meldung bleibt dann 8 Sekunden stehen
export function toast(msg, bad, action) {
  const t = h("div", { class: "toast" + (bad ? " bad" : "") + (action ? " has-action" : ""), role: "status" }, msg);
  if (action) t.append(h("button", { class: "toast-btn", type: "button", onclick: () => { t.remove(); action.run(); } }, action.label));
  document.body.append(t);
  setTimeout(() => t.remove(), action ? 8000 : bad ? Math.max(5200, String(msg).length * 80) : 2600);
}

// Rückfrage als Dialog. Liefert true bei Bestätigung.
export function ask(title, text, yes, no = "Abbrechen") {
  return new Promise(res => {
    const done = v => { dlg.close(); dlg.remove(); res(v); };
    const dlg = h("dialog", { "data-ask": "1" }, h("div", { class: "stack" }, h("h3", {}, title), h("p", {}, text),
      h("div", { class: "row" }, h("button", { class: "btn danger", type: "button", onclick: () => done(true) }, yes), h("button", { class: "btn", type: "button", onclick: () => done(false) }, no))));
    dlg.addEventListener("cancel", ev => { ev.preventDefault(); done(false); });
    document.body.append(dlg); dlg.showModal();
  });
}

// Supabase-/PostgREST-Fehler in verständliche Meldungen übersetzen
export function errMsg(e) {
  const c = e && (e.code || e.status);
  const m = (e && e.message) || "";
  if (c === "42501" || /row-level security|permission denied/i.test(m)) return "Keine Berechtigung für diese Aktion.";
  if (c === "23505") return "Eintrag existiert bereits (gleicher Name).";
  if (c === "23503") return "Eintrag wird noch verwendet und kann nicht gelöscht werden.";
  if (c === "PGRST301" || /JWT/i.test(m)) return "Anmeldung abgelaufen. Seite neu laden und erneut anmelden.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Keine Verbindung. Netz prüfen und erneut versuchen.";
  return "Fehler: " + (m || "unbekannt").slice(0, 160);
}

// Ursache eines Netzfehlers eingrenzen, damit der Hinweis nur kommt, wenn er stimmt:
// kein Internet, Server (supabase.co) von diesem Gerät aus nicht erreichbar oder Server erreichbar.
export async function diagnoseNetwork() {
  if (navigator.onLine === false) return "Kein Internet. WLAN oder mobile Daten prüfen und erneut versuchen.";
  const reach = async url => {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 6000);
    try { await fetch(url, { mode: "no-cors", cache: "no-store", signal: ac.signal }); return true; } catch (_) { return false; } finally { clearTimeout(t); }
  };
  if (!(await reach(location.origin + location.pathname))) return "Keine Verbindung zum Internet. Netz prüfen und erneut versuchen.";
  if (!(await reach(SUPABASE_URL + "/auth/v1/health"))) return "Diese Seite erreicht den Server (supabase.co) von diesem Gerät aus nicht, andere Seiten gehen aber. Meist blockiert ein Werbeblocker, ein VPN, privates DNS oder ein Filter im WLAN die Adresse. Das ausschalten, einen anderen Browser oder ein anderes Netz (WLAN oder mobile Daten) probieren.";
  return "Der Server ist erreichbar, die Anfrage ist trotzdem fehlgeschlagen. Seite neu laden und noch einmal versuchen. Bleibt es, dem Storyteller melden.";
}

// Supabase-Antwort {data,error} auswerten; Fehler als Toast, dann werfen
export async function guard(p, okMsg) {
  let r;
  try { r = await p; } catch (e) { toast(errMsg(e), true); throw e; }
  if (r && r.error) { toast(errMsg(r.error), true); throw r.error; }
  if (okMsg) toast(okMsg);
  return r ? r.data : r;
}

export const fmtDate = ts => ts ? new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
export const fmtShort = ts => ts ? new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "";
export const fmtDateTime = ts => ts ? new Date(ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export function confirmBtn(label, onYes) {
  const wrap = h("span", { class: "confirm" });
  const first = h("button", {
    class: "btn small danger", type: "button", onclick: () => wrap.replaceChildren(
      h("span", { class: "muted" }, "Wirklich?"),
      h("button", { class: "btn small danger", type: "button", onclick: onYes }, "Ja, " + label.toLowerCase()),
      h("button", { class: "btn small", type: "button", onclick: () => wrap.replaceChildren(first) }, "Abbrechen"))
  }, label);
  wrap.append(first);
  return wrap;
}

export function tok(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export const themeListeners = new Set();
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => themeListeners.forEach(f => f())); } catch (_) {}
new MutationObserver(() => themeListeners.forEach(f => f())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-style"] });

export function store(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  catch (_) { return null; }
}

export function head(title, text, ...right) {
  return h("div", { class: "head" }, h("div", {}, h("h2", {}, title), text ? h("p", {}, text) : null), h("div", { class: "row" }, ...right));
}

export const splitTags = s => String(s || "").split(",").map(x => x.trim().replace(/^#/, "")).filter(Boolean);

// ---------- Entwürfe ----------
// Ungespeicherter Text aus Editoren (Session-Notiz, Wiki-Seite, private Notiz, Szene) bleibt in diesem Browser liegen,
// bis er gespeichert oder verworfen wird. Wer den Editor verlässt, findet den Text beim nächsten Öffnen wieder.
const DRAFT = "kbn-draft:";
export const drafts = {
  get(key) { try { const v = JSON.parse(store(DRAFT + key) || "null"); return v && typeof v === "object" ? v : null; } catch (_) { return null; } },
  set(key, val) { store(DRAFT + key, JSON.stringify({ ...val, _ts: Date.now() })); },
  clear(key) { store(DRAFT + key, null); },
  has(key) { return !!this.get(key); },
};
const bound = new Set();
let draftWatch = null;
function watchDrafts() {
  if (draftWatch || typeof MutationObserver === "undefined") return;
  draftWatch = new MutationObserver(() => {
    for (const b of [...bound]) {
      if (b.anchor.isConnected) { b.seen = true; continue; }
      if (!b.seen) continue; // noch nicht in die Seite eingesetzt
      bound.delete(b);
      if (!b.done && b.dirty()) toast("Dein Text ist als Entwurf gesichert. Er steht wieder da, sobald du die Bearbeitung erneut öffnest.");
    }
  });
  draftWatch.observe(document.body, { childList: true, subtree: true });
}
// fields: { name: Eingabefeld }. Liefert { notice, clear }: notice ist ein Hinweis mit "Verwerfen", wenn ein Entwurf
// wiederhergestellt wurde (sonst null). clear() nach Speichern oder Abbrechen aufrufen.
export function bindDraft(key, fields) {
  watchDrafts();
  const names = Object.keys(fields), read = () => Object.fromEntries(names.map(n => [n, fields[n].value]));
  const original = read();
  const b = { anchor: fields[names[0]], done: false, dirty: () => names.some(n => fields[n].value !== original[n]) };
  let notice = null;
  const saved = drafts.get(key);
  if (saved && names.some(n => typeof saved[n] === "string" && saved[n] !== original[n])) {
    for (const n of names) if (typeof saved[n] === "string") fields[n].value = saved[n];
    notice = h("div", { class: "notice draft-notice", role: "status" }, "Ungespeicherter Entwurf vom " + fmtDateTime(saved._ts) + " wiederhergestellt. ",
      h("button", { class: "btn small", type: "button", onclick: () => { for (const n of names) fields[n].value = original[n]; drafts.clear(key); notice.remove(); } }, "Entwurf verwerfen"));
  } else if (saved) drafts.clear(key);
  const onInput = () => { if (b.done) return; if (b.dirty()) drafts.set(key, read()); else drafts.clear(key); };
  for (const n of names) { fields[n].addEventListener("input", onInput); fields[n].addEventListener("change", onInput); }
  bound.add(b);
  return { notice, clear() { b.done = true; bound.delete(b); drafts.clear(key); } };
}

// ---------- Schmale Bildschirme ----------
// Liegt ein Detailbereich unter der Liste oder Karte (einspaltig), dorthin scrollen, damit die Auswahl sichtbar wird.
export function revealOnNarrow(el, maxWidth, block = "start") {
  try {
    if (!el || !matchMedia("(max-width:" + maxWidth + "px)").matches) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => el.scrollIntoView({ block, behavior: calm ? "auto" : "smooth" }));
  } catch (_) {}
}

// Wiki-Schreibweise aus Kurztexten entfernen: "[[Prinz]]" wird "Prinz"
export const plainLinks = s => String(s || "").replace(/\[\[([^\]]+)\]\]/g, "$1");
