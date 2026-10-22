// Kiel by Night · db-migrate v1.0
// Wendet EINE benannte Migrationsdatei aus supabase/migrations/ an, aber nur, wenn sie bereits auf main des Repos liegt.
// So kann Claude Migrationen einspielen, ohne dass jemand im SQL-Editor einfügen muss. Aufruf mit eigenem Schlüssel (MIGRATE_TOKEN).
//
// Schutz:
//  - Ohne Secret MIGRATE_TOKEN (mind. 32 Zeichen) ist die Function abgeschaltet.
//  - Es läuft nur SQL aus einer Datei des Repos unter einem festen Commit (sha), und dieser Commit muss auf main liegen.
//    Der Aufrufer muss die SHA-256 der Datei mitschicken, die Function prüft sie (was gezeigt wurde, ist, was läuft).
//  - Jede Migration läuft in einer Transaktion und wird in kbn_admin.migrations vermerkt (nicht über die API erreichbar).
//    Eine vermerkte Migration läuft nie ein zweites Mal.
//
// Aufruf: POST <SUPABASE_URL>/functions/v1/db-migrate, Header x-migrate-token
//   { "action": "status" }
//   { "action": "apply", "name": "<jjjjmmtthhmmss_name_vX_Y>", "sha": "<40 Zeichen Commit>", "sql_sha256": "<64 Zeichen>", "dry_run": true|false }
//   { "action": "baseline", "sha": "<Commit>", "names": ["..."] }   // vermerkt bereits von Hand angewendete Migrationen, führt nichts aus

import postgres from "npm:postgres@3.4.4";

const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const TOKEN = Deno.env.get("MIGRATE_TOKEN") ?? "";
const REPO = Deno.env.get("MIGRATE_REPO") ?? "LuciusGR/kiel-by-night";
const BRANCH = Deno.env.get("MIGRATE_BRANCH") ?? "main";
const GH_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? ""; // optional, gegen das Ratenlimit der GitHub-API
const MIN_TOKEN = 32, MAX_SQL = 1024 * 1024, MAX_BODY = 64 * 1024;
const NAME_RE = /^[0-9]{14}_[a-z0-9_]+$/, SHA_RE = /^[0-9a-f]{40}$/, HASH_RE = /^[0-9a-f]{64}$/;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const enc = new TextEncoder();
async function sha256(text: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function same(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

// Liegt der Commit auf main? (main ist dem Commit voraus oder gleich)
async function onMain(sha: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/compare/${sha}...${BRANCH}`, {
    headers: { "Accept": "application/vnd.github+json", "User-Agent": "kbn-db-migrate", ...(GH_TOKEN ? { "Authorization": "Bearer " + GH_TOKEN } : {}) },
  });
  if (!res.ok) throw new Error("github_compare_" + res.status);
  const j = await res.json();
  return j.status === "ahead" || j.status === "identical";
}
async function fileAt(sha: string, name: string): Promise<string | null> {
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/supabase/migrations/${name}.sql`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("github_raw_" + res.status);
  const text = await res.text();
  if (text.length > MAX_SQL) throw new Error("file_too_large");
  return text;
}

const INIT = `
  create schema if not exists kbn_admin;
  revoke all on schema kbn_admin from public, anon, authenticated;
  create table if not exists kbn_admin.migrations (
    name text primary key, sql_sha256 text not null, commit_sha text not null, applied_at timestamptz not null default now(), note text not null default ''
  );
  revoke all on kbn_admin.migrations from public, anon, authenticated;`;

class Rollback extends Error {}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (TOKEN.length < MIN_TOKEN || !DB_URL) return json(503, { error: "migrate_disabled" });
  const sent = req.headers.get("x-migrate-token") ?? "";
  if (!sent || !(await same(sent, TOKEN))) return json(401, { error: "unauthorized" });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too_large" });
  let b: any;
  try { b = JSON.parse(raw); } catch { return json(422, { error: "invalid_json" }); }
  const action = b?.action ?? "apply";

  const sql = postgres(DB_URL, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    await sql.unsafe(INIT);

    if (action === "status") {
      const rows = await sql.unsafe("select name, sql_sha256, commit_sha, applied_at, note from kbn_admin.migrations order by name");
      return json(200, { ok: true, applied: rows });
    }

    if (action === "baseline") {
      if (!SHA_RE.test(b.sha ?? "") || !Array.isArray(b.names) || !b.names.length || b.names.length > 200) return json(422, { error: "invalid_request" });
      if (!(await onMain(b.sha))) return json(422, { error: "commit_not_on_main" });
      const done: string[] = [];
      for (const name of b.names) {
        if (typeof name !== "string" || !NAME_RE.test(name)) return json(422, { error: "invalid_name", name });
        const text = await fileAt(b.sha, name);
        if (text == null) return json(422, { error: "file_not_found", name });
        await sql.unsafe("insert into kbn_admin.migrations(name, sql_sha256, commit_sha, note) values ($1, $2, $3, 'baseline: von Hand angewendet') on conflict (name) do nothing", [name, await sha256(text), b.sha]);
        done.push(name);
      }
      return json(200, { ok: true, baseline: done });
    }

    if (action !== "apply") return json(422, { error: "unknown_action" });
    const { name, sha, sql_sha256: expect } = b;
    if (typeof name !== "string" || !NAME_RE.test(name) || !SHA_RE.test(sha ?? "") || !HASH_RE.test(expect ?? "")) return json(422, { error: "invalid_request" });
    const dry = b.dry_run === true;

    const already = await sql.unsafe("select name from kbn_admin.migrations where name = $1", [name]);
    if (already.length) return json(409, { error: "already_applied", name });
    if (!(await onMain(sha))) return json(422, { error: "commit_not_on_main" });
    const text = await fileAt(sha, name);
    if (text == null) return json(422, { error: "file_not_found", name });
    const actual = await sha256(text);
    if (actual !== expect) return json(422, { error: "sha256_mismatch", expected: expect, actual });

    const t0 = Date.now();
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe("select pg_advisory_xact_lock(7355608)");
        await tx.unsafe(text);
        if (dry) throw new Rollback();
        await tx.unsafe("insert into kbn_admin.migrations(name, sql_sha256, commit_sha) values ($1, $2, $3)", [name, actual, sha]);
      });
    } catch (e) {
      if (e instanceof Rollback) return json(200, { ok: true, dry_run: true, name, sql_sha256: actual, ms: Date.now() - t0, note: "ausgeführt und zurückgerollt, nichts gespeichert" });
      const pe = e as any;
      return json(500, { error: "migration_failed", name, message: String(pe?.message ?? e).slice(0, 500), code: pe?.code, position: pe?.position, hint: pe?.hint });
    }
    return json(200, { ok: true, dry_run: false, name, sql_sha256: actual, ms: Date.now() - t0 });
  } catch (e) {
    return json(502, { error: "failed", message: String((e as any)?.message ?? e).slice(0, 300) });
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
});
