// Kiel by Night · account-admin v1.0
// Konten der Gruppe verwalten, ohne das Supabase-Dashboard: neues Konto mit Profil anlegen, Passwort neu setzen.
// Antwortet ausschließlich dem Storyteller. Der Service-Schlüssel bleibt hier (eingebautes Secret), er steht nie im Browser.
//
// Aufruf aus dem Browser: supabase.functions.invoke("account-admin", { body })
//   { action: "create", username, password, display_name, role }   role: "player" (Standard) oder "st"
//   { action: "set_password", user_id, password }
// Benutzernamen werden wie in der Website zu <name>@kbn.invalid (es werden nie E-Mails verschickt).
// Passwörter werden weder protokolliert noch zurückgegeben.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const LOGIN_DOMAIN = "kbn.invalid";
const MAX_BODY = 4096;

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USERNAME = /^[a-z0-9._-]{2,32}$/;
const okPassword = (p: unknown): p is string => typeof p === "string" && p.length >= 8 && p.length <= 72;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) return json(500, { error: "config_missing" });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  // Aufrufer mit seinem eigenen JWT prüfen: muss angemeldet und Storyteller sein
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u, error: uErr } = await userClient.auth.getUser(auth.slice(7));
  if (uErr || !u?.user) return json(401, { error: "unauthorized" });
  const { data: isSt, error: stErr } = await userClient.rpc("is_st");
  if (stErr) return json(500, { error: "role_check_failed" });
  if (isSt !== true) return json(403, { error: "forbidden" });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too_large" });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "bad_json" }); }
  if (!body || typeof body !== "object") return json(400, { error: "bad_json" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  if (body.action === "create") {
    const username = String(body.username ?? "").trim().toLowerCase();
    const display = String(body.display_name ?? "").trim();
    const role = body.role === "st" ? "st" : "player";
    if (!USERNAME.test(username)) return json(400, { error: "bad_username", message: "Benutzername: 2 bis 32 Zeichen, nur Kleinbuchstaben, Zahlen, Punkt, Minus und Unterstrich." });
    if (!display || display.length > 60) return json(400, { error: "bad_display_name", message: "Anzeigename: 1 bis 60 Zeichen." });
    if (!okPassword(body.password)) return json(400, { error: "bad_password", message: "Passwort: 8 bis 72 Zeichen." });

    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email: username + "@" + LOGIN_DOMAIN, password: body.password, email_confirm: true });
    if (cErr || !created?.user) {
      const taken = /already|registered|exists/i.test(cErr?.message ?? "") || (cErr as { status?: number } | null)?.status === 422;
      return taken ? json(409, { error: "username_taken", message: "Diesen Benutzernamen gibt es schon." }) : json(502, { error: "create_failed", message: "Konto konnte nicht angelegt werden." });
    }
    const id = created.user.id;
    const { error: pErr } = await admin.from("profiles").insert({ id, display_name: display, role });
    if (pErr) {
      // Kein Konto ohne Profil zurücklassen
      await admin.auth.admin.deleteUser(id).catch(() => {});
      return json(500, { error: "profile_failed", message: "Profil konnte nicht angelegt werden, das Konto wurde wieder entfernt." });
    }
    return json(200, { id, username, role });
  }

  if (body.action === "set_password") {
    const id = String(body.user_id ?? "").toLowerCase();
    if (!UUID.test(id)) return json(400, { error: "bad_user_id" });
    if (!okPassword(body.password)) return json(400, { error: "bad_password", message: "Passwort: 8 bis 72 Zeichen." });
    // Nur Mitglieder der Gruppe (Konten mit Profil), keine beliebigen Konten des Projekts
    const { data: prof, error: fErr } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
    if (fErr) return json(500, { error: "lookup_failed" });
    if (!prof) return json(404, { error: "no_profile", message: "Für dieses Konto gibt es kein Profil." });
    const { error: upErr } = await admin.auth.admin.updateUserById(id, { password: body.password });
    if (upErr) return json(502, { error: "update_failed", message: "Passwort konnte nicht gesetzt werden." });
    return json(200, { ok: true });
  }

  return json(400, { error: "bad_action" });
});
