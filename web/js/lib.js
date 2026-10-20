// Kiel by Night · DOM- und Hilfsfunktionen (aus v1 übernommen, ohne window.claude)

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
  setTimeout(() => t.remove(), bad ? 5200 : 2600);
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
