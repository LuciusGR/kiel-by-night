// Würfelregeln nach V5 (web/js/dice.js). Aufruf: node tests/dice_test.mjs
import assert from "node:assert/strict";
import { rollPool, evaluate, rerollWillpower, d10 } from "../web/js/dice.js";

const seq = vals => { let i = 0; return () => vals[i++ % vals.length]; };
let n = 0; const T = (name, fn) => { fn(); n++; console.log("PASS\t" + name); };

T("Pool: Hunger-Würfel ersetzen normale, nie mehr als der Pool", () => {
  let r = rollPool(5, 2, seq([7])); assert.equal(r.normal.length, 3); assert.equal(r.hunger.length, 2);
  r = rollPool(2, 4, seq([7])); assert.equal(r.normal.length, 0); assert.equal(r.hunger.length, 2);
  r = rollPool(0, 0, seq([7])); assert.equal(r.normal.length + r.hunger.length, 1, "mindestens ein Würfel");
  r = rollPool(99, 9, seq([7])); assert.equal(r.normal.length + r.hunger.length, 30); assert.equal(r.hunger.length, 5);
});
T("Erfolg ab 6, Schwierigkeit entscheidet", () => {
  assert.equal(evaluate({ normal: [6, 5, 9], hunger: [1] }).successes, 2);
  assert.equal(evaluate({ normal: [6, 5, 9], hunger: [] }, 2).win, true); assert.equal(evaluate({ normal: [6, 5, 9], hunger: [] }, 3).win, false);
  assert.equal(evaluate({ normal: [6, 5, 9], hunger: [] }, 3).margin, -1);
});
T("Zwei Zehnen zählen vier Erfolge, eine einzelne Zehn nur einen", () => {
  assert.equal(evaluate({ normal: [10, 10, 2], hunger: [] }).successes, 4); assert.equal(evaluate({ normal: [10, 2], hunger: [] }).successes, 1);
  assert.equal(evaluate({ normal: [10, 10, 10, 10], hunger: [] }).successes, 8); assert.equal(evaluate({ normal: [10, 10, 10], hunger: [] }).successes, 5);
  assert.equal(evaluate({ normal: [10, 10], hunger: [] }).critical, true);
});
T("Messy Critical nur mit einer Hunger-Zehn im kritischen Erfolg", () => {
  assert.equal(evaluate({ normal: [10], hunger: [10] }).messy, true); assert.equal(evaluate({ normal: [10, 10], hunger: [3] }).messy, false);
  assert.equal(evaluate({ normal: [10], hunger: [10] }, 5).messy, false, "kein Erfolg, also kein Messy Critical");
});
T("Bestial Failure: Fehlschlag mit einer Hunger-Eins", () => {
  assert.equal(evaluate({ normal: [2, 3], hunger: [1] }).bestial, true); assert.equal(evaluate({ normal: [8], hunger: [1] }).bestial, false);
  assert.equal(evaluate({ normal: [8], hunger: [1] }, 3).bestial, true, "Fehlschlag gegen die Schwierigkeit zählt");
  assert.equal(evaluate({ normal: [2], hunger: [4] }).totalFailure, true);
});
T("Willenskraft: höchstens drei normale Fehlschläge neu, Hunger-Würfel bleiben", () => {
  const x = rerollWillpower({ normal: [2, 7, 3, 4, 5], hunger: [1, 2] }, seq([9]));
  assert.deepEqual(x.rerolled, [0, 2, 3]); assert.deepEqual(x.roll.normal, [9, 7, 9, 9, 5]); assert.deepEqual(x.roll.hunger, [1, 2]);
  assert.deepEqual(rerollWillpower({ normal: [8, 9], hunger: [1] }, seq([1])).rerolled, []);
});
T("W10 liefert 1 bis 10 und alle Werte kommen vor", () => {
  const seen = new Set(); for (let i = 0; i < 3000; i++) { const v = d10(); assert.ok(Number.isInteger(v) && v >= 1 && v <= 10); seen.add(v); } assert.equal(seen.size, 10);
});
console.log("\nDICE total=" + n + " pass=" + n + " fail=0");
