import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = HERE + "/out"; fs.mkdirSync(OUT, { recursive: true });
const R = path.resolve(HERE, "../..") + "/", read = f => fs.readFileSync(f, "utf8");
const db = new PGlite();
const out = [];
async function step(name, sql) { try { await db.exec(sql); out.push("OK  " + name); } catch (e) { out.push("ERR " + name + ": " + e.message); return false; } return true; }
await step("mock", read(R + "tests/mock_supabase.sql"));
for (const f of fs.readdirSync(R + "supabase/migrations").sort()) {
  let s = read(R + "supabase/migrations/" + f);
  s = s.replace("create extension if not exists pgcrypto;", "-- pgcrypto in PGlite nicht noetig (gen_random_uuid ist Kern)");
  await step(f, s);
}
// UAT-Skript fuer die Attrappe anpassen
let u = read(HERE + "/uat_rls.sql");
u = u.replace("perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', rl)::text, true);",
  "perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true); perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', rl)::text, true);");
u = u.replace(/insert into auth\.users\(id, aud, role, email\) values[\s\S]*?\('uat-noprofile@example\.invalid'\)|insert into auth\.users\(id, aud, role, email\) values\s*\(p1[\s\S]*?noprofile@example\.invalid'\);/,
  "insert into auth.users(id, email) values (st, 'st@x'), (p1, 'p1@x'), (p2, 'p2@x'), (nop, 'nop@x');");
u = u.replace("insert into public.profiles(id, display_name, role) values (p1, 'UAT P1', 'player'), (p2, 'UAT P2', 'player');",
  "insert into public.profiles(id, display_name, role) values (st, 'Roland', 'st'), (p1, 'UAT P1', 'player'), (p2, 'UAT P2', 'player');");
fs.writeFileSync(OUT + "/uat_rls_local.sql", u);
let msg = "";
try { await db.exec(u); msg = "KEIN ENDE-EXCEPTION (unerwartet)"; } catch (e) { msg = e.message; }
console.log(out.join("\n"));
console.log("\n" + msg);
