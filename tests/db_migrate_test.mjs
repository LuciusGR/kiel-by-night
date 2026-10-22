// Test der Edge Function db-migrate mit Datenbank und GitHub im Speicher (Node 22, Deno-Shim).
// Aufruf: node tests/db_migrate_test.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(HERE, "../supabase/functions/db-migrate/index.ts"), "utf8");
const TOKEN = "m".repeat(40), SHA = "a".repeat(40), OTHER = "b".repeat(40);
const h256 = t => crypto.createHash("sha256").update(t, "utf8").digest("hex");

// ---------- Datenbank im Speicher ----------
let applied, executed, schemaMade;
const fresh = () => { applied = new Map(); executed = []; schemaMade = false; };
function makeSql() {
  const q = {
    async unsafe(text, params = []) {
      if (/create schema if not exists kbn_admin/.test(text)) { schemaMade = true; return []; }
      if (/select name, sql_sha256, commit_sha, applied_at, note from kbn_admin\.migrations/.test(text)) return [...applied].map(([name, v]) => ({ name, ...v }));
      if (/select name from kbn_admin\.migrations where name/.test(text)) return applied.has(params[0]) ? [{ name: params[0] }] : [];
      if (/insert into kbn_admin\.migrations/.test(text)) {
        const [name, h, c] = params;
        if (/on conflict/.test(text) && applied.has(name)) return [];
        applied.set(name, { sql_sha256: h, commit_sha: c, applied_at: "2026-10-23", note: /baseline/.test(text) ? "baseline" : "" }); return [];
      }
      if (/pg_advisory_xact_lock/.test(text)) return [];
      if (/BOOM/.test(text)) { const e = new Error("relation \"boom\" does not exist"); e.code = "42P01"; throw e; }
      executed.push(text); return [];
    },
    async begin(fn) {
      const snap = { applied: new Map(applied), executed: [...executed] };
      try { return await fn(q); } catch (e) { applied = snap.applied; executed = snap.executed; throw e; }
    },
    async end() {},
  };
  return q;
}

// ---------- GitHub im Speicher ----------
const FILES = { "20261023120000_player_map_sect_v1_9": "alter table x add column y int;\n", "20261023120100_boom_v1_9": "select BOOM;\n", "20261020120000_schema_v1_0": "create table a();\n" };
let compare = "ahead";
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("api.github.com") && u.includes("/compare/")) return u.includes(OTHER) ? new Response("{}", { status: 404 }) : Response.json({ status: u.includes("/compare/" + SHA + "...") ? compare : "diverged" });
  const m = u.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([0-9a-f]+)\/supabase\/migrations\/(.+)\.sql$/);
  if (m) return m[2] in FILES ? new Response(FILES[m[2]]) : new Response("", { status: 404 });
  return new Response("", { status: 500 });
};

// ---------- Function laden ----------
let handler;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_DB_URL: "postgres://x", MIGRATE_TOKEN: process.env.TEST_TOKEN ?? TOKEN })[k] }, serve: (h) => { handler = h; } };
globalThis.__postgres = () => makeSql();
const js = stripTypeScriptTypes(src.replace('import postgres from "npm:postgres@3.4.4";', "const postgres = globalThis.__postgres;"));
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kbn-dm-")), "fn.mjs");
fs.writeFileSync(file, js);
await import(pathToFileURL(file).href);

const call = (body, { token = TOKEN, method = "POST" } = {}) =>
  handler(new Request("http://f/functions/v1/db-migrate", { method, headers: token == null ? {} : { "x-migrate-token": token }, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined }))
    .then(async (r) => ({ status: r.status, body: await r.json() }));
const N = "20261023120000_player_map_sect_v1_9";
const apply = (extra = {}) => call({ action: "apply", name: N, sha: SHA, sql_sha256: h256(FILES[N]), ...extra });

let pass = 0, fail = 0;
async function T(id, name, fn) {
  try { fresh(); compare = "ahead"; await fn(); pass++; console.log("ok   " + id + " " + name); }
  catch (e) { fail++; console.log("FAIL " + id + " " + name + "\n     " + String(e.message).split("\n")[0]); }
}

