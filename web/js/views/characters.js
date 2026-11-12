// Kiel by Night · Charakterbögen (V5, Trait-Namen nach Corebook)
import { h, toast, errMsg, head, guard, confirmBtn, fmtDate } from "../lib.js";
import { rollPool, evaluate, rerollWillpower, d10 } from "../dice.js";
import { sb, S, go, registerView, onCleanup, personName, loadChars } from "../core.js";

export const ATTR = [["Körperlich", ["Strength", "Dexterity", "Stamina"]], ["Sozial", ["Charisma", "Manipulation", "Composure"]], ["Geistig", ["Intelligence", "Wits", "Resolve"]]];
export const SKILLS = [["Körperlich", ["Athletics", "Brawl", "Craft", "Drive", "Firearms", "Larceny", "Melee", "Stealth", "Survival"]],
  ["Sozial", ["Animal Ken", "Etiquette", "Insight", "Intimidation", "Leadership", "Performance", "Persuasion", "Streetwise", "Subterfuge"]],
  ["Geistig", ["Academics", "Awareness", "Finance", "Investigation", "Medicine", "Occult", "Politics", "Science", "Technology"]]];

export function normSheet(s) {
  s = JSON.parse(JSON.stringify(s || {}));
  s.attr = s.attr || {}; for (const [, l] of ATTR) for (const a of l) if (s.attr[a] == null) s.attr[a] = 1;
  s.skills = s.skills || {}; for (const [, l] of SKILLS) for (const k of l) if (!s.skills[k]) s.skills[k] = { v: 0, spec: "" };
  s.disc = Array.isArray(s.disc) ? s.disc : [];
  s.merits = Array.isArray(s.merits) ? s.merits : [];   // { name, kind: Vorteil | Hintergrund | Nachteil, dots }
  s.xplog = Array.isArray(s.xplog) ? s.xplog : [];      // { d: Datum, t: Grund, n: Betrag (positiv erhalten, negativ ausgegeben) }
  s.portrait = s.portrait && s.portrait.path ? s.portrait : null; // { id, path }: ein Bild aus dem Bereich Dokumente
  s.health = Array.isArray(s.health) ? s.health : []; s.wp = Array.isArray(s.wp) ? s.wp : [];
  const humMissing = s.humanity == null || s.humanity === "";
  for (const k of ["hunger", "humanity", "stains", "bp", "xpTotal", "xpSpent"]) s[k] = Number(s[k] || 0);
  if (humMissing) s.humanity = 7;
  for (const k of ["concept", "ambition", "desire", "predator", "sire", "generation", "resonance", "touchstones", "advantages", "notes"]) s[k] = s[k] || "";
  return s;
}

export const canEdit = c => S.isST || (c.owner_id && c.owner_id === S.user.id);

// Clans des Grundregelwerks und der Ergänzungen, als Vorschlag (freie Eingabe bleibt möglich)
export const CLANS = ["Banu Haqim", "Brujah", "Gangrel", "Hecata", "Lasombra", "Malkavian", "Ministry", "Nosferatu", "Ravnos", "Salubri", "Toreador", "Tremere", "Tzimisce", "Ventrue", "Caitiff", "Thin-Blood"];

// Porträt: Bild aus dem Bereich Dokumente (signierte Adresse, eine Stunde gültig). Fehlt die Datei, bleibt der Platz leer.
export function portraitImg(p, cls) {
  if (!p || !p.path) return null;
  const img = h("img", { class: cls, alt: "", hidden: true, onerror: () => img.remove(), onload: () => { img.hidden = false; } });
  sb.storage.from("documents").createSignedUrl(p.path, 3600).then(r => { if (r.data && /^https?:/.test(r.data.signedUrl || "")) img.src = r.data.signedUrl; else img.remove(); }).catch(() => img.remove());
  return img;
}

function staticBoxes(n, cls) { const b = h("span", { class: "boxes" }); for (let i = 0; i < n; i++) b.append(h("span", { class: cls(i) })); return b; }

export function pcCard(c) {
  const sh = normSheet(c.sheet);
  const hmax = (sh.attr.Stamina || 1) + 3;
  return h("button", { class: "pc", type: "button", onclick: () => go("chars", { id: c.id }) },
    h("span", { class: "eyebrow" }, [c.clan || "Clan offen", c.owner_id ? personName(c.owner_id) : "ohne Spieler"].join(" · ")),
    h("div", { class: "pc-title" }, portraitImg(sh.portrait, "avatar"), h("h3", {}, c.name || "Unbenannt")),
    h("div", { class: "row", style: "gap:16px" },
      h("div", {}, h("div", { class: "eyebrow" }, "Hunger"), staticBoxes(5, i => i < sh.hunger ? "hunger" : "")),
      h("div", {}, h("div", { class: "eyebrow" }, "Health"), staticBoxes(hmax, i => { const v = (sh.health || [])[i] | 0; return v ? "s" + v : ""; }))));
}

