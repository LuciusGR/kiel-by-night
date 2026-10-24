// Kiel by Night · scene-import v1.0
// Nimmt Szenenkarten im Format kbn-scenes/1 entgegen und legt sie als Szenen an (Vorrat oder Session).
// Für den automatischen Import durch Claude: Aufruf mit dem Import-Schlüssel statt mit einer Anmeldung.
// Der Schlüssel liegt als Secret IMPORT_TOKEN hier und in der Umgebung von Claude, nie im Repo.
//
// Die Function kann nur EINES: neue Szenen (und deren NPC-Zeilen) anlegen. Sie liest nichts aus der Datenbank
// außer dem NPC-Cache und den Titeln der Szenen im Ziel, sie ändert und löscht nichts Vorhandenes.
//
// Aufruf: POST <SUPABASE_URL>/functions/v1/scene-import[?dry_run=1]
//   Header: x-import-token: <IMPORT_TOKEN>, Content-Type: application/json
//   Body:   Szenendatei kbn-scenes/1 (docs/Szenenformat_v1.md). "chronik" muss dem Titel einer vorhandenen Chronik entsprechen.
// Antwort: { ok, dry_run, session, chronicle, imported: [{ title, id, npcs: [{ name, linked, exact }] }], skipped: [{ title, reason }] }

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const IMPORT_TOKEN = Deno.env.get("IMPORT_TOKEN") ?? "";

