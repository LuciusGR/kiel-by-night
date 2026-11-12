// Kiel by Night · Zustand, Supabase-Client, Router
import { createClient } from "../vendor/supabase-js.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { h } from "./lib.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const S = {
  user: null,          // auth user
  isST: false,
  profiles: new Map(), // id -> {id, display_name, role}
  chars: [],           // characters, sortiert
  view: "start", arg: null, route: "",
  cleanups: [],
};

// ---------- gemeinsame Daten ----------
export async function loadProfiles() {
  const { data, error } = await sb.from("profiles").select("id, display_name, role");
  if (error) throw error;
  S.profiles = new Map(data.map(p => [p.id, p]));
  const me = S.profiles.get(S.user.id);
  S.isST = !!me && me.role === "st";
}
export async function loadChars() {
  const { data, error } = await sb.from("characters").select("*").order("sort").order("name");
  if (error) throw error;
  S.chars = data;
}

export function personName(uid) {
  const p = S.profiles.get(uid);
  return (p && p.display_name) || (uid === S.user?.id ? "Du" : "Unbekannt");
}
// Schlüssel für Entwürfe: je Konto getrennt
export const draftKey = (...parts) => [S.user ? S.user.id : "anon", ...parts].join(":");
export function charOf(uid) { return S.chars.find(c => c.owner_id === uid) || null; }
// Anzeige "Charakter (Person)" bzw. "Storyteller"
export function authorName(uid) {
  if (!uid) return "";
  const p = S.profiles.get(uid);
  if (p && p.role === "st") return "Storyteller";
  const c = charOf(uid);
  return c ? c.name : personName(uid);
}

// ---------- Router ----------
const views = {};
export function registerView(name, fn) { views[name] = fn; }
export function onCleanup(fn) { S.cleanups.push(fn); return fn; }

let navRenderer = () => {};
export function setNavRenderer(fn) { navRenderer = fn; }

// Adressen: "#bereich" oder "#bereich/schlüssel" (Bogen, Wiki-Seite, Session, Chronik …). So funktionieren die
// Zurück-Taste, Neuladen (F5) und Links auf einzelne Einträge. Der Schlüssel ist je Bereich genau ein Feld von S.arg.
const ROUTE_KEY = { chars: "id", chronicles: "id", wiki: "page", sessions: "session", st: "tab", scenes: "mode", search: "q", private: "id" };
export function toHash(view, arg) {
  const k = ROUTE_KEY[view], v = k && arg ? arg[k] : null;
  return "#" + view + (v != null && v !== "" ? "/" + encodeURIComponent(v) : "");
}
export function parseHash(hash) {
  const [view, ...rest] = String(hash || "").replace(/^#/, "").split("/");
  const k = ROUTE_KEY[view]; let val = null;
  try { val = rest.length ? decodeURIComponent(rest.join("/")) : null; } catch (_) {}
  if (view === "sessions" && val != null) { val = Number(val); if (!Number.isInteger(val) || val < 1) val = null; }
  return { view, arg: k && val != null && val !== "" ? { [k]: val } : null };
}

// Bereich wechseln. Jeder Wechsel legt einen Eintrag im Verlauf an (Zurück-Taste), außer mit { replace: true }.
export function go(view, arg, opts) {
  for (const f of S.cleanups) { try { f(); } catch (_) {} }
  S.cleanups = [];
  S.view = view; S.arg = arg || null;
  const hash = toHash(view, S.arg);
  if (location.hash !== hash) history[opts && opts.replace ? "replaceState" : "pushState"](null, "", hash);
  S.route = hash;
  navRenderer();
  render();
  window.scrollTo(0, 0);
}
// Adresse innerhalb eines Bereichs nachführen (z. B. gewählte Wiki-Seite), ohne neu zu zeichnen.
// push = true legt einen Verlaufseintrag an, sonst wird der aktuelle ersetzt.
// view nennt den Bereich, der die Adresse setzt: Ist inzwischen ein anderer Bereich offen (spät fertiges Laden), passiert nichts.
export function setRoute(arg, push, view) {
  if (view && view !== S.view) return;
  const hash = toHash(S.view, arg);
  if (location.hash !== hash) history[push ? "pushState" : "replaceState"](null, "", hash);
  S.route = hash;
}
export function render() {
  const m = document.getElementById("main");
  m.replaceChildren();
  const fn = views[S.view] || views.start;
  Promise.resolve(fn(m)).catch(e => {
    console.error(e);
    m.append(h("div", { class: "notice bad" }, "Bereich konnte nicht geladen werden: " + ((e && e.message) || e)));
  });
}
