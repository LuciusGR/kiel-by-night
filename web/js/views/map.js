// Kiel by Night · Kartenansicht (gemeinsam für Spielerkarte und ST-Karte)
// Backlog umgesetzt: A1 schneller Zoom · A2 Positionen dauerhaft (inkl. Erstanordnung) · A4 gleich große Knoten
//                    A5 Form je Sekte (nur ST-Karte, sonst Kreis) · A7 unterscheidbare Farben
import { h, toast, tok, themeListeners, confirmBtn, splitTags } from "../lib.js";
import { onCleanup } from "../core.js";
import { toCsv, toXlsx, mapTables, download, MIME, stamp } from "../export.js";

// ---------- A7: Farben je Typ ----------
const TYPE_TOK = {
  Kindred: "--blood", Ghoul: "--brass", Sterblicher: "--sea", Kine: "--sea",
  Wight: "--plum", Geist: "--teal", Werwolf: "--rust",
  Ort: "--moss", Organisation: "--slate", Gegenstand: "--olive",
  "Ohne NPC-Eintrag": "--grey",
};
const FALLBACK_TOK = ["--moss", "--plum", "--teal", "--rust", "--slate", "--olive"];
// A3: alte Schreibweise abfangen
export const normType = t => (t === "Ghul" ? "Ghoul" : (t || ""));
export function typeColor(t) {
  t = normType(t);
  if (!t) return tok("--grey");
  if (TYPE_TOK[t]) return tok(TYPE_TOK[t]);
  let x = 0; for (const ch of t) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return tok(FALLBACK_TOK[x % FALLBACK_TOK.length]);
}

// ---------- A5: Form je Sekte (eigene Zuordnung, nur aus Notion "Sekte" abgeleitet) ----------
export const SEKTE_SHAPE = {
  Camarilla: "hexagon",
  Anarch: "triangle",
  Sabbat: "diamond",
  Unabhaengig: "round-rectangle",
  "Second Inquisition": "star",
};
export function shapeForSekte(s) {
  const k = String(s || "").trim().replace("Unabhängig", "Unabhaengig");
  return SEKTE_SHAPE[k] || "ellipse";
}
const SVG_SHAPE = {
  ellipse: '<circle cx="7" cy="7" r="6"/>',
  hexagon: '<polygon points="4,1 10,1 13,7 10,13 4,13 1,7"/>',
  triangle: '<polygon points="7,1 13,13 1,13"/>',
  diamond: '<polygon points="7,1 13,7 7,13 1,7"/>',
  "round-rectangle": '<rect x="1" y="2" width="12" height="10" rx="3"/>',
  star: '<polygon points="7,1 8.8,5.2 13,5.4 9.7,8.2 10.8,13 7,10.4 3.2,13 4.3,8.2 1,5.4 5.2,5.2"/>',
};
export function shapeLegend() {
  const items = [...Object.entries(SEKTE_SHAPE), ["ohne Sekte", "ellipse"]];
  const el = h("div", { class: "shape-legend", "aria-label": "Formen je Sekte" });
  for (const [label, shape] of items) {
    const s = h("span", {});
    s.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4">${SVG_SHAPE[shape]}</svg>`;
    s.append(label);
    el.append(s);
  }
  return el;
}

const NODE_SIZE = 22; // A4: alle Knoten gleich groß

