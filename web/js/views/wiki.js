// Kiel by Night · Wiki: Kategorien, Tags, Verweise per [[Seitentitel]]
// Alle legen Kategorien an, nur der ST benennt um oder löscht. "ST-Notizen" (st_only) sieht nur der ST (RLS).
import { h, toast, guard, head, fmtDate, confirmBtn, splitTags } from "../lib.js";
import { sb, S, registerView, authorName } from "../core.js";

registerView("wiki", async m => {
  let cats = [], pages = [];
  let cat = (S.arg && S.arg.cat) || null, cur = (S.arg && S.arg.page) || null, edit = false, q = "", tag = null, newCat = false;
  const c1 = h("div", { class: "stack" }), c2 = h("div", { class: "stack" }), c3 = h("div", {});
  m.append(head("Wiki", "Gemeinsames Wissen der Gruppe. Verweise auf andere Seiten mit [[Seitentitel]]."), h("div", { class: "wiki-grid" }, c1, c2, c3));

  async function load() {
    const [c, p] = await Promise.all([
      sb.from("wiki_categories").select("*").order("sort").order("name"),
      sb.from("wiki_pages").select("*"),
    ]);
    if (c.error || p.error) { toast("Wiki konnte nicht geladen werden.", true); return; }
    cats = c.data; pages = p.data;
  }
  const catOf = id => cats.find(x => x.id === id);
  const byTitle = t => pages.find(p => p.title.toLowerCase() === t.toLowerCase());

  function body(text) {
    const out = h("div", { class: "body pre" }); const re = /\[\[([^\]]+)\]\]/g; let i = 0, mm;
    text = text || "";
    while ((mm = re.exec(text))) {
      out.append(text.slice(i, mm.index));
      const t = mm[1].trim(), p = byTitle(t);
      out.append(p ? h("button", { class: "wlink", type: "button", onclick: () => { cat = p.category_id; cur = p.id; edit = false; draw(); } }, t)
        : h("span", { class: "wlink missing", title: "Seite existiert noch nicht" }, t));
      i = re.lastIndex;
    }
    out.append(text.slice(i));
    return out;
  }

  function draw() {
    if ((!cat || !catOf(cat)) && cats.length) cat = cats[0].id;
    const counts = {}; pages.forEach(p => counts[p.category_id] = (counts[p.category_id] || 0) + 1);
    const ni = h("input", { type: "text", id: "newcat", placeholder: "Neue Kategorie" });
    c1.replaceChildren(h("span", { class: "eyebrow" }, "Kategorien"),
      h("div", { class: "list cat-list" }, ...cats.map(c => h("button", { type: "button", "aria-current": String(cat === c.id), onclick: () => { cat = c.id; cur = null; edit = false; tag = null; draw(); } },
        h("span", {}, c.name, c.st_only ? h("span", { class: "badge st", style: "margin-left:6px" }, "versteckt") : null), h("span", { class: "muted mono" }, String(counts[c.id] || 0))))),
      newCat ? h("div", { class: "row" }, ni,
        h("button", { class: "btn small primary", type: "button", onclick: async () => {
          const n = ni.value.trim(); if (!n) return;
          const r = await guard(sb.from("wiki_categories").insert({ name: n, sort: cats.filter(c => !c.st_only).length + 1, created_by: S.user.id }).select("id").single(), "Kategorie angelegt.");
          cat = r.id; newCat = false; await load(); draw();
        } }, "Anlegen"),
        h("button", { class: "btn small", type: "button", onclick: () => { newCat = false; draw(); } }, "Abbrechen"))
        : h("button", { class: "btn small", type: "button", onclick: () => { newCat = true; draw(); } }, "Kategorie hinzufügen"),
      S.isST && cat ? catAdmin() : null);

    const inCat = pages.filter(p => p.category_id === cat);
    const tags = [...new Set(inCat.flatMap(p => p.tags || []))].sort((a, b) => a.localeCompare(b, "de"));
    const sI = h("input", { type: "search", id: "wiki-search", placeholder: "In dieser Kategorie suchen", value: q, oninput: e => { q = e.target.value.toLowerCase(); drawList(); } });
    const listBox = h("div", {});
    function drawList() {
      const l = inCat.filter(p => !q || (p.title + " " + p.body).toLowerCase().includes(q)).filter(p => !tag || (p.tags || []).includes(tag)).sort((a, b) => a.title.localeCompare(b.title, "de"));
      listBox.replaceChildren(l.length ? h("div", { class: "list" }, ...l.map(p => h("button", { type: "button", "aria-current": String(cur === p.id), onclick: () => { cur = p.id; edit = false; draw(); } }, h("span", {}, p.title), S.isST && p.st_only ? h("span", { class: "badge st", style: "margin-left:6px" }, "versteckt") : null))) : h("div", { class: "empty" }, "Keine Seiten."));
    }
    c2.replaceChildren(h("button", { class: "btn primary", type: "button", disabled: cat ? null : true, onclick: () => { cur = null; edit = true; draw(); } }, "Neue Seite"), sI,
      tags.length ? h("div", { class: "chips" }, ...tags.map(t => h("button", { type: "button", class: "chip", "aria-pressed": String(!tag || tag === t), onclick: () => { tag = tag === t ? null : t; draw(); } }, "#" + t))) : null, listBox);
    drawList();

    const p = pages.find(x => x.id === cur);
    if (edit) c3.replaceChildren(pageForm(p));
    else if (p) {
      const c = catOf(p.category_id);
      c3.replaceChildren(h("article", { class: "article" },
        h("div", { class: "row", style: "justify-content:space-between" }, h("span", { class: "eyebrow" }, c ? (c.st_only ? c.name + " · nur für dich" : c.name) : "Ohne Kategorie", p.st_only ? " · versteckt" : ""),
          h("div", { class: "row" },
            S.isST ? h("button", { class: "btn small", type: "button", onclick: async () => { await guard(sb.from("wiki_pages").update({ st_only: !p.st_only }).eq("id", p.id), p.st_only ? "Für alle Mitglieder sichtbar." : "Nur für dich sichtbar."); await load(); draw(); } }, p.st_only ? "Für alle sichtbar machen" : "Nur für ST sichtbar") : null,
            h("button", { class: "btn small", type: "button", onclick: () => { edit = true; draw(); } }, "Bearbeiten"))),
        h("h2", { style: "margin-top:6px" }, p.title),
        (p.tags || []).length ? h("div", { class: "chips", style: "margin-top:8px" }, ...p.tags.map(t => h("span", { class: "chip" }, "#" + t))) : null,
        body(p.body),
        h("p", { class: "muted", style: "margin-top:16px;font-size:.86rem" }, "Zuletzt geändert " + fmtDate(p.updated_at) + (p.updated_by ? " von " + authorName(p.updated_by) : ""))));
    } else c3.replaceChildren(h("div", { class: "empty" }, catOf(cat)?.st_only ? "Versteckte Notizen nur für dich. Spieler sehen diese Kategorie nicht." : "Seite links auswählen oder eine neue anlegen."));
  }

  function catAdmin() {
    const c = catOf(cat); if (!c) return null;
    const used = pages.some(p => p.category_id === c.id);
    const n = h("input", { type: "text", id: "cat-rename", value: c.name });
    return h("details", { class: "panel" }, h("summary", { class: "muted", style: "cursor:pointer" }, "Kategorie verwalten"), h("div", { class: "stack", style: "margin-top:8px" },
      h("div", { class: "field" }, h("label", { for: "cat-rename" }, "Name"), n),
      h("div", { class: "row" },
        h("button", { class: "btn small", type: "button", onclick: async () => { await guard(sb.from("wiki_categories").update({ name: n.value.trim() || c.name }).eq("id", c.id), "Umbenannt."); await load(); draw(); } }, "Umbenennen"),
        used ? h("span", { class: "muted", style: "font-size:.84rem" }, "Löschen erst, wenn die Kategorie leer ist.")
          : confirmBtn("Löschen", async () => { await guard(sb.from("wiki_categories").delete().eq("id", c.id), "Gelöscht."); cat = null; await load(); draw(); }))));
  }

  function pageForm(p) {
    const t = h("input", { type: "text", id: "wp-title", value: p ? p.title : "" });
    const tg = h("input", { type: "text", id: "wp-tags", value: p ? (p.tags || []).join(", ") : "", placeholder: "durch Komma getrennt" });
    const cs = h("select", { id: "wp-cat" }, ...cats.map(c => h("option", { value: c.id, selected: (p ? p.category_id : cat) === c.id ? true : null }, c.name + (c.st_only ? " (versteckt)" : ""))));
    const b = h("textarea", { id: "wp-body", style: "min-height:280px" }, p ? p.body : "");
    const hid = h("input", { type: "checkbox", id: "wp-hidden", checked: p && p.st_only ? true : null, style: "width:auto" });
    return h("div", { class: "panel stack" }, h("h3", {}, p ? "Seite bearbeiten" : "Neue Seite"),
      h("div", { class: "field" }, h("label", { for: "wp-title" }, "Titel"), t),
      h("div", { class: "field" }, h("label", { for: "wp-cat" }, "Kategorie"), cs),
      h("div", { class: "field" }, h("label", { for: "wp-tags" }, "Tags"), tg),
      h("div", { class: "field" }, h("label", { for: "wp-body" }, "Text"), b),
      S.isST ? h("label", { class: "row", style: "align-items:center;gap:8px" }, hid, "Nur für den ST sichtbar (Spieler sehen die Seite nicht)") : null,
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: async () => {
          if (!t.value.trim()) { toast("Bitte einen Titel eintragen.", true); return; }
          const data = { title: t.value.trim(), tags: splitTags(tg.value), body: b.value, category_id: cs.value };
          if (S.isST) data.st_only = hid.checked;
          if (p) await guard(sb.from("wiki_pages").update(data).eq("id", p.id), "Gespeichert.");
          else { const r = await guard(sb.from("wiki_pages").insert({ ...data, created_by: S.user.id, updated_by: S.user.id }).select("id").single(), "Seite angelegt."); cur = r.id; }
          cat = cs.value; edit = false; await load(); draw();
        } }, "Speichern"),
        h("button", { class: "btn", type: "button", onclick: () => { edit = false; draw(); } }, "Abbrechen"),
        p && (S.isST || p.created_by === S.user.id) ? confirmBtn("Löschen", async () => { await guard(sb.from("wiki_pages").delete().eq("id", p.id), "Gelöscht."); cur = null; edit = false; await load(); draw(); }) : null));
  }

  await load();
  draw();
});
