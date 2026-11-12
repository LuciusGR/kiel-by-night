// Kiel by Night · Private Notizen (Spieler schreibt, ST liest mit)
import { h, guard, head, fmtDate, fmtShort, confirmBtn, bindDraft, revealOnNarrow } from "../lib.js";
import { sb, S, registerView, setRoute, draftKey, saveChecked, deleteWithUndo } from "../core.js";
import { richText } from "../wikilinks.js";

registerView("private", async m => {
  m.append(head("Privat", "Nur du und der Storyteller sehen diese Notizen. Die anderen Spieler nicht."));
  if (S.isST) { m.append(h("p", { class: "notice" }, "Als Storyteller liest du private Notizen im Bereich „Storyteller“.")); return; }
  m.append(await recordsUI());
});

async function recordsUI() {
  const route = (arg, push) => setRoute(arg, push, "private");
  let docs = [], cur = (S.arg && S.arg.id) || null, edit = false;
  const NARROW = 860;
  const left = h("div", { class: "stack" }), right = h("div", {});
  const box = h("div", { class: "split" }, left, right);
  const load = async () => { docs = (await guard(sb.from("private_notes").select("*").eq("owner_id", S.user.id).order("updated_at", { ascending: false }))) || []; };
  const draw = () => {
    left.replaceChildren(h("button", { class: "btn primary", type: "button", onclick: () => { cur = null; edit = true; route(null); draw(); revealOnNarrow(right, NARROW); } }, "Neue private Notiz"),
      docs.length ? h("div", { class: "list" }, ...docs.map(d => h("button", { type: "button", "aria-current": String(cur === d.id), onclick: () => { cur = d.id; edit = false; route({ id: d.id }, true); draw(); revealOnNarrow(right, NARROW); } }, h("span", {}, d.title || "Ohne Titel"), h("span", { class: "muted mono" }, fmtShort(d.updated_at))))) : h("div", { class: "empty" }, "Noch keine Einträge."));
    const d = docs.find(x => x.id === cur);
    if (edit) {
      const t = h("input", { type: "text", id: "rec-title", value: d ? d.title : "" });
      const b = h("textarea", { id: "rec-body" }, d ? d.body : "");
      const draft = bindDraft(draftKey("priv", d ? d.id : "new"), { title: t, body: b });
      right.replaceChildren(h("div", { class: "panel stack" }, draft.notice,
        h("div", { class: "field" }, h("label", { for: "rec-title" }, "Titel"), t),
        h("div", { class: "field" }, h("label", { for: "rec-body" }, "Text"), b),
        h("div", { class: "row" },
          h("button", { class: "btn primary", type: "button", onclick: async () => {
            if (d) { if (!(await saveChecked("private_notes", d, { title: t.value, body: b.value }, "Gespeichert."))) return; }
            else { const r = await guard(sb.from("private_notes").insert({ title: t.value, body: b.value }).select("id").single(), "Angelegt."); cur = r.id; }
            draft.clear(); edit = false; route(cur ? { id: cur } : null); await load(); draw();
          } }, "Speichern"),
          h("button", { class: "btn", type: "button", onclick: () => { draft.clear(); edit = false; draw(); } }, "Abbrechen"),
          d ? confirmBtn("Löschen", async () => { await deleteWithUndo("private_notes", d, async () => { await load(); draw(); }); draft.clear(); cur = null; edit = false; route(null); await load(); draw(); }) : null)));
    } else if (d) right.replaceChildren(h("div", { class: "article" }, h("h3", {}, d.title || "Ohne Titel"), h("p", { class: "muted" }, "Zuletzt geändert " + fmtDate(d.updated_at)), richText(d.body, { class: "body pre" }),
      h("div", { style: "margin-top:14px" }, h("button", { class: "btn", type: "button", onclick: () => { edit = true; draw(); } }, "Bearbeiten"))));
    else right.replaceChildren(h("div", { class: "empty" }, docs.length ? "Eintrag aus der Liste auswählen." : "Hier ist noch nichts."));
  };
  await load(); draw();
  if (cur && docs.some(d => d.id === cur)) revealOnNarrow(right, NARROW);
  return box;
}