registerView("chars", async m => {
  if (S.arg && S.arg.id) return viewSheet(m, S.arg.id);
  await loadChars();
  const newBox = h("div", { style: "margin-bottom:16px" });
  m.append(head("Charaktere", "Alle Bögen sind für die ganze Gruppe sichtbar. Bearbeiten können die jeweilige Person und der Storyteller.",
    S.isST ? h("button", { class: "btn", type: "button", onclick: () => newBox.replaceChildren(xpForm(() => newBox.replaceChildren())) }, "XP vergeben") : null,
    S.isST ? h("button", { class: "btn primary", type: "button", onclick: () => newBox.replaceChildren(newCharForm(() => newBox.replaceChildren())) }, "Neuer Charakter") : null), newBox);
  const cards = h("div", { class: "cards" });
  for (const c of S.chars) cards.append(pcCard(c));
  if (!S.chars.length) cards.append(h("div", { class: "empty" }, "Noch keine Charaktere."));
  m.append(cards);
});

// ---------- Verwaltung (nur Storyteller): anlegen, Spieler zuordnen, löschen ----------
function ownerSelect(id, current) {
  const people = [...S.profiles.values()].sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), "de"));
  return h("select", { id }, h("option", { value: "" }, "— ohne Spieler —"),
    ...people.map(p => h("option", { value: p.id, selected: p.id === current ? true : null }, (p.display_name || "Ohne Namen") + (p.role === "st" ? " (Storyteller)" : ""))));
}
function newCharForm(close) {
  const name = h("input", { type: "text", id: "nc-name", placeholder: "Name des Charakters" }), clan = h("input", { type: "text", id: "nc-clan", placeholder: "z. B. Toreador" });
  const owner = ownerSelect("nc-owner", null);
  return h("div", { class: "panel stack", "data-admin": "newchar" }, h("span", { class: "badge st", style: "align-self:flex-start" }, "Nur Storyteller"), h("h3", {}, "Neuer Charakter"),
    h("div", { class: "row" }, h("div", { class: "field" }, h("label", { for: "nc-name" }, "Name"), name), h("div", { class: "field" }, h("label", { for: "nc-clan" }, "Clan"), clan), h("div", { class: "field" }, h("label", { for: "nc-owner" }, "Spieler"), owner)),
    h("div", { class: "row" },
      h("button", { class: "btn primary", type: "button", onclick: async () => {
        if (!name.value.trim()) { toast("Bitte einen Namen eintragen.", true); return; }
        const sort = S.chars.reduce((mx, c) => Math.max(mx, c.sort || 0), 0) + 1;
        const r = await guard(sb.from("characters").insert({ name: name.value.trim(), clan: clan.value.trim(), owner_id: owner.value || null, sheet: {}, sort }).select("id").single(), "Charakter angelegt.");
        await loadChars(); go("chars", { id: r.id });
      } }, "Anlegen"),
      h("button", { class: "btn", type: "button", onclick: close }, "Abbrechen")));
}
// XP an mehrere Charaktere vergeben: erhöht "XP gesamt" und schreibt einen Eintrag in den XP-Verlauf des Bogens
function xpForm(close) {
  const amount = h("input", { type: "number", id: "xp-amount", min: 1, max: 99, value: 1, style: "max-width:110px" }), reason = h("input", { type: "text", id: "xp-reason", placeholder: "z. B. Session 12" });
  const boxes = S.chars.map(c => ({ c, el: h("input", { type: "checkbox", checked: c.owner_id ? true : null, style: "width:auto", "data-xp-char": c.id }) }));
  return h("div", { class: "panel stack", "data-admin": "xp" }, h("span", { class: "badge st", style: "align-self:flex-start" }, "Nur Storyteller"), h("h3", {}, "XP vergeben"),
    h("div", { class: "row" }, h("div", { class: "field", style: "flex:0 1 120px" }, h("label", { for: "xp-amount" }, "XP je Charakter"), amount), h("div", { class: "field" }, h("label", { for: "xp-reason" }, "Grund (steht im XP-Verlauf)"), reason)),
    h("div", { class: "row", style: "align-items:center" }, ...boxes.map(b => h("label", { class: "row", style: "align-items:center;gap:6px" }, b.el, b.c.name))),
    h("div", { class: "row" },
      h("button", { class: "btn primary", type: "button", onclick: async () => {
        const n = Math.floor(Number(amount.value)); const picked = boxes.filter(b => b.el.checked);
        if (!(n >= 1 && n <= 99)) { toast("Bitte 1 bis 99 XP eintragen.", true); return; }
        if (!picked.length) { toast("Bitte mindestens einen Charakter wählen.", true); return; }
        for (const { c } of picked) {
          // frisch laden, damit keine Änderung des Spielers überschrieben wird
          const cur = await guard(sb.from("characters").select("*").eq("id", c.id).maybeSingle());
          if (!cur) continue;
          const sheet = normSheet(cur.sheet); sheet.xpTotal += n; sheet.xplog.push({ d: new Date().toISOString().slice(0, 10), t: reason.value.trim() || "vom Storyteller", n });
          await guard(sb.from("characters").update({ sheet }).eq("id", c.id));
        }
        toast(n + " XP an " + picked.length + (picked.length === 1 ? " Charakter" : " Charaktere") + " vergeben."); await loadChars(); go("chars", null, { replace: true });
      } }, "Vergeben"),
      h("button", { class: "btn", type: "button", onclick: close }, "Abbrechen")));
}
function charAdmin(c) {
  const owner = ownerSelect("ca-owner", c.owner_id);
  return h("details", { class: "panel", "data-admin": "char", style: "margin-top:18px" }, h("summary", { class: "muted", style: "cursor:pointer" }, "Verwaltung (nur Storyteller)"),
    h("div", { class: "stack", style: "margin-top:10px" },
      h("div", { class: "row" }, h("div", { class: "field", style: "flex:0 1 320px" }, h("label", { for: "ca-owner" }, "Gehört zu Spieler"), owner),
        h("button", { class: "btn", type: "button", onclick: async () => { await guard(sb.from("characters").update({ owner_id: owner.value || null }).eq("id", c.id), "Zuordnung gespeichert."); await loadChars(); go("chars", { id: c.id }, { replace: true }); } }, "Zuordnung speichern")),
      h("p", { class: "muted" }, "Löschen entfernt den Bogen endgültig. Notizen und Kartenknoten der Person bleiben erhalten."),
      h("div", {}, confirmBtn("Charakter löschen", async () => { await guard(sb.from("characters").delete().eq("id", c.id), "Charakter gelöscht."); await loadChars(); go("chars", null, { replace: true }); }))));
}

