// Kiel by Night · Übersicht: nächster Termin, Charakterkarten, letzte Änderungen (mit "neu seit dem letzten Besuch"), für den ST offene Punkte
// "Letzte Änderungen" liest direkt aus den Tabellen. RLS blendet ST-Seiten und Entwürfe für Spieler aus.
import { h, head, fmtShort, fmtDate, fmtDateTime, plainLinks, store } from "../lib.js";
import { sb, S, go, registerView, loadChars, authorName } from "../core.js";
import { pcCard } from "./characters.js";

const today = () => new Date().toISOString().slice(0, 10);
const WEEKDAY = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
function inDays(date) {
  const d = Math.round((Date.parse(date + "T00:00:00") - Date.parse(today() + "T00:00:00")) / 864e5);
  return d === 0 ? "heute" : d === 1 ? "morgen" : "in " + d + " Tagen";
}

// Nächster Termin: die früheste Session mit Spieldatum ab heute
function nextBox(sessions) {
  const next = sessions.filter(s => s.play_date && s.play_date >= today()).sort((a, b) => a.play_date.localeCompare(b.play_date))[0];
  if (!next) return h("div", { class: "panel next-session", "data-next": "none" }, h("span", { class: "eyebrow" }, "Nächste Session"),
    h("p", { class: "muted" }, S.isST ? "Kein Termin eingetragen. Lege im Bereich Sessions eine neue Session an und trage das Spieldatum ein, dann steht er hier für alle." : "Noch kein Termin eingetragen."));
  const wd = WEEKDAY[new Date(next.play_date + "T12:00:00").getDay()];
  return h("div", { class: "panel next-session", "data-next": String(next.number) }, h("span", { class: "eyebrow" }, "Nächste Session"),
    h("div", { class: "row", style: "align-items:baseline;gap:6px 14px" },
      h("h3", {}, wd + ", " + fmtDate(next.play_date)), h("span", { class: "badge" }, inDays(next.play_date)),
      h("button", { class: "linkbtn", type: "button", onclick: () => go("sessions", { session: next.number }) }, "Session " + next.number + (next.title ? " · " + next.title : ""))));
}

// Nur ST: was noch zu tun ist
function todoBox(sessions, info, notes, scenes) {
  const inf = new Map(info.map(i => [i.session_number, i]));
  const played = sessions.filter(s => !s.play_date || s.play_date <= today());
  const noSummary = played.filter(s => !(inf.get(s.number) || {}).summary).sort((a, b) => b.number - a.number);
  const noTitle = sessions.filter(s => !s.title || !s.play_date);
  const unassigned = sessions.filter(s => !(inf.get(s.number) || {}).chronicle_id);
  const pool = scenes.filter(s => s.session_number == null);
  const latest = sessions.reduce((m, s) => Math.max(m, s.number), 0);
  const openLatest = scenes.filter(s => s.session_number === latest && s.status === "open");
  const row = (n, text, onclick, label) => n ? h("div", { class: "todo", "data-todo": label }, h("span", { class: "mono" }, String(n)), h("button", { class: "linkbtn", type: "button", onclick }, text)) : null;
  const rows = [
    row(noSummary.length, (noSummary.length === 1 ? "gespielte Session" : "gespielte Sessions") + " ohne Zusammenfassung (" + noSummary.slice(0, 4).map(s => s.number).join(", ") + (noSummary.length > 4 ? " …" : "") + ")", () => go("sessions", { session: noSummary[0].number }), "summary"),
    row(noTitle.length, (noTitle.length === 1 ? "Session" : "Sessions") + " ohne Titel oder Datum", () => go("sessions", { session: noTitle[0].number }), "title"),
    row(unassigned.length, (unassigned.length === 1 ? "Session ist" : "Sessions sind") + " keiner Chronik zugeordnet", () => go("chronicles"), "chronicle"),
    row(openLatest.length, (openLatest.length === 1 ? "offene Szene" : "offene Szenen") + " in Session " + latest, () => go("play", { session: latest }), "open"),
    row(pool.length, (pool.length === 1 ? "Szene" : "Szenen") + " im Vorrat", () => go("scenes"), "pool"),
  ].filter(Boolean);
  return h("div", { class: "panel stack", "data-st-todo": "1" }, h("span", { class: "badge st", style: "align-self:flex-start" }, "Nur Storyteller"), h("h3", {}, "Offene Punkte"),
    rows.length ? h("div", { class: "stack", style: "gap:6px" }, ...rows) : h("p", { class: "muted" }, "Nichts offen. Alle gespielten Sessions haben Titel, Datum, Chronik und Zusammenfassung."));
}

