// Kiel by Night · Übersicht: Charakterkarten + letzte Änderungen
// "Letzte Änderungen" liest direkt aus den Tabellen. RLS blendet ST-Seiten und Entwürfe für Spieler aus.
import { h, head, fmtShort } from "../lib.js";
import { sb, S, go, registerView, loadChars, authorName } from "../core.js";
import { pcCard } from "./characters.js";

registerView("start", async m => {
  m.append(head("Übersicht", "Die Coterie auf einen Blick, darunter alles, was sich zuletzt geändert hat."));
  const cards = h("div", { class: "cards" });
  const feed = h("div", { class: "feed panel", style: "margin-top:10px" }, h("div", { class: "muted" }, "Wird geladen …"));
  m.append(cards, h("div", { style: "height:28px" }), h("h3", {}, "Letzte Änderungen"), feed);

  await loadChars();
  cards.replaceChildren(...(S.chars.length ? S.chars.map(pcCard) : [h("div", { class: "empty" }, "Noch keine Charaktere angelegt.")]));

  const [wiki, docs, notes] = await Promise.all([
    sb.from("wiki_pages").select("id, title, category_id, updated_at, updated_by").order("updated_at", { ascending: false }).limit(8),
    sb.from("documents").select("id, title, created_at, uploader_id, draft").order("created_at", { ascending: false }).limit(8),
    sb.from("session_notes").select("id, session_number, body, updated_at, author_id").order("updated_at", { ascending: false }).limit(8),
  ]);
  const items = [
    ...(wiki.data || []).map(d => ({ ts: d.updated_at, kind: "Wiki", text: d.title, who: d.updated_by, go: () => go("wiki", { cat: d.category_id, page: d.id }) })),
    ...(docs.data || []).map(d => ({ ts: d.created_at, kind: d.draft ? "Entwurf" : "Dokument", text: d.title, who: d.uploader_id, go: () => go("docs") })),
    ...(notes.data || []).map(d => ({ ts: d.updated_at, kind: "Session " + d.session_number, text: (d.body || "").split("\n")[0].slice(0, 90) || "Notiz", who: d.author_id, go: () => go("sessions", { session: d.session_number }) })),
  ].filter(x => x.ts).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 12);

  const errs = [wiki.error, docs.error, notes.error].filter(Boolean);
  feed.replaceChildren(
    ...(errs.length ? [h("div", { class: "notice bad" }, "Teile des Verlaufs konnten nicht geladen werden.")] : []),
    ...(items.length ? items.map(x => h("div", { class: "item" },
      h("span", { class: "mono muted", style: "font-size:.84rem" }, fmtShort(x.ts)),
      h("div", { style: "min-width:0" }, h("span", { class: x.kind === "Entwurf" ? "badge st" : "badge" }, x.kind), " ",
        h("button", { class: "linkbtn", type: "button", onclick: x.go }, x.text),
        h("span", { class: "muted" }, x.who ? " · " + authorName(x.who) : ""))))
      : [h("div", { class: "muted" }, "Noch nichts passiert. Die erste Wiki-Seite oder Session-Notiz erscheint hier.")]));
});
