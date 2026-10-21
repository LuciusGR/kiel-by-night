// Kiel by Night · Dokumente an Karten-Elementen: Liste und Verknüpfen im Detailfeld der Spielerkarte und der Storytellerkarte
// scope "player": node_key = Knoten-ID der Spielerkarte. scope "st": node_key = Notion-ID des NPC (nur Storyteller).
import { h, toast, guard } from "../lib.js";
import { sb, go } from "../core.js";

export function docLinksBox(scope, key, label, canEdit) {
  const box = h("div", { class: "stack", style: "width:100%", "data-doclinks": scope });
  async function draw() {
    const [l, d] = await Promise.all([sb.from("document_links").select("*").eq("scope", scope).eq("node_key", key), sb.from("documents").select("id, title, draft")]);
    if (l.error || d.error) { box.replaceChildren(); return; }
    const docs = new Map(d.data.map(x => [x.id, x]));
    const linked = l.data.filter(x => docs.has(x.document_id)).sort((a, b) => docs.get(a.document_id).title.localeCompare(docs.get(b.document_id).title, "de"));
    const free = d.data.filter(x => !linked.some(y => y.document_id === x.id)).sort((a, b) => a.title.localeCompare(b.title, "de"));
    const sel = h("select", { "aria-label": "Dokument verknüpfen" }, h("option", { value: "" }, "Dokument wählen …"), ...free.map(x => h("option", { value: x.id }, x.title + (x.draft ? " (Entwurf)" : ""))));
    box.replaceChildren(
      linked.length || canEdit ? h("h4", { class: "eyebrow", style: "margin:0" }, "Dokumente (" + linked.length + ")") : null,
      ...linked.map(x => { const t = docs.get(x.document_id).title; return h("div", { class: "conn" }, h("div", { class: "c" },
        h("button", { class: "linkbtn", type: "button", title: "Im Bereich Dokumente zeigen", onclick: () => go("docs", { focus: x.document_id }) }, t),
        canEdit ? h("button", { class: "btn small", type: "button", style: "margin-left:8px", "aria-label": "Verknüpfung lösen: " + t, onclick: async () => { await guard(sb.from("document_links").delete().eq("id", x.id), "Verknüpfung gelöst."); await draw(); } }, "×") : null)); }),
      canEdit && free.length ? h("div", { class: "row", style: "align-items:center" }, h("div", { class: "field", style: "flex:1 1 180px" }, sel),
        h("button", { class: "btn small", type: "button", onclick: async () => {
          if (!sel.value) { toast("Bitte ein Dokument wählen.", true); return; }
          await guard(sb.from("document_links").insert({ document_id: sel.value, scope, node_key: key, label: label || "" }), "Verknüpft.");
          await draw();
        } }, "Verknüpfen")) : null);
  }
  draw().catch(() => {});
  return box;
}
