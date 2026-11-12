// Kiel by Night · Verweise [[Seitentitel]] außerhalb des Wikis (Session-Notizen, Zusammenfassungen, private Notizen)
import { h } from "./lib.js";
import { sb, go } from "./core.js";

let cache = null, loadedAt = 0;
export function forgetWikiTitles() { cache = null; }
// Titel → Seite. RLS blendet versteckte Seiten für Spieler aus, ein Verweis darauf erscheint dann als "existiert noch nicht".
export async function wikiTitles() {
  if (cache && Date.now() - loadedAt < 60000) return cache;
  const { data, error } = await sb.from("wiki_pages").select("id, title");
  if (error) return cache || new Map();
  cache = new Map(data.map(p => [String(p.title).toLowerCase(), p.id])); loadedAt = Date.now();
  return cache;
}

const RE = /\[\[([^\]]+)\]\]/g;
// Text mit Zeilenumbrüchen; [[Titel]] wird zum Link auf die Wiki-Seite. Der Text steht sofort da, die Links folgen nach dem Laden der Titel.
export function richText(text, attrs) {
  text = String(text || "");
  const out = h("div", { class: "pre", ...(attrs || {}) }, text);
  if (!text.includes("[[")) return out;
  wikiTitles().then(titles => {
    const kids = []; let i = 0, m; RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      kids.push(text.slice(i, m.index));
      const t = m[1].trim(), id = titles.get(t.toLowerCase());
      kids.push(id ? h("button", { class: "wlink", type: "button", title: "Wiki-Seite öffnen", onclick: () => go("wiki", { page: id }) }, t)
        : h("span", { class: "wlink missing", title: "Seite existiert noch nicht" }, t));
      i = RE.lastIndex;
    }
    kids.push(text.slice(i));
    out.replaceChildren(...kids.filter(k => k !== ""));
  }).catch(() => {});
  return out;
}
