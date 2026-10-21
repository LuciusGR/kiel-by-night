// Kiel by Night · Charakterbögen (V5, Trait-Namen nach Corebook)
import { h, toast, errMsg, head } from "../lib.js";
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
  s.health = Array.isArray(s.health) ? s.health : []; s.wp = Array.isArray(s.wp) ? s.wp : [];
  const humMissing = s.humanity == null || s.humanity === "";
  for (const k of ["hunger", "humanity", "stains", "bp", "xpTotal", "xpSpent"]) s[k] = Number(s[k] || 0);
  if (humMissing) s.humanity = 7;
  for (const k of ["concept", "ambition", "desire", "predator", "sire", "generation", "resonance", "touchstones", "advantages", "notes"]) s[k] = s[k] || "";
  return s;
}

export const canEdit = c => S.isST || (c.owner_id && c.owner_id === S.user.id);

function staticBoxes(n, cls) { const b = h("span", { class: "boxes" }); for (let i = 0; i < n; i++) b.append(h("span", { class: cls(i) })); return b; }

export function pcCard(c) {
  const sh = normSheet(c.sheet);
  const hmax = (sh.attr.Stamina || 1) + 3;
  return h("button", { class: "pc", type: "button", onclick: () => go("chars", { id: c.id }) },
    h("span", { class: "eyebrow" }, [c.clan || "Clan offen", c.owner_id ? personName(c.owner_id) : "ohne Spieler"].join(" · ")),
    h("h3", {}, c.name || "Unbenannt"),
    h("div", { class: "row", style: "gap:16px" },
      h("div", {}, h("div", { class: "eyebrow" }, "Hunger"), staticBoxes(5, i => i < sh.hunger ? "hunger" : "")),
      h("div", {}, h("div", { class: "eyebrow" }, "Health"), staticBoxes(hmax, i => { const v = (sh.health || [])[i] | 0; return v ? "s" + v : ""; }))));
}

registerView("chars", async m => {
  if (S.arg && S.arg.id) return viewSheet(m, S.arg.id);
  await loadChars();
  m.append(head("Charaktere", "Alle Bögen sind für die ganze Gruppe sichtbar. Bearbeiten können die jeweilige Person und der Storyteller."));
  const cards = h("div", { class: "cards" });
  for (const c of S.chars) cards.append(pcCard(c));
  if (!S.chars.length) cards.append(h("div", { class: "empty" }, "Noch keine Charaktere."));
  m.append(cards);
});

