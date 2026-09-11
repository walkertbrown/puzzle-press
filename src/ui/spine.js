// The spine calculator page. It imports the same functions the book generator
// uses, so the numbers here cannot drift away from the numbers in the PDFs.
import { TRIMS, gutterInches, PT } from "../pdf/kdp.js";
import { coverGeometry, spineWidthInches, PAPER, SPINE_TEXT_MIN_PAGES, BARCODE_IN } from "../pdf/cover-geometry.js";

const $ = (id) => document.getElementById(id);
const el = {
  trim: $("trim"), pages: $("pages"), paper: $("paper"),
  spine: $("spine"), spineMm: $("spineMm"), cover: $("cover"), coverMm: $("coverMm"),
  gutter: $("gutter"), spineText: $("spineText"), barcode: $("barcode"), sum: $("sum"),
};

for (const [id, t] of Object.entries(TRIMS)) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = t.label + (id === "6x9" ? " (most common)" : "");
  if (id === "6x9") o.selected = true;
  el.trim.append(o);
}
for (const [id, p] of Object.entries(PAPER)) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = `${p.label} — ${p.thickness}" per page`;
  if (id === "cream") o.selected = true;
  el.paper.append(o);
}

const inch = (n) => `${n.toFixed(3)}"`;
const mm = (n) => `${(n * 25.4).toFixed(1)} mm`;

function update() {
  const trim = el.trim.value;
  const pages = Math.max(24, Math.min(828, parseInt(el.pages.value, 10) || 24));
  const paper = el.paper.value;

  const spine = spineWidthInches(pages, paper);
  const g = coverGeometry({ trim, pageCount: pages, paper });
  const w = g.width / PT;
  const h = g.height / PT;
  const t = TRIMS[trim];

  el.spine.textContent = inch(spine);
  el.spineMm.textContent = mm(spine);
  el.cover.textContent = `${inch(w)} × ${inch(h)}`;
  el.coverMm.textContent = `${mm(w)} × ${mm(h)}`;
  el.gutter.textContent = `${inch(gutterInches(pages))} inside margin`;
  el.spineText.textContent =
    pages >= SPINE_TEXT_MIN_PAGES
      ? `Allowed — ${pages} pages is at or above KDP's ${SPINE_TEXT_MIN_PAGES}-page minimum for spine text.`
      : `Not allowed — KDP needs at least ${SPINE_TEXT_MIN_PAGES} pages before you may put text on the spine. Leave it blank.`;
  el.barcode.textContent = `Leave ${BARCODE_IN.w}" × ${BARCODE_IN.h}" clear in the lower right of the back cover.`;
  el.sum.textContent =
    `0.125" bleed + ${t.w}" back + ${inch(spine)} spine + ${t.w}" front + 0.125" bleed = ${inch(w)}`;
}

for (const node of [el.trim, el.pages, el.paper]) {
  node.addEventListener("input", update);
  node.addEventListener("change", update);
}
update();
