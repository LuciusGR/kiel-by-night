// UAT der Edge Function notion-proxy gegen gespielte Notion- und Supabase-Antworten (Node, Deno-Shim)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = HERE + "/out"; fs.mkdirSync(OUT, { recursive: true });
// Die Function läuft unverändert in Node: nur der Import von supabase-js wird auf das npm-Paket umgestellt.
const FN = OUT + "/notion-proxy.ts";
fs.writeFileSync(FN, fs.readFileSync(path.resolve(HERE, "../../supabase/functions/notion-proxy/index.ts"), "utf8").replace("npm:@supabase/supabase-js@2.45.4", "@supabase/supabase-js"));
const URL_ = "https://proj.supabase.co", NOTION = "https://api.notion.com/v1";
const SECRET = "ntn_GEHEIMER_TOKEN_123";
const results = [];
let seq = 0;

function page(id, props, url = "https://notion.so/" + id.replace(/-/g, "")) { return { id, url, properties: props }; }
const T = s => ({ type: "title", title: [{ plain_text: s }] });
const RT = s => ({ type: "rich_text", rich_text: [{ plain_text: s }] });
const SEL = s => ({ type: "select", select: { name: s } });
const REL = ids => ({ type: "relation", relation: ids.map(id => ({ id })) });
const NPCS = [
  page("aaaaaaaa-0000-0000-0000-000000000001", { Name: T("Prinz Aniq"), "Map-Label": RT("Aniq"), Sekte: SEL("Camarilla"), Clan: SEL("Ventrue"), Kategorie: SEL("Kindred") }),
  page("aaaaaaaa-0000-0000-0000-000000000002", { Name: T("Lena"), Sekte: SEL("Anarch"), "Map-Tags": { type: "multi_select", multi_select: [{ name: "A" }, { name: "B" }] } }),
];
const RELS = [page("bbbbbbbb-0000-0000-0000-000000000001", { Name: T("Aniq → Lena: misstraut"), "Von (NPC)": REL(["aaaaaaaa-0000-0000-0000-000000000001"]), "Nach (NPC)": REL(["aaaaaaaa-0000-0000-0000-000000000002"]), Richtung: SEL("→"), Beschreibung: RT("d") })];

// ---------- Szenario-Runner ----------
async function scenario(id, name, opts, run) {
  const calls = [], writes = [];
  const o = Object.assign({ env: {}, user: "st", cache: null, notion: "ok", upsertFail: false, isStError: false, notionStatus: null, pages: null }, opts);
  const env = Object.assign({ SUPABASE_URL: URL_, SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", NOTION_TOKEN: SECRET, ALLOWED_ORIGIN: "https://luciusgr.github.io" }, o.env);
  for (const k of Object.keys(env)) if (env[k] === null) delete env[k];
  let handler;
  globalThis.Deno = { env: { get: k => env[k] }, serve: h => { handler = h; } };
  let notionCalls = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init.method || (typeof input !== "string" && input.method) || "GET").toUpperCase();
    const hdr = new Headers(init.headers || (typeof input !== "string" ? input.headers : {}));
    calls.push(method + " " + url.replace(URL_, "").replace(NOTION, "N:"));
    const J = (s, b, h = {}) => new Response(b === undefined ? null : JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...h } });
    if (url.startsWith(URL_ + "/auth/v1/user")) {
      const tok = (hdr.get("authorization") || "").replace("Bearer ", "");
      if (tok === "good-st") return J(200, { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", email: "r@x" });
      if (tok === "good-player") return J(200, { id: "22222222-2222-2222-2222-222222222222", aud: "authenticated", email: "p@x" });
      return J(401, { msg: "invalid JWT", code: 401 });
    }
    if (url.startsWith(URL_ + "/rest/v1/rpc/is_st")) {
      if (o.isStError) return J(500, { message: "boom" });
      const tok = (hdr.get("authorization") || "").replace("Bearer ", "");
      return J(200, tok === "good-st");
    }
    if (url.startsWith(URL_ + "/rest/v1/notion_cache")) {
      if (method === "GET") return J(200, o.cache ? [o.cache] : []);
      writes.push({ url, body: JSON.parse(init.body) });
      return o.upsertFail ? J(500, { message: "write failed", code: "42501" }) : new Response(null, { status: 201 });
    }
    if (url.startsWith(NOTION)) {
      notionCalls++;
      const body = JSON.parse(init.body || "{}");
      const isNpc = url.includes("43d92643") || url.includes("8b4c5c76");
      const rows = isNpc ? NPCS : RELS;
      if (typeof o.notion === "function") return o.notion({ url, body, hdr, isNpc, rows, n: notionCalls, J });
      if (o.notion === "401") return J(401, { code: "unauthorized", message: "API token is invalid." });
      return J(200, { results: rows, has_more: false, next_cursor: null });
    }
    throw new Error("unerwarteter Aufruf: " + method + " " + url);
  };
  await import(pathToFileURL(FN).href + "?n=" + (++seq));
  const call = (init, p = "") => handler(new Request("https://f.test/" + p, init));
  let status = "PASS", detail = "";
  try { await run({ call, calls, writes, env, J: (r) => r }); } catch (e) { status = "FAIL"; detail = e.message.split("\n")[0]; }
  results.push({ id, name, status, detail });
}
const post = (tok, body) => ({ method: "POST", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) }, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) });
const js = r => r.json();

