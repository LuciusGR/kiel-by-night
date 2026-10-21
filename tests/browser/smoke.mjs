import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));

const WEB = path.join(HERE, "../../web");
const OUT = path.join(HERE, "shots");
fs.mkdirSync(OUT, { recursive: true });
const fake = fs.readFileSync(path.join(HERE, "fake-supabase.js"), "utf8");
const cyto = fs.readFileSync(path.join(HERE, "node_modules/cytoscape/dist/cytoscape.min.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let failures = 0;
for (const role of ["st", "player"]) {
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const errors = [];
    page.on("pageerror", e => errors.push("pageerror: " + e.message));
    page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await page.addInitScript(r => { window.__KBN_ROLE = r; }, role);
    await page.route("**/*", async route => {
      const u = new URL(route.request().url());
      if (u.hostname === "kbn.test") {
        let p = u.pathname === "/" ? "/index.html" : u.pathname;
        if (p === "/js/config.js") return route.fulfill({ contentType: "text/javascript", body: 'export const SUPABASE_URL="https://x.supabase.co";export const SUPABASE_ANON_KEY="k";export const APP_VERSION="test";' });
        const f = path.join(WEB, p);
        if (fs.existsSync(f)) return route.fulfill({ contentType: types[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
        return route.fulfill({ status: 404, body: "" });
      }
      if (u.href.includes("supabase-js")) return route.fulfill({ contentType: "text/javascript", body: fake });
      if (u.href.includes("cytoscape")) return route.fulfill({ contentType: "text/javascript", body: cyto });
      return route.fulfill({ status: 204, body: "" }); // Fonts etc.
    });
    const views = role === "st" ? ["start", "chars", "sessions", "map", "wiki", "docs", "st"] : ["start", "chars", "sessions", "map", "wiki", "docs", "private"];
    for (const v of views) {
      await page.goto("https://kbn.test/#" + v);
      await page.waitForTimeout(v === "map" || v === "st" ? 2500 : 600);
      const txt = await page.locator("main").innerText();
      if (/konnte nicht geladen werden|Fehler/i.test(txt)) errors.push(`${v}: Fehlertext in main: ${txt.slice(0, 200)}`);
      if (scheme === "light" || v === "st" || v === "map") await page.screenshot({ path: `${OUT}/${role}-${scheme}-${v}.png`, fullPage: false });
    }
    // Interaktion: Charakterbogen öffnen, Hunger setzen, speichern
    try {
    await page.goto("https://kbn.test/#chars");
    await page.waitForTimeout(400);
    await page.locator(".pc").first().click({ timeout: 5000 });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Bearbeitung", exact: true }).click({ timeout: 5000 });
    await page.getByRole("button", { name: "Hunger 4" }).click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    const saved = await page.locator(".save-state").innerText();
    if (saved !== "Gespeichert") errors.push("Bogen: Speicherstatus = " + saved);
    } catch (e) { errors.push("Interaktion: " + e.message.split("\n")[0] + " | main=" + (await page.locator("main").innerText()).slice(0, 300)); }
    if (role === "st" && scheme === "light") await page.screenshot({ path: `${OUT}/sheet.png`, fullPage: true });
    // ST-Karte: Positionen nach Erstanordnung gespeichert (A2)?
    if (role === "st") {
      await page.goto("https://kbn.test/#st"); await page.waitForTimeout(3500);
      const n = await page.evaluate(() => window.__db.map_positions.filter(p => p.scope === "st").length);
      if (n < 5) errors.push("A2: ST-Positionen nicht gespeichert (" + n + ")");
    }
    console.log(`[${role}/${scheme}]`, errors.length ? "FEHLER" : "ok");
    for (const e of errors) console.log("   ", e);
    failures += errors.length;
    await page.close();
  }
}
// Login-Ansicht
{
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.addInitScript(() => { window.__KBN_LOGGED_OUT = true; });
  await page.route("**/*", async route => {
    const u = new URL(route.request().url());
    if (u.hostname === "kbn.test") {
      let p = u.pathname === "/" ? "/index.html" : u.pathname;
      if (p === "/js/config.js") return route.fulfill({ contentType: "text/javascript", body: 'export const SUPABASE_URL="https://x.supabase.co";export const SUPABASE_ANON_KEY="k";export const APP_VERSION="test";' });
      const f = path.join(WEB, p);
      return route.fulfill({ contentType: types[path.extname(f)] || "text/plain", body: fs.readFileSync(f) });
    }
    if (u.href.includes("supabase-js")) return route.fulfill({ contentType: "text/javascript", body: fake });
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto("https://kbn.test/");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/login-mobile.png` });
  const hasForm = await page.locator("#login-user").count();
  console.log("[login]", hasForm ? "ok" : "FEHLER: kein Formular"); if (!hasForm) failures++;
  await page.close();
}
await browser.close();
console.log(failures ? `SMOKE: ${failures} Fehler` : "SMOKE: alles ok");
process.exit(failures ? 1 : 0);
