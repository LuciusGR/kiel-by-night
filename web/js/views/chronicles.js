// Kiel by Night · Chroniken: Chronik → Kapitel → Sessions als Zeitleiste. Der Storyteller pflegt, alle lesen.
// Entwürfe sieht nur der ST (Datenbank-Rechte, nicht nur die Anzeige).
import { h, toast, guard, head, fmtDate, confirmBtn } from "../lib.js";
import { sb, S, go, registerView } from "../core.js";

export const CHRON_STATUS = { draft: "Entwurf", running: "Laufend", done: "Abgeschlossen" };
const ORDER = { running: 0, draft: 1, done: 2 };

async function loadAll() {
  const [c, ch, si, se, no] = await Promise.all([
    sb.from("chronicles").select("*"), sb.from("chapters").select("*"), sb.from("session_info").select("*"),
    sb.from("sessions").select("*"), sb.from("session_notes").select("id, session_number"),
  ]);
  const err = [c, ch, si, se, no].find(x => x.error);
  if (err) throw err.error;
  const sessions = new Map();
  const ensure = n => { if (!sessions.has(n)) sessions.set(n, { number: n, title: "", play_date: null, info: null, notes: 0 }); return sessions.get(n); };
  for (const s of se.data) Object.assign(ensure(s.number), { title: s.title || "", play_date: s.play_date });
  for (const i of si.data) ensure(i.session_number).info = i;
  for (const n of no.data) ensure(n.session_number).notes++;
  const chronicles = c.data.slice().sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (a.sort - b.sort) || (Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0)));
  return { chronicles, chapters: ch.data, sessions: [...sessions.values()].sort((a, b) => b.number - a.number) };
}
const infoOf = s => s.info || {};
const firstLine = t => String(t || "").split("\n")[0].slice(0, 160);
const today = () => new Date().toISOString().slice(0, 10);

registerView("chronicles", async m => {
  const id = S.arg && S.arg.id;
  const root = h("div", {});
  m.append(root);
  let data;
  async function reload() { data = await loadAll(); }
  try { await reload(); } catch (e) { root.append(h("div", { class: "notice bad" }, "Chroniken konnten nicht geladen werden.")); return; }
  const draw = () => id ? drawDetail(root, id, data, async () => { await reload(); draw(); }) : drawList(root, data, async () => { await reload(); draw(); });
  draw();
});

function badge(status) { return h("span", { class: status === "done" ? "badge" : "badge st", style: status === "running" ? "background:var(--sea-soft);color:var(--sea)" : null }, CHRON_STATUS[status]); }