await scenario("F01", "OPTIONS liefert 200 und CORS-Header nur für die erlaubte Herkunft", {}, async ({ call }) => {
  const r = await call({ method: "OPTIONS" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "https://luciusgr.github.io");
  assert.match(r.headers.get("access-control-allow-headers"), /authorization/);
  assert.equal(r.headers.get("vary"), "Origin");
});
await scenario("F02", "GET wird mit 405 abgelehnt", {}, async ({ call }) => { const r = await call({ method: "GET" }); assert.equal(r.status, 405); });
await scenario("F03", "Ohne Authorization-Header: 401, keine Datenbank-/Notion-Aufrufe", {}, async ({ call, calls }) => {
  const r = await call(post(null, {})); assert.equal(r.status, 401); assert.equal(calls.length, 0);
});
await scenario("F04", "Ungültiges JWT: 401, Notion wird nicht gefragt", {}, async ({ call, calls }) => {
  const r = await call(post("muell", {})); assert.equal(r.status, 401); assert.ok(!calls.some(c => c.includes("N:")));
});
await scenario("F05", "Spieler (kein ST): 403, kein Cache-Lesen, kein Notion-Aufruf", { user: "player" }, async ({ call, calls }) => {
  const r = await call(post("good-player", { refresh: true })); assert.equal(r.status, 403);
  assert.ok(!calls.some(c => c.includes("notion_cache") || c.includes("N:")), calls.join(","));
});
await scenario("F06", "ST, Cache vorhanden, refresh=false: Antwort aus Cache ohne Notion-Aufruf", { cache: { payload: { npcs: [1], rels: [] }, fetched_at: "2026-10-20T10:00:00Z" } }, async ({ call, calls }) => {
  const r = await call(post("good-st", { refresh: false })); const j = await js(r);
  assert.equal(r.status, 200); assert.equal(j.source, "cache"); assert.equal(j.fetched_at, "2026-10-20T10:00:00Z"); assert.ok(!calls.some(c => c.includes("N:")));
});
await scenario("F07", "ST, kein Cache: lädt aus Notion, schreibt Cache (id=1) und liefert npcs/rels", {}, async ({ call, writes }) => {
  const r = await call(post("good-st", {})); const j = await js(r);
  assert.equal(j.source, "notion"); assert.equal(j.npcs.length, 2); assert.equal(j.rels.length, 1); assert.equal(j.warning, undefined);
  assert.equal(writes.length, 1); assert.equal(writes[0].body.id, 1); assert.equal(writes[0].body.payload.npcs.length, 2);
});
await scenario("F08", "ST, refresh=true trotz Cache: frisch aus Notion, Cache überschrieben", { cache: { payload: { npcs: [], rels: [] }, fetched_at: "x" } }, async ({ call, writes }) => {
  const j = await js(await call(post("good-st", { refresh: true }))); assert.equal(j.source, "notion"); assert.equal(writes.length, 1);
});
await scenario("F09", "NOTION_TOKEN fehlt, Cache da: Cache + Warnung", { env: { NOTION_TOKEN: null }, cache: { payload: { npcs: [], rels: [] }, fetched_at: "x" } }, async ({ call }) => {
  const r = await call(post("good-st", { refresh: true })); const j = await js(r);
  assert.equal(r.status, 200); assert.equal(j.source, "cache"); assert.match(j.warning, /NOTION_TOKEN/);
});
await scenario("F10", "NOTION_TOKEN fehlt, kein Cache: 500 notion_token_missing", { env: { NOTION_TOKEN: null } }, async ({ call }) => {
  const r = await call(post("good-st", {})); assert.equal(r.status, 500); assert.equal((await js(r)).error, "notion_token_missing");
});
await scenario("F11", "Notion lehnt Token ab, Cache da: 200 aus Cache mit Warnung", { notion: "401", cache: { payload: { npcs: [], rels: [] }, fetched_at: "x" } }, async ({ call }) => {
  const r = await call(post("good-st", { refresh: true })); const j = await js(r);
  assert.equal(r.status, 200); assert.equal(j.source, "cache"); assert.match(j.warning, /Notion 401/);
});
await scenario("F12", "Notion lehnt Token ab, kein Cache: 502 notion_failed", { notion: "401" }, async ({ call }) => {
  const r = await call(post("good-st", {})); const j = await js(r); assert.equal(r.status, 502); assert.equal(j.error, "notion_failed"); assert.match(j.message, /401/);
});
await scenario("F13", "Notion 429 mit Retry-After: Wiederholung, dann Erfolg", { notion: ({ n, rows, J }) => n === 1 ? J(429, { code: "rate_limited" }, { "Retry-After": "0" }) : J(200, { results: rows, has_more: false }) }, async ({ call }) => {
  const j = await js(await call(post("good-st", {}))); assert.equal(j.source, "notion"); assert.equal(j.npcs.length, 2);
});
await scenario("F14", "Paginierung: has_more/next_cursor wird bis zum Ende gelesen", {
  notion: ({ body, rows, isNpc, J }) => { if (!isNpc) return J(200, { results: rows, has_more: false }); if (!body.start_cursor) return J(200, { results: [rows[0]], has_more: true, next_cursor: "c1" }); return J(200, { results: [rows[1]], has_more: false }); } },
  async ({ call }) => { const j = await js(await call(post("good-st", {}))); assert.equal(j.npcs.length, 2); });
await scenario("F15", "Data-Source-API 404: Fallback auf alte Database-Query (Notion-Version 2022-06-28)", {
  notion: ({ url, hdr, rows, J }) => url.includes("/data_sources/") ? J(404, { code: "object_not_found" }) : (hdr.get("notion-version") === "2022-06-28" ? J(200, { results: rows, has_more: false }) : J(400, { code: "bad_version" })) },
  async ({ call, calls }) => { const j = await js(await call(post("good-st", {}))); assert.equal(j.npcs.length, 2); assert.ok(calls.some(c => c.includes("N:/databases/"))); });
await scenario("F16", "Feld-Mapping: Name, Map-Label, Sekte, Clan, Tags, IDs ohne Bindestriche, Relationen", {}, async ({ call }) => {
  const j = await js(await call(post("good-st", {}))); const a = j.npcs[0], b = j.npcs[1];
  assert.equal(a.id, "aaaaaaaa000000000000000000000001"); assert.equal(a.name, "Prinz Aniq"); assert.equal(a.label, "Aniq"); assert.equal(a.sekte, "Camarilla"); assert.equal(a.clan, "Ventrue");
  assert.equal(b.tags, "A, B"); assert.equal(b.label, "");
  const r = j.rels[0]; assert.deepEqual(r.vonIds, ["aaaaaaaa000000000000000000000001"]); assert.deepEqual(r.nachIds, ["aaaaaaaa000000000000000000000002"]); assert.equal(r.richtung, "→");
});
await scenario("F17", "Cache-Schreiben schlägt fehl: trotzdem 200 mit Warnung", { upsertFail: true }, async ({ call }) => {
  const r = await call(post("good-st", {})); const j = await js(r); assert.equal(r.status, 200); assert.equal(j.npcs.length, 2); assert.equal(j.warning, "Cache nicht gespeichert");
});
await scenario("F18", "Fehlende Umgebung (SERVICE_ROLE_KEY): 500 config_missing", { env: { SUPABASE_SERVICE_ROLE_KEY: null } }, async ({ call }) => {
  const r = await call(post("good-st", {})); assert.equal(r.status, 500); assert.equal((await js(r)).error, "config_missing");
});
await scenario("F19", "Kaputtes JSON im Body wird wie refresh=false behandelt", { cache: { payload: { npcs: [], rels: [] }, fetched_at: "x" } }, async ({ call }) => {
  const r = await call(post("good-st", "{kaputt")); assert.equal(r.status, 200); assert.equal((await js(r)).source, "cache");
});
await scenario("F20", "Rollenprüfung schlägt technisch fehl: 500 role_check_failed (kein Zugriff)", { isStError: true }, async ({ call, calls }) => {
  const r = await call(post("good-st", {})); assert.equal(r.status, 500); assert.equal((await js(r)).error, "role_check_failed"); assert.ok(!calls.some(c => c.includes("N:")));
});
await scenario("F21", "Der Notion-Token taucht in keiner Antwort auf (Erfolg und Fehler)", { notion: "401" }, async ({ call }) => {
  for (const body of [{}, { refresh: true }]) { const t = await (await call(post("good-st", body))).text(); assert.ok(!t.includes(SECRET)); }
});
await scenario("F22", "Notion-Aufrufe sind reine Lese-Abfragen (nur /query, kein Schreiben)", {}, async ({ call, calls }) => {
  await call(post("good-st", {})); const n = calls.filter(c => c.includes("N:")); assert.ok(n.length >= 2); assert.ok(n.every(c => c.startsWith("POST") && c.endsWith("/query")), n.join(","));
});
await scenario("F23", "Notion-Authorization wird als Bearer mit dem Secret gesendet", { notion: ({ hdr, rows, J }) => hdr.get("authorization") === "Bearer " + SECRET ? J(200, { results: rows, has_more: false }) : J(401, { code: "unauthorized", message: "x" }) }, async ({ call }) => {
  const j = await js(await call(post("good-st", {}))); assert.equal(j.source, "notion");
});
await scenario("F24", "Standard-CORS ohne ALLOWED_ORIGIN ist '*' (Hinweis: Secret muss gesetzt sein)", { env: { ALLOWED_ORIGIN: null } }, async ({ call }) => {
  const r = await call({ method: "OPTIONS" }); assert.equal(r.headers.get("access-control-allow-origin"), "*");
});

for (const r of results) console.log(`${r.id}\t${r.status}\t${r.name}${r.detail ? "\t" + r.detail : ""}`);
console.log(`\nSUMMARY total=${results.length} pass=${results.filter(r => r.status === "PASS").length} fail=${results.filter(r => r.status === "FAIL").length}`);
