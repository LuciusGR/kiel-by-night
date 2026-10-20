// In-Memory-Ersatz für supabase-js (nur für Browser-Smoke-Test, keine RLS)
const ROLE = window.__KBN_ROLE || "st";
const ST = "11111111-1111-1111-1111-111111111111", P1 = "22222222-2222-2222-2222-222222222222";
const me = ROLE === "st" ? ST : P1;
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const catP = uuid(), catST = uuid(), c1 = uuid(), c2 = uuid(), c3 = uuid(), n1 = uuid(), n2 = uuid(), n3 = uuid();
const db = {
  profiles: [{ id: ST, display_name: "Roland", role: "st" }, { id: P1, display_name: "Anna", role: "player" }],
  characters: [
    { id: c1, owner_id: P1, name: "Dr. Lucas „Lukas“ Feller", clan: "Tremere", sheet: { hunger: 2, health: [1, 2] }, sort: 1, updated_at: now() },
    { id: c2, owner_id: null, name: "Johana Talschmidt", clan: "Ventrue", sheet: {}, sort: 2, updated_at: now() },
    { id: c3, owner_id: null, name: "Steven „Damien Dark“ Felsenheimer", clan: "Malkavian", sheet: {}, sort: 3, updated_at: now() }],
  sessions: [{ number: 1, title: "Auftakt", play_date: "2026-10-01" }],
  session_notes: [{ id: uuid(), session_number: 1, author_id: P1, body: "Wir trafen [[Prinz]].", created_at: now(), updated_at: now() }],
  private_notes: [{ id: uuid(), owner_id: P1, title: "Verdacht", body: "Der Prinz lügt.", created_at: now(), updated_at: now() }],
  wiki_categories: [{ id: catP, name: "Personen", sort: 1, st_only: false }, { id: catST, name: "ST-Notizen", sort: 90, st_only: true }],
  wiki_pages: [{ id: uuid(), category_id: catP, title: "Prinz", tags: ["camarilla"], body: "Siehe [[Elysium]].", created_by: P1, updated_by: P1, created_at: now(), updated_at: now() }],
  documents: [{ id: uuid(), title: "Annales Isarnhoenses", description: "Handout", storage_path: ST + "/a.pdf", file_name: "a.pdf", content_type: "application/pdf", size_bytes: 120000, draft: true, uploader_id: ST, created_at: now() }],
  player_map_nodes: [
    { id: n1, label: "Dr. Lucas „Lukas“ Feller", type: "Kindred", tags: ["Spielercharakter"], description: "", is_pc: true },
    { id: n2, label: "Johana Talschmidt", type: "Kindred", tags: ["Spielercharakter"], description: "", is_pc: true },
    { id: n3, label: "Prinz Aniq", type: "Ghul", tags: [], description: "", is_pc: false }],
  player_map_edges: [{ id: uuid(), from_node: n1, to_node: n3, label: "misstraut", direction: "directed", description: "" }],
  map_positions: [],
  notion_cache: [],
};
window.__db = db;
const KEYS = { map_positions: ["scope", "node_key"], sessions: ["number"] };

class Q {
  constructor(t) { this.t = t; this.f = []; this.op = "select"; this.ret = false; }
  select() { if (this.op !== "select") this.ret = true; return this; }
  eq(k, v) { this.f.push(r => r[k] === v); return this; }
  or() { return this; }
  order() { return this; }
  limit(n) { this.lim = n; return this; }
  insert(rows) { this.op = "insert"; this.rows = [].concat(rows); return this; }
  upsert(rows) { this.op = "upsert"; this.rows = [].concat(rows); return this; }
  update(p) { this.op = "update"; this.patch = p; return this; }
  delete() { this.op = "delete"; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  run() {
    const T = db[this.t] || (db[this.t] = []);
    const match = r => this.f.every(fn => fn(r));
    let out = [];
    if (this.op === "select") out = T.filter(match);
    if (this.op === "insert") for (const r of this.rows) { const x = { id: uuid(), created_at: now(), updated_at: now(), author_id: me, owner_id: me, uploader_id: me, tags: [], ...r }; T.push(x); out.push(x); }
    if (this.op === "upsert") for (const r of this.rows) { const k = KEYS[this.t] || ["id"]; const ex = T.find(x => k.every(kk => x[kk] === r[kk])); if (ex) Object.assign(ex, r); else T.push({ ...r }); out.push(r); }
    if (this.op === "update") { out = T.filter(match); out.forEach(r => Object.assign(r, this.patch, { updated_at: now() })); }
    if (this.op === "delete") { out = T.filter(match); db[this.t] = T.filter(r => !match(r)); }
    if (this.lim) out = out.slice(0, this.lim);
    out = JSON.parse(JSON.stringify(out));
    return { data: this.one ? (out[0] || null) : out, error: null };
  }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
}
const NOTION = {
  npcs: [
    { id: "a1", url: "https://www.notion.so/a1", name: "Aniq", label: "Aniq", tags: "Prinz \\| Elysium", notes: "Alt<br>sehr alt", sekte: "Camarilla", status: "Aktiv", kategorie: "Kernfigur", wesen: "Kindred", clan: "Ventrue" },
    { id: "a2", url: "", name: "Mara", label: "", tags: "", notes: "", sekte: "Anarch", status: "Tot", kategorie: "Nebenfigur", wesen: "Ghoul" },
    { id: "a3", url: "", name: "Jäger", label: "", tags: "", notes: "", sekte: "Second Inquisition", status: "Aktiv", kategorie: "Statist", wesen: "Sterblicher" },
    { id: "a4", url: "", name: "Lukas", label: "Feller", tags: "Player Character", notes: "", sekte: "", status: "Aktiv", kategorie: "Kernfigur", wesen: "Kindred" }],
  rels: [
    { id: "r1", title: "Aniq → Mara: Herrin von", von: "Aniq", nach: "Mara", vonIds: ["a1"], nachIds: ["a2"], beschreibung: "geheim", richtung: "gerichtet" },
    { id: "r2", title: "Jäger → Hafenamt: arbeitet für", von: "Jäger", nach: "Hafenamt", vonIds: ["a3"], nachIds: [], beschreibung: "", richtung: "ungerichtet" },
    { id: "r3", title: "Feller → Aniq: Lehrer", von: "Feller", nach: "Aniq", vonIds: [], nachIds: ["a1"], beschreibung: "", richtung: "wechselseitig" }],
};
export function createClient() {
  const user = { id: me, email: ROLE + "@x.de" };
  return {
    auth: {
      getSession: async () => ({ data: { session: window.__KBN_LOGGED_OUT ? null : { user } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ error: { message: "Invalid login credentials" } }),
      signOut: async () => ({}), updateUser: async () => ({ error: null }),
    },
    from: t => new Q(t),
    rpc: async () => ({ data: ROLE === "st", error: null }),
    functions: { invoke: async () => ({ data: { ...NOTION, fetched_at: now(), source: "cache" }, error: null }) },
    storage: { from: () => ({
      upload: async () => ({ error: null }), remove: async () => ({ error: null }),
      createSignedUrl: async p => ({ data: { signedUrl: "about:blank#" + p }, error: null }),
      createSignedUrls: async ps => ({ data: ps.map(p => ({ path: p, signedUrl: "about:blank" })), error: null }) }) },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
    removeChannel: () => {},
  };
}