// ---------- Liste ----------
function drawList(root, data, refresh) {
  let adding = false;
  const body = h("div", { class: "stack" });
  const addBtn = S.isST ? h("button", { class: "btn primary", type: "button", onclick: () => { adding = !adding; paint(); } }, "Neue Chronik") : null;
  root.replaceChildren(head("Chroniken", "Geschichten, die ihr gemeinsam erzählt. Jede Chronik hat Kapitel, Sessions und eine Zeitleiste.", addBtn), body);

  function form() {
    const title = h("input", { type: "text", id: "ch-title", placeholder: "Titel der Chronik" });
    const desc = h("textarea", { id: "ch-desc", placeholder: "Kurzbeschreibung für alle Spieler" });
    const st = h("select", { id: "ch-status" }, ...Object.entries(CHRON_STATUS).map(([k, l]) => h("option", { value: k, selected: k === "running" ? true : null }, l)));
    const date = h("input", { type: "date", id: "ch-date" });
    return h("div", { class: "panel stack" }, h("h3", {}, "Neue Chronik"),
      h("div", { class: "field" }, h("label", { for: "ch-title" }, "Titel"), title),
      h("div", { class: "field" }, h("label", { for: "ch-desc" }, "Beschreibung"), desc),
      h("div", { class: "row" }, h("div", { class: "field" }, h("label", { for: "ch-status" }, "Status (Entwürfe sehen nur Storyteller)"), st), h("div", { class: "field" }, h("label", { for: "ch-date" }, "Beginn"), date)),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: async () => {
          if (!title.value.trim()) { toast("Bitte einen Titel eintragen.", true); return; }
          await guard(sb.from("chronicles").insert({ title: title.value.trim(), description: desc.value, status: st.value, started_on: date.value || null }), "Chronik angelegt.");
          await refresh();
        } }, "Speichern"),
        h("button", { class: "btn", type: "button", onclick: () => { adding = false; paint(); } }, "Abbrechen")));
  }

  function card(c) {
    const inChr = data.sessions.filter(s => infoOf(s).chronicle_id === c.id);
    const chapters = data.chapters.filter(x => x.chronicle_id === c.id).sort((a, b) => b.number - a.number);
    const next = inChr.filter(s => s.play_date && s.play_date >= today()).sort((a, b) => a.play_date.localeCompare(b.play_date))[0];
    return h("section", { class: "panel stack", "data-chronicle": c.id },
      h("div", { class: "row", style: "align-items:center" }, badge(c.status), h("span", { class: "muted" }, [inChr.length + (inChr.length === 1 ? " Session" : " Sessions"), chapters.length + (chapters.length === 1 ? " Kapitel" : " Kapitel"), c.started_on ? "seit " + fmtDate(c.started_on) : ""].filter(Boolean).join(" · "))),
      h("h3", {}, h("button", { class: "linkbtn", type: "button", style: "font:inherit", onclick: () => go("chronicles", { id: c.id }) }, c.title)),
      c.description ? h("p", { class: "pre" }, c.description) : null,
      h("dl", { class: "kv" },
        chapters.length ? [h("dt", {}, "Aktuelles Kapitel"), h("dd", {}, "Kapitel " + chapters[0].number + (chapters[0].title ? " · " + chapters[0].title : ""))] : null,
        next ? [h("dt", {}, "Nächste Session"), h("dd", {}, "Session " + next.number + " · " + fmtDate(next.play_date))] : null),
      h("div", {}, h("button", { class: "btn", type: "button", onclick: () => go("chronicles", { id: c.id }) }, "Zeitleiste öffnen")));
  }

  function paint() {
    const unassigned = data.sessions.filter(s => !infoOf(s).chronicle_id);
    body.replaceChildren(
      adding ? form() : null,
      ...(data.chronicles.length ? data.chronicles.map(card) : [h("div", { class: "empty" }, S.isST ? "Noch keine Chronik. Lege mit „Neue Chronik“ die erste an." : "Noch keine Chronik sichtbar.")]),
      S.isST && unassigned.length ? h("div", { class: "notice" }, unassigned.length + (unassigned.length === 1 ? " Session ist" : " Sessions sind") + " noch keiner Chronik zugeordnet. Das geht in der Chronik („Nicht zugeordnete Sessions“) oder in der Session selbst.") : null);
  }
  paint();
}

