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
  view: "start", arg: null,
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

export function go(view, arg) {
  for (const f of S.cleanups) { try { f(); } catch (_) {} }
  S.cleanups = [];
  S.view = view; S.arg = arg || null;
  const hash = "#" + view;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  navRenderer();
  render();
  window.scrollTo(0, 0);
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
