// Kiel by Night · Storyteller-Bereich: ST-Karte aus Notion (über Edge Function notion-proxy) + private Spielernotizen
import { h, toast, errMsg, head, guard, confirmBtn, fmtDate, fmtDateTime } from "../lib.js";
import { sb, S, go, registerView, personName, charOf, loadProfiles, saveChecked, deleteWithUndo } from "../core.js";
import { richText } from "../wikilinks.js";
import { stTabs } from "./sttabs.js";
import { download, stamp } from "../export.js";
import { MapView, shapeForSekte, normType, SEKTEN } from "./map.js";
import { savePositions, loadPositions } from "./playermap.js";
import { sceneMentions } from "./scenes.js";
import { docLinksBox } from "./doclinks.js";

registerView("st", async m => {
  if (!S.isST) { m.append(h("div", { class: "notice bad" }, "Dieser Bereich ist nur für den Storyteller.")); return; }
  const tab = (S.arg && S.arg.tab) || "map";
  const tg = stTabs(tab);
  const body = h("div", {});
  m.append(head("Storyteller", "Nur für dich sichtbar. Die Karte liest aus Notion (NPCs, Beziehungen) und wird zwischengespeichert; „Aus Notion neu laden“ holt den aktuellen Stand.", tg), body);
  if (tab === "private") return stPrivate(body);
  if (tab === "group") return stGroup(body);
  MapView(body, notionSource(S.arg && S.arg.focus));
});

// Private Notizen aller Spieler: lesen, ändern, löschen (Rechte seit Migration st_admin_v1_1)
async function stPrivate(root) {
  let data = [], editing = null;
  async function load() {
    const r = await sb.from("private_notes").select("*").order("updated_at", { ascending: false });
    if (r.error) { root.replaceChildren(h("div", { class: "notice bad" }, "Private Notizen konnten nicht geladen werden.")); return false; }
    data = r.data; return true;
  }
  function note(x) {
    if (editing !== x.id) return h("details", { "data-note": x.id }, h("summary", { style: "cursor:pointer" }, (x.title || "Ohne Titel") + " · " + fmtDate(x.updated_at)),
      richText(x.body, { style: "margin-top:6px" }),
      h("div", { style: "margin-top:8px" }, h("button", { class: "btn small", type: "button", onclick: () => { editing = x.id; draw(); } }, "Bearbeiten")));
    const t = h("input", { type: "text", id: "pn-title", value: x.title || "" }), b = h("textarea", { id: "pn-body" }, x.body || "");
    return h("div", { class: "panel stack", "data-note-edit": x.id },
      h("div", { class: "notice" }, "Du änderst als Storyteller eine private Notiz. Die Person sieht die Änderung."),
      h("div", { class: "field" }, h("label", { for: "pn-title" }, "Titel"), t), h("div", { class: "field" }, h("label", { for: "pn-body" }, "Text"), b),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: async () => { if (!(await saveChecked("private_notes", x, { title: t.value, body: b.value }, "Gespeichert."))) return; editing = null; if (await load()) draw(); } }, "Speichern"),
        h("button", { class: "btn", type: "button", onclick: () => { editing = null; draw(); } }, "Abbrechen"),
        confirmBtn("Löschen", async () => { await deleteWithUndo("private_notes", x, async () => { if (await load()) draw(); }); editing = null; if (await load()) draw(); })));
  }
  function draw() {
    const players = [...S.profiles.values()].filter(p => p.role !== "st");
    if (!players.length) { root.replaceChildren(h("div", { class: "empty" }, "Noch keine Spielerkonten.")); return; }
    root.replaceChildren(...players.map(p => {
      const c = charOf(p.id), mine = data.filter(n => n.owner_id === p.id);
      return h("div", { class: "panel stack", style: "margin-bottom:14px" },
        h("h3", {}, (c ? c.name : personName(p.id)) + " ", h("span", { class: "muted", style: "font-size:1rem" }, personName(p.id))),
        ...(mine.length ? mine.map(note) : [h("p", { class: "muted" }, "Keine privaten Notizen.")]));
    }));
  }
  if (await load()) draw();
}

