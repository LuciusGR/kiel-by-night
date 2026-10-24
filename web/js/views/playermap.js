// Kiel by Night · Spielerkarte (gemeinsam, alle bearbeiten; Form immer Kreis gemäß A5-Entscheidung)
import { guard, head } from "../lib.js";
import { sb, S, registerView } from "../core.js";
import { MapView, shapeForSekte } from "./map.js";
import { docLinksBox } from "./doclinks.js";

export async function savePositions(scope, list) {
  if (!list.length) return;
  const rows = list.map(([node_key, x, y]) => ({ scope, node_key, x, y, updated_at: new Date().toISOString() }));
  const { error } = await sb.from("map_positions").upsert(rows, { onConflict: "scope,node_key" });
  if (error) throw error;
}
export async function loadPositions(scope) {
  const { data, error } = await sb.from("map_positions").select("node_key, x, y").eq("scope", scope);
  if (error) throw error;
  const out = {}; for (const r of data) out[r.node_key] = [r.x, r.y];
  return out;
}

export function playerMapSource() {
  return {
    editable: true, focus: (S.arg && S.arg.focus) || null, legend: true, sects: true, exportName: "spielerkarte",
    // Dokumente am Knoten: Liste für alle, Verknüpfen und Lösen nur im Modus Bearbeitung
    nodeExtras: (n, id, nodes, o) => [docLinksBox("player", id, n.label, !!(o && o.edit))],
    async load() {
      const [n, e, positions] = await Promise.all([
        sb.from("player_map_nodes").select("*"),
        sb.from("player_map_edges").select("*"),
        loadPositions("player"),
      ]);
      if (n.error) throw n.error; if (e.error) throw e.error;
      const nodes = new Map(n.data.map(x => [x.id, { label: x.label, type: x.type, tags: x.tags || [], description: x.description, pc: x.is_pc, sect: x.sect || "", shape: shapeForSekte(x.sect) }]));
      const edges = new Map(e.data.map(x => [x.id, { from: x.from_node, to: x.to_node, label: x.label, direction: x.direction, description: x.description }]));
      return { nodes, edges, positions };
    },
    savePositions: list => savePositions("player", list),
    watch(onChange) {
      let t = null;
      const ping = () => { clearTimeout(t); t = setTimeout(onChange, 300); };
      const ch = sb.channel("player-map")
        .on("postgres_changes", { event: "*", schema: "public", table: "player_map_nodes" }, ping)
        .on("postgres_changes", { event: "*", schema: "public", table: "player_map_edges" }, ping)
        .subscribe();
      return () => { clearTimeout(t); sb.removeChannel(ch); };
    },
    addNode: async b => (await guard(sb.from("player_map_nodes").insert({ label: b.label, type: b.type, tags: b.tags, description: b.description, sect: b.sect || "" }).select("id").single(), "Hinzugefügt.")).id,
    updateNode: (id, b) => guard(sb.from("player_map_nodes").update({ label: b.label, type: b.type, tags: b.tags, description: b.description, sect: b.sect || "" }).eq("id", id), "Gespeichert."),
    metaRows: n => n.sect ? [["Sekte", n.sect]] : [],
    deleteNode: async id => {
      await guard(sb.from("player_map_nodes").delete().eq("id", id), "Gelöscht."); // Kanten per FK-Cascade
      await sb.from("map_positions").delete().eq("scope", "player").eq("node_key", id);
    },
    addEdge: b => guard(sb.from("player_map_edges").insert({ from_node: b.from, to_node: b.to, label: b.label, direction: b.direction, description: b.description }), "Verbindung angelegt."),
    updateEdge: (id, b) => guard(sb.from("player_map_edges").update({ from_node: b.from, to_node: b.to, label: b.label, direction: b.direction, description: b.description }).eq("id", id), "Gespeichert."),
    deleteEdge: id => guard(sb.from("player_map_edges").delete().eq("id", id), "Gelöscht."),
  };
}

registerView("map", m => {
  m.append(head("Spielerkarte", "Was die Coterie über Kiels Nächte weiß. Alle bearbeiten diese Karte gemeinsam; Änderungen der anderen erscheinen automatisch."));
  MapView(m, playerMapSource());
});