registerView("start", async m => {
  m.append(head("Übersicht", "Die Coterie auf einen Blick, darunter alles, was sich zuletzt geändert hat."));
  const top = h("div", { class: "stack", style: "margin-bottom:18px" });
  const cards = h("div", { class: "cards" });
  const feedHead = h("h3", {}, "Letzte Änderungen");
  const feed = h("div", { class: "feed panel", style: "margin-top:10px" }, h("div", { class: "muted" }, "Wird geladen …"));
  m.append(top, cards, h("div", { style: "height:28px" }), feedHead, feed);

  await loadChars();
  cards.replaceChildren(...(S.chars.length ? S.chars.map(pcCard) : [h("div", { class: "empty" }, "Noch keine Charaktere angelegt.")]));

  const [wiki, docs, notes, sess, info, scenes] = await Promise.all([
    sb.from("wiki_pages").select("id, title, category_id, updated_at, updated_by").order("updated_at", { ascending: false }).limit(30),
    sb.from("documents").select("id, title, created_at, uploader_id, draft").order("created_at", { ascending: false }).limit(30),
    sb.from("session_notes").select("id, session_number, body, updated_at, author_id").order("updated_at", { ascending: false }).limit(30),
    sb.from("sessions").select("*"),
    S.isST ? sb.from("session_info").select("*") : { data: [] },
    S.isST ? sb.from("scenes").select("id, session_number, status") : { data: [] },
  ]);
  top.replaceChildren(nextBox(sess.data || []), S.isST ? todoBox(sess.data || [], info.data || [], notes.data || [], scenes.data || []) : null);

  // Neu seit dem letzten Besuch: Zeitpunkt des vorigen Besuchs liegt je Konto in diesem Browser (app.js setzt S.lastVisit)
  const since = S.lastVisit ? Date.parse(S.lastVisit) : null;
  const isNew = x => since != null && Date.parse(x.ts) > since && x.who !== S.user.id;
  const all = [
    ...(wiki.data || []).map(d => ({ ts: d.updated_at, kind: "Wiki", text: d.title, who: d.updated_by, go: () => go("wiki", { cat: d.category_id, page: d.id }) })),
    ...(docs.data || []).map(d => ({ ts: d.created_at, kind: d.draft ? "Entwurf" : "Dokument", text: d.title, who: d.uploader_id, go: () => go("docs", { focus: d.id }) })),
    ...(notes.data || []).map(d => ({ ts: d.updated_at, kind: "Session " + d.session_number, text: plainLinks((d.body || "").split("\n")[0]).slice(0, 90) || "Notiz", who: d.author_id, go: () => go("sessions", { session: d.session_number }) })),
  ].filter(x => x.ts).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  const fresh = all.filter(isNew).length;
  const items = all.slice(0, Math.max(12, Math.min(fresh, 30)));

  function paint() {
    feedHead.replaceChildren("Letzte Änderungen",
      fresh ? h("span", { class: "badge st", style: "margin-left:10px;vertical-align:middle", "data-new-count": String(fresh) }, fresh + " neu") : null);
    const errs = [wiki.error, docs.error, notes.error].filter(Boolean);
    feed.replaceChildren(
      ...(errs.length ? [h("div", { class: "notice bad" }, "Teile des Verlaufs konnten nicht geladen werden.")] : []),
      fresh ? h("div", { class: "row", style: "align-items:center;justify-content:space-between;padding-bottom:8px" },
        h("span", { class: "muted" }, "Neu seit deinem letzten Besuch am " + fmtDateTime(S.lastVisit) + "."),
        h("button", { class: "btn small", type: "button", onclick: () => { S.lastVisit = new Date().toISOString(); store("kbn-seen-prev:" + S.user.id, S.lastVisit); go("start", null, { replace: true }); } }, "Als gelesen markieren")) : null,
      ...(items.length ? items.map(x => h("div", { class: "item" + (isNew(x) ? " is-new" : "") },
        h("span", { class: "mono muted", style: "font-size:.84rem" }, fmtShort(x.ts)),
        h("div", { style: "min-width:0" }, isNew(x) ? h("span", { class: "badge st", style: "margin-right:6px" }, "Neu") : null, h("span", { class: x.kind === "Entwurf" ? "badge st" : "badge" }, x.kind), " ",
          h("button", { class: "linkbtn", type: "button", onclick: x.go }, x.text),
          h("span", { class: "muted" }, x.who ? " · " + authorName(x.who) : ""))))
        : [h("div", { class: "muted" }, "Noch nichts passiert. Die erste Wiki-Seite oder Session-Notiz erscheint hier.")]));
  }
  paint();
});
