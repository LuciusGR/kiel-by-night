// Kiel by Night · Wischen am Handy: nach links zum nächsten Reiter, nach rechts zum vorigen.
// Das Wischen klickt den Nachbar-Reiter an, wirkt also genau wie ein Antippen. Am ersten und letzten Reiter passiert nichts.
// Kein Wechsel, wenn die Geste in einem Feld, auf einer Karte (dort verschiebt Wischen die Karte), in der Reiterleiste
// oder in einem seitlich scrollbaren Bereich beginnt, wenn Text markiert ist oder ein Dialog offen steht.
const MIN_X = 70;     // Mindestweg in Pixeln
const MAX_MS = 700;   // schneller Wisch, kein langsames Ziehen
const EDGE = 24;      // Bildschirmrand gehört den Gesten des Browsers (Zurück)

function blocked(target) {
  for (let e = target; e && e !== document.body && e.nodeType === 1; e = e.parentElement) {
    if (e.matches("input, textarea, select, [contenteditable], .map-canvas, nav.tabs, dialog, .who-items, .no-swipe")) return true;
    const st = getComputedStyle(e);
    if ((st.overflowX === "auto" || st.overflowX === "scroll") && e.scrollWidth > e.clientWidth + 1) return true;
  }
  return false;
}

export function mountSwipe(nav) {
  let s = null;
  const step = dir => {
    const btns = [...nav.querySelectorAll("button")], i = btns.findIndex(b => b.getAttribute("aria-current") === "page");
    const next = btns[i + dir];
    if (i < 0 || !next) return;
    const main = document.getElementById("main");
    next.click();
    if (main && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      main.classList.remove("swipe-next", "swipe-prev"); void main.offsetWidth; // Animation neu starten
      main.classList.add(dir > 0 ? "swipe-next" : "swipe-prev");
    }
  };
  window.addEventListener("touchstart", ev => {
    s = null;
    if (ev.touches.length !== 1) return;
    const t = ev.touches[0];
    if (t.clientX < EDGE || t.clientX > innerWidth - EDGE) return;
    if (blocked(ev.target)) return;
    s = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });
  window.addEventListener("touchmove", ev => { if (ev.touches.length !== 1) s = null; }, { passive: true });
  window.addEventListener("touchcancel", () => { s = null; }, { passive: true });
  window.addEventListener("touchend", ev => {
    if (!s) return;
    const t = ev.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y, dt = Date.now() - s.t;
    s = null;
    if (dt > MAX_MS || Math.abs(dx) < MIN_X || Math.abs(dx) < 2 * Math.abs(dy)) return;
    if (document.querySelector("dialog[open]")) return;
    const sel = window.getSelection && window.getSelection(); if (sel && !sel.isCollapsed) return;
    step(dx < 0 ? 1 : -1);
  }, { passive: true });
}
