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

// ---------- Schlichte Formatierung ----------
// Zeilenumbrüche bleiben, wie sie getippt wurden. Zusätzlich:
//   **fett**, *kursiv*, [[Seitentitel]] im Text
//   Zeilen mit "# ", "## " oder "### " am Anfang sind Zwischenüberschriften, Zeilen mit "- " oder "* " Aufzählungspunkte
const INLINE = /\[\[([^\]\n]+)\]\]|\*\*([^*\n]+)\*\*|\*([^*\s][^*\n]*?)\*/g;
function inlineNodes(line, link) {
  const out = []; let i = 0, m; INLINE.lastIndex = 0;
  while ((m = INLINE.exec(line))) {
    if (m.index > i) out.push(line.slice(i, m.index));
    out.push(m[1] != null ? link(m[1].trim()) : m[2] != null ? h("strong", {}, m[2]) : h("em", {}, m[3]));
    i = INLINE.lastIndex;
  }
  if (i < line.length) out.push(line.slice(i));
  return out;
}
// Baut den formatierten Text in out. link(titel) liefert den Knoten für einen Verweis.
export function formatInto(out, text, link) {
  const lines = String(text || "").split("\n"), kids = [];
  lines.forEach((line, n) => {
    const hd = /^(#{1,3})\s+(.+)$/.exec(line), li = /^[-*]\s+(.+)$/.exec(line);
    if (hd) kids.push(h("span", { class: "fmt-h fmt-h" + hd[1].length, role: "heading", "aria-level": String(hd[1].length + 3) }, ...inlineNodes(hd[2], link)));
    else if (li) kids.push(h("span", { class: "fmt-li" }, ...inlineNodes(li[1], link)));
    else { kids.push(...inlineNodes(line, link)); if (n < lines.length - 1) kids.push("\n"); }
  });
  out.replaceChildren(...kids.filter(k => k !== ""));
}

// Text mit Formatierung und Verweisen. Er steht sofort da (Verweise zunächst als Text), die Links folgen nach dem Laden der Titel.
export function richText(text, attrs) {
  text = String(text || "");
  const out = h("div", { class: "pre", ...(attrs || {}) });
  formatInto(out, text, t => document.createTextNode(t));
  if (!text.includes("[[")) return out;
  wikiTitles().then(titles => formatInto(out, text, t => {
    const id = titles.get(t.toLowerCase());
    return id ? h("button", { class: "wlink", type: "button", title: "Wiki-Seite öffnen", onclick: () => go("wiki", { page: id }) }, t)
      : h("span", { class: "wlink missing", title: "Seite existiert noch nicht" }, t);
  })).catch(() => {});
  return out;
}
