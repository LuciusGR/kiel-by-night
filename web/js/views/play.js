// Kiel by Night · Spielabend (nur Storyteller): die Szenen einer Session der Reihe nach, die Coterie im Blick, Notizen nur für den ST
import { h, toast, guard, head, bindDraft } from "../lib.js";
import { sb, S, go, registerView, onCleanup, setRoute, draftKey, loadChars, personName, watchTables } from "../core.js";
import { normSheet } from "./characters.js";
import { STATUS } from "./scenes.js";
import { stTabs } from "./sttabs.js";

registerView("play", async m => {
  if (!S.isST) { m.append(h("div", { class: "notice bad" }, "Dieser Bereich ist nur für den Storyteller.")); return; }
  const route = arg => setRoute(arg, false, "play");
  const [sr, ir, nr, scr] = await Promise.all([sb.from("sessions").select("number, title, play_date"), sb.from("session_info").select("session_number"), sb.from("session_notes").select("session_number"), sb.from("scenes").select("session_number")]);
  const nums = [...new Set([...(sr.data || []).map(x => x.number), ...(ir.data || []).map(x => x.session_number), ...(nr.data || []).map(x => x.session_number), ...(scr.data || []).map(x => x.session_number)].filter(n => n != null))].sort((a, b) => b - a);
  const meta = new Map((sr.data || []).map(x => [x.number, x]));
  let num = S.arg && S.arg.session != null && nums.includes(Number(S.arg.session)) ? Number(S.arg.session) : (nums[0] ?? null);
  const pick = h("select", { id: "play-session", "aria-label": "Session" }, ...nums.map(n => h("option", { value: String(n), selected: n === num ? true : null }, "Session " + n + (meta.get(n) && meta.get(n).title ? " · " + meta.get(n).title : ""))));
  pick.addEventListener("change", () => go("play", { session: Number(pick.value) }));
  m.append(head("Spielabend", "Die Szenen der Session der Reihe nach, daneben Hunger und Schaden der Coterie. Nur du siehst diesen Bereich.", stTabs("play")));
  if (num == null) { m.append(h("div", { class: "empty" }, "Noch keine Session. Lege im Bereich Sessions eine an und ordne ihr Szenen zu.")); return; }
  route({ session: num });
  const main = h("div", { class: "stack", style: "min-width:0" }), side = h("aside", { class: "stack play-side" });
  m.append(h("div", { class: "field", style: "max-width:420px;margin-bottom:14px" }, h("label", { for: "play-session" }, "Session"), pick), h("div", { class: "play-grid" }, main, side));

  // ---------- Szenen ----------
  let scenes = [], cur = 0;
  async function loadScenes() {
    const [s, n] = await Promise.all([sb.from("scenes").select("*").eq("session_number", num), sb.from("scene_npcs").select("*")]);
    if (s.error) { toast("Szenen konnten nicht geladen werden.", true); return; }
    scenes = s.data.sort((a, b) => a.position - b.position).map(x => ({ ...x, outcomes: x.outcomes || [], threads: x.threads || [], npcs: (n.data || []).filter(y => y.scene_id === x.id) }));
  }
  async function setStatus(sc, status, advance) {
    await guard(sb.from("scenes").update({ status }).eq("id", sc.id)); sc.status = status;
    if (advance && cur < scenes.length - 1) cur++;
    drawScenes();
  }
  function drawScenes() {
    if (!scenes.length) { main.replaceChildren(h("div", { class: "empty" }, "Diese Session hat noch keine Szenenkarten. Lege sie in der Session oder unter „Szenen“ an und ordne sie zu."),
      h("div", {}, h("button", { class: "btn", type: "button", onclick: () => go("sessions", { session: num }) }, "Zur Session " + num))); return; }
    const sc = scenes[cur], kv = [["Ort", sc.place], ["Stimmung", sc.mood], ["Ziel", sc.goal], ["Gegenspieler", sc.antagonist]].filter(([, v]) => v);
    main.replaceChildren(
      h("div", { class: "chips", role: "group", "aria-label": "Szenen dieser Session" }, ...scenes.map((x, i) => h("button", { class: "chip", type: "button", "aria-pressed": String(i === cur), "data-play-chip": x.id, title: STATUS[x.status], onclick: () => { cur = i; drawScenes(); } }, (i + 1) + ". " + x.title + (x.status === "open" ? "" : " ✓")))),
      h("article", { class: "panel stack", "data-play-scene": sc.id },
        h("div", { class: "row", style: "align-items:baseline;justify-content:space-between" }, h("span", { class: "eyebrow" }, "Szene " + (cur + 1) + " von " + scenes.length), h("span", { class: sc.status === "open" ? "badge" : "badge st" }, STATUS[sc.status])),
        h("h3", { style: "font-size:1.8rem" }, sc.title),
        sc.threads.length ? h("div", { class: "chips" }, h("span", { class: "eyebrow", style: "align-self:center" }, "Fäden"), ...sc.threads.map(t => h("span", { class: "badge st" }, t))) : null,
        kv.length ? h("dl", { class: "kv" }, ...kv.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null,
        sc.npcs.length ? h("div", {}, h("h4", { class: "eyebrow", style: "margin:0 0 6px" }, "NPCs und Motivation"), h("div", { class: "conn" }, ...sc.npcs.map(n => h("div", { class: "c" },
          n.notion_id ? h("button", { class: "chip", type: "button", title: "Auf der ST-Karte zeigen", onclick: () => go("st", { tab: "map", focus: n.notion_id }) }, n.name) : h("span", { class: "chip", style: "cursor:default;border-style:dashed" }, n.name),
          n.motivation ? h("div", { class: "muted" }, n.motivation) : null)))) : null,
        sc.outcomes.length ? h("div", {}, h("h4", { class: "eyebrow", style: "margin:0 0 6px" }, "Mögliche Ausgänge"), h("ul", { style: "margin:0;padding-left:20px" }, ...sc.outcomes.map(o => h("li", {}, o)))) : null,
        sc.body ? h("div", { class: "pre" }, sc.body) : null,
        sc.details ? h("details", { open: true }, h("summary", { class: "muted", style: "cursor:pointer" }, "Weitere Details und Infos"), h("div", { class: "pre", style: "margin-top:6px" }, sc.details)) : null,
        h("div", { class: "row" },
          h("button", { class: "btn", type: "button", disabled: cur === 0 ? true : null, onclick: () => { cur--; drawScenes(); } }, "← Vorige"),
          h("button", { class: "btn primary", type: "button", onclick: () => setStatus(sc, "played", true) }, cur < scenes.length - 1 ? "Gespielt, weiter →" : "Gespielt"),
          h("button", { class: "btn", type: "button", onclick: () => setStatus(sc, "skipped", true) }, "Übersprungen"),
          h("button", { class: "btn", type: "button", onclick: () => setStatus(sc, "postponed", true) }, "Verschoben"),
          sc.status !== "open" ? h("button", { class: "btn", type: "button", onclick: () => setStatus(sc, "open", false) }, "Wieder offen") : null)));
  }

  // ---------- Coterie: Hunger, Health, Willpower direkt ändern ----------
  const coterie = h("div", { class: "panel stack", "data-play-coterie": "1" });
  // Eine Änderung lädt den Bogen frisch, ändert nur das eine Feld und speichert: so geht keine Eingabe des Spielers verloren
  async function patchSheet(id, fn) {
    const row = await guard(sb.from("characters").select("*").eq("id", id).maybeSingle()); if (!row) return;
    const sheet = normSheet(row.sheet); fn(sheet);
    await guard(sb.from("characters").update({ sheet }).eq("id", id));
    await loadChars(); drawCoterie();
  }
  const cycle = (arr, len, i) => { const a = arr.slice(0, len); while (a.length < len) a.push(0); a[i] = ((a[i] | 0) + 1) % 3; return a; };
  function drawCoterie() {
    coterie.replaceChildren(h("div", { class: "row", style: "align-items:baseline;justify-content:space-between" }, h("h3", {}, "Coterie"), h("button", { class: "btn small", type: "button", onclick: async () => { await loadChars(); drawCoterie(); } }, "Aktualisieren")),
      ...S.chars.map(c => { const s = normSheet(c.sheet), hmax = (s.attr.Stamina || 0) + 3, wmax = (s.attr.Composure || 0) + (s.attr.Resolve || 0);
        const track = (arr, len, key, label) => h("span", { class: "boxes" }, ...Array.from({ length: len }, (_, i) => { const v = (arr || [])[i] | 0; return h("button", { type: "button", class: v ? "s" + v : "", "aria-label": c.name + ": " + label + " Kästchen " + (i + 1), onclick: () => patchSheet(c.id, sh => { sh[key] = cycle(sh[key], len, i); }) }); }));
        return h("div", { class: "play-char", "data-play-char": c.id },
          h("button", { class: "linkbtn", type: "button", style: "font-weight:700", onclick: () => go("chars", { id: c.id }) }, c.name), h("span", { class: "muted" }, " " + [c.clan, c.owner_id ? personName(c.owner_id) : ""].filter(Boolean).join(" · ")),
          h("div", { class: "play-tracks" },
            h("span", { class: "eyebrow" }, "Hunger"), h("span", { class: "boxes" }, ...Array.from({ length: 5 }, (_, i) => h("button", { type: "button", class: i < s.hunger ? "hunger" : "", "aria-label": c.name + ": Hunger " + (i + 1), onclick: () => patchSheet(c.id, sh => { sh.hunger = sh.hunger === i + 1 ? i : i + 1; }) }))),
            h("span", { class: "eyebrow" }, "Health"), track(s.health, hmax, "health", "Health"),
            h("span", { class: "eyebrow" }, "Willpower"), track(s.wp, wmax, "wp", "Willpower"),
            h("span", { class: "eyebrow" }, "Humanity"), h("span", { class: "mono" }, s.humanity + (s.stains ? " · " + s.stains + " Stains" : ""))));
      }),
      h("p", { class: "muted", style: "font-size:.84rem" }, "Klick ändert den Bogen sofort: Hunger setzen, Health und Willpower leer → oberflächlich → schwer."));
  }
  const tick = setInterval(async () => { try { await loadChars(); drawCoterie(); } catch (_) {} }, 30000);
  onCleanup(() => clearInterval(tick));
  watchTables("kbn-play", ["characters"], async () => { await loadChars(); drawCoterie(); });

  // ---------- Notizen nur für den ST (private Notiz "Spielabend · Session N") ----------
  const noteTitle = "Spielabend · Session " + num, noteBox = h("div", { class: "panel stack", "data-play-note": "1" });
  async function drawNote() {
    const { data } = await sb.from("private_notes").select("*").eq("owner_id", S.user.id).eq("title", noteTitle);
    let row = (data || [])[0] || null;
    const ta = h("textarea", { id: "play-note", placeholder: "Was ist passiert, was muss ich mir merken? Nur du siehst das." }, row ? row.body : "");
    const draft = bindDraft(draftKey("play", num), { body: ta }), state = h("span", { class: "save-state", role: "status" });
    noteBox.replaceChildren(h("h3", {}, "Meine Notizen"), draft.notice, h("div", { class: "field" }, h("label", { for: "play-note" }, "Nur für dich sichtbar"), ta),
      h("div", { class: "row", style: "align-items:center" }, h("button", { class: "btn", type: "button", onclick: async () => {
        if (row) await guard(sb.from("private_notes").update({ body: ta.value }).eq("id", row.id));
        else row = await guard(sb.from("private_notes").insert({ title: noteTitle, body: ta.value }).select("*").single());
        draft.clear(); state.textContent = "Gespeichert"; toast("Notiz gespeichert.");
      } }, "Speichern"), state));
  }

  side.append(coterie, noteBox);
  await Promise.all([loadScenes(), loadChars()]);
  cur = Math.max(0, scenes.findIndex(x => x.status === "open"));
  drawScenes(); drawCoterie(); await drawNote();
});