// Gruppe: Anzeigenamen und Rollen pflegen, Profil für ein neues Konto anlegen. Konten selbst (Benutzername, Passwort)
// entstehen weiterhin im Supabase-Dashboard, das kann die Seite aus Sicherheitsgründen nicht.
async function stGroup(root) {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function draw() {
    try { await loadProfiles(); } catch (_) { root.replaceChildren(h("div", { class: "notice bad" }, "Profile konnten nicht geladen werden.")); return; }
    const people = [...S.profiles.values()].sort((a, b) => (a.role === "st" ? 0 : 1) - (b.role === "st" ? 0 : 1) || String(a.display_name).localeCompare(String(b.display_name), "de"));
    const row = p => {
      const self = p.id === S.user.id, c = charOf(p.id);
      const name = h("input", { type: "text", value: p.display_name || "", "aria-label": "Anzeigename" });
      const role = h("select", { "aria-label": "Rolle", disabled: self ? true : null, title: self ? "Die eigene Rolle lässt sich nicht ändern" : null },
        h("option", { value: "player", selected: p.role !== "st" ? true : null }, "Spieler"), h("option", { value: "st", selected: p.role === "st" ? true : null }, "Storyteller"));
      return h("div", { class: "row", "data-profile": p.id, style: "align-items:flex-end" },
        h("div", { class: "field" }, h("label", {}, "Anzeigename" + (self ? " (du)" : "")), name),
        h("div", { class: "field", style: "flex:0 1 170px" }, h("label", {}, "Rolle"), role),
        h("div", { class: "field" }, h("label", {}, "Charakter"), h("div", { class: "muted", style: "padding:7px 0" }, c ? c.name : "keiner zugeordnet")),
        h("button", { class: "btn", type: "button", onclick: async () => {
          const patch = {};
          if (name.value.trim() !== (p.display_name || "")) patch.display_name = name.value.trim();
          if (!self && role.value !== p.role) patch.role = role.value;
          if (!Object.keys(patch).length) { toast("Nichts geändert."); return; }
          await guard(sb.from("profiles").update(patch).eq("id", p.id), "Gespeichert.");
          await draw();
        } }, "Speichern"),
        h("button", { class: "btn", type: "button", "data-setpw-btn": p.id, onclick: () => setPw(p) }, "Passwort setzen"));
    };
    // Konto anlegen und Passwort setzen laufen über die Edge Function account-admin (nur ST, Service-Schlüssel bleibt dort)
    const suggest = () => { const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = new Uint8Array(14); crypto.getRandomValues(b); return [...b].map(x => abc[x % abc.length]).join(""); };
    const pwField = id => { const i = h("input", { type: "text", id, autocomplete: "off", spellcheck: "false", placeholder: "mindestens 8 Zeichen" }); return [i, h("button", { class: "btn small", type: "button", onclick: () => { i.value = suggest(); } }, "Vorschlag")]; };
    const naUser = h("input", { type: "text", id: "na-user", placeholder: "z. B. damien", autocapitalize: "none", autocomplete: "off", spellcheck: "false" }), naName = h("input", { type: "text", id: "na-name", placeholder: "Vorname" });
    const naRole = h("select", { id: "na-role" }, h("option", { value: "player" }, "Spieler"), h("option", { value: "st" }, "Storyteller")), [naPw, naPwBtn] = pwField("na-pw");
    const setPw = p => {
      const [pw, btn] = pwField("sp-pw");
      const dlg = h("dialog", { "data-setpw": p.id }, h("div", { class: "stack" }, h("h3", {}, "Passwort setzen für " + (p.display_name || "Mitglied")),
        h("p", { class: "muted" }, "Das alte Passwort gilt danach nicht mehr. Gib das neue persönlich weiter, die Person ändert es anschließend selbst."),
        h("div", { class: "row" }, h("div", { class: "field" }, h("label", { for: "sp-pw" }, "Neues Passwort"), pw), btn),
        h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: async () => {
          if (pw.value.length < 8) { toast("Mindestens 8 Zeichen.", true); return; }
          try { await accountCall({ action: "set_password", user_id: p.id, password: pw.value }); toast("Passwort gesetzt."); dlg.close(); dlg.remove(); } catch (e) { toast(e.message, true); }
        } }, "Passwort setzen"), h("button", { class: "btn", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Abbrechen"))));
      document.body.append(dlg); dlg.showModal();
    };
    const uid = h("input", { type: "text", id: "np-uid", placeholder: "36 Zeichen, z. B. 1a2b3c4d-0000-4000-8000-123456789abc", autocomplete: "off", spellcheck: "false" });
    const nn = h("input", { type: "text", id: "np-name", placeholder: "Vorname" });
    const nr = h("select", { id: "np-role" }, h("option", { value: "player" }, "Spieler"), h("option", { value: "st" }, "Storyteller"));
    root.replaceChildren(
      h("div", { class: "panel stack", style: "margin-bottom:14px" }, h("h3", {}, "Mitglieder"),
        h("p", { class: "muted" }, "Den Charakter einer Person ordnest du im Bogen unter „Verwaltung“ zu."), ...people.map(row)),
      h("div", { class: "panel stack", "data-admin": "newaccount", style: "margin-bottom:14px" }, h("h3", {}, "Konto anlegen"),
        h("p", { class: "muted" }, "Legt Konto und Profil in einem Schritt an. Die Person meldet sich mit dem Benutzernamen und dem Startpasswort an und ändert das Passwort danach selbst."),
        h("div", { class: "row" }, h("div", { class: "field" }, h("label", { for: "na-user" }, "Benutzername"), naUser), h("div", { class: "field" }, h("label", { for: "na-name" }, "Anzeigename"), naName), h("div", { class: "field", style: "flex:0 1 170px" }, h("label", { for: "na-role" }, "Rolle"), naRole)),
        h("div", { class: "row" }, h("div", { class: "field", style: "flex:0 1 320px" }, h("label", { for: "na-pw" }, "Startpasswort"), naPw), naPwBtn,
          h("button", { class: "btn primary", type: "button", onclick: async () => {
            const user = naUser.value.trim().toLowerCase();
            if (!/^[a-z0-9._-]{2,32}$/.test(user)) { toast("Benutzername: 2 bis 32 Zeichen, nur Buchstaben, Zahlen, Punkt, Minus und Unterstrich.", true); return; }
            if (!naName.value.trim()) { toast("Bitte einen Anzeigenamen eintragen.", true); return; }
            if (naPw.value.length < 8) { toast("Das Startpasswort braucht mindestens 8 Zeichen.", true); return; }
            try { await accountCall({ action: "create", username: user, password: naPw.value, display_name: naName.value.trim(), role: naRole.value }); toast("Konto „" + user + "“ angelegt."); await draw(); }
            catch (e) { toast(e.message, true); }
          } }, "Konto anlegen"))),
      h("details", { class: "panel", "data-admin": "newprofile" }, h("summary", { class: "muted", style: "cursor:pointer" }, "Profil zu einem vorhandenen Konto anlegen (User-ID)"), h("div", { class: "stack", style: "margin-top:10px" },
        h("p", { class: "muted" }, "Für Konten, die im Supabase-Dashboard angelegt wurden (Authentication, Users, „Add user“ mit „Auto Confirm User“, Adresse benutzername@kbn.invalid). Trage die dort angezeigte User-ID (UID) ein. Erst mit Profil ist die Person Mitglied."),
        h("div", { class: "row" }, h("div", { class: "field", style: "flex:2 1 300px" }, h("label", { for: "np-uid" }, "User-ID (UID)"), uid), h("div", { class: "field" }, h("label", { for: "np-name" }, "Anzeigename"), nn), h("div", { class: "field", style: "flex:0 1 170px" }, h("label", { for: "np-role" }, "Rolle"), nr),
          h("button", { class: "btn primary", type: "button", onclick: async () => {
            const id = uid.value.trim().toLowerCase();
            if (!UUID.test(id)) { toast("Die User-ID hat nicht die Form einer UID (36 Zeichen mit Bindestrichen).", true); return; }
            if (!nn.value.trim()) { toast("Bitte einen Anzeigenamen eintragen.", true); return; }
            if (S.profiles.has(id)) { toast("Für dieses Konto gibt es schon ein Profil.", true); return; }
            const { error } = await sb.from("profiles").insert({ id, display_name: nn.value.trim(), role: nr.value });
            if (error) { toast(error.code === "23503" ? "Zu dieser User-ID gibt es kein Konto. UID im Supabase-Dashboard prüfen." : errMsg(error), true); return; }
            toast("Profil angelegt."); await draw();
          } }, "Profil anlegen")),
        h("p", { class: "muted" }, "Profile löschen geht hier bewusst nicht: Mit einem Profil verschwinden alle Notizen und Dokumente der Person."))),
      h("div", { class: "panel stack", "data-admin": "backup", style: "margin-top:14px" }, h("h3", {}, "Sicherung"),
        h("p", { class: "muted" }, "Lädt alle Inhalte der Seite als eine JSON-Datei herunter: Profile, Bögen, Sessions, Notizen (auch private), Wiki, Karten, Chroniken, Szenen und die Liste der Dokumente. Die hochgeladenen Dateien selbst sind nicht enthalten. Die Datei enthält alles, was nur du sehen darfst: sicher aufbewahren."),
        h("div", {}, h("button", { class: "btn", type: "button", onclick: backup }, "Sicherung herunterladen"))));
  }
  await draw();
}

// Aufruf der Edge Function account-admin mit verständlichen Fehlern
async function accountCall(body) {
  const { data, error } = await sb.functions.invoke("account-admin", { body });
  if (!error) { if (data && data.error) throw new Error(data.message || data.error); return data; }
  let j = null; try { j = await error.context.json(); } catch (_) {}
  const status = error.context && error.context.status;
  if (!error.context || (status === 404 && !(j && j.error)) || /not.?found/i.test((j && j.code) || ""))
    throw new Error("Die Funktion „account-admin“ ist noch nicht eingerichtet (Technische Dokumentation, Abschnitt 4.14). Bis dahin legst du Konten im Supabase-Dashboard an.");
  throw new Error((j && (j.message || j.error)) || "Die Anfrage ist fehlgeschlagen.");
}

// Sicherung: alles, was der ST lesen darf, als eine JSON-Datei (kein Wiederherstellen in der Seite)
const BACKUP_TABLES = ["profiles", "characters", "sessions", "session_info", "session_notes", "private_notes", "wiki_categories", "wiki_pages", "documents", "document_links",
  "player_map_nodes", "player_map_edges", "map_positions", "chronicles", "chapters", "scenes", "scene_npcs"];
async function backup() {
  const out = { format: "kbn-backup/1", created_at: new Date().toISOString(), tables: {}, missing: [] };
  for (const t of BACKUP_TABLES) { const { data, error } = await sb.from(t).select("*"); if (error) out.missing.push(t); else out.tables[t] = data; }
  download("kiel-by-night_sicherung_" + stamp() + ".json", JSON.stringify(out, null, 1), "application/json");
  toast(out.missing.length ? "Sicherung geladen, ohne: " + out.missing.join(", ") : "Sicherung heruntergeladen (" + Object.values(out.tables).reduce((a, r) => a + r.length, 0) + " Einträge).", !!out.missing.length);
}

// ---------- Notion → Graph ----------
const DIR = { gerichtet: "directed", wechselseitig: "mutual", ungerichtet: "undirected" };
const splitPipes = s => String(s || "").split(/\\?\|/).map(x => x.trim()).filter(Boolean); // maskierte Pipes "\|"
const brToNl = s => String(s || "").replace(/<br\s*\/?>/gi, "\n");                            // Umlaute bewusst NICHT korrigieren

export function buildGraph(payload) {
  const nodes = new Map(), byLabel = new Map();
  for (const r of payload.npcs || []) {
    if (!r.id) continue;
    const tags = splitPipes(r.tags);
    const n = {
      label: r.name || r.label || "?", alt: r.label || "", type: normType(r.wesen), cat: r.kategorie || "", tags,
      description: brToNl(r.notes), dead: r.status === "Tot", pc: tags.includes("Player Character"),
      shape: shapeForSekte(r.sekte), raw: r,
    };
    nodes.set(r.id, n);
    if (n.alt) byLabel.set(n.alt.toLowerCase(), r.id);
    byLabel.set(n.label.toLowerCase(), r.id);
  }
  const endpoint = (ids, label) => {
    const u = (ids || [])[0]; if (u && nodes.has(u)) return u;
    const l = String(label || "").trim(); if (!l) return null;
    const k = byLabel.get(l.toLowerCase()); if (k) return k;
    const pid = "lbl:" + l;
    if (!nodes.has(pid)) nodes.set(pid, { label: l, type: "Ohne NPC-Eintrag", tags: [], shape: "ellipse", description: "Kommt nur als Endpunkt in „Beziehungen“ vor (Ort, Organisation oder fehlender NPC-Eintrag).", raw: null });
    return pid;
  };
  const edges = new Map();
  for (const r of payload.rels || []) {
    const from = endpoint(r.vonIds, r.von), to = endpoint(r.nachIds, r.nach);
    if (!from || !to || from === to) continue;
    const title = String(r.title || ""); const ci = title.indexOf(": ");
    edges.set(r.id || ("e" + edges.size), { from, to, label: ci >= 0 ? title.slice(ci + 2) : "", description: brToNl(r.beschreibung), direction: DIR[r.richtung] || "directed" });
  }
  return { nodes, edges };
}

function notionSource(focus) {
  let force = false, meta = null;
  async function fetchNotion() {
    const { data, error } = await sb.functions.invoke("notion-proxy", { body: { refresh: force } });
    force = false;
    if (error) {
      let detail = "";
      try { const j = await error.context.json(); detail = j.message || j.error || ""; } catch (_) {}
      throw new Error("Notion konnte nicht gelesen werden" + (detail ? ": " + detail : ".") + " (Edge Function notion-proxy, Secret NOTION_TOKEN prüfen)");
    }
    if (data.warning) toast("Hinweis Notion: " + String(data.warning).slice(0, 200), true);
    meta = { fetched_at: data.fetched_at, source: data.source };
    return data;
  }
  return {
    editable: false, legend: true, exportName: "storytellerkarte", focus: focus || null,
    reloadLabel: "Aus Notion neu laden",
    reload: async () => { force = true; },
    statusText: () => meta ? "Stand " + fmtDateTime(meta.fetched_at) + (meta.source === "cache" ? " (Cache)" : " (frisch)") : "",
    async load() {
      const [payload, positions] = await Promise.all([fetchNotion(), loadPositions("st")]);
      return { ...buildGraph(payload), positions };
    },
    savePositions: list => savePositions("st", list),
    metaRows: n => {
      const r = n.raw; if (!r) return [];
      return [["Clan", r.clan], ["Sekte", r.sekte || r.clanSekte], ["Status", r.status], ["Kategorie", r.kategorie], ["Rang", r.rank], ["Fraktion", r.fraktion && r.fraktion !== "-" ? r.fraktion : ""], ["Map-Label", r.label]].filter(([, v]) => v);
    },
    nodeExtras: (n) => [
      n.raw && n.raw.id ? mentionsBox(n.raw.id) : null,
      n.raw && n.raw.id ? docLinksBox("st", n.raw.id, n.label, true) : null,
      n.raw && /^https:\/\//.test(n.raw.url || "") ? h("a", { class: "btn small", href: n.raw.url, target: "_blank", rel: "noopener" }, "In Notion öffnen") : null,
      h("button", { class: "btn small", type: "button", onclick: async () => {
        try { await ensurePlayerNode(n); toast("„" + n.label + "“ steht auf der Spielerkarte."); } catch (e) { toast("Fehler: " + (e.message || e), true); }
      } }, "Auf Spielerkarte"),
      // Enthüllen in einem Schritt: wählen, welche Angaben die Spieler sehen sollen
      n.raw ? h("button", { class: "btn small", type: "button", onclick: () => revealDialog(n) }, "Mit Angaben …") : null,
    ].filter(Boolean),
    edgeExtras: (e, id, nodes) => [h("button", { class: "btn small", type: "button", onclick: async () => {
      try {
        const a = await ensurePlayerNode(nodes.get(e.from)), b = await ensurePlayerNode(nodes.get(e.to));
        const { data: ex, error } = await sb.from("player_map_edges").select("id").or(`and(from_node.eq.${a},to_node.eq.${b}),and(from_node.eq.${b},to_node.eq.${a})`);
        if (error) throw error;
        if (ex.length) { toast("Diese Verbindung gibt es auf der Spielerkarte schon."); return; }
        // bewusst ohne Beschriftung und Beschreibung (Übergabe Abschnitt 4: "ohne Beschreibung")
        const { error: e2 } = await sb.from("player_map_edges").insert({ from_node: a, to_node: b, label: "", description: "", direction: e.direction });
        if (e2) throw e2;
        toast("Verbindung auf die Spielerkarte geschoben.");
      } catch (err) { toast("Fehler: " + (err.message || err), true); }
    } }, "Auf Spielerkarte")],
  };
}

// "Kommt vor in": Szenen, in denen dieser NPC verknüpft ist (mit Motivation der jeweiligen Szene)
function mentionsBox(notionId) {
  const box = h("div", { class: "stack", style: "width:100%", "data-mentions": "1" });
  sceneMentions(notionId).then(list => {
    if (!list.length) return;
    box.append(h("h4", { class: "eyebrow", style: "margin:0" }, "Kommt vor in (" + list.length + ")"),
      ...list.map(x => h("div", { class: "conn" }, h("div", { class: "c" },
        h("button", { class: "linkbtn", type: "button", onclick: () => x.scene.session_number == null ? go("scenes") : go("sessions", { session: x.scene.session_number }) }, (x.scene.session_number == null ? "Vorrat" : "Session " + x.scene.session_number) + " · " + x.scene.title),
        x.npc.motivation ? h("div", { class: "muted" }, x.npc.motivation) : null))));
  }).catch(() => {});
  return box;
}

// Dialog: Knoten mit ausgewählten Angaben auf die Spielerkarte bringen. Besteht der Knoten schon, werden nur die gewählten Angaben überschrieben.
function revealDialog(n) {
  const sect = SEKTEN.find(x => x === String(n.raw.sekte || "").replace("Unabhaengig", "Unabhängig")) || "";
  const opts = [["type", "Typ", n.type], ["sect", "Sekte", sect], ["description", "Beschreibung (deine Notizen aus Notion)", n.description]].filter(([, , v]) => v);
  const boxes = opts.map(([k, l, v]) => ({ k, v, el: h("input", { type: "checkbox", style: "width:auto", "data-reveal": k }), l }));
  const dlg = h("dialog", { "data-reveal-dialog": "1" }, h("div", { class: "stack" }, h("h3", {}, "„" + n.label + "“ auf die Spielerkarte"),
    h("p", { class: "muted" }, "Der Name wird immer übertragen. Hake an, was die Spieler zusätzlich sehen sollen. Nichts angehakt heißt: nur der Name."),
    ...boxes.map(b => h("label", { class: "row", style: "align-items:flex-start;gap:8px" }, b.el, h("span", {}, h("strong", {}, b.l + ": "), String(b.v).slice(0, 200) + (String(b.v).length > 200 ? " …" : "")))),
    !boxes.length ? h("p", { class: "muted" }, "Zu diesem Eintrag gibt es keine weiteren Angaben.") : null,
    h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: async () => {
      const extra = Object.fromEntries(boxes.filter(b => b.el.checked).map(b => [b.k, b.v]));
      try {
        const id = await ensurePlayerNode(n);
        if (Object.keys(extra).length) { const { error } = await sb.from("player_map_nodes").update(extra).eq("id", id); if (error) throw error; }
        toast("„" + n.label + "“ steht auf der Spielerkarte" + (Object.keys(extra).length ? " (mit " + boxes.filter(b => b.el.checked).map(b => b.l.split(" ")[0]).join(", ") + ")." : "."));
        dlg.close(); dlg.remove();
      } catch (e) { toast("Fehler: " + (e.message || e), true); }
    } }, "Übertragen"), h("button", { class: "btn", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Abbrechen"))));
  document.body.append(dlg); dlg.showModal();
}

// Nur der Name. Typ (Kindred, Sterblicher, …) bleibt leer: Die Spieler tragen ihn selbst ein, weil er nicht immer offensichtlich ist. Keine Beschreibung, keine Notion-Tags.
async function ensurePlayerNode(n) {
  const { data, error } = await sb.from("player_map_nodes").select("id, label");
  if (error) throw error;
  const hit = data.find(d => d.label.toLowerCase() === n.label.toLowerCase());
  if (hit) return hit.id;
  const { data: r, error: e2 } = await sb.from("player_map_nodes").insert({ label: n.label, type: "", tags: n.pc ? ["Spielercharakter"] : [], description: "", is_pc: !!n.pc }).select("id").single();
  if (e2) throw e2;
  return r.id;
}