function cyStyle() {
  const ink = tok("--ink"), paper = tok("--surface"), line = tok("--line2"), sea = tok("--sea"), muted = tok("--muted");
  return [
    { selector: "node", style: { "background-color": e => typeColor(e.data("type")), "shape": "data(shape)", "label": "data(label)", "font-size": 10, "color": ink, "text-valign": "bottom", "text-margin-y": 4,
      "width": NODE_SIZE, "height": NODE_SIZE, "text-wrap": "ellipsis", "text-max-width": 130, "font-family": "Alegreya Sans, system-ui, sans-serif",
      "text-background-color": paper, "text-background-opacity": .75, "text-background-padding": 1, "border-width": 0 } },
    { selector: "node[?pc]", style: { "border-width": 4, "border-style": "double", "border-color": ink } }, // SC-Ring, nicht verwechselbar mit Ghoul-Messing
    { selector: "node[?dead]", style: { "opacity": .5, "border-width": 1.5, "border-style": "dashed", "border-color": muted, "background-opacity": .35 } },
    { selector: "edge", style: { "width": 1.1, "line-color": line, "curve-style": "bezier", "target-arrow-shape": "triangle", "target-arrow-color": line, "arrow-scale": .7, "opacity": .8,
      "label": "data(label)", "font-size": 8, "color": muted, "text-rotation": "autorotate", "text-background-color": paper, "text-background-opacity": .85, "text-background-padding": 1.5,
      "text-wrap": "ellipsis", "text-max-width": 110, "min-zoomed-font-size": 7 } },
    { selector: "edge[dir = 'undirected']", style: { "target-arrow-shape": "none" } },
    { selector: "edge[dir = 'mutual']", style: { "source-arrow-shape": "triangle", "source-arrow-color": line } },
    { selector: ".faded", style: { "opacity": .1 } },
    { selector: "edge.hl", style: { "label": "data(label)", "font-size": 9, "color": ink, "text-rotation": "autorotate", "text-background-color": paper, "text-background-opacity": .9, "text-background-padding": 2,
      "line-color": sea, "target-arrow-color": sea, "source-arrow-color": sea, "width": 2, "opacity": 1, "text-wrap": "ellipsis", "text-max-width": 160, "min-zoomed-font-size": 0 } },
    { selector: "node:selected", style: { "border-width": 3, "border-color": sea } },
    { selector: ".hide", style: { "display": "none" } },
  ];
}

