// Kiel by Night · DOM- und Hilfsfunktionen (aus v1 übernommen, ohne window.claude)

import { SUPABASE_URL } from "./config.js";

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

export function toast(msg, bad) {
  const t = h("div", { class: "toast" + (bad ? " bad" : ""), role: "status" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), bad ? Math.max(5200, String(msg).length * 80) : 2600);
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
new MutationObserver(() => themeListeners.forEach(f => f())).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

export function store(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  catch (_) { return null; }
}

export function head(title, text, ...right) {
  return h("div", { class: "head" }, h("div", {}, h("h2", {}, title), text ? h("p", {}, text) : null), h("div", { class: "row" }, ...right));
}

export const splitTags = s => String(s || "").split(",").map(x => x.trim().replace(/^#/, "")).filter(Boolean);
