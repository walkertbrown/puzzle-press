// The margin calculator page. Same functions the PDF engine lays pages out
// with, so the figures here are the figures in the books.
import { TRIMS, PT, MIN_PAGES, MAX_PAGES, gutterInches, pageGeometry, marginsForPage } from "../pdf/kdp.js";
import { toolLink, carryNote } from "./tool-link.js";
import { px } from "./px.js";

const $ = (id) => document.getElementById(id);
const el = {
  make: $("makeBtn"), makeTop: $("makeBtnTop"), carry: $("carry"),
  trim: $("trim"), pages: $("pages"), bleed: $("bleed"),
  pageSize: $("pageSize"), pageSizeMm: $("pageSizeMm"), pagePt: $("pagePt"),
  inside: $("inside"), outside: $("outside"), topBottom: $("topBottom"),
  sides: $("sides"), settings: $("settings"), live: $("live"),
  diagram: $("diagram"), bleedNote: $("bleedNote"),
};

for (const [id, t] of Object.entries(TRIMS)) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = t.label + (id === "6x9" ? " (most common)" : "");
  if (id === "6x9") o.selected = true;
  el.trim.append(o);
}

const inch = (n) => `${(Math.round(n * 1000) / 1000).toString()}"`;
const mm = (n) => `${(n * 25.4).toFixed(1)} mm`;

// Two facing pages, drawn to scale, safe area shaded, gutter side marked.
function drawPages(geom) {
  const w = geom.width / PT, h = geom.height / PT;
  const scale = 150 / h; // px per inch, sized to a 150px-tall page
  const pw = w * scale, ph = h * scale, gap = 6;
  const m = geom.margin;
  const page = (x, pageNo) => {
    const mg = marginsForPage(geom, pageNo);
    const l = (mg.left / PT) * scale, r = (mg.right / PT) * scale, t = (mg.top / PT) * scale, b = (mg.bottom / PT) * scale;
    const bleed = (geom.bleed / PT) * scale;
    const trimX = mg.rightHand ? x : x + bleed; // bleed sits on the outside edge
    return `
      <rect x="${x}" y="0" width="${pw}" height="${ph}" fill="#fff" stroke="#8a93a3"/>
      ${bleed ? `<rect x="${trimX}" y="${bleed}" width="${pw - bleed}" height="${ph - 2 * bleed}" fill="none" stroke="#c9d0da" stroke-dasharray="3 3"/>` : ""}
      <rect x="${x + l}" y="${t}" width="${pw - l - r}" height="${ph - t - b}" fill="#e8eef8" stroke="#1d3557" stroke-width="1"/>
      <text x="${x + pw / 2}" y="${ph / 2 + 4}" text-anchor="middle" font-size="7" fill="#1d3557">${mg.rightHand ? "odd page" : "even page"}</text>
      <text x="${x + pw / 2}" y="${ph / 2 + 12}" text-anchor="middle" font-size="6" fill="#5c6470">gutter ${mg.rightHand ? "left" : "right"}</text>`;
  };
  el.diagram.setAttribute("viewBox", `0 0 ${pw * 2 + gap} ${ph}`);
  el.diagram.innerHTML =
    page(0, 2) + page(pw + gap, 3) +
    `<line x1="${pw + gap / 2}" y1="0" x2="${pw + gap / 2}" y2="${ph}" stroke="#1d3557" stroke-width="2"/>`;
  void m;
}

function update() {
  const trim = el.trim.value;
  const pages = Math.max(MIN_PAGES, Math.min(MAX_PAGES, parseInt(el.pages.value, 10) || MIN_PAGES));
  const bleed = el.bleed.checked;

  // Carried into the generator: trim, bleed, and their page count as the
  // puzzle count that reaches it. The interior it lays out uses exactly the
  // margins and the gutter side drawn on this page.
  const link = toolLink({ trim, pages, bleed: bleed ? "1" : "" });
  el.make.href = link.href;
  el.makeTop.href = link.href;
  el.carry.textContent = carryNote(link, trim, bleed ? ", with bleed" : "");

  const geom = pageGeometry({ trim, bleed, pageCount: pages });
  const t = TRIMS[trim];
  const w = geom.width / PT, h = geom.height / PT;
  const inner = geom.margin.inner / PT, outer = geom.margin.outer / PT, tb = geom.margin.top / PT;

  el.pageSize.textContent = `${inch(w)} × ${inch(h)}`;
  el.pageSizeMm.textContent = `${mm(w)} × ${mm(h)}`;
  el.pagePt.textContent = `${Math.round(geom.width)} × ${Math.round(geom.height)} pt`;
  el.inside.textContent = inch(inner);
  el.outside.textContent = inch(outer);
  el.topBottom.textContent = inch(tb);
  el.sides.textContent = `Inside margin ${inch(inner)} sits on the LEFT of odd pages (1, 3, 5… — right-hand pages) and on the RIGHT of even pages. ` +
    `Outside margin ${inch(outer)} is the other edge. Top and bottom ${inch(tb)}.`;
  el.settings.textContent = bleed
    ? `Page size ${inch(w)} × ${inch(h)}; mirror margins; inside ${inch(inner)}, outside ${inch(outer)}, top ${inch(tb)}, bottom ${inch(tb)}. ` +
      `The outside/top/bottom figures already include the 0.125" bleed, so measure them from the PDF page edge.`
    : `Page size ${t.w}" × ${t.h}"; mirror margins; inside (gutter) ${inch(inner)}, outside ${inch(outer)}, top ${inch(tb)}, bottom ${inch(tb)}.`;
  el.live.textContent = `Live area ${inch(w - inner - outer)} × ${inch(h - 2 * tb)} — everything that must print goes inside it.`;
  el.bleedNote.hidden = !bleed;
  drawPages(geom);
}

for (const node of [el.trim, el.pages, el.bleed]) {
  node.addEventListener("input", update);
  node.addEventListener("change", update);
}

// The handoff into the generator, and the one number the whole strategy rests
// on. These three calculators are the only pages search has ever carried, and
// the boss's ruling was distribution over content — so "somebody used a free
// utility and then went on to make a book" is the measurement that decides
// whether the free utilities are a front door or a dead end. It cannot be read
// out of the request log: the handoff lands on /?trim=..&count=..#tool, and
// Cloudflare logs the path without the query, so it is indistinguishable from
// any other landing. One content-free beacon makes it visible. See ./px.js.
for (const [node, where] of [[el.make, "handoff"], [el.makeTop, "handofftop"]]) {
  node.addEventListener("click", () => {
    // Both buttons count as the handoff, so the strategic number stays one
    // number — and the top one says so twice, so I can tell whether putting
    // the door beside the answer is what made the difference.
    px("handoff", { keep: true });
    if (where !== "handoff") px(where, { keep: true });
  });
}

update();
