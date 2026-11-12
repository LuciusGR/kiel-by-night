// Kiel by Night · Würfeln nach V5 (Corebook: Würfelpool, Hunger-Würfel, kritische Erfolge, Messy Critical, Bestial Failure)
// Reine Funktionen ohne DOM, damit sie sich in Node testen lassen (tests/dice_test.mjs).

// Ein W10 (1 bis 10) aus dem Zufallsgenerator des Browsers, ohne Schieflage (Werte ab 250 werden verworfen)
export function d10(rand) {
  if (rand) return rand();
  const b = new Uint8Array(1);
  for (;;) { crypto.getRandomValues(b); if (b[0] < 250) return (b[0] % 10) + 1; }
}

// pool = Zahl aller Würfel, hunger = Hunger des Charakters. Hunger-Würfel ersetzen normale Würfel, nie mehr als der Pool.
export function rollPool(pool, hunger, rand) {
  pool = Math.max(1, Math.min(30, Math.floor(pool) || 1)); // ein Pool unter 1 würfelt immer noch einen Würfel
  const h = Math.max(0, Math.min(5, Math.floor(hunger) || 0, pool));
  return { normal: Array.from({ length: pool - h }, () => d10(rand)), hunger: Array.from({ length: h }, () => d10(rand)) };
}

// Auswertung: Erfolg ab 6, je Paar Zehnen zwei Zusatzerfolge. difficulty 0 = keine Schwierigkeit angegeben.
export function evaluate(roll, difficulty = 0) {
  const all = [...roll.normal, ...roll.hunger];
  const base = all.filter(v => v >= 6).length, tens = all.filter(v => v === 10).length, pairs = Math.floor(tens / 2);
  const successes = base + pairs * 2;
  const win = difficulty > 0 ? successes >= difficulty : successes > 0;
  const critical = pairs > 0 && win;
  return {
    successes, critical, win,
    margin: difficulty > 0 ? successes - difficulty : null,
    messy: critical && roll.hunger.includes(10),          // kritischer Erfolg mit einer Hunger-Zehn
    bestial: !win && roll.hunger.includes(1),             // Fehlschlag mit einer Hunger-Eins
    totalFailure: successes === 0,
  };
}

// Willenskraft: bis zu drei normale Würfel neu würfeln (nie Hunger-Würfel). Gewählt werden zuerst Fehlschläge.
export function rerollWillpower(roll, rand) {
  const idx = roll.normal.map((v, i) => [v, i]).filter(([v]) => v < 6).slice(0, 3).map(([, i]) => i);
  const normal = roll.normal.slice();
  for (const i of idx) normal[i] = d10(rand);
  return { roll: { normal, hunger: roll.hunger.slice() }, rerolled: idx };
}