/*
 src = {
   editable, legend?,
   load(): Promise<{nodes:Map<id,{label,type,shape?,tags?,description?,pc?,dead?,cat?,alt?}>, edges:Map<id,{from,to,label,direction,description}>, positions:{[id]:[x,y]}}>
   savePositions(list:[[id,x,y]]): Promise
   watch?(onChange): unsubscribe       // Realtime
   reloadLabel?: string                // z. B. "Aus Notion neu laden"
   reload?(): Promise                  // erzwungenes Neuladen der Quelle
   addNode, updateNode, deleteNode(id), addEdge, updateEdge, deleteEdge(id)   // nur wenn editable
   metaRows?(node), nodeExtras?(node,id,nodes), edgeExtras?(edge,id,nodes), statusText?()
 }
*/
export function MapView(root, src) {
  let nodes = new Map(), edges = new Map(), positions = {}, cy = null, sel = null, editing = null;
  const hidden = new Set(), hiddenCat = new Set();
  const search = h("input", { type: "search", id: "map-search", placeholder: "Name suchen …", "aria-label": "Name suchen" });
  const chips = h("div", { class: "chips" });
  const tools = h("div", { class: "map-tools" }, search, chips);
  const canvas = h("div", { class: "map-canvas" }, h("div", { class: "state" }, "Karte wird geladen …"));
  const panel = h("aside", { class: "map-panel" });
  const actions = h("div", { class: "row", style: "margin-bottom:10px" });
  const status = h("span", { class: "muted", style: "font-size:.86rem" });
  root.append(...[actions, src.legend ? shapeLegend() : null, h("div", { class: "map-grid" }, h("div", { style: "min-width:0" }, tools, canvas), panel)].filter(Boolean));

  // Zwei Modi für bearbeitbare Karten: Ansicht (Standard) sperrt Anlegen, Bearbeiten, Löschen, Verschieben und Neu anordnen.
  let mode = "view";
  const bView = h("button", { type: "button", onclick: () => setMode("view") }, "Ansicht"), bEdit = h("button", { type: "button", onclick: () => setMode("edit") }, "Bearbeitung");
  const addNodeBtn = h("button", { class: "btn primary", type: "button", onclick: () => { editing = { kind: "node" }; drawPanel(); } }, "Person/Ort hinzufügen");
  const addEdgeBtn = h("button", { class: "btn", type: "button", onclick: () => { editing = { kind: "edge" }; drawPanel(); } }, "Verbindung hinzufügen");
  const relayoutBtn = h("button", { class: "btn", type: "button", onclick: () => relayout(true, true) }, "Neu anordnen");
  if (src.editable) actions.append(h("div", { class: "toggle", role: "group", "aria-label": "Modus" }, bView, bEdit), addNodeBtn, addEdgeBtn);
  actions.append(relayoutBtn);
  function paintMode() {
    if (!src.editable) return;
    const e = mode === "edit";
    bView.setAttribute("aria-pressed", String(!e)); bEdit.setAttribute("aria-pressed", String(e));
    for (const b of [addNodeBtn, addEdgeBtn, relayoutBtn]) b.style.display = e ? "" : "none";
    if (cy) cy.autoungrabify(!e);
  }
  function setMode(next) { if (next === mode) return; mode = next; if (mode === "view") { editing = null; flushPositions(); } paintMode(); drawPanel(); }
  paintMode();
  if (src.reload) actions.append(h("button", { class: "btn", type: "button", onclick: async () => { await src.reload(); await refresh(); } }, src.reloadLabel || "Neu laden"));
  // Herunterladen als CSV (Knoten, Verbindungen) oder Excel (beides als zwei Blätter), z. B. zur Auswertung durch Claude
  const exportMenu = h("details", { class: "export-menu" }, h("summary", { class: "btn", "aria-label": "Karte herunterladen" }, "Herunterladen"),
    h("div", { class: "row", style: "margin-top:6px" },
      ...[["Excel (.xlsx)", "xlsx"], ["Knoten (.csv)", "nodes"], ["Verbindungen (.csv)", "edges"]].map(([label, kind]) => h("button", { class: "btn small", type: "button", onclick: () => {
        const { nodeRows, edgeRows } = mapTables(nodes, edges), base = (src.exportName || "karte") + "_" + stamp();
        if (kind === "xlsx") download(base + ".xlsx", toXlsx([["Knoten", nodeRows], ["Verbindungen", edgeRows]]), MIME.xlsx);
        else download(base + (kind === "nodes" ? "_knoten" : "_verbindungen") + ".csv", toCsv(kind === "nodes" ? nodeRows : edgeRows), MIME.csv);
        exportMenu.open = false;
      } }, label))));
  actions.append(exportMenu, status);

  const onTheme = () => { if (cy) cy.style(cyStyle()); drawChips(); };
  themeListeners.add(onTheme);
  let unwatch = null, alive = true;
  onCleanup(() => { alive = false; themeListeners.delete(onTheme); if (unwatch) unwatch(); if (cy) cy.destroy(); clearTimeout(posTimer); flushPositions(); });

  // ---------- Positionen (A2) ----------
  const posQueue = new Map(); let posTimer = null;
  function queuePos(list) {
    for (const [id, x, y] of list) { posQueue.set(id, [id, Math.round(x), Math.round(y)]); positions[id] = [Math.round(x), Math.round(y)]; }
    clearTimeout(posTimer); posTimer = setTimeout(flushPositions, 700);
  }
  function flushPositions() {
    if (!posQueue.size) return;
    const list = [...posQueue.values()]; posQueue.clear();
    src.savePositions(list).catch(e => toast("Positionen nicht gespeichert: " + (e.message || e), true));
  }
  const allPositions = () => cy.nodes().map(n => [n.id(), n.position("x"), n.position("y")]);

  // ---------- Daten ----------
  async function refresh() {
    try {
      const r = await src.load();
      if (!alive) return;
      nodes = r.nodes; edges = r.edges; positions = { ...(r.positions || {}) };
      for (const [id, x, y] of posQueue.values()) positions[id] = [x, y]; // noch nicht gespeicherte Züge behalten
      sync();
    } catch (e) {
      if (!alive) return;
      const msg = (e && e.message) || String(e);
      if (cy) toast(msg, true); else canvas.replaceChildren(h("div", { class: "state" }, msg));
    }
  }

  function elementsFor() {
    const out = [];
    for (const [id, n] of nodes) out.push({ group: "nodes", data: { id, label: n.label || "?", type: normType(n.type), shape: n.shape || "ellipse", pc: !!n.pc, dead: !!n.dead }, position: pos(id) });
    for (const [id, e] of edges) if (nodes.has(e.from) && nodes.has(e.to)) out.push({ group: "edges", data: { id, source: e.from, target: e.to, label: e.label || "", dir: e.direction || "directed" } });
    return out;
  }
  function pos(id) { const p = positions[id]; return p ? { x: p[0], y: p[1] } : undefined; }

  function sync() {
    if (typeof cytoscape === "undefined") { canvas.replaceChildren(h("div", { class: "state" }, "Die Karten-Bibliothek konnte nicht geladen werden. Seite neu laden.")); return; }
    if (!nodes.size) {
      if (cy) { cy.destroy(); cy = null; }
      canvas.replaceChildren(h("div", { class: "state" }, src.editable ? "Die Karte ist leer. Oben auf „Bearbeitung“ umschalten und „Person/Ort hinzufügen“ wählen." : "Keine Einträge gefunden."));
      drawChips(); drawPanel(); status.textContent = ""; return;
    }
    if (!cy) {
      canvas.replaceChildren();
      // A1: Standard-Zoomgeschwindigkeit (v1 hatte 0.25 = viermal langsamer)
      // layout "preset": sonst legt Cytoscape nach dem Start ein Raster über die gespeicherten Positionen
      cy = cytoscape({ container: canvas, elements: elementsFor(), style: cyStyle(), layout: { name: "preset" }, minZoom: .1, maxZoom: 3 });
      paintMode();
      const placed = cy.nodes().filter(n => !!positions[n.id()]).length;
      if (placed < cy.nodes().length * 0.6) relayout(false, true);      // Erstanordnung wird gespeichert
      else { const fresh = placeMissing(); cy.fit(undefined, 30); capZoom(); if (fresh.length) queuePos(fresh); }
      cy.on("tap", "node", ev => { sel = { kind: "node", id: ev.target.id() }; editing = null; resultsOn = false; highlight(); drawPanel(); });
      cy.on("tap", "edge", ev => { sel = { kind: "edge", id: ev.target.id() }; editing = null; resultsOn = false; highlight(); drawPanel(); });
      cy.on("tap", ev => { if (ev.target === cy) { sel = null; resultsOn = false; highlight(); drawPanel(); } });
      cy.on("dragfree", "node", ev => { const n = ev.target; queuePos([[n.id(), n.position("x"), n.position("y")]]); });
    } else {
      const els = elementsFor();
      const want = new Set(els.map(e => e.data.id));
      cy.elements().forEach(el => { if (!want.has(el.id())) el.remove(); });
      const fresh = [];
      for (const el of els) {
        const ex = cy.getElementById(el.data.id);
        if (ex.empty()) {
          const added = cy.add(el);
          if (el.group === "nodes" && !el.position) { const c = cy.extent(); added.position({ x: (c.x1 + c.x2) / 2 + Math.random() * 60 - 30, y: (c.y1 + c.y2) / 2 + Math.random() * 60 - 30 }); fresh.push([added.id(), added.position("x"), added.position("y")]); }
        } else if (el.group === "edges" && (ex.data("source") !== el.data.source || ex.data("target") !== el.data.target)) { ex.remove(); cy.add(el); }
        else {
          const { id: _i, source: _s, target: _t, ...rest } = el.data; ex.data(rest);
          if (el.group === "nodes" && el.position && !ex.grabbed()) { const p = ex.position(); if (Math.abs(p.x - el.position.x) > 1 || Math.abs(p.y - el.position.y) > 1) ex.position(el.position); }
        }
      }
      if (fresh.length) queuePos(fresh);
    }
    if (sel && cy.getElementById(sel.id).empty()) sel = null;
    applyFilter(); highlight(); drawChips(); drawPanel();
    status.textContent = (src.statusText ? src.statusText() + " · " : "") + nodes.size + " Knoten · " + edges.size + " Verbindungen";
  }
  function placeMissing() {
    const c = cy.extent(), out = [];
    cy.nodes().forEach(n => { if (!positions[n.id()]) { n.position({ x: c.x1 + Math.random() * (c.x2 - c.x1), y: c.y1 + Math.random() * (c.y2 - c.y1) }); out.push([n.id(), n.position("x"), n.position("y")]); } });
    return out;
  }
  function relayout(animate, persist) {
    if (!cy) return;
    const l = cy.layout({ name: "cose", animate: !!animate && !matchMedia("(prefers-reduced-motion: reduce)").matches, randomize: true, nodeRepulsion: () => 9000, idealEdgeLength: () => 80, gravity: .6, numIter: 1200, fit: true, padding: 30 });
    l.one("layoutstop", () => { capZoom(); if (persist) queuePos(allPositions()); });
    l.run();
  }
  // Bei wenigen Knoten nicht maximal hineinzoomen
  function capZoom() { if (cy && cy.zoom() > 1.2) { cy.zoom(1.2); cy.center(); } }
  function applyFilter() { if (!cy) return; cy.nodes().forEach(n => { const d = nodes.get(n.id()); const hide = hidden.has(normType(d.type)) || (d.cat && hiddenCat.has(d.cat)); n.toggleClass("hide", !!hide); }); }
  function highlight() {
    if (!cy) return; cy.elements().removeClass("faded hl");
    if (!sel) return; const el = cy.getElementById(sel.id); if (el.empty()) return;
    const keep = sel.kind === "node" ? el.closedNeighborhood() : el.union(el.connectedNodes());
    cy.elements().not(keep).addClass("faded"); keep.edges().addClass("hl"); if (sel.kind === "edge") el.addClass("hl");
  }
  function drawChips() {
    const types = [...new Set([...nodes.values()].map(n => normType(n.type)))].sort((a, b) => a.localeCompare(b, "de"));
    const cats = [...new Set([...nodes.values()].map(n => n.cat).filter(Boolean))];
    chips.replaceChildren(
      ...types.map(t => h("button", { type: "button", class: "chip", "aria-pressed": String(!hidden.has(t)), onclick: () => { hidden.has(t) ? hidden.delete(t) : hidden.add(t); applyFilter(); drawChips(); } }, h("span", { class: "dot", style: "background:" + typeColor(t) }), t || "ohne Typ")),
      ...cats.map(c => h("button", { type: "button", class: "chip", "aria-pressed": String(!hiddenCat.has(c)), onclick: () => { hiddenCat.has(c) ? hiddenCat.delete(c) : hiddenCat.add(c); applyFilter(); drawChips(); } }, c)));
  }
  // Suche: zeigt alle Treffer als Liste im Detailfeld. Mehrere Treffer = zugeklappt, genau ein Treffer = aufgeklappt.
  let resultsOn = false;
  const searchIds = () => { const q = search.value.trim().toLowerCase(); return q ? [...nodes].filter(([, n]) => (n.label || "").toLowerCase().includes(q) || (n.alt || "").toLowerCase().includes(q)).map(([id]) => id) : []; };
  function applySearch() {
    resultsOn = !!search.value.trim();
    if (!cy) { drawPanel(); return; }
    const ids = searchIds();
    cy.$(":selected").unselect();
    if (!resultsOn) { sel = null; highlight(); drawPanel(); return; }
    if (ids.length === 1) {
      sel = { kind: "node", id: ids[0] }; highlight(); drawPanel();
      const n = cy.getElementById(ids[0]); if (!n.empty()) { n.select(); cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1.1) }, { duration: 250 }); }
      return;
    }
    sel = null; cy.elements().removeClass("faded hl");
    if (ids.length) {
      const hit = cy.nodes().filter(n => ids.includes(n.id()));
      cy.elements().addClass("faded"); hit.removeClass("faded"); hit.select();
      cy.animate({ fit: { eles: hit, padding: 80 } }, { duration: 250, complete: capZoom });
    }
    drawPanel();
  }
  function selectNode(id) { if (!cy) return; const n = cy.getElementById(id); if (n.empty()) return; sel = { kind: "node", id }; resultsOn = false; highlight(); drawPanel(); n.select(); cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1) }, { duration: 250 }); }
  function focusNode(id) { if (!cy) return; const n = cy.getElementById(id); if (!n.empty()) cy.animate({ center: { eles: n }, zoom: Math.max(cy.zoom(), 1) }, { duration: 250 }); }
  search.addEventListener("input", applySearch);
  search.addEventListener("keydown", e => { if (e.key === "Enter") applySearch(); }); // Enter: Ansicht erneut auf die Treffer einpassen

  const nodeLabel = id => { const n = nodes.get(id); return n ? n.label : "?"; };
  const afterWrite = async () => { editing = null; await refresh(); };

  // Inhalt eines Knotens: für die Einzelansicht (mit Titel) und für die Trefferliste (Titel steht in der Kopfzeile des Eintrags)
  function nodeBody(id, n, withTitle) {
    const conn = [...edges.values()].filter(e => e.from === id || e.to === id);
    const out = [withTitle ? h("div", {}, h("span", { class: "eyebrow" }, normType(n.type) || "ohne Typ"), h("h3", {}, n.label)) : h("span", { class: "eyebrow" }, normType(n.type) || "ohne Typ")];
    const rows = src.metaRows ? src.metaRows(n) : []; if (n.tags && n.tags.length) rows.push(["Tags", n.tags.join(", ")]);
    if (rows.length) out.push(h("dl", { class: "kv" }, ...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])));
    if (n.description) out.push(h("div", { class: "pre", style: "font-size:.94rem" }, n.description));
    if (conn.length) out.push(h("div", {}, h("h4", { class: "eyebrow", style: "margin:0 0 6px" }, "Verbindungen (" + conn.length + ")"), h("div", { class: "conn" }, ...conn.map(e => {
      const other = e.from === id ? e.to : e.from;
      const arrow = e.direction === "undirected" ? "—" : (e.direction === "mutual" ? "↔" : (e.from === id ? "→" : "←"));
      return h("div", { class: "c" }, arrow + " ", h("button", { class: "linkbtn", type: "button", onclick: () => { resultsOn = false; sel = { kind: "node", id: other }; highlight(); drawPanel(); } }, nodeLabel(other)), e.label ? h("div", { class: "muted" }, e.label) : null, e.description ? h("div", { class: "pre muted", style: "font-size:.88rem;margin-top:2px" }, e.description) : null);
    }))));
    const btns = h("div", { class: "row" });
    if (src.editable && mode === "edit") btns.append(
      h("button", { class: "btn small", type: "button", onclick: () => { editing = { kind: "node", data: { id, ...n } }; drawPanel(); } }, "Bearbeiten"),
      confirmBtn("Löschen", async () => { await src.deleteNode(id); sel = null; await afterWrite(); }));
    if (src.nodeExtras) btns.append(...src.nodeExtras(n, id, nodes, { edit: !!src.editable && mode === "edit" }));
    out.push(btns);
    return out;
  }
  // Trefferliste der Suche: mehrere Treffer zugeklappt, genau ein Treffer aufgeklappt
  function resultsView() {
    const ids = searchIds();
    const box = h("div", { class: "stack" }, h("span", { class: "eyebrow", role: "status" }, ids.length ? ids.length + " Treffer" : "Keine Treffer"));
    for (const id of ids) {
      const n = nodes.get(id);
      const det = h("details", { class: "panel hit", open: ids.length === 1 ? true : null },
        h("summary", { style: "cursor:pointer" }, h("strong", {}, n.label || "?"), " ", h("span", { class: "muted" }, normType(n.type) || "ohne Typ")),
        h("div", { class: "stack", style: "margin-top:8px" }, ...nodeBody(id, n, false)));
      det.addEventListener("toggle", () => { if (det.open) focusNode(id); });
      box.append(det);
    }
    return box;
  }

  function drawPanel() {
    panel.replaceChildren();
    if (editing) { panel.append(editing.kind === "node" ? nodeForm(editing.data) : edgeForm(editing.data)); return; }
    if (resultsOn && search.value.trim()) { panel.append(resultsView()); return; }
    if (!sel) { panel.append(h("div", { class: "panel" }, h("p", { class: "muted" }, "Knoten oder Verbindung antippen, um Details zu sehen. Die Suche zeigt alle Treffer als Liste."))); return; }
    if (sel.kind === "node") {
      const n = nodes.get(sel.id); if (!n) return;
      panel.append(h("div", { class: "panel stack" }, ...nodeBody(sel.id, n, true)));
    } else {
      const e = edges.get(sel.id); if (!e) return;
      const id = sel.id;
      const p = h("div", { class: "panel stack" }, h("span", { class: "eyebrow" }, "Verbindung"), h("h3", {}, nodeLabel(e.from) + (e.direction === "undirected" ? " — " : e.direction === "mutual" ? " ↔ " : " → ") + nodeLabel(e.to)));
      if (e.label) p.append(h("p", {}, e.label));
      if (e.description) p.append(h("div", { class: "pre muted" }, e.description));
      const btns = h("div", { class: "row" });
      if (src.editable && mode === "edit") btns.append(
        h("button", { class: "btn small", type: "button", onclick: () => { editing = { kind: "edge", data: { id, ...e } }; drawPanel(); } }, "Bearbeiten"),
        confirmBtn("Löschen", async () => { await src.deleteEdge(id); sel = null; await afterWrite(); }));
      if (src.edgeExtras) btns.append(...src.edgeExtras(e, id, nodes));
      p.append(btns); panel.append(p);
    }
  }
  function nodeForm(d) {
    d = d || {};
    const cur = normType(d.type);
    const types = ["Kindred", "Ghoul", "Sterblicher", "Ort", "Organisation", ...[...nodes.values()].map(n => normType(n.type)), cur].filter((v, i, a) => v && a.indexOf(v) === i);
    const label = h("input", { type: "text", id: "nf-label", value: d.label || ""});
    const type = h("select", { id: "nf-type" }, h("option", { value: "" }, "— ohne Typ —"), ...types.map(t => h("option", { value: t, selected: t === cur ? true : null }, t)), h("option", { value: "__new__" }, "＋ Neuer Typ …"));
    const newType = h("input", { type: "text", id: "nf-type-new", placeholder: "Neuen Typ eingeben", hidden: true, "aria-label": "Neuer Typ" });
    type.addEventListener("change", () => { newType.hidden = type.value !== "__new__"; if (!newType.hidden) newType.focus(); });
    const tags = h("input", { type: "text", id: "nf-tags", value: (d.tags || []).join(", "), placeholder: "durch Komma getrennt" }), desc = h("textarea", { id: "nf-desc" }, d.description || "");
    return h("div", { class: "panel stack" }, h("h3", {}, d.id ? "Knoten bearbeiten" : "Neuer Knoten"),
      h("div", { class: "field" }, h("label", { for: "nf-label" }, "Name"), label),
      h("div", { class: "field" }, h("label", { for: "nf-type" }, "Typ"), type, newType),
      h("div", { class: "field" }, h("label", { for: "nf-tags" }, "Tags"), tags),
      h("div", { class: "field" }, h("label", { for: "nf-desc" }, "Was wir wissen"), desc),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: async () => {
          if (!label.value.trim()) { toast("Bitte einen Namen eintragen.", true); return; }
          const typeVal = type.value === "__new__" ? newType.value.trim() : type.value;
          if (type.value === "__new__" && !typeVal) { toast("Bitte einen neuen Typ eintragen.", true); return; }
          const body = { label: label.value.trim(), type: normType(typeVal), tags: splitTags(tags.value), description: desc.value };
          if (d.id) await src.updateNode(d.id, body); else { const id = await src.addNode(body); if (id) sel = { kind: "node", id }; }
          await afterWrite();
        } }, "Speichern"),
        h("button", { class: "btn", type: "button", onclick: () => { editing = null; drawPanel(); } }, "Abbrechen")));
  }
  function edgeForm(d) {
    d = d || {};
    const opts = [...nodes].sort((a, b) => (a[1].label || "").localeCompare(b[1].label || "", "de"));
    const mk = (id, val) => h("select", { id }, h("option", { value: "" }, "— wählen —"), ...opts.map(([nid, n]) => h("option", { value: nid, selected: nid === val ? true : null }, n.label)));
    const from = mk("ef-from", d.from || (sel && sel.kind === "node" ? sel.id : "")), to = mk("ef-to", d.to);
    const label = h("input", { type: "text", id: "ef-label", value: d.label || "", placeholder: "z. B. Erzeuger von, schuldet einen Boon" });
    const dir = h("select", { id: "ef-dir" }, ...[["directed", "gerichtet (→)"], ["mutual", "wechselseitig (↔)"], ["undirected", "ungerichtet (—)"]].map(([v, l]) => h("option", { value: v, selected: (d.direction || "directed") === v ? true : null }, l)));
    const desc = h("textarea", { id: "ef-desc", style: "min-height:70px" }, d.description || "");
    return h("div", { class: "panel stack" }, h("h3", {}, d.id ? "Verbindung bearbeiten" : "Neue Verbindung"),
      h("div", { class: "field" }, h("label", { for: "ef-from" }, "Von"), from), h("div", { class: "field" }, h("label", { for: "ef-to" }, "Nach"), to),
      h("div", { class: "field" }, h("label", { for: "ef-label" }, "Beschriftung"), label), h("div", { class: "field" }, h("label", { for: "ef-dir" }, "Richtung"), dir),
      h("div", { class: "field" }, h("label", { for: "ef-desc" }, "Details"), desc),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: async () => {
          if (!from.value || !to.value || from.value === to.value) { toast("Bitte zwei verschiedene Knoten wählen.", true); return; }
          const body = { from: from.value, to: to.value, label: label.value.trim(), direction: dir.value, description: desc.value };
          if (d.id) await src.updateEdge(d.id, body); else await src.addEdge(body);
          await afterWrite();
        } }, "Speichern"),
        h("button", { class: "btn", type: "button", onclick: () => { editing = null; drawPanel(); } }, "Abbrechen")));
  }

  // Start: Daten UND Positionen zuerst laden, dann zeichnen (A2: kein Race wie in v1)
  refresh().then(() => {
    if (alive && src.watch) unwatch = src.watch(() => { if (!editing) refresh(); });
    if (alive && src.focus) selectNode(src.focus);
  });
  return { refresh };
}