const FORMAT = "kbn-scenes/1", MAX_SCENES = 100, MAX_TEXT = 20000, MAX_BODY = 2 * 1024 * 1024, MIN_TOKEN = 32;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Vergleich in konstanter Zeit (über SHA-256, damit die Länge nichts verrät)
async function sameToken(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

// ---------- Format prüfen (gleiche Regeln wie parseScenes in web/js/views/scenes.js) ----------
type Npc = { name: string; motivation: string; notion_id?: string };
type Scene = {
  title: string; place: string; mood: string; goal: string; antagonist: string; outcomes: string[]; threads: string[];
  body: string; details: string; npcs: Npc[]; order: number | null; idx: number;
};

function parseScenes(text: string): { errors: string[]; data: { session: number | null; chronicle: string; scenes: Scene[] } | null } {
  const errors: string[] = [];
  let j: any;
  try { j = JSON.parse(text); } catch { return { errors: ["Die Datei ist kein gültiges JSON."], data: null }; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { errors: ["Die Datei muss ein JSON-Objekt sein."], data: null };
  if (j.format !== FORMAT) errors.push(`Unbekanntes Format: erwartet "${FORMAT}"` + (j.format ? `, gefunden "${String(j.format).slice(0, 40)}".` : "."));
  if (j.session != null && (!Number.isInteger(j.session) || j.session < 1)) errors.push('"session" muss, wenn vorhanden, eine ganze Zahl ab 1 sein.');
  if (!Array.isArray(j.szenen) || !j.szenen.length) errors.push('"szenen" muss eine Liste mit mindestens einer Szene sein.');
  else if (j.szenen.length > MAX_SCENES) errors.push(`Zu viele Szenen (höchstens ${MAX_SCENES}).`);
  if (errors.length) return { errors, data: null };

  const str = (v: unknown, path: string, req = false): string => {
    if (v == null || v === "") { if (req) errors.push(path + " fehlt."); return ""; }
    if (typeof v !== "string") { errors.push(path + " muss Text sein."); return ""; }
    if (v.length > MAX_TEXT) { errors.push(`${path} ist zu lang (höchstens ${MAX_TEXT} Zeichen).`); return ""; }
    return v.trim();
  };
  const list = (v: unknown, path: string): string[] => {
    if (v == null) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) { errors.push(path + " muss eine Liste aus Text sein."); return []; }
    return (v as string[]).map((x) => x.trim()).filter(Boolean).slice(0, 50);
  };
  const scenes = (j.szenen as any[]).map((s, i): Scene | null => {
    const p = "Szene " + (i + 1);
    if (!s || typeof s !== "object" || Array.isArray(s)) { errors.push(p + " ist kein Objekt."); return null; }
    const npcs: Npc[] = [];
    if (s.npcs != null) {
      if (!Array.isArray(s.npcs)) errors.push(p + ': "npcs" muss eine Liste sein.');
      else s.npcs.slice(0, 50).forEach((n: any, k: number) => {
        if (typeof n === "string") { if (n.trim()) npcs.push({ name: n.trim(), motivation: "" }); }
        else if (n && typeof n === "object" && !Array.isArray(n)) {
          const name = str(n.name, `${p}, NPC ${k + 1}: "name"`, true), motivation = str(n.motivation, `${p}, NPC ${k + 1}: "motivation"`);
          if (name) npcs.push({ name, motivation });
        } else errors.push(`${p}, NPC ${k + 1} muss Text oder ein Objekt mit "name" sein.`);
      });
    }
    const order = s.reihenfolge == null ? null : s.reihenfolge;
    if (order != null && !Number.isInteger(order)) errors.push(p + ': "reihenfolge" muss eine ganze Zahl sein.');
    return {
      title: str(s.titel, p + ': "titel"', true), place: str(s.ort, p + ': "ort"'), mood: str(s.stimmung, p + ': "stimmung"'),
      goal: str(s.ziel, p + ': "ziel"'), antagonist: str(s.gegenspieler, p + ': "gegenspieler"'),
      outcomes: list(s.ausgaenge, p + ': "ausgaenge"'), threads: list(s.faeden, p + ': "faeden"'),
      body: str(s.text, p + ': "text"'), details: str(s.details, p + ': "details"'), npcs,
      order: Number.isInteger(order) ? order : null, idx: i,
    };
  });
  if (errors.length) return { errors, data: null };
  const ok = scenes as Scene[];
  ok.sort((a, b) => ((a.order ?? a.idx + 1) - (b.order ?? b.idx + 1)) || (a.idx - b.idx));
  return { errors: [], data: { session: j.session ?? null, chronicle: typeof j.chronik === "string" ? j.chronik.trim() : "", scenes: ok } };
}

// ---------- NPC-Abgleich (gleiche Regeln wie matchNpc in scenes.js): exakt auf Name/Label, sonst eindeutiger Teiltreffer ----------
type NotionNpc = { id: string; name: string; label: string };
function matchNpc(name: string, npcs: NotionNpc[]): { id: string; name: string; exact: boolean } | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const exact = npcs.filter((n) => n.name.toLowerCase() === q || n.label.toLowerCase() === q);
  if (exact.length) return { id: exact[0].id, name: exact[0].name, exact: true };
  const part = npcs.filter((n) => n.name.toLowerCase().includes(q) || n.label.toLowerCase().includes(q));
  return part.length === 1 ? { id: part[0].id, name: part[0].name, exact: false } : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  // Ohne ausreichend langen Schlüssel ist die Function abgeschaltet.
  if (IMPORT_TOKEN.length < MIN_TOKEN) return json(503, { error: "import_disabled" });
  const sent = req.headers.get("x-import-token") ?? "";
  if (!sent || !(await sameToken(sent, IMPORT_TOKEN))) return json(401, { error: "unauthorized" });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too_large" });
  const { errors, data } = parseScenes(raw);
  if (!data) return json(422, { error: "invalid", errors: errors.slice(0, 20) });

  const dry = new URL(req.url).searchParams.get("dry_run") === "1";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const session = data.session; // null = Vorrat

  // Chronik: "chronik" in der Datei muss genau (ohne Beachtung der Groß-/Kleinschreibung) einem Chroniktitel entsprechen.
  // Ohne Angabe gilt die Chronik der Session (Zusatzangaben), sonst keine. Eine unbekannte Chronik bricht ab, statt falsch zuzuordnen.
  const { data: chrons, error: chErr } = await admin.from("chronicles").select("id, title");
  if (chErr) return json(500, { error: "read_failed", where: "chronicles", detail: chErr.message });
  let chronicleId: string | null = null;
  if (data.chronicle) {
    const hit = (chrons ?? []).find((c: any) => String(c.title).trim().toLowerCase() === data.chronicle.toLowerCase());
    if (!hit) return json(422, { error: "unknown_chronicle", chronik: data.chronicle, known: (chrons ?? []).map((c: any) => c.title) });
    chronicleId = hit.id;
  } else if (session != null) {
    const { data: info, error: iErr } = await admin.from("session_info").select("chronicle_id").eq("session_number", session).maybeSingle();
    if (iErr) return json(500, { error: "read_failed", where: "session_info", detail: iErr.message });
    chronicleId = info?.chronicle_id ?? null;
  }
  const chronicleTitle = (chrons ?? []).find((c: any) => c.id === chronicleId)?.title ?? null;

  // Vorhandene Szenen im Ziel: Titel in derselben Chronik (zum Überspringen) und höchste Position
  const { data: existing, error: exErr } = await admin.from("scenes").select("session_number, position, title, chronicle_id");
  if (exErr) return json(500, { error: "read_failed", where: "scenes", detail: exErr.message });
  const here = (existing ?? []).filter((x: any) => (x.session_number ?? null) === session);
  const titles = new Set(here.filter((x: any) => (x.chronicle_id ?? null) === chronicleId).map((x: any) => String(x.title).trim().toLowerCase()));
  let pos = here.reduce((m: number, x: any) => Math.max(m, x.position || 0), 0);

  const { data: cache } = await admin.from("notion_cache").select("payload").eq("id", 1).maybeSingle(); // ohne Cache: NPCs bleiben unverknüpft
  const npcList: NotionNpc[] = ((cache?.payload?.npcs ?? []) as any[]).filter((r) => r?.id && (r.name || r.label))
    .map((r) => ({ id: String(r.id), name: String(r.name || r.label || ""), label: String(r.label || "") }));

  const imported: { title: string; id: string | null; npcs: { name: string; linked: string | null; exact: boolean }[] }[] = [];
  const skipped: { title: string; reason: string }[] = [];
  for (const sc of data.scenes) {
    const key = sc.title.toLowerCase();
    if (titles.has(key)) { skipped.push({ title: sc.title, reason: "Titel gibt es schon" }); continue; }
    titles.add(key);
    const npcs = sc.npcs.map((n) => {
      const m = matchNpc(n.name, npcList);
      return { ...n, notion_id: m ? m.id : "", linked: m ? m.name : null, exact: !!m?.exact };
    });
    let id: string | null = null;
    if (!dry) {
      const { data: row, error } = await admin.from("scenes").insert({
        session_number: session, chronicle_id: chronicleId, position: ++pos, title: sc.title, place: sc.place, mood: sc.mood, goal: sc.goal, antagonist: sc.antagonist,
        outcomes: sc.outcomes, threads: sc.threads, body: sc.body, details: sc.details,
      }).select("id").single();
      if (error || !row) return json(500, { error: "insert_failed", detail: error?.message, imported, skipped, failed_at: sc.title });
      id = row.id;
      if (npcs.length) {
        const { error: nErr } = await admin.from("scene_npcs").insert(npcs.map((n) => ({ scene_id: id, notion_id: n.notion_id, name: n.name, motivation: n.motivation })));
        if (nErr) {
          await admin.from("scenes").delete().eq("id", id); // halb angelegte Szene zurücknehmen
          return json(500, { error: "npc_insert_failed", detail: nErr.message, imported, skipped, failed_at: sc.title });
        }
      }
    }
    imported.push({ title: sc.title, id, npcs: npcs.map((n) => ({ name: n.name, linked: n.linked, exact: n.exact })) });
  }
  return json(200, { ok: true, dry_run: dry, session, chronicle: chronicleTitle, imported, skipped });
});
