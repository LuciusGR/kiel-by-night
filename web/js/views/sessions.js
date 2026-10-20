// Kiel by Night · Session-Notizen: eine Seite pro Session, jede Person schreibt ihren eigenen Abschnitt
import { h, toast, guard, head, fmtDate, confirmBtn } from "../lib.js";
import { sb, S, registerView, authorName, personName } from "../core.js";

registerView("sessions", async m => {
  let mine = !!(S.arg && S.arg.mine);
  let cur = S.arg && S.arg.session != null ? Number(S.arg.session) : null;
  let notes = [], meta = {}, editing = null;
  const me = S.user.id;

  const left = h("div", { class: "stack" }), right = h("div", {});
  const bAll = h("button", { type: "button", onclick: () => { mine = false; draw(); } }, "Alle");
  const bMine = h("button", { type: "button", onclick: () => { mine = true; draw(); } }, "Nur meine");
  const tg = h("div", { class: "toggle", role: "group", "aria-label": "Ansicht" }, bAll, bMine);
  m.append(head("Sessions", "Eine Seite pro Session. Jede Person schreibt ihren eigenen Abschnitt, alle können mitlesen.", tg,
    h("button", { class: "btn primary", type: "button", onclick: () => newNote() }, "Neue Notiz")), h("div", { class: "split" }, left, right));

  async function load() {
    const [n, s] = await Promise.all([
      sb.from("session_notes").select("*").order("created_at"),
      sb.from("sessions").select("*"),
    ]);
    if (n.error || s.error) { toast("Sessions konnten nicht geladen werden.", true); return; }
    notes = n.data; meta = {}; for (const x of s.data) meta[x.number] = x;
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
    const art = h("div", { class: "article" }, h("span", { class: "eyebrow" }, "Session"), h("h2", {}, "Session " + cur), metaEditor(cur));
    // eigene Abschnitte zuerst, dann die anderen in Reihenfolge des Anlegens
    const these = notes.filter(x => x.session_number === cur).sort((a, b) => (a.author_id === me ? 0 : 1) - (b.author_id === me ? 0 : 1) || Date.parse(a.created_at) - Date.parse(b.created_at));
    for (const n of these) art.append(editing && editing.id === n.id ? noteEditor(editing) : entry(n));
    if (!these.length) art.append(h("p", { class: "muted", style: "margin-top:12px" }, "Zu dieser Session gibt es noch keine Notizen."));
    if (editing && !editing.id) art.append(noteEditor(editing));
    else if (!editing) art.append(h("div", { style: "margin-top:14px" }, h("button", { class: "btn", type: "button", onclick: () => { editing = { id: null, session_number: cur, body: "" }; draw(); } }, "Eigenen Abschnitt schreiben")));
    right.replaceChildren(art);
  }

  await load();
  draw();
});
