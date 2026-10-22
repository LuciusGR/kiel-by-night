// Test der Edge Function scene-import mit einem Datenbank-Nachbau im Speicher (Node 22, Deno-Shim).
// Aufruf: node tests/scene_import_test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(HERE, "../supabase/functions/scene-import/index.ts"), "utf8");
const TOKEN = "t".repeat(40);

// ---------- Datenbank im Speicher ----------
let db, failNpcInsert;
function fresh(cache) {
  db = { scenes: [], scene_npcs: [], notion_cache: cache ? [{ id: 1, payload: cache }] : [], chronicles: [{ id: "c-1", title: "Kiel by Night" }, { id: "c-2", title: "Hamburg Noir" }], session_info: [{ session_number: 18, chronicle_id: "c-2" }] };
  failNpcInsert = false;
}
let seq = 0;
function table(name) {
  const q = { op: "select", filters: [], row: null, rows: null, single: false, maybe: false };
  const run = () => {
    const t = db[name];
    if (q.op === "insert") {
      if (name === "scene_npcs" && failNpcInsert) return { data: null, error: { message: "boom" } };
      const rows = q.rows.map((r) => ({ id: "id-" + ++seq, ...r }));
      t.push(...rows);
      return { data: q.single ? rows[0] : rows, error: null };
    }
    if (q.op === "delete") { db[name] = t.filter((r) => !q.filters.every(([k, v]) => r[k] === v)); return { data: null, error: null }; }
    const rows = t.filter((r) => q.filters.every(([k, v]) => r[k] === v));
    return { data: q.maybe ? (rows[0] ?? null) : rows, error: null };
  };
  const api = {
    select() { return api; },
    eq(k, v) { q.filters.push([k, v]); return api; },
    maybeSingle() { q.maybe = true; return api; },
    single() { q.single = true; return api; },
    insert(r) { q.op = "insert"; q.rows = Array.isArray(r) ? r : [r]; q.single = false; return api; },
    delete() { q.op = "delete"; return api; },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  return api;
}

// ---------- Function laden ----------
let handler;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "svc", IMPORT_TOKEN: process.env.TEST_TOKEN ?? TOKEN })[k] }, serve: (h) => { handler = h; } };
globalThis.__createClient = () => ({ from: table });
const js = stripTypeScriptTypes(src.replace('import { createClient } from "npm:@supabase/supabase-js@2.45.4";', "const createClient = globalThis.__createClient;"));
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kbn-si-")), "fn.mjs");
fs.writeFileSync(file, js);
await import(pathToFileURL(file).href);

const call = (body, { token = TOKEN, query = "", method = "POST" } = {}) =>
  handler(new Request("http://f/functions/v1/scene-import" + query, { method, headers: token == null ? {} : { "x-import-token": token }, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined }))
    .then(async (r) => ({ status: r.status, body: await r.json() }));

const doc = (extra = {}, scenes) => ({ format: "kbn-scenes/1", szenen: scenes ?? [{ titel: "Treffen im Hafen", ort: "Hafen", npcs: [{ name: "Aniq", motivation: "Will Antworten" }, "Unbekannter", "Ani"], ausgaenge: ["Erfolg"], text: "Ablauf" }, { titel: "Zweite Szene" }], ...extra });
const CACHE = { npcs: [{ id: "n-1", name: "Prinz Aniq", label: "Aniq" }, { id: "n-2", name: "Aniqa", label: "" }, { id: "n-3", name: "Mara", label: "" }] };

let pass = 0, fail = 0;
async function T(id, name, fn) {
  try { fresh(CACHE); await fn(); pass++; console.log("ok   " + id + " " + name); }
  catch (e) { fail++; console.log("FAIL " + id + " " + name + "\n     " + String(e.message).split("\n")[0]); }
}