// ---------- Detail ----------
function drawDetail(root, id, data, refresh) {
  const c = data.chronicles.find(x => x.id === id);
  if (!c) { root.replaceChildren(h("div", { class: "notice bad" }, "Diese Chronik gibt es nicht oder sie ist nicht sichtbar."), h("p", {}, h("button", { class: "btn", type: "button", onclick: () => go("chronicles") }, "Zu allen Chroniken"))); return; }
  let editing = false, managing = false;
  const chapters = data.chapters.filter(x => x.chronicle_id === id).sort((a, b) => b.number - a.number);
  const mine = data.sessions.filter(s => infoOf(s).chronicle_id === id);
  const body = h("div", { class: "stack" });

  const editBtn = S.isST ? [h("button", { class: "btn", type: "button", onclick: () => { editing = !editing; paint(); } }, "Chronik bearbeiten"), h("button", { class: "btn", type: "button", onclick: () => { managing = !managing; paint(); } }, "Kapitel verwalten")] : [];
  root.replaceChildren(h("p", {}, h("button", { class: "linkbtn", type: "button", onclick: () => go("chronicles") }, "← Alle Chroniken")), head(c.title, c.description, ...editBtn), body);

  function sessionCard(s) {
    const i = infoOf(s);
    return h("div", { class: "panel", "data-session": String(s.number) },
      h("div", { class: "row", style: "align-items:baseline;gap:6px 14px" },
        h("button", { class: "linkbtn", type: "button", style: "font-weight:700", onclick: () => go("sessions", { session: s.number }) }, "Session " + s.number + (s.title ? " · " + s.title : "")),
        h("span", { class: "muted" }, [s.play_date ? "Gespielt " + fmtDate(s.play_date) : "", i.ingame_date ? "Ingame " + i.ingame_date : ""].filter(Boolean).join(" · "))),
      i.summary ? h("p", { style: "margin-top:4px" }, firstLine(i.summary)) : (S.isST ? h("p", { class: "muted", style: "margin-top:4px" }, "Noch keine Zusammenfassung.") : null),
      h("div", { class: "muted", style: "font-size:.86rem;margin-top:4px" }, s.notes + (s.notes === 1 ? " Notiz" : " Notizen")));
  }

  function editForm() {
    const title = h("input", { type: "text", id: "ce-title", value: c.title });
    const desc = h("textarea", { id: "ce-desc" }, c.description || "");
    const st = h("select", { id: "ce-status" }, ...Object.entries(CHRON_STATUS).map(([k, l]) => h("option", { value: k, selected: k === c.status ? true : null }, l)));
    const date = h("input", { type: "date", id: "ce-date", value: c.started_on || "" });
    return h("div", { class: "panel stack" }, h("h3", {}, "Chronik bearbeiten"),
      h("div", { class: "field" }, h("label", { for: "ce-title" }, "Titel"), title), h("div", { class: "field" }, h("label", { for: "ce-desc" }, "Beschreibung"), desc),
      h("div", { class: "row" }, h("div", { class: "field" }, h("label", { for: "ce-status" }, "Status (Entwürfe sehen nur Storyteller)"), st), h("div", { class: "field" }, h("label", { for: "ce-date" }, "Beginn"), date)),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: async () => {
          if (!title.value.trim()) { toast("Bitte einen Titel eintragen.", true); return; }
          await guard(sb.from("chronicles").update({ title: title.value.trim(), description: desc.value, status: st.value, started_on: date.value || null }).eq("id", id), "Gespeichert.");
          await refresh();
        } }, "Speichern"),
        h("button", { class: "btn", type: "button", onclick: () => { editing = false; paint(); } }, "Abbrechen"),
        confirmBtn("Chronik löschen", async () => { await guard(sb.from("chronicles").delete().eq("id", id), "Gelöscht. Die Sessions bleiben erhalten."); go("chronicles"); })));
  }

  function chapterManager() {
    const nextNo = chapters.reduce((m, x) => Math.max(m, x.number), 0) + 1;
    const nn = h("input", { type: "number", id: "kn-nr", min: 1, value: nextNo, style: "max-width:90px" }), nt = h("input", { type: "text", id: "kn-title", placeholder: "Titel des Kapitels" });
    return h("div", { class: "panel stack" }, h("h3", {}, "Kapitel verwalten"),
      ...chapters.slice().reverse().map(k => {
        const t = h("input", { type: "text", "aria-label": "Titel Kapitel " + k.number, value: k.title });
        return h("div", { class: "row", style: "align-items:center" }, h("strong", { style: "flex:0 0 90px" }, "Kapitel " + k.number), h("div", { class: "field" }, t),
          h("button", { class: "btn small", type: "button", onclick: async () => { await guard(sb.from("chapters").update({ title: t.value.trim() }).eq("id", k.id), "Gespeichert."); await refresh(); } }, "Speichern"),
          confirmBtn("Löschen", async () => { await guard(sb.from("chapters").delete().eq("id", k.id), "Gelöscht. Die Sessions bleiben der Chronik zugeordnet."); await refresh(); }));
      }),
      h("div", { class: "row" }, h("div", { class: "field", style: "flex:0 1 110px" }, h("label", { for: "kn-nr" }, "Nummer"), nn), h("div", { class: "field" }, h("label", { for: "kn-title" }, "Neues Kapitel"), nt),
        h("button", { class: "btn primary", type: "button", onclick: async () => {
          const no = Number(nn.value); if (!Number.isInteger(no) || no < 1) { toast("Bitte eine Kapitelnummer ab 1 eintragen.", true); return; }
          if (chapters.some(x => x.number === no)) { toast("Diese Kapitelnummer gibt es schon.", true); return; }
          await guard(sb.from("chapters").insert({ chronicle_id: id, number: no, title: nt.value.trim() }), "Kapitel angelegt."); await refresh();
        } }, "Kapitel anlegen")));
  }

  function paint() {
    const groups = chapters.map(k => ({ k, list: mine.filter(s => infoOf(s).chapter_id === k.id) }));
    const loose = mine.filter(s => !chapters.some(k => k.id === infoOf(s).chapter_id));
    const unassigned = data.sessions.filter(s => !infoOf(s).chronicle_id);
    const gaps = mine.filter(s => !s.title || !infoOf(s).summary).length;
    const section = (title, list, open, key) => h("details", { class: "panel stack", open: open ? true : null, "data-chapter": key },
      h("summary", { style: "cursor:pointer" }, h("h3", { style: "display:inline" }, title), h("span", { class: "muted" }, "  " + list.length + (list.length === 1 ? " Session" : " Sessions"))),
      h("div", { class: "stack", style: "margin-top:10px" }, ...(list.length ? list.map(sessionCard) : [h("div", { class: "muted" }, "Noch keine Session in diesem Kapitel.")])));
    body.replaceChildren(
      h("div", { class: "row", style: "align-items:center" }, badge(c.status), h("span", { class: "muted" }, [mine.length + (mine.length === 1 ? " Session" : " Sessions"), chapters.length + " Kapitel", c.started_on ? "seit " + fmtDate(c.started_on) : ""].join(" · "))),
      editing ? editForm() : null, managing ? chapterManager() : null,
      ...groups.map((g, n) => section("Kapitel " + g.k.number + (g.k.title ? " · " + g.k.title : ""), g.list, n === 0, g.k.id)),
      loose.length || !chapters.length ? section(chapters.length ? "Ohne Kapitel" : "Sessions", loose, !chapters.length || !groups.some(g => g.list.length), "loose") : null,
      S.isST && gaps ? h("div", { class: "notice", role: "status" }, h("span", { class: "badge st" }, "Nur Storyteller"), " Lücken: " + gaps + (gaps === 1 ? " Session hat" : " Sessions haben") + " keinen Titel oder keine Zusammenfassung.") : null,
      S.isST && unassigned.length ? h("div", { class: "panel stack", "data-unassigned": "1" }, h("span", { class: "badge st" }, "Nur Storyteller"), h("h3", {}, "Nicht zugeordnete Sessions"),
        ...unassigned.map(s => h("div", { class: "row", style: "align-items:center" }, h("span", { style: "flex:1 1 160px" }, "Session " + s.number + (s.title ? " · " + s.title : "")),
          h("button", { class: "btn small", type: "button", onclick: async () => { await guard(sb.from("session_info").upsert({ session_number: s.number, chronicle_id: id }), "Zugeordnet."); await refresh(); } }, "Dieser Chronik zuordnen")))) : null);
  }
  paint();
}
