// Kiel by Night · Migrationen einspielen (ruft die Edge Function db-migrate auf)
// Aufruf:
//   node tools/db-migrate.mjs status
//   node tools/db-migrate.mjs apply <name> [--dry-run] [--sha <commit>]
//   node tools/db-migrate.mjs baseline --through <name> [--sha <commit>]
// <name> ohne Endung .sql, zum Beispiel 20261023120000_player_map_sect_v1_9.
// Die Migration muss schon auf main liegen. --sha ist der Commit auf main (Standard: origin/main nach git fetch).
// Das Skript zeigt vor dem Aufruf den SQL-Text und dessen SHA-256, die Function prüft denselben Hash gegen die Datei im Repo.
// Umgebung: KBN_MIGRATE_TOKEN (Pflicht, gleicher Wert wie das Secret MIGRATE_TOKEN in Supabase)
//           KBN_MIGRATE_URL   (optional, Standard: Function des Projekts)
// Hinter einem Proxy (z. B. Claude-Cloud-Umgebung) zusätzlich NODE_USE_ENV_PROXY=1 setzen.
// Der Schlüssel gehört nie ins Repo.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const URL_ = process.env.KBN_MIGRATE_URL || "https://ueiqslwzpjzfpexiwtbb.supabase.co/functions/v1/db-migrate";
const TOKEN = process.env.KBN_MIGRATE_TOKEN || "";
const [cmd, ...rest] = process.argv.slice(2);
const flag = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
const has = n => rest.includes(n);
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
const usage = () => { console.error("Aufruf: node tools/db-migrate.mjs status | apply <name> [--dry-run] [--sha <commit>] | baseline --through <name> [--sha <commit>]"); process.exit(2); };
if (!TOKEN || !["status", "apply", "baseline"].includes(cmd)) usage();

const sha = flag("--sha") || git("rev-parse", "origin/main");
const fileAt = name => git("show", sha + ":supabase/migrations/" + name + ".sql");
const hash = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");

let body;
if (cmd === "status") body = { action: "status" };
else if (cmd === "apply") {
  const name = rest.find(a => !a.startsWith("--") && a !== flag("--sha"));
  if (!name) usage();
  const text = fileAt(name);
  console.log("--- " + name + ".sql (Commit " + sha.slice(0, 10) + ") ---\n" + text.trimEnd() + "\n--- SHA-256: " + hash(text) + " ---");
  body = { action: "apply", name, sha, sql_sha256: hash(text), dry_run: has("--dry-run") };
} else {
  const through = flag("--through"); if (!through) usage();
  const names = git("ls-tree", "--name-only", sha, "supabase/migrations/").split("\n").map(f => f.replace(/^supabase\/migrations\//, "").replace(/\.sql$/, "")).filter(n => /^\d{14}_/.test(n) && n <= through).sort();
  body = { action: "baseline", sha, names };
  console.log("Baseline für " + names.length + " Migrationen bis " + through);
}

const res = await fetch(URL_, { method: "POST", headers: { "x-migrate-token": TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const out = await res.json().catch(() => ({}));
if (!res.ok) { console.error("Fehler " + res.status + ": " + JSON.stringify(out, null, 2)); process.exit(1); }
if (cmd === "status") for (const m of out.applied) console.log(m.name + "  " + m.applied_at + (m.note ? "  (" + m.note + ")" : ""));
else console.log(JSON.stringify(out, null, 2));
