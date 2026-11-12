// Kiel by Night · Tab Szenen (nur Storyteller): Szenenkarten sammeln, ohne sie vorab einer Session zuzuordnen
import { h, head } from "../lib.js";
import { S, sb, go, registerView } from "../core.js";
import { sceneBoard, resetNpcCache, STATUS } from "./scenes.js";
import { stTabs } from "./sttabs.js";

const MODES = [["pool", "Vorrat"], ["assigned", "Zugeordnet"], ["all", "Alle"], ["threads", "Fäden"]];

registerView("scenes", async m => {
  if (!S.isST) { m.append(h("div", { class: "notice bad" }, "Dieser Bereich ist nur für den Storyteller.")); return; }
  resetNpcCache();
  const mode = MODES.some(([k]) => k === (S.arg && S.arg.mode)) ? S.arg.mode : "pool";
  const tg = h("div", { class: "toggle", role: "group", "aria-label": "Szenen anzeigen" },
    ...MODES.map(([k, l]) => h("button", { type: "button", "aria-pressed": String(mode === k), onclick: () => go("scenes", { mode: k }) }, l)));
  const headEl = head("Szenen", "Hier sammelst du Szenenkarten, ohne dafür Sessions im Voraus planen zu müssen. Nur du siehst sie.", stTabs("scenes"));
  if (mode === "threads") { m.append(headEl, h("div", { style: "margin-bottom:14px" }, tg), await threadsView()); return; }
  const search = h("input", { type: "search", id: "scene-search", placeholder: "Szenen durchsuchen …", "aria-label": "Szenen durchsuchen" });
  const board = sceneBoard({
    session: null, mode,
    title: { pool: "Vorrat", assigned: "Zugeordnete Szenen", all: "Alle Szenen" }[mode],
    text: { pool: "Szenen ohne feste Session. Ordne sie einer Session zu, sobald du weißt, wann du sie spielst.", assigned: "Szenen, die schon in einer Session liegen. Du kannst sie verschieben oder in den Vorrat zurücklegen.", all: "Vorrat und zugeordnete Szenen zusammen, nach Session sortiert." }[mode],
    empty: { pool: "Der Vorrat ist leer. Lege mit „Neue Szene“ oder „Szenen importieren“ Karten an.", assigned: "Noch keine Szene ist einer Session zugeordnet.", all: "Noch keine Szenenkarten." }[mode],
  });
  search.addEventListener("input", () => board.setQuery(search.value));
  const { data: chr } = await sb.from("chronicles").select("id, title, sort").order("sort");
  const chron = h("select", { id: "scene-chron", "aria-label": "Nach Chronik filtern" }, h("option", { value: "" }, "Alle Chroniken"), h("option", { value: "none" }, "Ohne Chronik"), ...(chr || []).map(c => h("option", { value: c.id }, c.title)));
  chron.addEventListener("change", () => board.setChronicle(chron.value));
  m.append(headEl, h("div", { style: "margin-bottom:14px" }, tg), h("div", { class: "map-tools" }, search, chron), board);
});

// Fäden über alle Szenen: jeder Faden mit den Szenen, in denen er vorkommt. Offen ist ein Faden, solange eine seiner Szenen noch offen ist.
async function threadsView() {
  const { data, error } = await sb.from("scenes").select("id, title, session_number, position, status, threads");
  if (error) return h("div", { class: "notice bad" }, "Fäden konnten nicht geladen werden.");
  const map = new Map();
  for (const sc of data) for (const t of sc.threads || []) { const k = t.trim().toLowerCase(); if (!k) continue; if (!map.has(k)) map.set(k, { title: t.trim(), scenes: [] }); map.get(k).scenes.push(sc); }
  const list = [...map.values()].map(t => ({ ...t, open: t.scenes.some(s => s.status === "open" || s.status === "postponed") })).sort((a, b) => (a.open ? 0 : 1) - (b.open ? 0 : 1) || a.title.localeCompare(b.title, "de"));
  if (!list.length) return h("div", { class: "empty" }, "Noch keine Fäden. Trage sie im Feld „Fäden“ einer Szene ein (durch Komma getrennt).");
  const where = s => s.session_number == null ? "Vorrat" : "Session " + s.session_number;
  return h("div", { class: "stack", "data-threads": "1" }, h("p", { class: "muted" }, list.filter(t => t.open).length + " offen, " + list.filter(t => !t.open).length + " erledigt. Ein Faden gilt als erledigt, wenn alle seine Szenen gespielt oder übersprungen sind."),
    ...list.map(t => h("div", { class: "panel stack", "data-thread": t.title },
      h("div", { class: "row", style: "align-items:baseline" }, h("strong", {}, t.title), h("span", { class: t.open ? "badge st" : "badge" }, t.open ? "offen" : "erledigt"), h("span", { class: "muted" }, t.scenes.length + (t.scenes.length === 1 ? " Szene" : " Szenen"))),
      h("div", { class: "conn" }, ...t.scenes.sort((a, b) => (a.session_number ?? 1e9) - (b.session_number ?? 1e9) || a.position - b.position).map(s => h("div", { class: "c" },
        h("button", { class: "linkbtn", type: "button", onclick: () => s.session_number == null ? go("scenes") : go("sessions", { session: s.session_number }) }, where(s) + " · " + s.title), " ", h("span", { class: "muted" }, STATUS[s.status])))))));
}
