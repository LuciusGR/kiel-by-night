// Test der Edge Function notion-proxy gegen Mock-Server (Supabase + Notion).
// Aufruf: deno run --allow-net --allow-env --allow-read tests/notion_proxy_test.ts
const PORT = 54400, BASE = `http://127.0.0.1:${PORT}`;
const ST = "11111111-1111-1111-1111-111111111111", P1 = "22222222-2222-2222-2222-222222222222";
let cache: any = null, notionCalls: string[] = [], mode: "ok" | "legacy" | "unauthorized" = "ok";

const rt = (s: string) => ({ type: "rich_text", rich_text: s ? [{ plain_text: s }] : [] });
const title = (s: string) => ({ type: "title", title: [{ plain_text: s }] });
const sel = (s: string) => ({ type: "select", select: s ? { name: s } : null });
const rel = (...ids: string[]) => ({ type: "relation", relation: ids.map((id) => ({ id })) });
const npc = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, url: `https://www.notion.so/${id.replace(/-/g, "")}`,
  properties: { Name: title(name), "Map-Label": rt(""), "Map-Tags": rt("A \\| B"), Notizen: rt("Zeile1<br>Zeile2"), Sekte: sel("Camarilla"), Wesen: sel("Ghoul"), Status: sel("Aktiv"), ...extra },
});
const NPC_PAGES = [[npc("aaaa-1", "Aniq"), npc("aaaa-2", "Mara")], [npc("aaaa-3", "Jäger", { Sekte: sel("") })]];
const REL_PAGES = [{ id: "rrrr-1", properties: { Beziehung: title("Aniq → Mara: Herrin von"), Von: rt("Aniq"), Nach: rt("Mara"), "Von (NPC)": rel("aaaa-1"), "Nach (NPC)": rel("aaaa-2"), Beschreibung: rt("geheim"), Richtung: sel("gerichtet") } }];

Deno.serve({ port: PORT, onListen() {} }, async (req) => {
  const u = new URL(req.url), auth = req.headers.get("Authorization") ?? "";
  const who = auth.includes("st-token") ? ST : auth.includes("player-token") ? P1 : null;
  if (u.pathname === "/auth/v1/user") return who ? Response.json({ id: who, aud: "authenticated" }) : Response.json({ msg: "bad jwt" }, { status: 401 });
  if (u.pathname === "/rest/v1/rpc/is_st") return Response.json(who === ST);
  if (u.pathname === "/rest/v1/notion_cache") {
    if (req.method === "GET") {
      const rows = cache ? [cache] : [];
      if ((req.headers.get("Accept") ?? "").includes("vnd.pgrst.object")) return rows.length ? Response.json(rows[0]) : Response.json({ code: "PGRST116" }, { status: 406 });
      return Response.json(rows);
    }
    const body = await req.json(); cache = Array.isArray(body) ? body[0] : body; return new Response(null, { status: 201 });
  }
  if (u.pathname.startsWith("/v1/")) {
    notionCalls.push(u.pathname);
    if (mode === "unauthorized") return Response.json({ code: "unauthorized", message: "API token is invalid." }, { status: 401 });
    if (mode === "legacy" && u.pathname.startsWith("/v1/data_sources")) return Response.json({ code: "invalid_request_url" }, { status: 400 });
    const b = await req.json();
    if (u.pathname.includes("43d92643") || u.pathname.includes("8b4c5c76")) {
      const page = b.start_cursor === "c2" ? 1 : 0;
      return Response.json({ results: NPC_PAGES[page], has_more: page === 0, next_cursor: page === 0 ? "c2" : null });
    }
    return Response.json({ results: REL_PAGES, has_more: false, next_cursor: null });
  }
  return new Response("not found", { status: 404 });
});

Deno.env.set("SUPABASE_URL", BASE);
Deno.env.set("SUPABASE_ANON_KEY", "anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("NOTION_TOKEN", "secret_test");
Deno.env.set("NOTION_API_BASE", BASE + "/v1");
await import("../supabase/functions/notion-proxy/index.ts"); // startet Deno.serve auf Port 8000

const call = (token: string | null, body: unknown = {}) => fetch("http://127.0.0.1:8000/", {
  method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: JSON.stringify(body),
});
let failed = 0;
const check = (cond: boolean, msg: string) => { console.log((cond ? "ok   " : "FEHLER ") + msg); if (!cond) failed++; };

let r = await call(null); await r.body?.cancel(); check(r.status === 401, "ohne Login → 401");
r = await call("player-token"); await r.body?.cancel(); check(r.status === 403, "Spieler → 403");
r = await fetch("http://127.0.0.1:8000/", { method: "OPTIONS" }); await r.body?.cancel(); check(r.status === 200 && !!r.headers.get("Access-Control-Allow-Origin"), "CORS-Preflight");

r = await call("st-token"); let j = await r.json();
check(r.status === 200 && j.source === "notion", "ST ohne Cache → frisch aus Notion");
check(j.npcs?.length === 3 && j.rels?.length === 1, "Paginierung: 3 NPCs, 1 Beziehung");
check(j.npcs[0].id === "aaaa1" && j.npcs[0].wesen === "Ghoul" && j.npcs[0].sekte === "Camarilla", "NPC-Felder gemappt");
check(j.npcs[0].tags === "A \\| B" && j.npcs[0].notes === "Zeile1<br>Zeile2", "Rohtext unverändert (Pipes, <br>)");
check(j.rels[0].vonIds[0] === "aaaa1" && j.rels[0].richtung === "gerichtet", "Relationen gemappt");
check(!!cache && cache.payload?.npcs?.length === 3, "Cache geschrieben");
check(notionCalls.every((p) => p.startsWith("/v1/data_sources/")), "neue Data-Source-API genutzt");

notionCalls = [];
r = await call("st-token"); j = await r.json();
check(j.source === "cache" && notionCalls.length === 0, "zweiter Aufruf aus Cache, keine Notion-Anfrage");

mode = "legacy"; notionCalls = [];
r = await call("st-token", { refresh: true }); j = await r.json();
check(j.source === "notion" && notionCalls.some((p) => p.startsWith("/v1/databases/")), "Fallback auf alte Database-API");

mode = "unauthorized";
r = await call("st-token", { refresh: true }); j = await r.json();
check(r.status === 200 && j.source === "cache" && /401/.test(j.warning ?? ""), "Notion-Fehler → Cache + Warnung");

cache = null;
r = await call("st-token", { refresh: true }); j = await r.json();
check(r.status === 502 && j.error === "notion_failed", "Notion-Fehler ohne Cache → 502");

console.log(failed ? `NOTION-PROXY: ${failed} Fehler` : "NOTION-PROXY: alles ok");
Deno.exit(failed ? 1 : 0);
