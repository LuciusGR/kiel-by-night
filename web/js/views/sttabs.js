// Kiel by Night · Reiter des Storyteller-Bereichs. Szenen und Spielabend sind eigene Ansichten, gehören aber hierher:
// In der Kopfleiste steht dafür nur noch "Storyteller".
import { h } from "../lib.js";
import { go } from "../core.js";

const TABS = [["map", "Beziehungskarte", () => go("st", { tab: "map" })], ["scenes", "Szenen", () => go("scenes")], ["play", "Spielabend", () => go("play")],
  ["private", "Private Spielernotizen", () => go("st", { tab: "private" })], ["group", "Gruppe", () => go("st", { tab: "group" })]];
export const ST_VIEWS = new Set(["st", "scenes", "play"]);
export function stTabs(active) {
  return h("div", { class: "toggle wrap st-tabs", role: "group", "aria-label": "Storyteller-Bereich" },
    ...TABS.map(([k, l, open]) => h("button", { type: "button", "aria-pressed": String(active === k), onclick: open }, l)));
}
