// Kiel by Night · Tab Szenen (nur Storyteller): Szenenkarten sammeln, ohne sie vorab einer Session zuzuordnen
import { h, head } from "../lib.js";
import { S, go, registerView } from "../core.js";
import { sceneBoard, resetNpcCache } from "./scenes.js";

const MODES = [["pool", "Vorrat"], ["assigned", "Zugeordnet"], ["all", "Alle"]];

registerView("scenes", async m => {
  if (!S.isST) { m.append(h("div", { class: "notice bad" }, "Dieser Bereich ist nur für den Storyteller.")); return; }
  resetNpcCache();
  const mode = MODES.some(([k]) => k === (S.arg && S.arg.mode)) ? S.arg.mode : "pool";
  const tg = h("div", { class: "toggle", role: "group", "aria-label": "Szenen anzeigen" },
    ...MODES.map(([k, l]) => h("button", { type: "button", "aria-pressed": String(mode === k), onclick: () => go("scenes", { mode: k }) }, l)));
  const search = h("input", { type: "search", id: "scene-search", placeholder: "Szenen durchsuchen …", "aria-label": "Szenen durchsuchen" });
  const board = sceneBoard({
    session: null, mode,
    title: { pool: "Vorrat", assigned: "Zugeordnete Szenen", all: "Alle Szenen" }[mode],
    text: { pool: "Szenen ohne feste Session. Ordne sie einer Session zu, sobald du weißt, wann du sie spielst.", assigned: "Szenen, die schon in einer Session liegen. Du kannst sie verschieben oder in den Vorrat zurücklegen.", all: "Vorrat und zugeordnete Szenen zusammen, nach Session sortiert." }[mode],
    empty: { pool: "Der Vorrat ist leer. Lege mit „Neue Szene“ oder „Szenen importieren“ Karten an.", assigned: "Noch keine Szene ist einer Session zugeordnet.", all: "Noch keine Szenenkarten." }[mode],
  });
  search.addEventListener("input", () => board.setQuery(search.value));
  m.append(head("Szenen", "Hier sammelst du Szenenkarten, ohne dafür Sessions im Voraus planen zu müssen. Nur du siehst sie.", tg), h("div", { class: "map-tools" }, search), board);
});
