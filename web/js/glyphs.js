// Kiel by Night · Symbolstile der Karten (Knotenbild je Art des Wesens)
// Drei umschaltbare Stile: Holzschnitt, Sigil, Spritzer. Jeder Stil hat einen eigenen Umriss und einen eigenen Satz Symbole
// für dieselben Arten. Der ganze Knoten ist ein SVG-Bild (Umriss, Rand, Symbol, Bruchlinie, Rahmen), weil Cytoscape 3.33
// bei `shape: polygon` mit `border-width` einen Fehler wirft (hasMiterBounds).
// Symbole: Pfade im 24×24-Raster, `§` steht für die Farbe, die der Aufrufer einsetzt.
import { h, store } from "./lib.js";

const F = d => `<path fill-rule="evenodd" d="${d}" fill="§"/>`;
const L = (d, w = 1.9) => `<path d="${d}" fill="none" stroke="§" stroke-width="${w}" stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="square"/>`;
const pts = s => s.trim().split(/\s+/).map(p => p.split(",").map(Number));

// Spritzer: Körper mit kurzen, schiefen Zacken (Spitzen 17,6 bis 19,4, Täler um 15), damit das Symbol Platz behält
function splat() {
  const n = 14, tip = [19, 18, 19.4, 17.6, 19, 18.2, 19.4, 17.8, 19, 18, 19.2, 17.6, 19.2, 18.4], out = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2 * Math.PI / n - Math.PI / 2, step = 2 * Math.PI / n, j = ((i * 7) % 5 - 2) * .025;
    const rv = 14.8 + (i % 3) * .45;
    out.push([20 + rv * Math.cos(a - step / 2), 20 + rv * Math.sin(a - step / 2)]);
    out.push([20 + tip[i] * Math.cos(a + j), 20 + tip[i] * Math.sin(a + j)]);
  }
  return out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}

