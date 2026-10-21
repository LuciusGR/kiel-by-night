// Kiel by Night · Session-Notizen: eine Seite pro Session, jede Person schreibt ihren eigenen Abschnitt
import { h, toast, guard, head, fmtDate, confirmBtn } from "../lib.js";
import { sb, S, registerView, authorName, personName } from "../core.js";
import { sceneBlock, resetNpcCache } from "./scenes.js";

registerView("sessions", async m => {
  let mine = !!(S.arg && S.arg.mine);
  let cur = S.arg && S.arg.session != null ? Number(S.arg.session) : null;
  let notes = [], meta = {}, editing = null, info = {}, chrons = [], chaps = [];
  resetNpcCache();
  const me = S.user.id;

  const left = h("div", { class: "stack" }), right = h("div", {});
  const bAll = h("button", { type: "button", onclick: () => { mine = false; draw(); } }, "Alle");
  const bMine = h("button", { type: "button", onclick: () => { mine = true; draw(); } }, "Nur meine");
  const tg = h("div", { class: "toggle", role: "group", "aria-label": "Ansicht" }, bAll, bMine);
  m.append(head("Sessions", "Eine Seite pro Session. Jede Person schreibt ihren eigenen Abschnitt, alle können mitlesen.", tg,
    h("button", { class: "btn primary", type: "button", onclick: () => newNote() }, "Neue Notiz")), h("div", { class: "split" }, left, right));

  async function load() {
    const [n, s, i, c, k] = await Promise.all([
      sb.from("session_notes").select("*").order("created_at"),
      sb.from("sessions").select("*"),
      sb.from("session_info").select("*"), sb.from("chronicles").select("*"), sb.from("chapters").select("*"),
    ]);
    if (n.error || s.error) { toast("Sessions konnten nicht geladen werden.", true); return; }
    notes = n.data; meta = {}; for (const x of s.data) meta[x.number] = x;
    // Chroniken sind neu: fehlen die Tabellen noch, funktionieren die Notizen trotzdem
    info = {}; for (const x of (i.error ? [] : i.data)) info[x.session_number] = x;
    chrons = c.error ? [] : c.data; chaps = k.error ? [] : k.data;
  }
  const sessionsList = () => { const set = new Set(notes.map(n => n.session_number)); Object.keys(meta).forEach(k => set.add(Number(k))); return [...set].sort((a, b) => b - a); };
  function newNote() { const l = sessionsList(); const next = cur ?? (l[0] || 1); editing = { id: null, session_number: next, body: "" }; mine = false; cur = next; draw(); }

  function noteEditor(n) {
    const ta = h("textarea", { id: "note-body", placeholder: "Was ist passiert? Wer war dabei? Was ist offen?" }, n.body || "");
    const sn = h("input", { type: "number", id: "note-session", min: 1, value: n.session_number ?? "" });
    return h("div", { class: "panel stack", style: "margin-top:12px" },
      h("div", { class: "row" }, h("div", { class: "field", style: "flex:0 1 120px" }, h("label", { for: "note-session" }, "Session Nr."), sn)),
      h("div", { class: "field" }, h("label", { for: "note-body" }, "Notiz"), ta),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: async () => {
          const session_number = Number(sn.value);
          if (!Number.isInteger(session_number) || session_number < 1) { toast("Bitte eine Session-Nummer eintragen.", true); return; }
          if (n.id) await guard(sb.from("session_notes").update({ session_number, body: ta.value }).eq("id", n.id), "Gespeichert.");
          else await guard(sb.from("session_notes").insert({ session_number, body: ta.value }), "Notiz angelegt.");
          editing = null; cur = session_number; await load(); draw();
        } }, "Speichern"),
        h("button", { class: "btn", type: "button", onclick: () => { editing = null; draw(); } }, "Abbrechen"),
        n.id ? confirmBtn("Löschen", async () => { await guard(sb.from("session_notes").delete().eq("id", n.id), "Gelöscht."); editing = null; await load(); draw(); }) : null));
  }

  function metaEditor(num) {
    const md = meta[num] || {};
    const title = h("input", { type: "text", id: "sess-title", value: md.title || "", placeholder: "Titel der Session" });
    const date = h("input", { type: "date", id: "sess-date", value: md.play_date || "" });
    return h("details", {}, h("summary", { class: "muted", style: "cursor:pointer" }, [md.play_date ? fmtDate(md.play_date) : "Datum offen", md.title || "ohne Titel"].join(" · ") + " — bearbeiten"),
      h("div", { class: "row", style: "margin-top:8px" },
        h("div", { class: "field" }, h("label", { for: "sess-title" }, "Titel"), title),
        h("div", { class: "field", style: "flex:0 1 170px" }, h("label", { for: "sess-date" }, "Spieldatum"), date),
        h("button", { class: "btn", type: "button", onclick: async () => {
          await guard(sb.from("sessions").upsert({ number: num, title: title.value.trim(), play_date: date.value || null, updated_by: me }), "Gespeichert.");
          await load(); draw();
        } }, "Speichern")));
  }

  // Chronik, Kapitel, Ingame-Datum und Zusammenfassung: alle lesen, nur der ST schreibt
  function infoBlock(num) {
    const i = info[num] || {};
    const chr = chrons.find(c => c.id === i.chronicle_id), chap = chaps.find(k => k.id === i.chapter_id);
    const where = [chr && chr.title + (chap ? " · Kapitel " + chap.number + (chap.title ? " " + chap.title : "") : ""), i.ingame_date && "Ingame: " + i.ingame_date].filter(Boolean).join(" · ");
    const view = h("div", { class: "stack", style: "margin-top:10px" },
      where ? h("div", { class: "muted", "data-info": "where" }, where) : null,
      i.summary ? h("div", {}, h("h4", { class: "eyebrow", style: "margin:0 0 4px" }, "Zusammenfassung"), h("div", { class: "pre", "data-info": "summary" }, i.summary)) : null);
    if (!S.isST) return view;
    const csel = h("select", { id: "si-chron" }, h("option", { value: "" }, "— keine Chronik —"), ...chrons.map(c => h("option", { value: c.id, selected: c.id === i.chronicle_id ? true : null }, c.title)));
    const ksel = h("select", { id: "si-chap" });
    const fillChaps = () => ksel.replaceChildren(h("option", { value: "" }, "— kein Kapitel —"), ...chaps.filter(k => k.chronicle_id === csel.value).sort((a, b) => a.number - b.number).map(k => h("option", { value: k.id, selected: k.id === i.chapter_id ? true : null }, "Kapitel " + k.number + (k.title ? " · " + k.title : ""))));
    fillChaps(); csel.addEventListener("change", fillChaps);
    const ing = h("input", { type: "text", id: "si-ingame", value: i.ingame_date || "", placeholder: "z. B. Nacht vom 11. auf den 12. März" });
    const sum = h("textarea", { id: "si-summary", placeholder: "Was ist geschehen? Alle Spieler lesen das." }, i.summary || "");
    return h("div", { class: "stack" }, view, h("details", { "data-info": "edit" }, h("summary", { class: "muted", style: "cursor:pointer" }, "Chronik, Kapitel und Zusammenfassung — bearbeiten (nur Storyteller)"),
      h("div", { class: "stack", style: "margin-top:8px" },
        h("div", { class: "row" }, h("div", { class: "field" }, h("label", { for: "si-chron" }, "Chronik"), csel), h("div", { class: "field" }, h("label", { for: "si-chap" }, "Kapitel"), ksel)),
        h("div", { class: "field" }, h("label", { for: "si-ingame" }, "Ingame-Datum"), ing),
        h("div", { class: "field" }, h("label", { for: "si-summary" }, "Zusammenfassung (sichtbar für alle)"), sum),
        h("div", {}, h("button", { class: "btn", type: "button", onclick: async () => {
          await guard(sb.from("session_info").upsert({ session_number: num, chronicle_id: csel.value || null, chapter_id: csel.value ? (ksel.value || null) : null, ingame_date: ing.value.trim(), summary: sum.value }), "Gespeichert.");
          await load(); draw();
        } }, "Speichern")))));
  }

  function entry(n) {
    return h("div", { class: "entry" },
      h("div", { class: "by" }, h("strong", {}, authorName(n.author_id)), h("span", { class: "muted" }, personName(n.author_id) + " · " + fmtDate(n.updated_at)),
        n.author_id === me ? h("button", { class: "btn small", type: "button", onclick: () => { editing = n; mine = false; cur = n.session_number; draw(); } }, "Bearbeiten") : null),
      h("div", { class: "pre", style: "margin-top:6px" }, n.body));
  }

  function draw() {
    bAll.setAttribute("aria-pressed", String(!mine)); bMine.setAttribute("aria-pressed", String(mine));
    const list = sessionsList();
    if (cur == null && list.length) cur = list[0];
    left.replaceChildren(list.length ? h("div", { class: "list" }, ...list.map(n => {
      const c = notes.filter(x => x.session_number === n).length;
      return h("button", { type: "button", "aria-current": String(!mine && n === cur), onclick: () => { mine = false; cur = n; editing = null; draw(); } },
        h("span", {}, "Session " + n + (meta[n]?.title ? " · " + meta[n].title : "")), h("span", { class: "muted mono" }, String(c)));
    })) : h("div", { class: "empty" }, "Noch keine Sessions."));

    if (mine) {
      const my = notes.filter(n => n.author_id === me).sort((a, b) => (b.session_number - a.session_number) || (Date.parse(b.updated_at) - Date.parse(a.updated_at)));
      right.replaceChildren(h("div", { class: "article" }, h("h3", {}, "Meine Notizen"),
        my.length ? my.map(n => h("div", { class: "entry" }, h("div", { class: "by" }, h("strong", {}, "Session " + n.session_number), h("span", { class: "muted" }, fmtDate(n.updated_at)),
          h("button", { class: "btn small", type: "button", onclick: () => { editing = n; mine = false; cur = n.session_number; draw(); } }, "Bearbeiten")), h("div", { class: "pre", style: "margin-top:6px" }, n.body)))
          : h("p", { class: "muted", style: "margin-top:10px" }, "Du hast noch keine Notizen geschrieben.")));
      return;
    }
    if (cur == null) {
      right.replaceChildren(h("div", { class: "empty" }, "Lege mit „Neue Notiz“ die erste Session an."));
      if (editing) right.append(noteEditor(editing));
      return;
    }
    const art = h("div", { class: "article" }, h("span", { class: "eyebrow" }, "Session"), h("h2", {}, "Session " + cur), metaEditor(cur), infoBlock(cur));
    // eigene Abschnitte zuerst, dann die anderen in Reihenfolge des Anlegens
    const these = notes.filter(x => x.session_number === cur).sort((a, b) => (a.author_id === me ? 0 : 1) - (b.author_id === me ? 0 : 1) || Date.parse(a.created_at) - Date.parse(b.created_at));
    for (const n of these) art.append(editing && editing.id === n.id ? noteEditor(editing) : entry(n));
    if (!these.length) art.append(h("p", { class: "muted", style: "margin-top:12px" }, "Zu dieser Session gibt es noch keine Notizen."));
    if (editing && !editing.id) art.append(noteEditor(editing));
    else if (!editing) art.append(h("div", { style: "margin-top:14px" }, h("button", { class: "btn", type: "button", onclick: () => { editing = { id: null, session_number: cur, body: "" }; draw(); } }, "Eigenen Abschnitt schreiben")));
    right.replaceChildren(art);
    if (S.isST) right.append(h("div", { style: "margin-top:16px" }, sceneBlock(cur)));
  }

  await load();
  draw();
});
