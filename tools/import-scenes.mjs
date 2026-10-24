// Kiel by Night · Szenen automatisch importieren (ruft die Edge Function scene-import auf)
// Aufruf: node tools/import-scenes.mjs <szenen.json> [--dry-run]
// Umgebung: KBN_IMPORT_TOKEN (Pflicht, gleicher Wert wie das Secret IMPORT_TOKEN in Supabase)
//           KBN_IMPORT_URL   (optional, Standard: Function des Projekts)
// Hinter einem Proxy (z. B. Claude-Cloud-Umgebung) zusätzlich NODE_USE_ENV_PROXY=1 setzen, sonst findet Node den Host nicht.
// Der Schlüssel gehört nie ins Repo. --dry-run prüft und gleicht ab, schreibt aber nichts.
import fs from "node:fs";

const URL_ = process.env.KBN_IMPORT_URL || "https://ueiqslwzpjzfpexiwtbb.supabase.co/functions/v1/scene-import";
const TOKEN = process.env.KBN_IMPORT_TOKEN || "";
const args = process.argv.slice(2), dry = args.includes("--dry-run"), file = args.find((a) => !a.startsWith("--"));
if (!file || !TOKEN) { console.error("Aufruf: KBN_IMPORT_TOKEN=… node tools/import-scenes.mjs <szenen.json> [--dry-run]"); process.exit(2); }

const res = await fetch(URL_ + (dry ? "?dry_run=1" : ""), { method: "POST", headers: { "x-import-token": TOKEN, "Content-Type": "application/json" }, body: fs.readFileSync(file, "utf8") });
const out = await res.json().catch(() => ({}));
if (!res.ok) { console.error("Fehler " + res.status + ": " + JSON.stringify(out, null, 2)); process.exit(1); }
console.log((out.dry_run ? "Trockenlauf: " : "") + out.imported.length + " Szenen " + (out.dry_run ? "würden angelegt" : "angelegt") + " (" + (out.session != null ? "Session " + out.session : "Vorrat") + ", Chronik: " + (out.chronicle || "keine") + ")");
for (const s of out.imported) console.log(" + " + s.title + (s.npcs.length ? "  [NPCs: " + s.npcs.map((n) => n.name + (n.linked ? "→" + n.linked : " (nicht verknüpft)")).join(", ") + "]" : ""));
for (const s of out.skipped) console.log(" = " + s.title + " übersprungen: " + s.reason);
