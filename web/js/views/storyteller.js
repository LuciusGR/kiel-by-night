// Kiel by Night · Storyteller-Bereich: ST-Karte aus Notion (über Edge Function notion-proxy) + private Spielernotizen
import { h, toast, head, fmtDate, fmtDateTime } from "../lib.js";
import { sb, S, go, registerView, personName, charOf } from "../core.js";
import { MapView, shapeForSekte, normType } from "./map.js";
import { savePositions, loadPositions } from "./playermap.js";
import { sceneMentions } from "./scenes.js";
import { docLinksBox } from "./doclinks.js";

registerView("st", async m => {
  if (!S.isST) { m.append(h("div", { class: "notice bad" }, "Dieser Bereich ist nur für den Storyteller.")); return; }
  const tab = (S.arg && S.arg.tab) || "map";
  const tg = h("div", { class: "toggle", role: "group", "aria-label": "Storyteller-Bereich" },
    ...[["map", "Beziehungskarte"], ["private", "Private Spielernotizen"]].map(([k, l]) => h("button", { type: "button", "aria-pressed": String(tab === k), onclick: () => go("st", { tab: k }) }, l)));
  const body = h("div", {});
  m.append(head("Storyteller", "Nur für dich sichtbar. Die Karte liest aus Notion (NPCs, Beziehungen) und wird zwischengespeichert; „Aus Notion neu laden“ holt den aktuellen Stand.", tg), body);
  if (tab === "private") return stPrivate(body);
  MapView(body, notionSource(S.arg && S.arg.focus));
});

async function stPrivate(root) {
  const { data, error } = await sb.from("private_notes").select("*").order("updated_at", { ascending: false });
  if (error) { root.append(h("div", { class: "notice bad" }, "Private Notizen konnten nicht geladen werden.")); return; }
  const players = [...S.profiles.values()].filter(p => p.role !== "st");
  if (!players.length) { root.append(h("div", { class: "empty" }, "Noch keine Spielerkonten.")); return; }
  for (const p of players) {
    const c = charOf(p.id);
    const mine = data.filter(n => n.owner_id === p.id);
    root.append(h("div", { class: "panel stack", style: "margin-bottom:14px" },
      h("h3", {}, (c ? c.name : personName(p.id)) + " ", h("span", { class: "muted", style: "font-size:1rem" }, personName(p.id))),
      ...(mine.length ? mine.map(x => h("details", {}, h("summary", { style: "cursor:pointer" }, (x.title || "Ohne Titel") + " · " + fmtDate(x.updated_at)), h("div", { class: "pre", style: "margin-top:6px" }, x.body)))
        : [h("p", { class: "muted" }, "Keine privaten Notizen.")])));
  }
}

// ---------- Notion → Graph ----------
const DIR = { gerichtet: "directed", wechselseitig: "mutual", ungerichtet: "undirected" };
const splitPipes = s => String(s || "").split(/\\?\|/).map(x => x.trim()).filter(Boolean); // maskierte Pipes "\|"
const brToNl = s => String(s || "").replace(/<br\s*\/?>/gi, "\n");                            // Umlaute bewusst NICHT korrigieren

export function buildGraph(payload) {
  const nodes = new Map(), byLabel = new Map();
  for (const r of payload.npcs || []) {
    if (!r.id) continue;
    const tags = splitPipes(r.tags);
    const n = {
      label: r.name || r.label || "?", alt: r.label || "", type: normType(r.wesen), cat: r.kategorie || "", tags,
      description: brToNl(r.notes), dead: r.status === "Tot", pc: tags.includes("Player Character"),
      shape: shapeForSekte(r.sekte), raw: r,
    };
    nodes.set(r.id, n);
    if (n.alt) byLabel.set(n.alt.toLowerCase(), r.id);
    byLabel.set(n.label.toLowerCase(), r.id);
  }
  const endpoint = (ids, label) => {
    const u = (ids || [])[0]; if (u && nodes.has(u)) return u;
    const l = String(label || "").trim(); if (!l) return null;
    const k = byLabel.get(l.toLowerCase()); if (k) return k;
    const pid = "lbl:" + l;
    if (!nodes.has(pid)) nodes.set(pid, { label: l, type: "Ohne NPC-Eintrag", tags: [], shape: "ellipse", description: "Kommt nur als Endpunkt in „Beziehungen“ vor (Ort, Organisation oder fehlender NPC-Eintrag).", raw: null });
    return pid;
  };
  const edges = new Map();
  for (const r of payload.rels || []) {
    const from = endpoint(r.vonIds, r.von), to = endpoint(r.nachIds, r.nach);
    if (!from || !to || from === to) continue;
    const title = String(r.title || ""); const ci = title.indexOf(": ");
    edges.set(r.id || ("e" + edges.size), { from, to, label: ci >= 0 ? title.slice(ci + 2) : "", description: brToNl(r.beschreibung), direction: DIR[r.richtung] || "directed" });
  }
  return { nodes, edges };
}