async function viewSheet(m, id) {
  const { data: c, error } = await sb.from("characters").select("*").eq("id", id).maybeSingle();
  if (error) { m.append(h("div", { class: "notice bad" }, errMsg(error))); return; }
  if (!c) { m.append(h("div", { class: "empty" }, "Dieser Bogen existiert nicht.")); return; }
  const editable = canEdit(c);
  const data = { name: c.name, clan: c.clan };
  const sheet = normSheet(c.sheet);
  let timer = null, pending = false;
  const stateEl = h("span", { class: "save-state", role: "status" }, "");
  const title = h("h2", {}, c.name || "Unbenannt");
  const wrap = h("div", {});
  m.append(h("div", { class: "head" }, h("div", {},
    h("button", { class: "linkbtn", type: "button", onclick: () => go("chars") }, "← Alle Charaktere"), title,
    h("p", {}, editable ? "Änderungen werden automatisch gespeichert." : "Nur Lesen. Bearbeiten können die Person selbst und der Storyteller.")), stateEl), wrap);

  async function flush() {
    clearTimeout(timer); timer = null;
    if (!pending) return;
    pending = false;
    stateEl.textContent = "Speichert …";
    const { error } = await sb.from("characters").update({ name: data.name || "", clan: data.clan || "", sheet }).eq("id", id);
    if (error) { stateEl.textContent = "Nicht gespeichert"; toast(errMsg(error), true); return; }
    stateEl.textContent = "Gespeichert";
    const local = S.chars.find(x => x.id === id); if (local) Object.assign(local, { name: data.name, clan: data.clan, sheet: JSON.parse(JSON.stringify(sheet)) });
  }
  const save = () => { pending = true; stateEl.textContent = "Ungespeichert …"; clearTimeout(timer); timer = setTimeout(flush, 800); };
  onCleanup(() => { if (pending) flush(); });
  window.addEventListener("beforeunload", flushOnUnload);
  onCleanup(() => window.removeEventListener("beforeunload", flushOnUnload));
  function flushOnUnload(e) { if (pending) { flush(); e.preventDefault(); } }

  const draw = () => { title.textContent = data.name || "Unbenannt"; wrap.replaceChildren(sheetUI(data, sheet, editable, save, draw)); };
  draw();
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
  out.append(h("div", { class: "panel stack" },
    h("div", { class: "row" }, txt("Name", "name", data), txt("Clan", "clan", data), txt("Konzept", "concept"), txt("Prädator-Typ", "predator")),
    h("div", { class: "row" }, txt("Ambition", "ambition"), txt("Desire", "desire"), txt("Erzeuger (Sire)", "sire"), txt("Generation", "generation"))));
  const attrs = h("div", { class: "grid3" });
  for (const [g, l] of ATTR) attrs.append(h("div", {}, h("h4", {}, g), ...l.map(a => h("div", { class: "trait" }, h("span", { class: "name" }, a), dotsUI(s.attr[a], 5, ed, v => set(() => s.attr[a] = v), a)))));
  out.append(h("div", { class: "panel" }, h("h4", {}, "Attribute"), attrs));
  const sk = h("div", { class: "grid3" });
  for (const [g, l] of SKILLS) sk.append(h("div", {}, h("h4", {}, g), ...l.map(k => h("div", { class: "skill" }, h("span", { class: "name" }, k), dotsUI(s.skills[k].v, 5, ed, v => set(() => s.skills[k].v = v), k),
    h("input", { class: "spec", type: "text", id: "spec-" + k.replace(/\s/g, ""), placeholder: "Spezialisierung", value: s.skills[k].spec || "", disabled: ed ? null : true, "aria-label": "Spezialisierung " + k, oninput: e => { s.skills[k].spec = e.target.value; save(); } })))));
  out.append(h("div", { class: "panel" }, h("h4", {}, "Fertigkeiten"), sk));
  const hum = h("span", { class: "boxes" });
  for (let i = 0; i < 10; i++) hum.append(h("button", { type: "button", class: i < s.humanity ? "hum" : (i >= 10 - s.stains ? "stain" : ""), "aria-label": "Humanity " + (i + 1), disabled: ed ? null : true, onclick: () => set(() => s.humanity = (s.humanity === i + 1 ? i : i + 1)) }));
  const hung = h("span", { class: "boxes" });
  for (let i = 0; i < 5; i++) hung.append(h("button", { type: "button", class: i < s.hunger ? "hunger" : "", "aria-label": "Hunger " + (i + 1), disabled: ed ? null : true, onclick: () => set(() => s.hunger = (s.hunger === i + 1 ? i : i + 1)) }));
  // Zahlenfelder zeichnen den Bogen nicht neu (sonst gehen Fokus und Eingabe im nächsten Feld verloren)
  const xpText = () => "XP frei: " + (s.xpTotal - s.xpSpent), xpFree = h("div", { class: "mono muted" }, xpText());
  const num = (label, key, min, max) => { const id = "n-" + key; return h("div", { class: "field", style: "flex:0 1 110px" }, h("label", { for: id }, label), h("input", { type: "number", id, min, max, value: s[key], disabled: ed ? null : true, onchange: e => { e.target.value = s[key]; }, oninput: e => { s[key] = Math.max(min, Math.min(max, Number(e.target.value) || 0)); xpFree.textContent = xpText(); save(); } })); };
  out.append(h("div", { class: "grid3" },
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
  out.append(h("div", { class: "panel" }, h("h4", {}, "Disziplinen"), discs, ed ? h("button", { class: "btn small", type: "button", onclick: () => set(() => s.disc.push({ name: "", lvl: 1, powers: "" })) }, "Disziplin hinzufügen") : null));
  out.append(h("div", { class: "grid3" }, area("Touchstones & Convictions", "touchstones"), area("Vorteile & Nachteile", "advantages", "Backgrounds, Merits, Flaws"), area("Notizen", "notes")));
  return out;
}