async function viewSheet(m, id) {
  const { data: c, error } = await sb.from("characters").select("*").eq("id", id).maybeSingle();
  if (error) { m.append(h("div", { class: "notice bad" }, errMsg(error))); return; }
  if (!c) { m.append(h("p", {}, h("button", { class: "linkbtn", type: "button", onclick: () => go("chars") }, "← Alle Charaktere")), h("div", { class: "empty", style: "margin-top:12px" }, "Dieser Bogen existiert nicht.")); return; }
  const editable = canEdit(c);
  const data = { name: c.name, clan: c.clan };
  const sheet = normSheet(c.sheet);
  let timer = null, pending = false, stamp = c.updated_at, conflict = false;
  const conflictBox = h("div", {});
  const stateEl = h("span", { class: "save-state", role: "status" }, "");
  const title = h("h2", {}, c.name || "Unbenannt");
  const wrap = h("div", {}), diceWrap = h("div", { style: "margin-top:18px" }); // Würfeln steht außerhalb des Bogens: Es bleibt auch in der Ansicht bedienbar und ändert nichts
  // Zwei Modi: Ansicht (Standard, alles gesperrt) und Bearbeitung. Wer den Bogen nicht ändern darf, sieht nur die Ansicht.
  let mode = "view";
  const isEdit = () => editable && mode === "edit";
  const hint = () => !editable ? "Nur Lesen. Bearbeiten können die Person selbst und der Storyteller."
    : mode === "edit" ? "Bearbeitung: Änderungen werden automatisch gespeichert." : "Ansicht: Bearbeiten ist gesperrt. Zum Ändern oben auf „Bearbeitung“ umschalten.";
  const hintEl = h("p", {}, hint());
  const bView = h("button", { type: "button", onclick: () => setMode("view") }, "Ansicht"), bEdit = h("button", { type: "button", onclick: () => setMode("edit") }, "Bearbeitung");
  const modeToggle = editable ? h("div", { class: "toggle", role: "group", "aria-label": "Modus" }, bView, bEdit) : null;
  const paintMode = () => { bView.setAttribute("aria-pressed", String(mode === "view")); bEdit.setAttribute("aria-pressed", String(mode === "edit")); hintEl.textContent = hint(); };
  function setMode(next) { if (next === mode) return; if (next === "view" && pending) flush(); mode = next; paintMode(); draw(); }
  paintMode();
  m.append(h("div", { class: "head" }, h("div", {},
    h("button", { class: "linkbtn", type: "button", onclick: () => go("chars") }, "← Alle Charaktere"), title,
    hintEl), h("div", { class: "row" }, modeToggle, stateEl)), sectionNav(m), conflictBox, wrap, diceWrap);

  // Speichern mit Schutz vor gleichzeitigem Bearbeiten: Geschrieben wird nur, wenn der Bogen seit dem Laden unverändert ist
  // (Vergleich über updated_at). Sonst erscheint ein Hinweis mit "Neu laden" und "Überschreiben".
  async function flush(force) {
    clearTimeout(timer); timer = null;
    if (!pending && !force) return;
    if (conflict && !force) return;
    pending = false;
    stateEl.textContent = "Speichert …";
    let q = sb.from("characters").update({ name: data.name || "", clan: data.clan || "", sheet }).eq("id", id);
    if (!force && stamp) q = q.eq("updated_at", stamp);
    const { data: rows, error } = await q.select("updated_at");
    if (error) { stateEl.textContent = "Nicht gespeichert"; toast(errMsg(error), true); return; }
    if (!rows || !rows.length) {
      conflict = true; pending = true; stateEl.textContent = "Nicht gespeichert";
      conflictBox.replaceChildren(h("div", { class: "notice bad", role: "alert", "data-conflict": "1", style: "margin-bottom:14px" },
        "Dieser Bogen wurde inzwischen von jemand anderem geändert. Deine letzte Änderung ist noch nicht gespeichert. ",
        h("span", { class: "row", style: "margin-top:8px" },
          h("button", { class: "btn small", type: "button", onclick: () => { pending = false; go("chars", { id }, { replace: true }); } }, "Neu laden (meine Änderung verwerfen)"),
          h("button", { class: "btn small danger", type: "button", onclick: async () => { conflict = false; conflictBox.replaceChildren(); await flush(true); } }, "Mit meinem Stand überschreiben"))));
      return;
    }
    stamp = rows[0].updated_at;
    stateEl.textContent = "Gespeichert";
    const local = S.chars.find(x => x.id === id); if (local) Object.assign(local, { name: data.name, clan: data.clan, sheet: JSON.parse(JSON.stringify(sheet)) });
  }
  const save = () => { pending = true; stateEl.textContent = "Ungespeichert …"; clearTimeout(timer); timer = setTimeout(flush, 800); };
  onCleanup(() => { if (pending) flush(); });
  window.addEventListener("beforeunload", flushOnUnload);
  onCleanup(() => window.removeEventListener("beforeunload", flushOnUnload));
  function flushOnUnload(e) { if (pending) { flush(); e.preventDefault(); } }

  const draw = () => { title.textContent = data.name || "Unbenannt"; wrap.replaceChildren(sheetUI(data, sheet, isEdit(), save, draw)); diceWrap.replaceChildren(dicePanel(sheet)); };
  wrap.addEventListener("pick-portrait", async () => {
    // Porträt wählen: ein Bild aus dem Bereich Dokumente (dort hochladen, hier auswählen)
    const { data: docs } = await sb.from("documents").select("id, title, storage_path, content_type, draft");
    const imgs = (docs || []).filter(d => /^image\//.test(d.content_type || "") && !d.draft);
    const sel = h("select", { id: "portrait-doc" }, h("option", { value: "" }, "— kein Bild —"), ...imgs.map(d => h("option", { value: d.id, selected: sheet.portrait && sheet.portrait.id === d.id ? true : null }, d.title)));
    const dlg = h("dialog", {}, h("div", { class: "stack" }, h("h3", {}, "Porträt wählen"),
      h("p", { class: "muted" }, imgs.length ? "Bilder aus dem Bereich Dokumente. Ein neues Bild lädst du dort hoch." : "Im Bereich Dokumente liegt noch kein Bild. Lade dort eines hoch und wähle es dann hier aus."),
      h("div", { class: "field" }, h("label", { for: "portrait-doc" }, "Bild"), sel),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: () => { const d = imgs.find(x => x.id === sel.value); sheet.portrait = d ? { id: d.id, path: d.storage_path } : null; save(); draw(); dlg.close(); dlg.remove(); } }, "Übernehmen"),
        h("button", { class: "btn", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Abbrechen"))));
    document.body.append(dlg); dlg.showModal();
  });
  draw();
  if (S.isST) m.append(charAdmin(c));
}

function dotsUI(val, max, editable, set, label) {
  const d = h("span", { class: "dots", "aria-disabled": editable ? null : "true" });
  for (let i = 0; i < max; i++) d.append(h("button", { type: "button", class: i < val ? "on" : "", "aria-label": (label ? label + ": " : "") + (i + 1) + " Punkte", disabled: editable ? null : true, onclick: () => set(val === i + 1 ? i : i + 1) }));
  return d;
}
const STATES = ["leer", "oberflächlich", "schwer"];
function trackUI(arr, len, editable, set, label) {
  const b = h("span", { class: "boxes" });
  for (let i = 0; i < len; i++) {
    const v = arr[i] | 0;
    b.append(h("button", { type: "button", class: v ? "s" + v : "", title: STATES[v], "aria-label": label + " Kästchen " + (i + 1) + ": " + STATES[v], disabled: editable ? null : true,
      onclick: () => { const a = arr.slice(0, len); while (a.length < len) a.push(0); a[i] = ((a[i] | 0) + 1) % 3; set(a); } }));
  }
  return b;
}

function sheetUI(data, s, ed, save, redraw) {
  const txt = (label, key, obj = s, ph = "") => { const id = "f-" + key; return h("div", { class: "field" }, h("label", { for: id }, label), h("input", { type: "text", id, value: obj[key] || "", placeholder: ph, disabled: ed ? null : true, oninput: e => { obj[key] = e.target.value; save(); } })); };
  const area = (label, key, ph) => { const id = "f-" + key; return h("div", { class: "field" }, h("label", { for: id }, label), h("textarea", { id, placeholder: ph || "", disabled: ed ? null : true, oninput: e => { s[key] = e.target.value; save(); } }, s[key])); };
  const set = fn => { fn(); save(); redraw(); };
  const hmax = (s.attr.Stamina || 0) + 3, wmax = (s.attr.Composure || 0) + (s.attr.Resolve || 0);
  const out = h("div", { class: "sheet" });
  const clanField = txt("Clan", "clan", data); clanField.querySelector("input").setAttribute("list", "clan-list");
  out.append(h("datalist", { id: "clan-list" }, ...CLANS.map(c => h("option", { value: c }))));
  out.append(h("div", { class: "panel stack", "data-sec": "Kopf" },
    s.portrait || ed ? h("div", { class: "row", style: "align-items:center" }, portraitImg(s.portrait, "portrait"),
      ed ? h("button", { class: "btn small", type: "button", onclick: () => out.dispatchEvent(new CustomEvent("pick-portrait", { bubbles: true })) }, s.portrait ? "Porträt ändern" : "Porträt wählen") : null) : null,
    h("div", { class: "row" }, txt("Name", "name", data), clanField, txt("Konzept", "concept"), txt("Prädator-Typ", "predator")),
    h("div", { class: "row" }, txt("Ambition", "ambition"), txt("Desire", "desire"), txt("Erzeuger (Sire)", "sire"), txt("Generation", "generation"))));
  const attrs = h("div", { class: "grid3" });
  for (const [g, l] of ATTR) attrs.append(h("div", {}, h("h4", {}, g), ...l.map(a => h("div", { class: "trait" }, h("span", { class: "name" }, a), dotsUI(s.attr[a], 5, ed, v => set(() => s.attr[a] = v), a)))));
  out.append(h("div", { class: "panel", "data-sec": "Attribute" }, h("h4", {}, "Attribute"), attrs));
  const sk = h("div", { class: "grid3" });
  for (const [g, l] of SKILLS) sk.append(h("div", {}, h("h4", {}, g), ...l.map(k => h("div", { class: "skill" }, h("span", { class: "name" }, k), dotsUI(s.skills[k].v, 5, ed, v => set(() => s.skills[k].v = v), k),
    h("input", { class: "spec", type: "text", id: "spec-" + k.replace(/\s/g, ""), placeholder: "Spezialisierung", value: s.skills[k].spec || "", disabled: ed ? null : true, "aria-label": "Spezialisierung " + k, oninput: e => { s.skills[k].spec = e.target.value; save(); } })))));
  out.append(h("div", { class: "panel", "data-sec": "Fertigkeiten" }, h("h4", {}, "Fertigkeiten"), sk));
  const hum = h("span", { class: "boxes" });
  for (let i = 0; i < 10; i++) hum.append(h("button", { type: "button", class: i < s.humanity ? "hum" : (i >= 10 - s.stains ? "stain" : ""), "aria-label": "Humanity " + (i + 1), disabled: ed ? null : true, onclick: () => set(() => s.humanity = (s.humanity === i + 1 ? i : i + 1)) }));
  const hung = h("span", { class: "boxes" });
  for (let i = 0; i < 5; i++) hung.append(h("button", { type: "button", class: i < s.hunger ? "hunger" : "", "aria-label": "Hunger " + (i + 1), disabled: ed ? null : true, onclick: () => set(() => s.hunger = (s.hunger === i + 1 ? i : i + 1)) }));
  // Zahlenfelder zeichnen den Bogen nicht neu (sonst gehen Fokus und Eingabe im nächsten Feld verloren)
  const xpText = () => "XP frei: " + (s.xpTotal - s.xpSpent), xpFree = h("div", { class: "mono muted" }, xpText());
  const num = (label, key, min, max) => { const id = "n-" + key; return h("div", { class: "field", style: "flex:0 1 110px" }, h("label", { for: id }, label), h("input", { type: "number", id, min, max, value: s[key], disabled: ed ? null : true, onchange: e => { e.target.value = s[key]; }, oninput: e => { s[key] = Math.max(min, Math.min(max, Number(e.target.value) || 0)); xpFree.textContent = xpText(); save(); } })); };
  out.append(h("div", { class: "grid3", "data-sec": "Zustand" },
    h("div", { class: "panel stack" }, h("h4", {}, "Health (" + hmax + ")"), trackUI(s.health, hmax, ed, a => set(() => s.health = a), "Health"), h("h4", {}, "Willpower (" + wmax + ")"), trackUI(s.wp, wmax, ed, a => set(() => s.wp = a), "Willpower"), h("p", { class: "muted", style: "font-size:.82rem" }, "Klick: leer → oberflächlich → schwer. Health = Stamina + 3, Willpower = Composure + Resolve.")),
    h("div", { class: "panel stack" }, h("h4", {}, "Humanity " + s.humanity + " · Stains " + s.stains), hum,
      h("div", { class: "row" }, h("button", { class: "btn small", type: "button", disabled: ed ? null : true, onclick: () => set(() => s.stains = Math.max(0, s.stains - 1)) }, "Stain −"), h("button", { class: "btn small", type: "button", disabled: ed ? null : true, onclick: () => set(() => s.stains = Math.min(10, s.stains + 1)) }, "Stain +")),
      h("h4", {}, "Hunger"), hung),
    h("div", { class: "panel stack" }, h("div", { class: "row" }, num("Blood Potency", "bp", 0, 10), num("XP gesamt", "xpTotal", 0, 9999), num("XP ausgegeben", "xpSpent", 0, 9999)),
      xpFree, txt("Resonanz", "resonance"))));
  const discs = h("div", {});
  s.disc.forEach((d, i) => {
    discs.append(h("div", { class: "disc" },
      h("input", { type: "text", id: "disc-" + i, value: d.name || "", placeholder: "Disziplin", disabled: ed ? null : true, "aria-label": "Disziplin", oninput: e => { d.name = e.target.value; save(); } }),
      dotsUI(d.lvl || 0, 5, ed, v => set(() => d.lvl = v), d.name || "Disziplin"),
      ed ? h("button", { class: "btn small", type: "button", "aria-label": "Disziplin entfernen", onclick: () => set(() => s.disc.splice(i, 1)) }, "✕") : h("span"),
      h("textarea", { id: "discp-" + i, placeholder: "Kräfte, z. B. Awe, Lingering Kiss", disabled: ed ? null : true, oninput: e => { d.powers = e.target.value; save(); } }, d.powers || "")));
  });
  out.append(h("div", { class: "panel", "data-sec": "Disziplinen" }, h("h4", {}, "Disziplinen"), discs, ed ? h("button", { class: "btn small", type: "button", onclick: () => set(() => s.disc.push({ name: "", lvl: 1, powers: "" })) }, "Disziplin hinzufügen") : null));
  // Vorteile, Hintergründe und Nachteile als Einträge mit Punkten (das Freitextfeld darunter bleibt für Altes und Ergänzungen)
  const KINDS = ["Vorteil", "Hintergrund", "Nachteil"];
  const merits = h("div", {});
  s.merits.forEach((mt, i) => merits.append(h("div", { class: "disc merit" },
    h("input", { type: "text", id: "merit-" + i, value: mt.name || "", placeholder: "Name, z. B. Ressourcen", disabled: ed ? null : true, "aria-label": "Vorteil oder Nachteil", oninput: e => { mt.name = e.target.value; save(); } }),
    h("select", { "aria-label": "Art", disabled: ed ? null : true, onchange: e => { mt.kind = e.target.value; save(); } }, ...KINDS.map(k => h("option", { value: k, selected: (mt.kind || "Vorteil") === k ? true : null }, k))),
    dotsUI(mt.dots || 0, 5, ed, v => set(() => mt.dots = v), mt.name || "Vorteil"),
    ed ? h("button", { class: "btn small", type: "button", "aria-label": "Eintrag entfernen", onclick: () => set(() => s.merits.splice(i, 1)) }, "✕") : h("span"))));
  const sum = k => s.merits.filter(x => (x.kind || "Vorteil") === k).reduce((a, x) => a + (x.dots || 0), 0);
  out.append(h("div", { class: "panel stack", "data-sec": "Vorteile" }, h("h4", {}, "Vorteile, Hintergründe, Nachteile"),
    s.merits.length ? h("div", { class: "muted mono", style: "font-size:.86rem" }, KINDS.map(k => k + ": " + sum(k)).join(" · ")) : (ed ? null : h("p", { class: "muted" }, "Noch keine Einträge.")),
    merits, ed ? h("div", {}, h("button", { class: "btn small", type: "button", onclick: () => set(() => s.merits.push({ name: "", kind: "Vorteil", dots: 1 })) }, "Eintrag hinzufügen")) : null));
  // XP-Verlauf: jeder Eintrag verändert "XP gesamt" (erhalten) oder "XP ausgegeben"
  const xpAmount = h("input", { type: "number", id: "xl-amount", min: 1, max: 999, value: 1, style: "max-width:100px" }), xpText2 = h("input", { type: "text", id: "xl-text", placeholder: "wofür, z. B. Auspex 2" });
  const xpKind = h("select", { id: "xl-kind", "aria-label": "Art des Eintrags" }, h("option", { value: "spent" }, "ausgegeben"), h("option", { value: "gained" }, "erhalten"));
  out.append(h("div", { class: "panel stack", "data-sec": "XP" }, h("h4", {}, "XP-Verlauf"),
    s.xplog.length ? h("div", { class: "xplog" }, ...s.xplog.slice().reverse().map((x, ri) => { const i = s.xplog.length - 1 - ri; return h("div", { class: "xprow" },
      h("span", { class: "mono muted" }, x.d ? fmtDate(x.d) : ""), h("span", { class: "mono", style: "text-align:right;color:" + (x.n < 0 ? "var(--bad)" : "var(--ok)") }, (x.n > 0 ? "+" : "") + x.n), h("span", {}, x.t || ""),
      ed ? h("button", { class: "btn small", type: "button", "aria-label": "XP-Eintrag entfernen", onclick: () => set(() => { if (x.n > 0) s.xpTotal = Math.max(0, s.xpTotal - x.n); else s.xpSpent = Math.max(0, s.xpSpent + x.n); s.xplog.splice(i, 1); }) }, "✕") : h("span")); }))
      : h("p", { class: "muted" }, "Noch keine Einträge. Jeder Eintrag rechnet XP gesamt oder XP ausgegeben mit."),
    ed ? h("div", { class: "row" }, h("div", { class: "field", style: "flex:0 1 100px" }, h("label", { for: "xl-amount" }, "XP"), xpAmount), h("div", { class: "field", style: "flex:0 1 150px" }, h("label", { for: "xl-kind" }, "Art"), xpKind), h("div", { class: "field" }, h("label", { for: "xl-text" }, "Wofür"), xpText2),
      h("button", { class: "btn small", type: "button", onclick: () => { const n = Math.floor(Number(xpAmount.value)); if (!(n >= 1 && n <= 999)) { toast("Bitte 1 bis 999 XP eintragen.", true); return; }
        set(() => { const gained = xpKind.value === "gained"; if (gained) s.xpTotal += n; else s.xpSpent += n; s.xplog.push({ d: new Date().toISOString().slice(0, 10), t: xpText2.value.trim(), n: gained ? n : -n }); }); } }, "Eintragen")) : null));
  out.append(h("div", { class: "grid3", "data-sec": "Notizen" }, area("Touchstones & Convictions", "touchstones"), area("Weitere Vorteile & Nachteile (Freitext)", "advantages", "Backgrounds, Merits, Flaws"), area("Notizen", "notes")));
  return out;
}

// Sprungmarken zu den Abschnitten des Bogens (am Handy ist der Bogen lang)
const SECTIONS = ["Kopf", "Attribute", "Fertigkeiten", "Zustand", "Disziplinen", "Vorteile", "XP", "Notizen", "Würfeln"];
function sectionNav(root) {
  return h("nav", { class: "sheet-nav no-swipe", "aria-label": "Abschnitte des Bogens" }, ...SECTIONS.map(n => h("button", { class: "chip", type: "button", onclick: () => {
    const el = root.querySelector('[data-sec="' + n + '"]'); if (el) el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  } }, n)));
}

// Würfeln: Pool aus Attribut + Fertigkeit oder Disziplin + Modifikator, Hunger-Würfel aus dem Bogen. Ändert den Bogen nicht.
function dicePanel(s) {
  const attrs = ATTR.flatMap(([, l]) => l), skills = SKILLS.flatMap(([, l]) => l);
  const a = h("select", { id: "dice-attr", "aria-label": "Attribut" }, ...attrs.map(n => h("option", { value: n }, n + " (" + (s.attr[n] || 0) + ")")));
  const b = h("select", { id: "dice-skill", "aria-label": "Fertigkeit oder Disziplin" }, h("option", { value: "" }, "— ohne —"),
    h("optgroup", { label: "Fertigkeiten" }, ...skills.map(n => h("option", { value: "s:" + n }, n + " (" + (s.skills[n].v || 0) + ")"))),
    s.disc.length ? h("optgroup", { label: "Disziplinen" }, ...s.disc.filter(d => d.name).map(d => h("option", { value: "d:" + d.name }, d.name + " (" + (d.lvl || 0) + ")"))) : null,
    h("optgroup", { label: "Zweites Attribut" }, ...attrs.map(n => h("option", { value: "a:" + n }, n + " (" + (s.attr[n] || 0) + ")"))));
  const mod = h("input", { type: "number", id: "dice-mod", value: 0, min: -10, max: 10, style: "max-width:90px" }), diff = h("input", { type: "number", id: "dice-diff", value: "", min: 0, max: 20, placeholder: "offen", style: "max-width:90px" });
  const poolEl = h("span", { class: "mono", "data-dice-pool": "1" }), out = h("div", { class: "stack", "aria-live": "polite", "data-dice-out": "1" });
  const second = () => { const v = b.value; if (!v) return 0; const n = v.slice(2); return v[0] === "s" ? (s.skills[n].v || 0) : v[0] === "a" ? (s.attr[n] || 0) : ((s.disc.find(d => d.name === n) || {}).lvl || 0); };
  const pool = () => Math.max(1, (s.attr[a.value] || 0) + second() + (Math.floor(Number(mod.value)) || 0));
  const paintPool = () => { const p = pool(); poolEl.textContent = "Pool " + p + " · davon " + Math.min(s.hunger, p) + " Hunger-Würfel"; };
  for (const el of [a, b, mod]) el.addEventListener("input", paintPool);
  let last = null, usedWp = false;
  const dice = (vals, cls, marked) => vals.map((v, i) => h("span", { class: "die " + cls + (v >= 6 ? " hit" : "") + (v === 10 ? " ten" : "") + (cls === "hunger" && v === 1 ? " one" : "") + (marked && marked.includes(i) ? " re" : ""), title: cls === "hunger" ? "Hunger-Würfel" : "normaler Würfel" }, String(v)));
  function show(roll, marked) {
    const d = Math.max(0, Math.floor(Number(diff.value)) || 0), r = evaluate(roll, d);
    const verdict = r.bestial ? "Bestialischer Fehlschlag" : r.messy ? "Messy Critical" : r.critical ? "Kritischer Erfolg" : r.win ? "Erfolg" : r.totalFailure ? "Totaler Fehlschlag" : "Fehlschlag";
    out.replaceChildren(
      h("div", { class: "dice-row" }, ...dice(roll.normal, "normal", marked), ...dice(roll.hunger, "hunger")),
      h("div", {}, h("strong", { "data-dice-verdict": "1" }, verdict), " · " + r.successes + (r.successes === 1 ? " Erfolg" : " Erfolge") + (d ? " gegen Schwierigkeit " + d + " (Differenz " + (r.margin >= 0 ? "+" : "") + r.margin + ")" : "")),
      r.messy ? h("p", { class: "muted" }, "Eine Hunger-Zehn ist Teil des kritischen Erfolgs: Das Tier bestimmt, wie der Erfolg aussieht.") : null,
      r.bestial ? h("p", { class: "muted" }, "Fehlschlag mit einer Hunger-Eins: Das Tier bricht durch (Compulsion).") : null,
      !usedWp && roll.normal.some(v => v < 6) ? h("div", {}, h("button", { class: "btn small", type: "button", onclick: () => { const x = rerollWillpower(last); last = x.roll; usedWp = true; show(last, x.rerolled); } }, "Willenskraft: bis zu drei normale Würfel neu"), h("span", { class: "muted", style: "margin-left:8px;font-size:.86rem" }, "kostet 1 Willpower (oberflächlich), im Bogen selbst eintragen")) : null);
  }
  paintPool();
  return h("div", { class: "panel stack no-print", "data-sec": "Würfeln" }, h("h4", {}, "Würfeln"),
    h("div", { class: "row" }, h("div", { class: "field" }, h("label", { for: "dice-attr" }, "Attribut"), a), h("div", { class: "field" }, h("label", { for: "dice-skill" }, "Fertigkeit oder Disziplin"), b),
      h("div", { class: "field", style: "flex:0 1 90px" }, h("label", { for: "dice-mod" }, "Modifikator"), mod), h("div", { class: "field", style: "flex:0 1 90px" }, h("label", { for: "dice-diff" }, "Schwierigkeit"), diff)),
    h("div", { class: "row", style: "align-items:center" }, h("button", { class: "btn primary", type: "button", onclick: () => { last = rollPool(pool(), s.hunger); usedWp = false; show(last); } }, "Würfeln"),
      h("button", { class: "btn", type: "button", onclick: () => { const v = d10(); out.replaceChildren(h("div", { class: "dice-row" }, h("span", { class: "die hunger" + (v >= 6 ? " hit" : "") }, String(v))), h("div", {}, h("strong", { "data-dice-verdict": "1" }, v >= 6 ? "Rouse Check bestanden" : "Rouse Check misslungen"), v >= 6 ? " · Hunger bleibt" : " · Hunger steigt um 1 (im Bogen eintragen)")); } }, "Rouse Check"), poolEl),
    out, h("p", { class: "muted", style: "font-size:.86rem" }, "Gewürfelt wird nur für dich, die anderen sehen das Ergebnis nicht. Der Bogen wird dabei nicht verändert."));
}
