// Kiel by Night · Fußzeile mit Hinweis zu Marken
import { h } from "./lib.js";

export function mountFooter() {
  if (document.querySelector(".site-foot")) return;
  document.body.append(h("footer", { class: "site-foot" },
    h("span", {}, "Inoffizielles Fan-Projekt, nicht verbunden mit den Rechteinhabern von Vampire: Die Maskerade.")));
}
