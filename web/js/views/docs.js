// Kiel by Night · Dokumente (Supabase Storage, privater Bucket "documents")
// Alle laden hoch, Spieler löschen nur eigene Dateien. ST-Entwürfe sind für Spieler unsichtbar (RLS + Storage-Policy).
import { h, toast, errMsg, guard, head, fmtDate, confirmBtn } from "../lib.js";
import { sb, S, go, registerView, authorName } from "../core.js";

const BUCKET = "documents";
const MAX = 20 * 1024 * 1024;
const TYPES = { pdf: "application/pdf", md: "text/markdown", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const safeName = n => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-80) || "datei";

registerView("docs", async m => {
  let docs = [], editing = null, links = [], pLabels = new Map();
  m.append(head("Dokumente", "Handouts, Karten, Bilder und Recherchen. Alle laden hoch, gelöscht wird nur, was man selbst hochgeladen hat."));

  const f = h("input", { type: "file", id: "up-file", accept: Object.values(TYPES).join(",") });
  const t = h("input", { type: "text", id: "up-title", placeholder: "Titel" }), d = h("input", { type: "text", id: "up-desc", placeholder: "Kurzbeschreibung (optional)" });
  const asDraft = S.isST ? h("input", { type: "checkbox", id: "up-draft" }) : null;
  const btn = h("button", { class: "btn primary", type: "button", onclick: upload }, "Hochladen");
  m.append(h("div", { class: "panel stack", style: "margin-bottom:20px" },
    h("div", { class: "row" }, h("div", { class: "field" }, h("label", { for: "up-file" }, "Datei (PDF, Bild, Text · max. 20 MB)"), f), h("div", { class: "field" }, h("label", { for: "up-title" }, "Titel"), t), h("div", { class: "field" }, h("label", { for: "up-desc" }, "Beschreibung"), d)),
    h("div", { class: "row", style: "align-items:center" }, btn, asDraft ? h("label", { for: "up-draft", style: "display:inline-flex;gap:6px;align-items:center" }, asDraft, "Als ST-Entwurf (für Spieler unsichtbar)") : null)));
  const grid = h("div", { class: "docs" }), draftBox = h("div", {});
  m.append(grid, draftBox);

  async function upload() {
    const file = f.files && f.files[0];
    if (!file) { toast("Bitte eine Datei wählen.", true); return; }
    if (file.size > MAX) { toast("Datei ist zu groß (max. 20 MB).", true); return; }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const type = file.type || TYPES[ext] || "";
    if (!Object.values(TYPES).includes(type)) { toast("Dateityp wird nicht unterstützt (PDF, Bild, Text).", true); return; }
    btn.disabled = true; btn.textContent = "Lädt hoch …";
    const path = `${S.user.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
    try {
      const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: type, upsert: false });
      if (up.error) throw up.error;
      const ins = await sb.from("documents").insert({ title: t.value.trim() || file.name, description: d.value.trim(), storage_path: path, file_name: file.name, content_type: type, size_bytes: file.size, draft: !!(asDraft && asDraft.checked) });
      if (ins.error) { await sb.storage.from(BUCKET).remove([path]); throw ins.error; }
      toast("Hochgeladen."); f.value = ""; t.value = ""; d.value = "";
      await load(); draw();
    } catch (e) { toast(errMsg(e), true); }
    btn.disabled = false; btn.textContent = "Hochladen";
  }

  async function load() {
    const { data, error } = await sb.from("documents").select("*").order("created_at", { ascending: false });
    if (error) { toast(errMsg(error), true); return; }
    docs = data;
    // Verknüpfungen mit Knoten der Karten (Spielerkarte für alle, Storytellerkarte nur ST); fehlen sie noch, bleibt die Liste leer
    const [lk, pn] = await Promise.all([sb.from("document_links").select("*"), sb.from("player_map_nodes").select("id, label")]);
    links = lk.error ? [] : lk.data.filter(l => l.scope === "player" || S.isST);
    pLabels = new Map((pn.error ? [] : pn.data).map(x => [x.id, x.label]));
    // Vorschaubilder: signierte URLs (1 h), nur für Bilder
    const imgs = docs.filter(x => x.content_type.startsWith("image/")).map(x => x.storage_path);
    if (imgs.length) {
      const { data: urls } = await sb.storage.from(BUCKET).createSignedUrls(imgs, 3600);
      const map = new Map((urls || []).map(u => [u.path, u.signedUrl]));
      for (const x of docs) x._thumb = map.get(x.storage_path) || null;
    }
  }

  async function open(x) {
    const w = window.open("about:blank", "_blank"); // vor dem await öffnen, sonst blockt der Popup-Blocker
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(x.storage_path, 3600);
    if (error || !data) { if (w) w.close(); toast(errMsg(error || {}), true); return; }
    if (w) { w.opener = null; w.location.href = data.signedUrl; } else location.href = data.signedUrl;
  }

  // Titel und Beschreibung nachträglich ändern (Uploader und ST; die Datei selbst bleibt unverändert)
  function editForm(x) {
    const t = h("input", { type: "text", id: "doc-title", value: x.title }), d = h("textarea", { id: "doc-desc", style: "min-height:70px" }, x.description || "");
    return h("div", { class: "doc" }, h("div", { class: "meta stack" },
      h("div", { class: "field" }, h("label", { for: "doc-title" }, "Titel"), t),
      h("div", { class: "field" }, h("label", { for: "doc-desc" }, "Beschreibung"), d),
      h("div", { class: "actions" },
        h("button", { class: "btn small primary", type: "button", onclick: async () => {
          const title = t.value.trim(); if (!title) { toast("Bitte einen Titel eintragen.", true); return; }
          await guard(sb.from("documents").update({ title, description: d.value.trim() }).eq("id", x.id), "Gespeichert.");
          editing = null; await load(); draw();
        } }, "Speichern"),
        h("button", { class: "btn small", type: "button", onclick: () => { editing = null; draw(); } }, "Abbrechen"))));
  }

  // Karten-Elemente, mit denen das Dokument verknüpft ist: Klick springt zum Knoten
  function linkChips(x) {
    const mine = links.filter(l => l.document_id === x.id);
    if (!mine.length) return null;
    return h("div", { class: "chips", "data-doc-links": "1" }, ...mine.map(l => {
      const st = l.scope === "st", name = (st ? l.label : pLabels.get(l.node_key)) || l.label || "Knoten";
      return h("span", { class: "chip", style: "cursor:default" },
        h("button", { class: "linkbtn", type: "button", title: st ? "Auf der Storytellerkarte zeigen" : "Auf der Spielerkarte zeigen", onclick: () => st ? go("st", { tab: "map", focus: l.node_key }) : go("map", { focus: l.node_key }) }, (st ? "ST: " : "") + name),
        h("button", { class: "linkbtn", type: "button", style: "margin-left:6px", "aria-label": "Verknüpfung lösen: " + name, onclick: async () => { await guard(sb.from("document_links").delete().eq("id", l.id), "Verknüpfung gelöst."); await load(); draw(); } }, "×"));
    }));
  }

  function card(x) {
    const img = x.content_type.startsWith("image/"), ext = (x.file_name.split(".").pop() || "Datei").toUpperCase();
    const mineOrSt = S.isST || x.uploader_id === S.user.id;
    if (editing === x.id) return editForm(x);
    return h("div", { class: "doc", "data-doc": x.id },
      h("div", { class: "thumb" }, img && x._thumb ? h("img", { src: x._thumb, alt: x.title, loading: "lazy" }) : h("span", { class: "ext" }, ext)),
      h("div", { class: "meta" }, h("strong", {}, x.title), x.description ? h("span", { class: "muted", style: "font-size:.9rem" }, x.description) : null,
        h("span", { class: "muted", style: "font-size:.82rem" }, fmtDate(x.created_at) + " · " + authorName(x.uploader_id) + (x.size_bytes ? " · " + Math.max(1, Math.round(x.size_bytes / 1024)) + " KB" : "")),
        linkChips(x),
        h("div", { class: "actions" },
          h("button", { class: "btn small", type: "button", onclick: () => open(x) }, "Öffnen"),
          mineOrSt && (S.isST || !x.draft) ? h("button", { class: "btn small", type: "button", onclick: () => { editing = x.id; draw(); } }, "Bearbeiten") : null,
          x.draft && S.isST ? h("button", { class: "btn small primary", type: "button", onclick: async () => { await guard(sb.from("documents").update({ draft: false }).eq("id", x.id), "Für Spieler freigegeben."); await load(); draw(); } }, "Freigeben") : null,
          mineOrSt ? confirmBtn("Löschen", async () => {
            await guard(sb.from("documents").delete().eq("id", x.id), "Gelöscht.");
            const r = await sb.storage.from(BUCKET).remove([x.storage_path]);
            if (r.error) toast("Datei blieb im Speicher: " + errMsg(r.error), true);
            await load(); draw();
          }) : null)));
  }

  function draw() {
    const pub = docs.filter(x => !x.draft), drafts = docs.filter(x => x.draft);
    grid.replaceChildren(...(pub.length ? pub.map(card) : [h("div", { class: "empty" }, "Noch keine Dokumente.")]));
    if (S.isST) draftBox.replaceChildren(h("h3", { style: "margin:28px 0 12px" }, "ST-Entwürfe ", h("span", { class: "badge st" }, "versteckt")),
      drafts.length ? h("div", { class: "docs" }, ...drafts.map(card)) : h("div", { class: "empty" }, "Keine Entwürfe. Beim Hochladen „Als ST-Entwurf“ anhaken."));
  }

  await load();
  draw();
  // Sprung von der Karte: Dokument anzeigen und hervorheben
  const f2 = S.arg && S.arg.focus; const el = f2 && m.querySelector('[data-doc="' + f2 + '"]');
  if (el) { if (el.scrollIntoView) el.scrollIntoView({ block: "center" }); el.style.outline = "2px solid var(--sea)"; }
});
