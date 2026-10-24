// Kiel by Night · Anleitung: zeigt docs/Benutzerhandbuch.md live aus dem GitHub-Repository
// Die Seite enthält keinen Anleitungstext. Sie lädt das Handbuch bei jedem Aufruf von GitHub (main) und baut es
// aus Markdown als DOM-Knoten auf (HTML wird nie geparst, keine Fremdbibliothek). Die letzte geladene Fassung liegt als Rückfall im Browser.
import { h, head, store } from "../lib.js";
import { registerView } from "../core.js";

const REPO = "LuciusGR/kiel-by-night", BRANCH = "main", FILE = "docs/Benutzerhandbuch.md";
export const MANUAL_RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE}`;
export const MANUAL_PAGE = `https://github.com/${REPO}/blob/${BRANCH}/${FILE}`;
const DOCS_BASE = `https://github.com/${REPO}/blob/${BRANCH}/docs/`;
const CACHE_KEY = "kbn-manual";

// ---------- Markdown → DOM ----------
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>]*[^\s<>.,;:!?)"'“”„])/g;

// Nur http(s) und relative Pfade im Repo (docs/) werden zu Links, alles andere (javascript:, data:, #…) bleibt Text.
function linkHref(u) {
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith("#") || u.startsWith("//")) return null;
  return DOCS_BASE + u.replace(/^\.?\//, "");
}

export function inline(text) {
  const re = new RegExp(INLINE.source, "g"), out = [];
  let i = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > i) out.push(text.slice(i, m.index));
    if (m[1] != null) out.push(h("code", {}, m[1]));
    else if (m[2] != null) out.push(h("strong", {}, ...inline(m[2])));
    else if (m[5] != null) out.push(h("a", { href: m[5], target: "_blank", rel: "noopener noreferrer" }, m[5]));
    else {
      const href = linkHref(m[4]);
      out.push(href ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, ...inline(m[3])) : m[3]);
    }
    i = re.lastIndex;
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

const RE_HEAD = /^(#{1,6})\s+(.*?)\s*#*\s*$/, RE_ITEM = /^(\s*)([-*+]|\d+\.)\s+(.*)$/, RE_FENCE = /^```/, RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const RE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const isTableLine = l => /^\s*\|/.test(l);
const isBlockStart = l => RE_HEAD.test(l) || RE_ITEM.test(l) || RE_FENCE.test(l) || RE_HR.test(l) || isTableLine(l) || /^>/.test(l);
const cells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());

// Aufzählung mit Verschachtelung über die Einrückung
function buildList(items) {
  const first = items[0], rootTag = first.ordered ? "ol" : "ul";
  const root = h(rootTag, first.ordered && first.start > 1 ? { start: String(first.start) } : {});
  const stack = [{ indent: first.indent, list: root, li: null }];
  for (const it of items) {
    let top = stack[stack.length - 1];
    while (stack.length > 1 && it.indent < top.indent) { stack.pop(); top = stack[stack.length - 1]; }
    if (it.indent > top.indent && top.li) {
      const list = h(it.ordered ? "ol" : "ul");
      top.li.append(list);
      top = { indent: it.indent, list, li: null };
      stack.push(top);
    }
    top.li = h("li", {}, ...inline(it.text));
    top.list.append(top.li);
  }
  return root;
}

