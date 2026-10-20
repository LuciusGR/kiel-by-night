// Kiel by Night · Private Notizen (Spieler schreibt, ST liest mit)
import { h, guard, head, fmtDate, fmtShort, confirmBtn } from "../lib.js";
import { sb, S, registerView } from "../core.js";

registerView("private", async m => {
  m.append(head("Privat", "Nur du und der Storyteller sehen diese Notizen. Die anderen Spieler nicht."));
  if (S.isST) { m.append(h("p", { class: "notice" }, "Als Storyteller liest du private Notizen im Bereich „Storyteller“.")); return; }
  m.append(await recordsUI());
});

async function recordsUI() {
  let docs = [], cur = null, edit = false;
  const left = h("div", { class: "stack" }), right = h("div", {});
  const box = h("div", { class: "split" }, left, right);
  const load = async () => { docs = (await guard(sb.from("private_notes").select("*").eq("owner_id", S.user.id).order("updated_at", { ascending: false }))) || []; };
  const draw = () => {
    left.replaceChildren(h("button", { class: "btn primary", type: "button", onclick: () => { cur = null; edit = true; draw(); } }, "Neue private Notiz"),
      docs.length ? h("div", { class: "list" }, ...docs.map(d => h("button", { type: "button", "aria-current": String(cur === d.id), onclick: () => { cur = d.id; edit = false; draw(); } }, h("span", {}, d.title || "Ohne Titel"), h("span", { class: "muted mono" }, fmtShort(d.updated_at))))) : h("div", { class: "empty" }, "Noch keine Einträge."));
    const d = docs.find(x => x.id === cur);
    if (edit) {
      const t = h("input", { type: "text", id: "rec-title", value: d ? d.title : "" });
      const b = h("textarea", { id: "rec-body" }, d ? d.body : "");
      right.replaceChildren(h("div", { class: "panel stack" },
        h("div", { class: "field" }, h("label", { for: "rec-title" }, "Titel"), t),
        h("div", { class: "field" }, h("label", { for: "rec-body" }, "Text"), b),
        h("div", { class: "row" },
          h("button", { class: "btn primary", type: "button", onclick: async () => {
            if (d) await guard(sb.from("private_notes").update({ title: t.value, body: b.value }).eq("id", d.id), "Gespeichert.");
            else { const r = await guard(sb.from("private_notes").insert({ title: t.value, body: b.value }).select("id").single(), "Angelegt."); cur = r.id; }
            edit = false; await load(); draw();
          } }, "Speichern"),
          h("button", { class: "btn", type: "button", onclick: () => { edit = false; draw(); } }, "Abbrechen"),
          d ? confirmBtn("Löschen", async () => { await guard(sb.from("private_notes").delete().eq("id", d.id), "Gelöscht."); cur = null; edit = false; await load(); draw(); }) : null)));
    } else if (d) right.replaceChildren(h("div", { class: "article" }, h("h3", {}, d.title || "Ohne Titel"), h("p", { class: "muted" }, "Zuletzt geändert " + fmtDate(d.updated_at)), h("div", { class: "body pre" }, d.body),
      h("div", { style: "margin-top:14px" }, h("button", { class: "btn", type: "button", onclick: () => { edit = true; draw(); } }, "Bearbeiten"))));
    else right.replaceChildren(h("div", { class: "empty" }, docs.length ? "Eintrag links auswählen." : "Hier ist noch nichts."));
  };
  await load(); draw();
  return box;
}