function notionSource(focus) {
  let force = false, meta = null;
  async function fetchNotion() {
    const { data, error } = await sb.functions.invoke("notion-proxy", { body: { refresh: force } });
    force = false;
    if (error) {
      let detail = "";
      try { const j = await error.context.json(); detail = j.message || j.error || ""; } catch (_) {}
      throw new Error("Notion konnte nicht gelesen werden" + (detail ? ": " + detail : ".") + " (Edge Function notion-proxy, Secret NOTION_TOKEN prüfen)");
    }
    if (data.warning) toast("Hinweis Notion: " + String(data.warning).slice(0, 200), true);
    meta = { fetched_at: data.fetched_at, source: data.source };
    return data;
  }
  return {
    editable: false, legend: true, focus: focus || null,
    reloadLabel: "Aus Notion neu laden",
    reload: async () => { force = true; },
    statusText: () => meta ? "Stand " + fmtDateTime(meta.fetched_at) + (meta.source === "cache" ? " (Cache)" : " (frisch)") : "",
    async load() {
      const [payload, positions] = await Promise.all([fetchNotion(), loadPositions("st")]);
      return { ...buildGraph(payload), positions };
    },
    savePositions: list => savePositions("st", list),
    metaRows: n => {
      const r = n.raw; if (!r) return [];
      return [["Clan", r.clan], ["Sekte", r.sekte || r.clanSekte], ["Status", r.status], ["Kategorie", r.kategorie], ["Rang", r.rank], ["Fraktion", r.fraktion && r.fraktion !== "-" ? r.fraktion : ""], ["Map-Label", r.label]].filter(([, v]) => v);
    },
    nodeExtras: (n) => [
      n.raw && n.raw.id ? mentionsBox(n.raw.id) : null,
      n.raw && n.raw.id ? docLinksBox("st", n.raw.id, n.label, true) : null,
      n.raw && /^https:\/\//.test(n.raw.url || "") ? h("a", { class: "btn small", href: n.raw.url, target: "_blank", rel: "noopener" }, "In Notion öffnen") : null,
      h("button", { class: "btn small", type: "button", onclick: async () => {
        try { await ensurePlayerNode(n); toast("„" + n.label + "“ steht auf der Spielerkarte."); } catch (e) { toast("Fehler: " + (e.message || e), true); }
      } }, "Auf Spielerkarte"),
    ].filter(Boolean),
    edgeExtras: (e, id, nodes) => [h("button", { class: "btn small", type: "button", onclick: async () => {
      try {
        const a = await ensurePlayerNode(nodes.get(e.from)), b = await ensurePlayerNode(nodes.get(e.to));
        const { data: ex, error } = await sb.from("player_map_edges").select("id").or(`and(from_node.eq.${a},to_node.eq.${b}),and(from_node.eq.${b},to_node.eq.${a})`);
        if (error) throw error;
        if (ex.length) { toast("Diese Verbindung gibt es auf der Spielerkarte schon."); return; }
        // bewusst ohne Beschriftung und Beschreibung (Übergabe Abschnitt 4: "ohne Beschreibung")
        const { error: e2 } = await sb.from("player_map_edges").insert({ from_node: a, to_node: b, label: "", description: "", direction: e.direction });
        if (e2) throw e2;
        toast("Verbindung auf die Spielerkarte geschoben.");
      } catch (err) { toast("Fehler: " + (err.message || err), true); }
    } }, "Auf Spielerkarte")],
  };
}

// "Kommt vor in": Szenen, in denen dieser NPC verknüpft ist (mit Motivation der jeweiligen Szene)
function mentionsBox(notionId) {
  const box = h("div", { class: "stack", style: "width:100%", "data-mentions": "1" });
  sceneMentions(notionId).then(list => {
    if (!list.length) return;
    box.append(h("h4", { class: "eyebrow", style: "margin:0" }, "Kommt vor in (" + list.length + ")"),
      ...list.map(x => h("div", { class: "conn" }, h("div", { class: "c" },
        h("button", { class: "linkbtn", type: "button", onclick: () => x.scene.session_number == null ? go("scenes") : go("sessions", { session: x.scene.session_number }) }, (x.scene.session_number == null ? "Vorrat" : "Session " + x.scene.session_number) + " · " + x.scene.title),
        x.npc.motivation ? h("div", { class: "muted" }, x.npc.motivation) : null))));
  }).catch(() => {});
  return box;
}

// Nur der Name. Typ (Kindred, Sterblicher, …) bleibt leer: Die Spieler tragen ihn selbst ein, weil er nicht immer offensichtlich ist. Keine Beschreibung, keine Notion-Tags.
async function ensurePlayerNode(n) {
  const { data, error } = await sb.from("player_map_nodes").select("id, label");
  if (error) throw error;
  const hit = data.find(d => d.label.toLowerCase() === n.label.toLowerCase());
  if (hit) return hit.id;
  const { data: r, error: e2 } = await sb.from("player_map_nodes").insert({ label: n.label, type: "", tags: n.pc ? ["Spielercharakter"] : [], description: "", is_pc: !!n.pc }).select("id").single();
  if (e2) throw e2;
  return r.id;
}
