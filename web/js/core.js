// Kiel by Night · Zustand, Supabase-Client, Router
import { createClient } from "../vendor/supabase-js.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { h, toast, errMsg, ask } from "./lib.js";

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
const ROUTE_KEY = { chars: "id", chronicles: "id", wiki: "page", sessions: "session", st: "tab", scenes: "mode", search: "q", private: "id", play: "session" };
export function toHash(view, arg) {
  const k = ROUTE_KEY[view], v = k && arg ? arg[k] : null;
  return "#" + view + (v != null && v !== "" ? "/" + encodeURIComponent(v) : "");
}
export function parseHash(hash) {
  const [view, ...rest] = String(hash || "").replace(/^#/, "").split("/");
  const k = ROUTE_KEY[view]; let val = null;
  try { val = rest.length ? decodeURIComponent(rest.join("/")) : null; } catch (_) {}
  if ((view === "sessions" || view === "play") && val != null) { val = Number(val); if (!Number.isInteger(val) || val < 1) val = null; }
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
  // Ladebalken unter der Kopfzeile, solange der Bereich seine Daten holt (erst nach 150 ms, damit er bei schnellen Wechseln nicht flackert)
  const bar = document.getElementById("loadbar"), token = ++renderToken;
  const t = setTimeout(() => { if (bar && token === renderToken) bar.classList.add("on"); }, 150);
  const done = () => { clearTimeout(t); if (bar && token === renderToken) bar.classList.remove("on"); };
  Promise.resolve().then(() => fn(m)).then(done, e => {
    done();
    console.error(e);
    m.append(h("div", { class: "notice bad" }, "Bereich konnte nicht geladen werden: " + ((e && e.message) || e)));
  });
}
let renderToken = 0;

// ---------- Speichern und Löschen mit Netz ----------
// Speichert nur, wenn der Eintrag seit dem Laden unverändert ist (Vergleich über updated_at). Hat inzwischen jemand
// anderes gespeichert, fragt ein Dialog, ob überschrieben werden soll. Liefert true, wenn gespeichert wurde.
export async function saveChecked(table, row, patch, okMsg) {
  let q = sb.from(table).update(patch).eq("id", row.id);
  if (row.updated_at) q = q.eq("updated_at", row.updated_at);
  const first = await q.select("id");
  if (first.error) { toast(errMsg(first.error), true); throw first.error; }
  if (first.data && first.data.length) { if (okMsg) toast(okMsg); return true; }
  const cur = await sb.from(table).select("id, updated_at").eq("id", row.id).maybeSingle();
  if (cur.error || !cur.data) { toast("Der Eintrag wurde inzwischen gelöscht oder du darfst ihn nicht ändern. Dein Text bleibt hier stehen.", true); return false; }
  if (!(await ask("Inzwischen geändert", "Jemand anderes hat diesen Eintrag gespeichert, während du geschrieben hast. Überschreibst du, geht dessen Änderung verloren. Mit „Abbrechen“ bleibt dein Text im Editor stehen, du kannst ihn kopieren und die Seite neu laden.", "Mit meinem Text überschreiben"))) return false;
  const second = await sb.from(table).update(patch).eq("id", row.id).select("id");
  if (second.error) { toast(errMsg(second.error), true); throw second.error; }
  if (!second.data || !second.data.length) { toast("Keine Berechtigung für diese Aktion.", true); return false; }
  if (okMsg) toast(okMsg);
  return true;
}
// Löscht einen Eintrag und bietet acht Sekunden lang "Rückgängig" an (legt die Zeile unverändert wieder an).
export async function deleteWithUndo(table, row, after) {
  const { error } = await sb.from(table).delete().eq("id", row.id);
  if (error) { toast(errMsg(error), true); throw error; }
  toast("Gelöscht.", false, { label: "Rückgängig", run: async () => {
    let r = await sb.from(table).insert(row);
    // Fremde Wiki-Seite (ST hat gelöscht): Anlegen verlangt den eigenen Namen als Ersteller
    if (r.error && "created_by" in row && row.created_by !== S.user.id) r = await sb.from(table).insert({ ...row, created_by: S.user.id });
    if (r.error) { toast("Wiederherstellen ging nicht: " + errMsg(r.error), true); return; }
    toast("Wiederhergestellt."); if (after) await after();
  } });
}

// ---------- Live ----------
// Meldet Änderungen anderer an den genannten Tabellen (Supabase Realtime, gebündelt nach 400 ms). Die Abmeldung
// geschieht beim Verlassen des Bereichs. Ohne Realtime für die Tabelle kommt schlicht nie ein Ereignis.
export function watchTables(name, tables, onChange) {
  let t = null, ch = sb.channel(name);
  const ping = () => { clearTimeout(t); t = setTimeout(() => { Promise.resolve(onChange()).catch(() => {}); }, 400); };
  for (const table of tables) ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, ping);
  ch.subscribe();
  onCleanup(() => { clearTimeout(t); try { sb.removeChannel(ch); } catch (_) {} });
}
