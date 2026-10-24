// Kiel by Night · Tabellen-Export (CSV und Excel) ohne Bibliothek
// CSV: UTF-8 mit BOM und Semikolon, so öffnet es das deutsche Excel richtig. Excel: schlichte .xlsx (Text, eine Mappe, mehrere Blätter).

// Zellen, die mit = + - @ beginnen, würde ein Tabellenprogramm als Formel lesen: mit ' davor entschärfen
const safe = v => { const s = v == null ? "" : String(v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
const csvCell = v => { const s = safe(v); return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function toCsv(rows) { return "﻿" + rows.map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n"; }

// ---------- minimale .xlsx (ZIP ohne Kompression) ----------
const enc = new TextEncoder();
const xml = s => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
let crcTable = null;
function crc32(b) {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const parts = [], central = []; let offset = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [name, text] of files) {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)]);
    parts.push(local, nm, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nm);
    offset += local.length + nm.length + data.length;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, p) => a + p.length, 0)); let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
const col = i => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
function sheetXml(rows) {
  const body = rows.map((r, y) => '<row r="' + (y + 1) + '">' + r.map((v, x) => v === "" || v == null ? "" : '<c r="' + col(x) + (y + 1) + '" t="inlineStr"' + (y === 0 ? ' s="1"' : "") + "><is><t xml:space=\"preserve\">" + xml(v) + "</t></is></c>").join("") + "</row>").join("");
  const widths = (rows[0] || []).map((_, x) => '<col min="' + (x + 1) + '" max="' + (x + 1) + '" width="' + Math.min(60, Math.max(10, ...rows.slice(0, 200).map(r => String(r[x] ?? "").split("\n")[0].length + 2))) + '" customWidth="1"/>').join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + widths + "</cols><sheetData>" + body + "</sheetData></worksheet>";
}
// sheets: [[Blattname, rows], ...], rows[0] ist die Kopfzeile
export function toXlsx(sheets) {
  const names = sheets.map(([n]) => xml(String(n).replace(/[\\/?*[\]:]/g, " ").slice(0, 31)));
  const files = [
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") + "</Types>"],
    ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + names.map((n, i) => '<sheet name="' + n + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") + "</sheets></workbook>"],
    ["xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ["xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ...sheets.map(([, rows], i) => ["xl/worksheets/sheet" + (i + 1) + ".xml", sheetXml(rows)]),
  ];
  return zip(files);
}

export const MIME = { csv: "text/csv;charset=utf-8", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
export function download(filename, data, mime) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const stamp = () => new Date().toISOString().slice(0, 10);

// ---------- Karten: Tabellen aus Knoten und Verbindungen ----------
const DIR = { directed: "gerichtet (→)", mutual: "wechselseitig (↔)", undirected: "ungerichtet (—)" };
export function mapTables(nodes, edges) {
  const label = id => (nodes.get(id) || {}).label || "";
  const deg = new Map(); for (const e of edges.values()) { deg.set(e.from, (deg.get(e.from) || 0) + 1); deg.set(e.to, (deg.get(e.to) || 0) + 1); }
  const list = [...nodes].sort((a, b) => String(a[1].label || "").localeCompare(String(b[1].label || ""), "de"));
  const hasCat = list.some(([, n]) => n.cat), hasDead = list.some(([, n]) => n.dead), hasSect = list.some(([, n]) => n.sect);
  const nodeRows = [["Name", "Typ", ...(hasSect ? ["Sekte"] : []), ...(hasCat ? ["Kategorie"] : []), "Tags", "Beschreibung", "Spielercharakter", ...(hasDead ? ["Verstorben"] : []), "Anzahl Verbindungen", "ID"],
    ...list.map(([id, n]) => [n.label || "", n.type || "", ...(hasSect ? [n.sect || ""] : []), ...(hasCat ? [n.cat || ""] : []), (n.tags || []).join(", "), n.description || "", n.pc ? "ja" : "nein", ...(hasDead ? [n.dead ? "ja" : "nein"] : []), deg.get(id) || 0, id])];
  const edgeRows = [["Von", "Nach", "Richtung", "Beschriftung", "Details", "Von-ID", "Nach-ID"],
    ...[...edges.values()].sort((a, b) => label(a.from).localeCompare(label(b.from), "de") || label(a.to).localeCompare(label(b.to), "de"))
      .map(e => [label(e.from), label(e.to), DIR[e.direction] || e.direction || "", e.label || "", e.description || "", e.from, e.to])];
  return { nodeRows, edgeRows };
}