export const STYLES = {
  holzschnitt: {
    name: "Holzschnitt", box: [9, 9, 22],
    pts: pts("4,6 14,3.5 26,5 36,3.5 37,15 35.5,27 37,36.5 25,37.5 13,35.5 3.5,37 5,25 3,14"),
    deco: () => "",
    g: {
      Kindred: F("M2 2h20v4.5H2ZM3.5 6.5h7L7 21.5ZM13.5 6.5h7L17 21.5Z"),
      Ghoul: F("M3 2h18l-1.5 8.5L12 15 4.5 10.5ZM6.8 5h10.4l-.7 4L12 11.8 7.5 9Z") + F("M10.6 14.5h2.8v4.7h-2.8ZM6 19.6h12V22H6Z"),
      Sterblicher: F("M12 1.5 18 4.5 18.5 12 15.5 19 12 22.5 8.5 19 5.5 12 6 4.5ZM7.8 9 11 10.2 9 12.3ZM16.2 9 13 10.2 15 12.3ZM10.3 16.2h3.4v1.2h-3.4Z"),
      Ort: F("M12 1 17.5 8V22H6.5V8ZM10.5 22v-5l1.5-1.5 1.5 1.5v5ZM11 10h2v3.5h-2Z") + F("M2.5 22V14l3.5-2.5V22ZM21.5 22V14L18 11.5V22Z"),
      Organisation: F("M2 20.5 3.2 7l5.3 5L12 3.5 15.5 12l5.3-5L22 20.5Z") + F("M2 21.8h20v1.7H2Z"),
      Wight: F("M12 1.5 19 3.5 22 9.5 20 15 18 16.2V22h-3v-3h-1.4v3h-3.2v-3H9v3H6V16.2L4 15 2 9.5 5 3.5ZM5.8 9 10.5 10.4 8.6 13.2ZM18.2 9 13.5 10.4 15.4 13.2ZM12 13.2 13.2 15.4h-2.4Z"),
      Geist: F("M12 1 17 8 15.8 11.2 19.4 10 18.4 17 12 23 5.6 17 4.6 10 8.2 11.2 7 8ZM9.2 14.2 11 15.6 9.8 17.4ZM14.8 14.2 13 15.6 14.2 17.4Z"),
      Werwolf: F("M3.5 1.5 9 6.2H15L20.5 1.5 21.5 11 17.5 17.5 14 22.5H10L6.5 17.5 2.5 11ZM6.5 10 10 11.2 9.3 13ZM17.5 10 14 11.2 14.7 13ZM10.5 19h3L12 21Z"),
      Gegenstand: F("M2 7l3-4.5h14l3 4.5v14.5H2ZM2 10.5h20v1.6H2ZM11 13.8h2l.6 4h-3.2Z"),
      unbekannt: L("M6.5 7.5 12 3 17.5 7.5V12L12 15v2.5", 3.2) + F("M12 19.5 14 21.5 12 23.5 10 21.5Z"),
      sonst: F("M12 1 14 8.5 20.5 4.5 15.5 10 23 12 15.5 14 20.5 19.5 14 15.5 12 23 10 15.5 3.5 19.5 8.5 14 1 12 8.5 10 3.5 4.5 10 8.5Z"),
    },
  },
  sigil: {
    name: "Sigil", box: [10, 10, 20],
    pts: pts("20,0.8 36.8,20 20,39.2 3.2,20"),
    deco: (fill, edge, ink) => `<polygon points="20,5.5 32,20 20,34.5 8,20" fill="none" stroke="${ink}" stroke-opacity=".55" stroke-width=".8"/>`,
    g: {
      Kindred: L("M5 5.5h14L12 16.5ZM12 16.5V22M8.5 20h7", 1.7),
      Ghoul: L("M5 5h14v14H5ZM5 5l14 14M12 2v3M12 19v3", 1.6),
      Sterblicher: L("M12 3 20 20H4ZM7.5 14h9", 1.6) + F("M12 8.5 13.3 10 12 11.5 10.7 10Z"),
      Ort: L("M4 4h16v16H4ZM9 9h6v6H9ZM12 4v5M12 15v5", 1.6),
      Organisation: L("M12 2v20M4 5v8.5l8 4.5 8-4.5V5", 1.8),
      Wight: L("M12 2v21M6.5 14.5h11M9 2h6M8.5 23h7", 1.8),
      Geist: L("M3 8 7 4 11 8 15 4 19 8M3 14 7 10 11 14 15 10 19 14M12 15.5V21.5", 1.6),
      Werwolf: L("M5.5 3 9 21M12 3V21M18.5 3 15 21", 2),
      Gegenstand: L("M12 2 17 7 12 12 7 7ZM12 12V22M12 16h5M12 20h3", 1.6),
      unbekannt: L("M7 7.5 12 3 17 7.5V12L12 15v2.5", 2) + F("M12 19.5 13.6 21.1 12 22.7 10.4 21.1Z"),
      sonst: L("M12 2V22M2 12H22M5 5 19 19M19 5 5 19", 1.4),
    },
  },
  spritzer: {
    // überarbeitet: kürzere Zacken, größere Fläche, kräftigere und klarere Schnitte
    name: "Spritzer", box: [8.5, 8.5, 23], pts: splat(),
    deco: () => "",
    g: {
      Kindred: F("M8 1 12.2 14.5 8 22.5 3.8 14.5ZM16 1 20.2 14.5 16 22.5 11.8 14.5Z"),
      Ghoul: F("M1.5 2.5H22.5L21.2 8.5 19.4 7.2 18.6 17.5 16.6 9 14.2 12 12.4 23 10 11 7.8 13.6 6 8.4 4.2 15.5 2.8 8Z"),
      Sterblicher: F("M12 1.2 15.6 3.8 15.4 8.8 12 11 8.6 8.8 8.4 3.8ZM10.6 12h2.8L16.4 22.5H7.6ZM1.5 13.4 8.6 12 8.8 14.8ZM22.5 13.4 15.4 12 15.2 14.8Z"),
      Ort: F("M2 22.5V9l4 3.2L9.6 4.4l3.2 6.4 3.2-4.4 6 6.6V22.5ZM10 22.5v-6.4h4v6.4Z"),
      Organisation: L("M12 2V22M3 6.5 21 17.5M21 6.5 3 17.5", 2.3) + L("M12 6.6 16.8 9.4V14.6L12 17.4 7.2 14.6V9.4Z", 1.8),
      Wight: F("M12 1.2 18.8 3.2 22 9.4 19.8 14.6 17.2 15.6 18.2 22.6 14.6 19.8 12 23 9.4 19.8 5.8 22.6 6.8 15.6 4.2 14.6 2 9.4 5.2 3.2ZM6.2 8.4 11 10.2 8.8 13.2ZM17.8 8.4 13 10.2 15.2 13.2Z"),
      Geist: F("M.8 12 12 3.4 23.2 12 12 20.6ZM12 7.8 15.8 12 12 16.2 8.2 12Z"),
      Werwolf: F("M1 2.5H23L21 12.5 19 7.2 17 13.5 15 7.2 13 14.5 11 7.2 9 13.5 7 7.2 5 12.5 3 7.2Z") + F("M2 21.5 4.5 14 7 20 9.5 14.6 12 21.8 14.5 14.6 17 20 19.5 14 22 21.5Z"),
      Gegenstand: F("M12 23 7.8 8.2H16.2ZM5.5 8.2H18.5V5H5.5ZM10 5V1H14V5Z"),
      unbekannt: L("M6.5 7.5 12 3 17.5 7.5V11.5L12 14.5V17", 2.9) + F("M12 18.8 14.2 21.2 12 23.6 9.8 21.2Z"),
      sonst: F("M2 3 6 1.5 22 21 18 22.5ZM22 3 18 1.5 2 21 6 22.5Z"),
    },
  },
};
export const STYLE_IDS = Object.keys(STYLES);
export const DEFAULT_STYLE = "spritzer";
const KEY = "kbn_symstyle";
let current = (() => { const v = store(KEY); return STYLES[v] ? v : DEFAULT_STYLE; })();
export const getStyleId = () => current;
export function setStyleId(id) { if (STYLES[id]) { current = id; store(KEY, id); } }

