// Kiel by Night · Szenenkarten (nur Storyteller): Karten je Session, Import aus JSON mit Vorschau, NPC-Verknüpfung zur ST-Karte
import { h, toast, guard, confirmBtn } from "../lib.js";
import { sb, go } from "../core.js";

export const SCENE_FORMAT = "kbn-scenes/1";
export const STATUS = { open: "Offen", played: "Gespielt", skipped: "Übersprungen", postponed: "Verschoben" };
const MAX_SCENES = 100, MAX_TEXT = 20000;

// ---------- Format prüfen und normalisieren ----------
// Gibt { errors: [...], data: { session, chronicle, scenes: [...] } } zurück. Bei Fehlern wird nichts importiert.
export function parseScenes(text) {
  const errors = [];
  let j;
  try { j = JSON.parse(text); } catch (_) { return { errors: ["Die Datei ist kein gültiges JSON."], data: null }; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { errors: ["Die Datei muss ein JSON-Objekt sein."], data: null };
  if (j.format !== SCENE_FORMAT) errors.push("Unbekanntes Format: erwartet \"" + SCENE_FORMAT + "\"" + (j.format ? ", gefunden \"" + String(j.format).slice(0, 40) + "\"." : "."));
  if (!Number.isInteger(j.session) || j.session < 1) errors.push("\"session\" muss eine ganze Zahl ab 1 sein.");
  if (!Array.isArray(j.szenen) || !j.szenen.length) errors.push("\"szenen\" muss eine Liste mit mindestens einer Szene sein.");
  else if (j.szenen.length > MAX_SCENES) errors.push("Zu viele Szenen (höchstens " + MAX_SCENES + ").");
  if (errors.length) return { errors, data: null };

  const str = (v, path, req) => {
    if (v == null || v === "") { if (req) errors.push(path + " fehlt."); return ""; }
    if (typeof v !== "string") { errors.push(path + " muss Text sein."); return ""; }
    if (v.length > MAX_TEXT) { errors.push(path + " ist zu lang (höchstens " + MAX_TEXT + " Zeichen)."); return ""; }
    return v.trim();
  };
  const list = (v, path) => {
    if (v == null) return [];
    if (!Array.isArray(v) || v.some(x => typeof x !== "string")) { errors.push(path + " muss eine Liste aus Text sein."); return []; }
    return v.map(x => x.trim()).filter(Boolean).slice(0, 50);
  };
  const scenes = j.szenen.map((s, i) => {
    const p = "Szene " + (i + 1);
    if (!s || typeof s !== "object" || Array.isArray(s)) { errors.push(p + " ist kein Objekt."); return null; }
    const npcs = [];
    if (s.npcs != null) {
      if (!Array.isArray(s.npcs)) errors.push(p + ": \"npcs\" muss eine Liste sein.");
      else s.npcs.slice(0, 50).forEach((n, k) => {
        if (typeof n === "string") { if (n.trim()) npcs.push({ name: n.trim(), motivation: "" }); }
        else if (n && typeof n === "object" && !Array.isArray(n)) {
          const name = str(n.name, p + ", NPC " + (k + 1) + ": \"name\"", true), motivation = str(n.motivation, p + ", NPC " + (k + 1) + ": \"motivation\"");
          if (name) npcs.push({ name, motivation });
        } else errors.push(p + ", NPC " + (k + 1) + " muss Text oder ein Objekt mit \"name\" sein.");
      });
    }
    const order = s.reihenfolge == null ? null : s.reihenfolge;
    if (order != null && !Number.isInteger(order)) errors.push(p + ": \"reihenfolge\" muss eine ganze Zahl sein.");
    return {
      title: str(s.titel, p + ": \"titel\"", true), place: str(s.ort, p + ": \"ort\""), mood: str(s.stimmung, p + ": \"stimmung\""),
      goal: str(s.ziel, p + ": \"ziel\""), antagonist: str(s.gegenspieler, p + ": \"gegenspieler\""),
      outcomes: list(s.ausgaenge, p + ": \"ausgaenge\""), threads: list(s.faeden, p + ": \"faeden\""),
      body: str(s.text, p + ": \"text\""), details: str(s.details, p + ": \"details\""), npcs, order: Number.isInteger(order) ? order : null, idx: i,
    };
  });
  if (errors.length) return { errors, data: null };
  scenes.sort((a, b) => ((a.order ?? a.idx + 1) - (b.order ?? b.idx + 1)) || (a.idx - b.idx));
  return { errors: [], data: { session: j.session, chronicle: typeof j.chronik === "string" ? j.chronik.trim() : "", scenes } };
}

// ---------- NPCs der ST-Karte (aus dem Notion-Cache der Edge Function) ----------
let npcCache = null;
export function resetNpcCache() { npcCache = null; }
export async function loadNotionNpcs() {
  if (npcCache) return npcCache;
  let list = [];
  try {
    const { data, error } = await sb.functions.invoke("notion-proxy", { body: { refresh: false } });
    if (error || !data) throw error || new Error("leer");
    list = (data.npcs || []).filter(r => r.id).map(r => ({ id: r.id, name: r.name || r.label || "", label: r.label || "" })).filter(n => n.name);
  } catch (_) { toast("NPCs aus Notion nicht erreichbar: Namen werden ohne Verknüpfung gespeichert.", true); }
  npcCache = list;
  return list;
}
// exakter Treffer auf Name oder Alias (Map-Label); sonst ein eindeutiger Teiltreffer
export function matchNpc(name, npcs) {
  const q = String(name || "").trim().toLowerCase();
  if (!q) return null;
  const exact = npcs.filter(n => n.name.toLowerCase() === q || n.label.toLowerCase() === q);
  if (exact.length) return { id: exact[0].id, name: exact[0].name, exact: true };
  const part = npcs.filter(n => n.name.toLowerCase().includes(q) || n.label.toLowerCase().includes(q));
  return part.length === 1 ? { id: part[0].id, name: part[0].name, exact: false } : null;
}

// ---------- Daten ----------
async function loadScenes(session) {
  const [s, n] = await Promise.all([sb.from("scenes").select("*").eq("session_number", session), sb.from("scene_npcs").select("*")]);
  if (s.error || n.error) throw s.error || n.error;
  const scenes = s.data.sort((a, b) => (a.position - b.position) || (Date.parse(a.created_at) - Date.parse(b.created_at)));
  return scenes.map(sc => ({ ...sc, npcs: n.data.filter(x => x.scene_id === sc.id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) }));
}
async function insertScene(session, sc, position) {
  const row = await guard(sb.from("scenes").insert({
    session_number: session, position, title: sc.title, place: sc.place, mood: sc.mood, goal: sc.goal, antagonist: sc.antagonist,
    outcomes: sc.outcomes, threads: sc.threads, body: sc.body, details: sc.details,
  }).select("id").single());
  if (sc.npcs.length) await guard(sb.from("scene_npcs").insert(sc.npcs.map(n => ({ scene_id: row.id, notion_id: n.notion_id || "", name: n.name, motivation: n.motivation || "" }))));
  return row.id;
}

// "Kommt vor in" für die ST-Karte: alle Szenen, in denen die Notion-ID verknüpft ist
export async function sceneMentions(notionId) {
  const [n, s] = await Promise.all([sb.from("scene_npcs").select("*").eq("notion_id", notionId), sb.from("scenes").select("id, session_number, position, title")]);
  if (n.error || s.error) return [];
  return n.data.map(x => ({ npc: x, scene: s.data.find(y => y.id === x.scene_id) })).filter(x => x.scene)
    .sort((a, b) => (b.scene.session_number - a.scene.session_number) || (a.scene.position - b.scene.position));
}

// ---------- Block in der Session-Ansicht ----------
export function sceneBlock(session) {
  const root = h("section", { class: "panel stack", "aria-labelledby": "scenes-h" });
  let scenes = [], editing = null, importing = null, busy = false;

  async function reload() {
    try { scenes = await loadScenes(session); } catch (e) { root.replaceChildren(h("div", { class: "notice bad" }, "Szenenkarten konnten nicht geladen werden.")); return false; }
    return true;
  }
  async function refresh() { if (await reload()) draw(); }

  async function setStatus(sc, status) { await guard(sb.from("scenes").update({ status }).eq("id", sc.id)); await refresh(); }
  async function move(i, dir) {
    const j = i + dir; if (j < 0 || j >= scenes.length) return;
    const order = scenes.slice(); [order[i], order[j]] = [order[j], order[i]];
    for (let k = 0; k < order.length; k++) if (order[k].position !== k + 1) await guard(sb.from("scenes").update({ position: k + 1 }).eq("id", order[k].id));
    await refresh();
  }

  function npcChip(n) {
    const linked = !!n.notion_id;
    const label = h("span", {}, n.name);
    const chip = linked
      ? h("button", { class: "chip", type: "button", title: "Auf der ST-Karte zeigen", onclick: () => go("st", { tab: "map", focus: n.notion_id }) }, label)
      : h("span", { class: "chip", title: "Nicht mit der ST-Karte verknüpft", style: "cursor:default;border-style:dashed" }, label);
    return chip;
  }

  function card(sc, i) {
    const kv = [["Ort", sc.place], ["Stimmung", sc.mood], ["Ziel", sc.goal], ["Gegenspieler", sc.antagonist]].filter(([, v]) => v);
    const body = h("div", { class: "stack", style: "margin-top:10px" },
      kv.length ? h("dl", { class: "kv" }, ...kv.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null,
      sc.npcs.length ? h("div", {}, h("h4", { class: "eyebrow", style: "margin:0 0 6px" }, "NPCs und Motivation"),
        h("div", { class: "conn" }, ...sc.npcs.map(n => h("div", { class: "c" }, npcChip(n), n.motivation ? h("div", { class: "muted" }, n.motivation) : null)))) : null,
      sc.outcomes.length ? h("div", {}, h("h4", { class: "eyebrow", style: "margin:0 0 6px" }, "Mögliche Ausgänge"), h("ul", { style: "margin:0;padding-left:20px" }, ...sc.outcomes.map(o => h("li", {}, o)))) : null,
      sc.body ? h("div", { class: "pre" }, sc.body) : null,
      sc.details ? h("details", {}, h("summary", { class: "muted", style: "cursor:pointer" }, "Weitere Details und Infos"), h("div", { class: "pre", style: "margin-top:6px" }, sc.details)) : null,
      sc.threads.length ? h("div", { class: "chips" }, ...sc.threads.map(t => h("span", { class: "badge st" }, t))) : null,
      h("div", { class: "row" },
        h("div", { class: "toggle wrap", role: "group", "aria-label": "Status der Szene" }, ...Object.entries(STATUS).map(([k, l]) => h("button", { type: "button", "aria-pressed": String(sc.status === k), onclick: () => setStatus(sc, k) }, l))),
        h("button", { class: "btn small", type: "button", "aria-label": "Szene nach oben", disabled: i === 0, onclick: () => move(i, -1) }, "↑"),
        h("button", { class: "btn small", type: "button", "aria-label": "Szene nach unten", disabled: i === scenes.length - 1, onclick: () => move(i, 1) }, "↓"),
        h("button", { class: "btn small", type: "button", onclick: () => { editing = sc; draw(); } }, "Bearbeiten"),
        confirmBtn("Löschen", async () => { await guard(sb.from("scenes").delete().eq("id", sc.id), "Gelöscht."); await refresh(); })));
    return h("details", { class: "panel", open: scenes.length === 1 ? true : null, "data-scene": sc.id },
      h("summary", { style: "cursor:pointer" }, h("strong", {}, (i + 1) + ". " + sc.title), " ", h("span", { class: sc.status === "open" ? "badge" : "badge st" }, STATUS[sc.status]), sc.place ? h("span", { class: "muted" }, " · " + sc.place) : null), body);
  }

  // ---------- Bearbeiten / Neu ----------
  function editor(sc) {
    const f = (id, label, val, tag = "input") => h("div", { class: "field" }, h("label", { for: id }, label), tag === "input" ? h("input", { type: "text", id, value: val || "" }) : h("textarea", { id }, val || ""));
    const npcRows = h("div", { class: "stack" });
    const rows = [];
    const addRow = (n = {}) => {
      const name = h("input", { type: "text", "aria-label": "NPC-Name", value: n.name || "", placeholder: "Name" }), mot = h("input", { type: "text", "aria-label": "Motivation", value: n.motivation || "", placeholder: "Motivation in dieser Szene" });
      const r = { name, mot, notion_id: n.notion_id || "", el: null };
      r.el = h("div", { class: "row" }, h("div", { class: "field" }, name), h("div", { class: "field", style: "flex:2 1 220px" }, mot), h("button", { class: "btn small", type: "button", "aria-label": "NPC entfernen", onclick: () => { rows.splice(rows.indexOf(r), 1); r.el.remove(); } }, "×"));
      rows.push(r); npcRows.append(r.el);
    };
    (sc.npcs || []).forEach(addRow);
    const get = id => document.getElementById(id).value;
    return h("div", { class: "panel stack" }, h("h3", {}, sc.id ? "Szene bearbeiten" : "Neue Szene"),
      f("sc-title", "Titel", sc.title), f("sc-place", "Ort", sc.place), f("sc-mood", "Grundstimmung", sc.mood), f("sc-goal", "Ziel", sc.goal), f("sc-ant", "Gegenspieler", sc.antagonist),
      h("div", {}, h("h4", { class: "eyebrow", style: "margin:0 0 6px" }, "NPCs und Motivation"), npcRows, h("button", { class: "btn small", type: "button", style: "margin-top:8px", onclick: () => addRow() }, "NPC hinzufügen")),
      f("sc-out", "Mögliche Ausgänge (eine Zeile je Ausgang)", (sc.outcomes || []).join("\n"), "ta"), f("sc-thr", "Fäden (durch Komma getrennt)", (sc.threads || []).join(", ")),
      f("sc-body", "Ablauf", sc.body, "ta"), f("sc-det", "Weitere Details und Infos", sc.details, "ta"),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: async () => {
          const title = get("sc-title").trim(); if (!title) { toast("Bitte einen Titel eintragen.", true); return; }
          const npcsAll = await loadNotionNpcs();
          const npcs = rows.map(r => {
            const name = r.name.value.trim(); if (!name) return null;
            let id = r.notion_id;
            if (!id) { const m = matchNpc(name, npcsAll); if (m) id = m.id; }
            return { name, motivation: r.mot.value.trim(), notion_id: id || "" };
          }).filter(Boolean);
          const lines = s => s.split("\n").map(x => x.trim()).filter(Boolean);
          const fields = { title, place: get("sc-place").trim(), mood: get("sc-mood").trim(), goal: get("sc-goal").trim(), antagonist: get("sc-ant").trim(), outcomes: lines(get("sc-out")), threads: get("sc-thr").split(",").map(x => x.trim()).filter(Boolean), body: get("sc-body"), details: get("sc-det") };
          if (sc.id) {
            await guard(sb.from("scenes").update(fields).eq("id", sc.id));
            await guard(sb.from("scene_npcs").delete().eq("scene_id", sc.id));
            if (npcs.length) await guard(sb.from("scene_npcs").insert(npcs.map(n => ({ scene_id: sc.id, ...n }))));
            toast("Gespeichert.");
          } else { await insertScene(session, { ...fields, npcs }, scenes.length + 1); toast("Szene angelegt."); }
          editing = null; await refresh();
        } }, "Speichern"),
        h("button", { class: "btn", type: "button", onclick: () => { editing = null; draw(); } }, "Abbrechen")));
  }

  // ---------- Import ----------
  function importDialog() {
    const file = h("input", { type: "file", id: "sc-file", accept: ".json,application/json", "aria-label": "Szenen-Datei" });
    const out = h("div", { class: "stack" });
    file.addEventListener("change", async () => {
      out.replaceChildren(); importing = null;
      const f = file.files && file.files[0]; if (!f) return;
      if (f.size > 2 * 1024 * 1024) { out.append(h("div", { class: "notice bad" }, "Die Datei ist zu groß (höchstens 2 MB).")); return; }
      const { errors, data } = parseScenes(await f.text());
      if (errors.length) { out.append(h("div", { class: "notice bad" }, h("strong", {}, "Import nicht möglich. Es wurde nichts gespeichert."), h("ul", { style: "margin:6px 0 0;padding-left:20px" }, ...errors.slice(0, 12).map(e => h("li", {}, e))))); return; }
      const npcs = await loadNotionNpcs();
      const existing = new Set(scenes.map(s => s.title.trim().toLowerCase()));
      const items = data.scenes.map(sc => ({ sc, include: !existing.has(sc.title.toLowerCase()), dup: existing.has(sc.title.toLowerCase()),
        npcs: sc.npcs.map(n => { const m = matchNpc(n.name, npcs); return { ...n, notion_id: m ? m.id : "", matched: m ? m.name : "", exact: m ? m.exact : false }; }) }));
      importing = { session: data.session, items };
      renderPreview(out, npcs);
    });
    return h("div", { class: "panel stack" }, h("h3", {}, "Szenen importieren"),
      h("p", { class: "muted" }, "Datei im Format " + SCENE_FORMAT + " (JSON). Vorhandene Szenen bleiben unverändert, neue werden angehängt."),
      h("div", { class: "field" }, h("label", { for: "sc-file" }, "Datei wählen"), file), out,
      h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: () => { importing = null; draw(); } }, "Schließen")));
  }
  function renderPreview(out, npcs) {
    const { items } = importing;
    const todo = items.filter(x => x.include);
    const unlinked = items.reduce((a, x) => a + (x.include ? x.npcs.filter(n => !n.notion_id).length : 0), 0);
    out.replaceChildren(
      h("div", { role: "status", class: "notice" }, "Vorschau: " + items.length + " Szenen in der Datei, " + todo.length + " werden importiert." + (importing.session !== session ? " Achtung: Die Datei gehört zu Session " + importing.session + ", importiert wird in Session " + session + "." : "")),
      ...items.map((it, k) => h("div", { class: "panel stack", "data-import": String(k) },
        h("label", { class: "row", style: "align-items:center;gap:8px" }, h("input", { type: "checkbox", checked: it.include ? true : null, style: "width:auto", "aria-label": "Szene importieren: " + it.sc.title, onchange: e => { it.include = e.target.checked; renderPreview(out, npcs); } }),
          h("strong", {}, it.sc.title), it.dup ? h("span", { class: "badge st" }, "Titel gibt es schon") : null),
        it.sc.place || it.sc.mood ? h("div", { class: "muted" }, [it.sc.place, it.sc.mood].filter(Boolean).join(" · ")) : null,
        it.npcs.length ? h("div", { class: "conn" }, ...it.npcs.map(n => {
          const sel = h("select", { "aria-label": "Verknüpfung für " + n.name }, h("option", { value: "" }, "— nicht verknüpfen —"), ...npcs.slice().sort((a, b) => a.name.localeCompare(b.name, "de")).map(x => h("option", { value: x.id, selected: x.id === n.notion_id ? true : null }, x.name)));
          sel.addEventListener("change", () => { n.notion_id = sel.value; n.matched = (npcs.find(x => x.id === sel.value) || {}).name || ""; n.exact = !!sel.value; renderPreview(out, npcs); });
          return h("div", { class: "c" }, h("strong", {}, n.name), n.motivation ? h("span", { class: "muted" }, " · " + n.motivation) : null, " ",
            n.notion_id ? h("span", { class: "badge" }, (n.exact ? "verknüpft: " : "ähnlich: ") + n.matched) : h("span", { class: "badge st" }, "nicht verknüpft"), " ", npcs.length ? sel : null);
        })) : null)),
      unlinked ? h("div", { class: "notice" }, unlinked + " NPC(s) sind nicht mit der ST-Karte verknüpft. Sie werden trotzdem mit Namen gespeichert und lassen sich später beim Bearbeiten verknüpfen.") : null,
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", disabled: !todo.length || busy ? true : null, onclick: async ev => {
        busy = true; ev.target.disabled = true;
        try {
          let pos = scenes.reduce((m, s) => Math.max(m, s.position), 0);
          for (const it of todo) await insertScene(session, { ...it.sc, npcs: it.npcs }, ++pos);
          toast(todo.length + (todo.length === 1 ? " Szene importiert." : " Szenen importiert."));
          importing = null; busy = false; await refresh();
        } catch (_) { busy = false; ev.target.disabled = false; toast("Import abgebrochen. Bereits angelegte Szenen bleiben bestehen.", true); await refresh(); }
      } }, todo.length === 1 ? "1 Szene importieren" : todo.length + " Szenen importieren")));
  }

  function draw() {
    root.replaceChildren(
      h("div", { class: "row", style: "align-items:center" }, h("div", { style: "flex:1 1 200px" }, h("span", { class: "badge st" }, "Nur Storyteller"), h("h3", { id: "scenes-h", style: "margin-top:4px" }, "Szenenkarten"), h("p", { class: "muted" }, "Vorbereitung für diese Session. Spieler sehen nichts davon.")),
        h("button", { class: "btn", type: "button", onclick: () => { importing = {}; editing = null; draw(); } }, "Szenen importieren"),
        h("button", { class: "btn", type: "button", onclick: () => { editing = { id: null, npcs: [] }; importing = null; draw(); } }, "Neue Szene")),
      importing ? importDialog() : null,
      editing ? editor(editing) : null,
      ...(scenes.length ? scenes.map(card) : [h("div", { class: "empty" }, "Noch keine Szenenkarten für diese Session.")]));
  }

  refresh();
  return root;
}
