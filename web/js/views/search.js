// Kiel by Night · Suche über alle Bereiche. Geladen wird, was das Konto lesen darf (RLS), gesucht wird im Browser.
import { h, head, fmtDate, plainLinks } from "../lib.js";
import { sb, S, go, registerView, setRoute, loadChars, authorName, personName } from "../core.js";

const norm = s => String(s || "").toLowerCase();
// Ausschnitt um den ersten Treffer, Treffer hervorgehoben
function snippet(text, words) {
  text = plainLinks(text).replace(/\s+/g, " ").trim();
  if (!text) return null;
  const low = text.toLowerCase(); let at = -1;
  for (const w of words) { const i = low.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const from = Math.max(0, (at < 0 ? 0 : at) - 50), part = text.slice(from, from + 170);
  const out = h("div", { class: "muted hit-text" }, from > 0 ? "… " : "");
  const lowPart = part.toLowerCase(); let i = 0;
  while (i < part.length) {
    let best = -1, len = 0;
    for (const w of words) { const k = lowPart.indexOf(w, i); if (k >= 0 && (best < 0 || k < best)) { best = k; len = w.length; } }
    if (best < 0) { out.append(part.slice(i)); break; }
    out.append(part.slice(i, best), h("mark", {}, part.slice(best, best + len)));
    i = best + len;
  }
  if (from + 170 < text.length) out.append(" …");
  return out;
}

registerView("search", async m => {
  const route = (arg, push) => setRoute(arg, push, "search");
  let q = (S.arg && S.arg.q) || "", items = [], timer = null;
  const input = h("input", { type: "search", id: "search-q", value: q, placeholder: "Name, Ort, Stichwort …", autocomplete: "off", "aria-label": "Suchbegriff" });
  const out = h("div", { class: "stack", "aria-live": "polite" });
  m.append(head("Suche", "Durchsucht Charaktere, Sessions, Notizen, Wiki, Dokumente und die Spielerkarte. Du findest nur, was du auch sehen darfst."),
    h("div", { class: "field", style: "max-width:520px;margin-bottom:16px" }, input), out);

  async function load() {
    const t = name => sb.from(name).select("*").then(r => r.error ? [] : r.data || []);
    await loadChars();
    const [sessions, info, notes, cats, pages, docs, nodes, priv, scenes, npcs] = await Promise.all([
      t("sessions"), t("session_info"), t("session_notes"), t("wiki_categories"), t("wiki_pages"), t("documents"), t("player_map_nodes"), t("private_notes"),
      S.isST ? t("scenes") : [], S.isST ? t("scene_npcs") : []]);
    const cat = new Map(cats.map(c => [c.id, c.name])), meta = new Map(sessions.map(s => [s.number, s]));
    const sTitle = n => "Session " + n + (meta.get(n) && meta.get(n).title ? " · " + meta.get(n).title : "");
    items = [
      ...S.chars.map(c => ({ group: "Charaktere", title: c.name || "Unbenannt", sub: c.clan, text: [c.clan, c.sheet && c.sheet.concept, c.sheet && c.sheet.notes].filter(Boolean).join(" "), open: () => go("chars", { id: c.id }) })),
      ...sessions.map(s => ({ group: "Sessions", title: sTitle(s.number), sub: s.play_date ? fmtDate(s.play_date) : "", text: "", open: () => go("sessions", { session: s.number }) })),
      ...info.filter(i => i.summary || i.ingame_date).map(i => ({ group: "Sessions", title: sTitle(i.session_number), sub: "Zusammenfassung", text: [i.ingame_date, i.summary].filter(Boolean).join(" "), open: () => go("sessions", { session: i.session_number }) })),
      ...notes.map(n => ({ group: "Session-Notizen", title: sTitle(n.session_number), sub: authorName(n.author_id), text: n.body, open: () => go("sessions", { session: n.session_number }) })),
      ...pages.map(p => ({ group: "Wiki", title: p.title, sub: [cat.get(p.category_id), ...(p.tags || []).map(x => "#" + x)].filter(Boolean).join(" · "), text: p.body, extra: (p.tags || []).join(" "), open: () => go("wiki", { page: p.id }) })),
      ...docs.map(d => ({ group: "Dokumente", title: d.title, sub: d.draft ? "Entwurf" : d.file_name, text: d.description, extra: d.file_name, open: () => go("docs", { focus: d.id }) })),
      ...nodes.map(n => ({ group: "Spielerkarte", title: n.label, sub: [n.type, n.sect].filter(Boolean).join(" · "), text: n.description, extra: (n.tags || []).join(" "), open: () => go("map", { focus: n.id }) })),
      ...priv.map(n => ({ group: "Private Notizen", title: n.title || "Ohne Titel", sub: n.owner_id === S.user.id ? "" : personName(n.owner_id), text: n.body, open: () => S.isST ? go("st", { tab: "private" }) : go("private", { id: n.id }) })),
      ...scenes.map(sc => ({ group: "Szenen", title: sc.title, sub: sc.session_number == null ? "Vorrat" : "Session " + sc.session_number,
        text: [sc.place, sc.mood, sc.goal, sc.antagonist, sc.body, sc.details, ...(sc.threads || []), ...(sc.outcomes || []), ...npcs.filter(n => n.scene_id === sc.id).flatMap(n => [n.name, n.motivation])].filter(Boolean).join(" · "),
        open: () => sc.session_number == null ? go("scenes") : go("sessions", { session: sc.session_number }) })),
    ];
    for (const it of items) it.hay = norm([it.title, it.sub, it.text, it.extra].filter(Boolean).join(" \n "));
  }

  function draw() {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length || norm(q).trim().length < 2) { out.replaceChildren(h("div", { class: "empty" }, "Mindestens zwei Zeichen eingeben. Mehrere Wörter müssen alle vorkommen.")); return; }
    const hits = items.filter(it => words.every(w => it.hay.includes(w)));
    if (!hits.length) { out.replaceChildren(h("div", { class: "empty" }, "Nichts gefunden für „" + q.trim() + "“.")); return; }
    const groups = new Map(); for (const x of hits) { if (!groups.has(x.group)) groups.set(x.group, []); groups.get(x.group).push(x); }
    out.replaceChildren(h("p", { class: "muted", "data-hits": String(hits.length) }, hits.length + (hits.length === 1 ? " Treffer" : " Treffer")),
      ...[...groups].map(([g, list]) => h("section", { class: "panel stack", "data-group": g },
        h("h3", {}, g + " ", h("span", { class: "muted mono", style: "font-size:.9rem" }, String(list.length))),
        ...list.slice(0, 40).map(x => h("div", { class: "hit" },
          h("button", { class: "linkbtn", type: "button", onclick: x.open }, x.title), x.sub ? h("span", { class: "muted" }, " · " + x.sub) : null,
          snippet(x.text, words))),
        list.length > 40 ? h("p", { class: "muted" }, "Weitere " + (list.length - 40) + " Treffer, bitte genauer suchen.") : null)));
  }

  input.addEventListener("input", () => { q = input.value; clearTimeout(timer); timer = setTimeout(() => { route(q.trim() ? { q: q.trim() } : null); draw(); }, 150); });
  out.append(h("div", { class: "muted" }, "Wird geladen …"));
  await load();
  draw();
  if (!matchMedia("(pointer:coarse)").matches) input.focus(); // am Handy keine Tastatur ungefragt öffnen
});