// Bruchlinie für Tote: zackiger Riss in der Farbe der Fläche (wirkt wie eine Lücke im Symbol)
const crackSvg = col => `<path d="M1.5 2.6 10.6 9.4 6.8 13 15.4 17.2 12.6 23.6" fill="none" stroke="${col}" stroke-width="1.7" stroke-linejoin="miter"/>`;
const P = a => a.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
const cache = new Map();

/** Knotenbild als Data-URI. o: { type (Schlüssel in g), fill, ink (Symbolfarbe), edge (Randfarbe), pc, dead, sel, inkTheme, sea } */
export function nodeFaceUri(o, styleId = current) {
  const key = [styleId, o.type, o.fill, o.pc, o.dead, o.sel, o.inkTheme, o.sea].join("|");
  if (cache.has(key)) return cache.get(key);
  const st = STYLES[styleId], [bx, by, bs] = st.box, k = o.pc ? .92 : 1;
  const g = (st.g[o.type] || st.g.sonst).replace(/§/g, o.ink) + (o.dead ? crackSvg(o.fill) : "");
  const frame = (sc, extra) => `<g transform="translate(20 20) scale(${sc}) translate(-20 -20)"><polygon points="${P(st.pts)}" ${extra} stroke-linejoin="miter" stroke-miterlimit="8"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">`
    + (o.sel ? frame(1.1, `fill="none" stroke="${o.sea}" stroke-width="3"`) : "")
    + (o.pc ? frame(1.1, `fill="none" stroke="${o.inkTheme}" stroke-width="1.5"`) : "")
    + frame(k, `fill="${o.fill}" fill-opacity="${o.dead ? .6 : 1}" stroke="${o.edge}" stroke-width="2.6"${o.dead ? ' stroke-dasharray="4 2.2"' : ""}`)
    + `<g transform="translate(20 20) scale(${k}) translate(-20 -20)">${st.deco(o.fill, o.edge, o.ink)}</g>`
    + `<svg x="${bx}" y="${by}" width="${bs}" height="${bs}" viewBox="0 0 24 24">${g}</svg></svg>`;
  const uri = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  cache.set(key, uri); return uri;
}

/** Symbol für Legende und Filter: Maske, nimmt die Textfarbe an (nur DOM-Knoten, kein HTML-Text) */
export function glyphIcon(type, cls, styleId = current) {
  const st = STYLES[styleId], g = (st.g[type] || st.g.sonst).replace(/§/g, "#000");
  const u = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${g}</svg>`)}")`;
  return h("span", { class: "glyph " + (cls || ""), "aria-hidden": "true", style: `-webkit-mask-image:${u};mask-image:${u}` });
}

/** Umriss des aktuellen Stils als CSS-Polygon (Prozent), für die Sektenpunkte der Legende */
export function frameClip(styleId = current) {
  return "polygon(" + STYLES[styleId].pts.map(([x, y]) => (x / .4).toFixed(1) + "% " + (y / .4).toFixed(1) + "%").join(",") + ")";
}

/** Umriss des Stils für Cytoscape (`shape-polygon-points`, Koordinaten −1…1): Kanten enden damit am sichtbaren Rand des Knotenbilds,
 *  nicht am umgebenden Rechteck. Nur ohne `border-width`, sonst wirft Cytoscape 3.33 einen Fehler (hasMiterBounds). */
export function framePolygon(styleId = current) {
  return STYLES[styleId].pts.map(([x, y]) => ((x - 20) / 20).toFixed(3) + " " + ((y - 20) / 20).toFixed(3)).join(" ");
}