await T("M01", "ohne Schlüssel 401, nichts ausgeführt", async () => { const r = await call({ action: "apply", name: N, sha: SHA, sql_sha256: h256(FILES[N]) }, { token: null }); assert.equal(r.status, 401); assert.equal(executed.length, 0); });
await T("M02", "falscher Schlüssel 401", async () => { const r = await call({ action: "status" }, { token: "x".repeat(40) }); assert.equal(r.status, 401); });
await T("M03", "GET 405", async () => { const r = await call(null, { method: "GET" }).catch(() => null); assert.ok(r === null || r.status === 405); });
await T("M04", "ungültiger Name 422 (Pfadtrick)", async () => { const r = await call({ action: "apply", name: "../../x", sha: SHA, sql_sha256: "0".repeat(64) }); assert.equal(r.status, 422); assert.equal(r.body.error, "invalid_request"); });
await T("M05", "Apply: führt die Datei aus und vermerkt sie", async () => {
  const r = await apply(); assert.equal(r.status, 200); assert.equal(r.body.dry_run, false);
  assert.deepEqual(executed, [FILES[N]]); assert.ok(applied.has(N)); assert.equal(applied.get(N).sql_sha256, h256(FILES[N])); assert.ok(schemaMade);
});
await T("M06", "zweites Apply: 409, läuft nie doppelt", async () => { await apply(); const r = await apply(); assert.equal(r.status, 409); assert.equal(executed.length, 1); });
await T("M07", "falsche SHA-256: 422, nichts ausgeführt", async () => { const r = await apply({ sql_sha256: "0".repeat(64) }); assert.equal(r.status, 422); assert.equal(r.body.error, "sha256_mismatch"); assert.equal(executed.length, 0); assert.equal(applied.size, 0); });
await T("M08", "Commit nicht auf main: 422, nichts ausgeführt", async () => { compare = "diverged"; const r = await apply(); assert.equal(r.status, 422); assert.equal(r.body.error, "commit_not_on_main"); assert.equal(executed.length, 0); });
await T("M09", "GitHub-Fehler beim Prüfen: 502, nichts ausgeführt", async () => { const r = await apply({ sha: OTHER }); assert.equal(r.status, 502); assert.equal(executed.length, 0); });
await T("M10", "Datei nicht vorhanden: 422", async () => { const r = await call({ action: "apply", name: "20261023999999_gibt_es_nicht", sha: SHA, sql_sha256: "0".repeat(64) }); assert.equal(r.status, 422); assert.equal(r.body.error, "file_not_found"); });
await T("M11", "Dry-Run: ausgeführt, zurückgerollt, nichts vermerkt", async () => { const r = await apply({ dry_run: true }); assert.equal(r.status, 200); assert.equal(r.body.dry_run, true); assert.equal(applied.size, 0); assert.equal(executed.length, 0); });
await T("M12", "SQL-Fehler: 500 mit Meldung, nichts vermerkt", async () => {
  const B = "20261023120100_boom_v1_9"; const r = await call({ action: "apply", name: B, sha: SHA, sql_sha256: h256(FILES[B]) });
  assert.equal(r.status, 500); assert.equal(r.body.error, "migration_failed"); assert.equal(r.body.code, "42P01"); assert.equal(applied.size, 0);
});
await T("M13", "Baseline vermerkt ohne auszuführen, doppelt ist harmlos", async () => {
  const names = ["20261020120000_schema_v1_0"]; const r = await call({ action: "baseline", sha: SHA, names });
  assert.equal(r.status, 200); assert.equal(executed.length, 0); assert.ok(applied.has(names[0]));
  const r2 = await call({ action: "baseline", sha: SHA, names }); assert.equal(r2.status, 200); assert.equal(applied.size, 1);
});
await T("M14", "Baseline mit Commit nicht auf main: 422", async () => { compare = "diverged"; const r = await call({ action: "baseline", sha: SHA, names: ["20261020120000_schema_v1_0"] }); assert.equal(r.status, 422); assert.equal(applied.size, 0); });
await T("M15", "Status listet Vermerke", async () => { await apply(); const r = await call({ action: "status" }); assert.equal(r.status, 200); assert.deepEqual(r.body.applied.map((x) => x.name), [N]); });
await T("M16", "unbekannte Aktion 422", async () => { const r = await call({ action: "drop_everything" }); assert.equal(r.status, 422); });
await T("M17", "zu großer Body 413", async () => { const r = await call(JSON.stringify({ action: "status", x: "a".repeat(70 * 1024) })); assert.equal(r.status, 413); });

console.log(`\ndb-migrate: ${pass} von ${pass + fail} bestanden`);
process.exit(fail ? 1 : 0);
