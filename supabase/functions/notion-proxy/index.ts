// Kiel by Night · notion-proxy v1.0
// Liest NPCs und Beziehungen aus Notion (nur lesend) und cached das Ergebnis in public.notion_cache.
// Antwortet ausschließlich dem ST-Konto. Der Notion-Schlüssel bleibt als Secret NOTION_TOKEN hier.
//
// Aufruf aus dem Browser: supabase.functions.invoke("notion-proxy", { body: { refresh: false } })
//   refresh=false -> Cache, falls vorhanden; sonst frisch laden
//   refresh=true  -> frisch aus Notion laden und Cache ersetzen

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const NOTION_API = Deno.env.get("NOTION_API_BASE") ?? "https://api.notion.com/v1"; // nur für Tests überschreiben

// Aus der Übergabe, Abschnitt 5. Per Secret überschreibbar.
const NPC_SOURCE = Deno.env.get("NOTION_NPC_SOURCE") ?? "43d92643-5cc1-44f9-b12b-8977a87767f4";
const NPC_DB = Deno.env.get("NOTION_NPC_DB") ?? "8b4c5c76db7b4d4db57c7bdc32c652c8";
const REL_SOURCE = Deno.env.get("NOTION_REL_SOURCE") ?? "51381fc5-6079-4b3d-bfe7-94a65ead1c6d";
const REL_DB = Deno.env.get("NOTION_REL_DB") ?? "484bef7b8d764db9b1447c06987ea3c8";

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Notion ----------
type Prop = Record<string, any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function notionPost(path: string, body: unknown, version: string): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(NOTION_API + path, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + NOTION_TOKEN,
        "Notion-Version": version,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("Retry-After") ?? "1") * 1000;
      await sleep(Math.min(Math.max(wait, 400), 10_000) * (attempt + 1));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`Notion ${res.status}: ${data?.code ?? ""} ${data?.message ?? ""}`.trim());
      (err as any).status = res.status;
      (err as any).code = data?.code;
      throw err;
    }
    return data;
  }
  throw new Error("Notion antwortet dauerhaft mit 429/5xx.");
}

// Neue API (Data Sources, Notion-Version 2025-09-03); Fallback auf die alte Database-Query.
async function queryAll(sourceId: string, dbId: string): Promise<any[]> {
  const run = async (path: string, version: string) => {
    const rows: any[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 50; i++) {
      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const r = await notionPost(path, body, version);
      rows.push(...(r.results ?? []));
      if (!r.has_more || !r.next_cursor) break;
      cursor = r.next_cursor;
      await sleep(350); // Notion: ca. 3 Anfragen/s
    }
    return rows;
  };
  try {
    return await run(`/data_sources/${sourceId}/query`, "2025-09-03");
  } catch (e) {
    const s = (e as any).status;
    if (s === 400 || s === 404) return await run(`/databases/${dbId}/query`, "2022-06-28");
    throw e;
  }
}

function text(p: Prop | undefined): string {
  if (!p) return "";
  switch (p.type) {
    case "title": return (p.title ?? []).map((t: any) => t.plain_text).join("");
    case "rich_text": return (p.rich_text ?? []).map((t: any) => t.plain_text).join("");
    case "select": return p.select?.name ?? "";
    case "status": return p.status?.name ?? "";
    case "multi_select": return (p.multi_select ?? []).map((s: any) => s.name).join(", ");
    case "url": return p.url ?? "";
    case "number": return p.number == null ? "" : String(p.number);
    case "formula": return p.formula?.string ?? (p.formula?.number != null ? String(p.formula.number) : "");
    default: return "";
  }
}
const relIds = (p: Prop | undefined): string[] =>
  p?.type === "relation" ? (p.relation ?? []).map((r: any) => String(r.id).replace(/-/g, "")) : [];
const titleOf = (props: Record<string, Prop>) => text(Object.values(props).find((p) => p.type === "title"));
const pid = (id: string) => String(id).replace(/-/g, "");

function mapNpc(page: any) {
  const p = page.properties ?? {};
  return {
    id: pid(page.id),
    url: page.url ?? "",
    name: titleOf(p),
    label: text(p["Map-Label"]),
    tags: text(p["Map-Tags"]),
    notes: text(p["Notizen"]),
    fraktion: text(p["Fraktion"]),
    rank: text(p["Generation/Rang"]),
    clan: text(p["Clan"]),
    clanSekte: text(p["Clan/Sekte"]),
    sekte: text(p["Sekte"]),
    status: text(p["Status"]),
    kategorie: text(p["Kategorie"]),
    wesen: text(p["Wesen"]),
  };
}

function mapRel(page: any) {
  const p = page.properties ?? {};
  return {
    id: pid(page.id),
    title: titleOf(p),
    von: text(p["Von"]),
    nach: text(p["Nach"]),
    vonIds: relIds(p["Von (NPC)"]),
    nachIds: relIds(p["Nach (NPC)"]),
    beschreibung: text(p["Beschreibung"]),
    richtung: text(p["Richtung"]),
  };
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return json(500, { error: "config_missing", message: "SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY fehlen in der Function-Umgebung" });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  // Nutzer mit seinem eigenen JWT prüfen (RLS bleibt aktiv).
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u, error: uErr } = await userClient.auth.getUser(auth.slice(7));
  if (uErr || !u?.user) return json(401, { error: "unauthorized" });
  const { data: isSt, error: stErr } = await userClient.rpc("is_st");
  if (stErr) return json(500, { error: "role_check_failed" });
  if (isSt !== true) return json(403, { error: "forbidden" });

  let refresh = false;
  try { refresh = !!(await req.json())?.refresh; } catch { /* leerer Body */ }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: cached } = await admin.from("notion_cache").select("payload, fetched_at").eq("id", 1).maybeSingle();

  if (!refresh && cached) return json(200, { ...cached.payload, fetched_at: cached.fetched_at, source: "cache" });

  if (!NOTION_TOKEN) {
    return cached
      ? json(200, { ...cached.payload, fetched_at: cached.fetched_at, source: "cache", warning: "NOTION_TOKEN fehlt" })
      : json(500, { error: "notion_token_missing" });
  }

  try {
    const npcRows = await queryAll(NPC_SOURCE, NPC_DB);
    const relRows = await queryAll(REL_SOURCE, REL_DB);
    const payload = { npcs: npcRows.map(mapNpc), rels: relRows.map(mapRel) };
    const fetched_at = new Date().toISOString();
    const { error: wErr } = await admin.from("notion_cache").upsert({ id: 1, payload, fetched_at });
    return json(200, { ...payload, fetched_at, source: "notion", warning: wErr ? "Cache nicht gespeichert" : undefined });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (cached) return json(200, { ...cached.payload, fetched_at: cached.fetched_at, source: "cache", warning: msg });
    return json(502, { error: "notion_failed", message: msg });
  }
});