// Liefert die Knoten des Dokuments und die Gliederung (Überschriften der Ebene 2)
export function renderMarkdown(md) {
  const lines = String(md).replace(/\r\n?/g, "\n").split("\n");
  const nodes = [], toc = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const hm = RE_HEAD.exec(line);
    if (hm) {
      const lvl = hm[1].length, kids = inline(hm[2]);
      i++;
      if (lvl === 1) continue; // Titel der Datei: die Seite hat ihre eigene Kopfzeile
      const el = h(lvl === 2 ? "h3" : lvl === 3 ? "h4" : "h5", {}, ...kids);
      if (lvl === 2) toc.push({ text: hm[2].replace(/[`*]/g, ""), el });
      nodes.push(el);
      continue;
    }
    if (RE_FENCE.test(line)) {
      const buf = [];
      for (i++; i < lines.length && !RE_FENCE.test(lines[i]); i++) buf.push(lines[i]);
      i++;
      nodes.push(h("pre", {}, h("code", {}, buf.join("\n"))));
      continue;
    }
    if (RE_HR.test(line)) { nodes.push(h("hr")); i++; continue; }
    if (isTableLine(line) && i + 1 < lines.length && RE_SEP.test(lines[i + 1])) {
      const headCells = cells(line);
      const tbody = h("tbody");
      for (i += 2; i < lines.length && isTableLine(lines[i]); i++) tbody.append(h("tr", {}, ...cells(lines[i]).map(c => h("td", {}, ...inline(c)))));
      nodes.push(h("div", { class: "table-wrap" }, h("table", {}, h("thead", {}, h("tr", {}, ...headCells.map(c => h("th", {}, ...inline(c))))), tbody)));
      continue;
    }
    if (/^>/.test(line)) {
      const buf = [];
      for (; i < lines.length && /^>/.test(lines[i]); i++) buf.push(lines[i].replace(/^>\s?/, ""));
      nodes.push(h("blockquote", {}, h("p", {}, ...inline(buf.join(" ")))));
      continue;
    }
    if (RE_ITEM.test(line)) {
      const items = [];
      for (; i < lines.length; i++) {
        const l = lines[i], im = RE_ITEM.exec(l);
        if (im) items.push({ indent: im[1].replace(/\t/g, "  ").length, ordered: /\d/.test(im[2]), start: parseInt(im[2], 10) || 1, text: im[3] });
        else if (l.trim() && /^\s+\S/.test(l) && !RE_HR.test(l)) items[items.length - 1].text += " " + l.trim(); // Fortsetzungszeile
        else break;
      }
      nodes.push(buildList(items));
      continue;
    }
    const buf = [];
    for (; i < lines.length && lines[i].trim() && !(buf.length && isBlockStart(lines[i])); i++) buf.push(lines[i].trim());
    nodes.push(h("p", {}, ...inline(buf.join(" "))));
  }
  return { nodes, toc };
}

// ---------- Laden ----------
function readCache() {
  try { const c = JSON.parse(store(CACHE_KEY) || "null"); return c && typeof c.text === "string" ? c : null; } catch (_) { return null; }
}
async function loadManual() {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(MANUAL_RAW, { cache: "no-cache", signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const text = await r.text();
    if (!/^#\s/m.test(text)) throw new Error("Datei ist kein Handbuch");
    store(CACHE_KEY, JSON.stringify({ at: Date.now(), text }));
    return { text };
  } catch (e) {
    const c = readCache();
    return c ? { text: c.text, cachedAt: c.at } : { error: e };
  } finally { clearTimeout(timer); }
}

// ---------- Ansicht ----------
registerView("manual", async m => {
  const out = h("div", {}, h("div", { class: "muted" }, "Anleitung wird von GitHub geladen …"));
  const reload = h("button", { class: "btn small", type: "button", onclick: () => draw() }, "Neu laden");
  m.append(head("Anleitung", "Das Benutzerhandbuch der Seite. Es wird live aus dem Repository geladen und ist deshalb immer auf dem neuesten Stand.",
    reload, h("a", { class: "btn small", href: MANUAL_PAGE, target: "_blank", rel: "noopener noreferrer" }, "Auf GitHub öffnen")), out);

  async function draw() {
    reload.disabled = true;
    const r = await loadManual();
    reload.disabled = false;
    if (r.error) {
      out.replaceChildren(h("div", { class: "notice bad" },
        "Die Anleitung konnte nicht von GitHub geladen werden (" + (r.error.name === "AbortError" ? "Zeitüberschreitung" : r.error.message) + "). Neu laden oder direkt auf GitHub lesen: ",
        h("a", { href: MANUAL_PAGE, target: "_blank", rel: "noopener noreferrer" }, "Benutzerhandbuch auf GitHub"), "."));
      return;
    }
    const { nodes, toc } = renderMarkdown(r.text);
    const tocList = h("div", { class: "list" }, ...toc.map(t => h("button", { type: "button", onclick: () => t.el.scrollIntoView({ behavior: "smooth", block: "start" }) }, h("span", {}, t.text))));
    out.replaceChildren(
      r.cachedAt ? h("div", { class: "notice", style: "margin-bottom:14px" }, "GitHub ist gerade nicht erreichbar. Angezeigt wird die Fassung vom " + new Date(r.cachedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + ".") : null,
      h("div", { class: "split" },
        toc.length ? h("details", { class: "panel toc", open: window.innerWidth > 860 }, h("summary", {}, "Inhalt"), tocList) : h("div"),
        h("article", { class: "article manual-body" }, ...nodes)));
  }
  await draw();
});
