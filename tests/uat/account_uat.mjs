// UAT der Edge Function account-admin gegen gespielte Supabase-Antworten (Node, Deno-Shim)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = HERE + "/out"; fs.mkdirSync(OUT, { recursive: true });
const FN = OUT + "/account-admin.ts";
fs.writeFileSync(FN, fs.readFileSync(path.resolve(HERE, "../../supabase/functions/account-admin/index.ts"), "utf8").replace("npm:@supabase/supabase-js@2.45.4", "@supabase/supabase-js"));
const URL_ = "https://proj.supabase.co", NEW_ID = "33333333-3333-4333-8333-333333333333", P1 = "22222222-2222-2222-2222-222222222222";
const results = []; let seq = 0;

async function scenario(id, name, opts, run) {
  const o = Object.assign({ env: {}, taken: false, profileFail: false, updateFail: false, isStError: false }, opts), calls = [], bodies = [];
  const env = Object.assign({ SUPABASE_URL: URL_, SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", ALLOWED_ORIGIN: "https://luciusgr.github.io" }, o.env);
  for (const k of Object.keys(env)) if (env[k] === null) delete env[k];
  let handler; globalThis.Deno = { env: { get: k => env[k] }, serve: h => { handler = h; } };
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url, method = (init.method || (typeof input !== "string" && input.method) || "GET").toUpperCase();
    const hdr = new Headers(init.headers || (typeof input !== "string" ? input.headers : {}));
    const tok = (hdr.get("authorization") || "").replace("Bearer ", "");
    calls.push(method + " " + url.replace(URL_, "")); if (init.body) bodies.push({ url: url.replace(URL_, ""), key: tok, body: JSON.parse(init.body) });
    const J = (s, b) => new Response(b === undefined ? null : JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
    if (url.startsWith(URL_ + "/auth/v1/user")) return tok === "good-st" ? J(200, { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated" }) : tok === "good-player" ? J(200, { id: P1, aud: "authenticated" }) : J(401, { msg: "invalid JWT" });
    if (url.startsWith(URL_ + "/rest/v1/rpc/is_st")) return o.isStError ? J(500, { message: "boom" }) : J(200, tok === "good-st");
    if (url.startsWith(URL_ + "/auth/v1/admin/users")) {
      if (tok !== "svc") return J(401, { msg: "no service key" });
      if (method === "POST") return o.taken ? J(422, { msg: "A user with this email address has already been registered", code: 422 }) : J(200, { id: NEW_ID, email: JSON.parse(init.body).email });
      if (method === "PUT") return o.updateFail ? J(500, { msg: "boom" }) : J(200, { id: P1 });
      if (method === "DELETE") return J(200, {});
    }
    if (url.startsWith(URL_ + "/rest/v1/profiles")) {
      if (method === "POST") return o.profileFail ? J(409, { message: "duplicate", code: "23505" }) : new Response(null, { status: 201 });
      if (method === "GET") return J(200, url.includes(P1) ? { id: P1 } : null);
    }
    return J(404, { message: "unexpected " + url });
  };
  await import(pathToFileURL(FN).href + "?v=" + (++seq));
  const call = async (body, o2 = {}) => { const r = await handler(new Request("https://fn/account-admin", { method: o2.method || "POST", headers: o2.token === null ? {} : { Authorization: "Bearer " + (o2.token || "good-st") }, body: o2.method === "OPTIONS" ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) })); return { status: r.status, json: await r.json().catch(() => null), headers: r.headers }; };
  try { await run({ call, calls, bodies }); results.push({ id, name, pass: true }); } catch (e) { results.push({ id, name, pass: false, detail: e.message.split("\n")[0] }); }
}
const CREATE = { action: "create", username: "Damien", password: "ein-langes-passwort", display_name: "Damien", role: "player" };

await scenario("A01", "ST legt Konto an: Adresse name@kbn.invalid, bestätigt, Profil mit Rolle, Antwort ohne Passwort", {}, async ({ call, bodies }) => {
  const r = await call(CREATE); assert.equal(r.status, 200); assert.deepEqual(r.json, { id: NEW_ID, username: "damien", role: "player" });
  const u = bodies.find(b => b.url.startsWith("/auth/v1/admin/users")); assert.equal(u.body.email, "damien@kbn.invalid"); assert.equal(u.body.email_confirm, true); assert.equal(u.key, "svc");
  const p = bodies.find(b => b.url.startsWith("/rest/v1/profiles")); assert.deepEqual(p.body, { id: NEW_ID, display_name: "Damien", role: "player" }); assert.ok(!JSON.stringify(r.json).includes("passwort"));
});
await scenario("A02", "Spieler wird abgewiesen (403), kein Admin-Aufruf", {}, async ({ call, calls }) => { const r = await call(CREATE, { token: "good-player" }); assert.equal(r.status, 403); assert.ok(!calls.some(c => c.includes("/admin/"))); });
await scenario("A03", "Ohne oder mit ungültiger Anmeldung: 401", {}, async ({ call, calls }) => { assert.equal((await call(CREATE, { token: null })).status, 401); assert.equal((await call(CREATE, { token: "bad" })).status, 401); assert.ok(!calls.some(c => c.includes("/admin/"))); });
await scenario("A04", "Rollenprüfung schlägt fehl: 500, kein Admin-Aufruf", { isStError: true }, async ({ call, calls }) => { assert.equal((await call(CREATE)).status, 500); assert.ok(!calls.some(c => c.includes("/admin/"))); });
await scenario("A05", "Ungültige Eingaben: Benutzername, Anzeigename, Passwort, Aktion, kaputtes JSON", {}, async ({ call, calls }) => {
  for (const [patch, err] of [[{ username: "a" }, "bad_username"], [{ username: "mit leer" }, "bad_username"], [{ username: "x@y.de" }, "bad_username"], [{ display_name: " " }, "bad_display_name"], [{ password: "kurz" }, "bad_password"], [{ password: "x".repeat(73) }, "bad_password"], [{ password: 12345678 }, "bad_password"], [{ action: "delete" }, "bad_action"]]) {
    const r = await call({ ...CREATE, ...patch }); assert.equal(r.status, 400, JSON.stringify(patch)); assert.equal(r.json.error, err); }
  assert.equal((await call("{kaputt")).json.error, "bad_json"); assert.ok(!calls.some(c => c.includes("/admin/")));
});
await scenario("A06", "Unbekannte Rolle wird zu 'player', 'st' bleibt 'st'", {}, async ({ call, bodies }) => {
  await call({ ...CREATE, role: "admin" }); assert.equal(bodies.filter(b => b.url.startsWith("/rest/v1/profiles")).pop().body.role, "player");
  await call({ ...CREATE, role: "st" }); assert.equal(bodies.filter(b => b.url.startsWith("/rest/v1/profiles")).pop().body.role, "st");
});
await scenario("A07", "Benutzername vergeben: 409, kein Profil", { taken: true }, async ({ call, calls }) => { const r = await call(CREATE); assert.equal(r.status, 409); assert.equal(r.json.error, "username_taken"); assert.ok(!calls.some(c => c.includes("/rest/v1/profiles"))); });
await scenario("A08", "Profil scheitert: Konto wird wieder gelöscht, 500", { profileFail: true }, async ({ call, calls }) => { const r = await call(CREATE); assert.equal(r.status, 500); assert.equal(r.json.error, "profile_failed"); assert.ok(calls.includes("DELETE /auth/v1/admin/users/" + NEW_ID)); });
await scenario("A09", "Passwort setzen für ein Mitglied: 200, Aufruf mit Service-Schlüssel", {}, async ({ call, bodies }) => {
  const r = await call({ action: "set_password", user_id: P1, password: "neues-passwort-1" }); assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true });
  const u = bodies.find(b => b.url === "/auth/v1/admin/users/" + P1); assert.equal(u.body.password, "neues-passwort-1"); assert.equal(u.key, "svc");
});
await scenario("A10", "Passwort setzen: Konto ohne Profil 404, ungültige ID 400, kurzes Passwort 400, Fehler von Supabase 502", { updateFail: true }, async ({ call, calls }) => {
  assert.equal((await call({ action: "set_password", user_id: NEW_ID, password: "neues-passwort-1" })).status, 404);
  assert.equal((await call({ action: "set_password", user_id: "../x", password: "neues-passwort-1" })).status, 400);
  assert.equal((await call({ action: "set_password", user_id: P1, password: "kurz" })).status, 400);
  assert.equal(calls.filter(c => c.startsWith("PUT /auth/v1/admin/users")).length, 0);
  assert.equal((await call({ action: "set_password", user_id: P1, password: "neues-passwort-1" })).status, 502);
});
await scenario("A11", "Spieler darf kein Passwort setzen", {}, async ({ call, calls }) => { assert.equal((await call({ action: "set_password", user_id: P1, password: "neues-passwort-1" }, { token: "good-player" })).status, 403); assert.ok(!calls.some(c => c.includes("/admin/"))); });
await scenario("A12", "Zu großer Body 413, falsche Methode 405, OPTIONS mit CORS auf die erlaubte Herkunft", {}, async ({ call }) => {
  assert.equal((await call({ ...CREATE, display_name: "x".repeat(5000) })).status, 413); assert.equal((await call(CREATE, { method: "PUT" })).status, 405);
  const o = await call(null, { method: "OPTIONS" }); assert.equal(o.status, 200); assert.equal(o.headers.get("access-control-allow-origin"), "https://luciusgr.github.io");
});
await scenario("A13", "Fehlende Konfiguration: 500 ohne Aufrufe", { env: { SUPABASE_SERVICE_ROLE_KEY: null } }, async ({ call, calls }) => { assert.equal((await call(CREATE)).status, 500); assert.equal(calls.length, 0); });

for (const r of results) console.log(`${r.id}\t${r.pass ? "PASS" : "FAIL"}\t${r.name}${r.detail ? "\t→ " + r.detail : ""}`);
const pass = results.filter(r => r.pass).length;
console.log(`\nSUMMARY total=${results.length} pass=${pass} fail=${results.length - pass}`);
process.exit(pass === results.length ? 0 : 1);
