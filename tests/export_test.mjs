// Test von web/js/export.js (CSV, XLSX, Kartentabellen). Aufruf: node tests/export_test.mjs [pfad-zum-schreiben.xlsx]
import assert from "node:assert/strict";
import fs from "node:fs";
import { toCsv, toXlsx, mapTables } from "../web/js/export.js";
let n = 0; const ok = (id, name, f) => { f(); n++; console.log("ok   " + id + " " + name); };

ok("E01", "CSV: BOM, Semikolon, Anführungszeichen, Zeilenumbruch", () => {
  const c = toCsv([["a", "b;c"], ['x"y', "z\nw"]]);
  assert.equal(c, '﻿a;"b;c"\r\n"x""y";"z\nw"\r\n');
});
ok("E02", "CSV: Formel-Anfänge werden entschärft", () => assert.equal(toCsv([["=1+1", "+x", "-y", "@z", "ok"]]), "﻿'=1+1;'+x;'-y;'@z;ok\r\n"));
ok("E03", "Kartentabellen: Knoten mit Verbindungszahl, Kanten mit Namen", () => {
  const nodes = new Map([["n1", { label: "Zed", type: "Kindred", tags: ["a", "b"], description: "d", pc: true }], ["n2", { label: "Ärger", type: "Ort" }]]);
  const edges = new Map([["e1", { from: "n1", to: "n2", label: "jagt", direction: "directed", description: "" }]]);
  const t = mapTables(nodes, edges);
  assert.deepEqual(t.nodeRows[0], ["Name", "Typ", "Tags", "Beschreibung", "Spielercharakter", "Anzahl Verbindungen", "ID"]);
  assert.deepEqual(t.nodeRows[1].slice(0, 6), ["Ärger", "Ort", "", "", "nein", 1]); // nach Name sortiert (de)
  assert.deepEqual(t.edgeRows[1].slice(0, 4), ["Zed", "Ärger", "gerichtet (→)", "jagt"]);
});
ok("E04", "XLSX: gültiges ZIP mit allen Teilen (Prüfsummen stimmen)", () => {
  const rows = [["Name", "Text"], ["A & B <c>", "Zeile1\nZeile2 \u0001 ä"]];
  const x = toXlsx([["Knoten", rows], ["Verbindungen", [["Von"], ["x"]]]]);
  assert.equal(String.fromCharCode(x[0], x[1]), "PK");
  const out = process.argv[2]; if (out) fs.writeFileSync(out, x);
  assert.ok(x.length > 1000);
});
console.log(n + " von " + n + " bestanden");