await T("S01", "ohne Schlüssel 401", async () => { const r = await call(doc(), { token: null }); assert.equal(r.status, 401); assert.equal(db.scenes.length, 0); });
await T("S02", "falscher Schlüssel 401", async () => { const r = await call(doc(), { token: "x".repeat(40) }); assert.equal(r.status, 401); assert.equal(db.scenes.length, 0); });
await T("S03", "GET 405", async () => { const r = await call(null, { method: "GET" }).catch(() => null); assert.ok(r === null || r.status === 405); });
await T("S04", "ungültiges JSON 422", async () => { const r = await call("{nope"); assert.equal(r.status, 422); assert.equal(db.scenes.length, 0); });
await T("S05", "falsches Format 422", async () => { const r = await call(doc({ format: "x/1" })); assert.equal(r.status, 422); assert.match(r.body.errors[0], /Unbekanntes Format/); });
await T("S06", "Szene ohne Titel 422, nichts gespeichert", async () => { const r = await call(doc({}, [{ titel: "A" }, { ort: "B" }])); assert.equal(r.status, 422); assert.equal(db.scenes.length, 0); });
await T("S07", "Import in den Vorrat, Positionen aufsteigend", async () => {
  const r = await call(doc());
  assert.equal(r.status, 200); assert.equal(r.body.imported.length, 2); assert.equal(r.body.session, null);
  assert.deepEqual(db.scenes.map((s) => [s.title, s.session_number, s.position]), [["Treffen im Hafen", null, 1], ["Zweite Szene", null, 2]]);
  assert.deepEqual(db.scenes[0].outcomes, ["Erfolg"]);
});
await T("S08", "Import in eine Session", async () => { const r = await call(doc({ session: 18 })); assert.equal(r.body.session, 18); assert.ok(db.scenes.every((s) => s.session_number === 18)); });
await T("S09", "NPC-Abgleich: exakt, nicht gefunden, mehrdeutig", async () => {
  await call(doc());
  const by = Object.fromEntries(db.scene_npcs.map((n) => [n.name, n]));
  assert.equal(by["Aniq"].notion_id, "n-1");           // exakt auf Label
  assert.equal(by["Aniq"].motivation, "Will Antworten");
  assert.equal(by["Unbekannter"].notion_id, "");        // nicht gefunden
  assert.equal(by["Ani"].notion_id, "");                // Teiltreffer "Prinz Aniq" und "Aniqa": nicht eindeutig
});
await T("S10", "zweiter Import ersetzt nichts, Titel werden übersprungen", async () => {
  await call(doc()); const n = db.scenes.length;
  const r = await call(doc({}, [{ titel: "treffen im hafen" }, { titel: "Neu" }]));
  assert.equal(r.body.skipped.length, 1); assert.equal(r.body.imported.length, 1); assert.equal(db.scenes.length, n + 1);
  assert.equal(db.scenes.at(-1).position, 3);
});
await T("S11", "gleicher Titel in anderer Session ist erlaubt", async () => { await call(doc({ session: 1 })); const r = await call(doc({ session: 2 })); assert.equal(r.body.imported.length, 2); });
await T("S12", "dry_run schreibt nichts", async () => { const r = await call(doc(), { query: "?dry_run=1" }); assert.equal(r.status, 200); assert.equal(r.body.dry_run, true); assert.equal(r.body.imported.length, 2); assert.equal(db.scenes.length, 0); assert.equal(db.scene_npcs.length, 0); });
await T("S13", "ohne NPC-Cache: Namen ohne Verknüpfung", async () => { fresh(null); const r = await call(doc()); assert.equal(r.status, 200); assert.ok(db.scene_npcs.every((n) => n.notion_id === "")); });
await T("S14", "NPC-Fehler nimmt die Szene zurück", async () => { failNpcInsert = true; const r = await call(doc()); assert.equal(r.status, 500); assert.equal(r.body.error, "npc_insert_failed"); assert.equal(db.scenes.length, 0); });
await T("S15", "zu große Datei 413", async () => { const r = await call(JSON.stringify(doc({ x: "a".repeat(2 * 1024 * 1024 + 10) }))); assert.equal(r.status, 413); });
await T("S16", "mehr als 100 Szenen 422", async () => { const r = await call(doc({}, Array.from({ length: 101 }, (_, i) => ({ titel: "S" + i })))); assert.equal(r.status, 422); });
await T("S18", "chronik in der Datei wird zugeordnet (ohne Beachtung der Schreibweise)", async () => { const r = await call(doc({ chronik: "kiel BY night" })); assert.equal(r.status, 200); assert.equal(r.body.chronicle, "Kiel by Night"); assert.ok(db.scenes.every((s) => s.chronicle_id === "c-1")); });
await T("S19", "unbekannte Chronik bricht ab, nichts gespeichert", async () => { const r = await call(doc({ chronik: "Berlin" })); assert.equal(r.status, 422); assert.equal(r.body.error, "unknown_chronicle"); assert.deepEqual(r.body.known, ["Kiel by Night", "Hamburg Noir"]); assert.equal(db.scenes.length, 0); });
await T("S20", "ohne chronik: Chronik der Session, im Vorrat keine", async () => { await call(doc({ session: 18 })); assert.ok(db.scenes.every((s) => s.chronicle_id === "c-2")); fresh(CACHE); await call(doc()); assert.ok(db.scenes.every((s) => s.chronicle_id === null)); });
await T("S21", "gleicher Titel in anderer Chronik ist erlaubt, in derselben nicht", async () => { await call(doc({ chronik: "Kiel by Night" })); const a = await call(doc({ chronik: "Hamburg Noir" })); assert.equal(a.body.imported.length, 2); const b = await call(doc({ chronik: "Hamburg Noir" })); assert.equal(b.body.skipped.length, 2); });
await T("S17", "Die Function ändert oder löscht nie Vorhandenes", async () => {
  db.scenes.push({ id: "alt", session_number: null, position: 5, title: "Alt", body: "bleibt" });
  await call(doc());
  const alt = db.scenes.find((s) => s.id === "alt"); assert.equal(alt.body, "bleibt"); assert.equal(db.scenes.find((s) => s.title === "Treffen im Hafen").position, 6);
});

console.log(`\nscene-import: ${pass} von ${pass + fail} bestanden`);
process.exit(fail ? 1 : 0);
