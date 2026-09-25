// The spine calculator page. It imports the same functions the book generator
// uses, so the numbers here cannot drift away from the numbers in the PDFs.
import { TRIMS, gutterInches, PT } from "../pdf/kdp.js";
import { coverGeometry, spineWidthInches, PAPER, SPINE_TEXT_MIN_PAGES, SPINE_FOLD_IN, SPINE_TYPE_BOX_EM, SPINE_TYPE_MIN_PT, BARCODE_IN } from "../pdf/cover-geometry.js";
import { toolLink, carryNote } from "./tool-link.js";
import { px } from "./px.js";

const $ = (id) => document.getElementById(id);
const el = {
  make: $("makeBtn"), makeTop: $("makeBtnTop"), carry: $("carry"),
  trim: $("trim"), pages: $("pages"), paper: $("paper"),
  spine: $("spine"), spineMm: $("spineMm"), cover: $("cover"), coverMm: $("coverMm"),
  gutter: $("gutter"), spineText: $("spineText"), barcode: $("barcode"), sum: $("sum"),
  coverPx: $("coverPx"), pxNote: $("pxNote"),
};

// Nobody designs a cover in inches. They open Canva or Photoshop, which ask for
// a canvas in pixels, and the conversion needs a DPI the tool never states.
// Checked against KDP's published guidelines 2026-09-23: images must be placed
// at a minimum of 300 DPI, 600 is their recommended ceiling to keep the file
// under 650MB, and a paperback cover must be CMYK and a single PDF containing
// back, spine and front. So 300 is the number to multiply by — it is the floor
// they enforce, not a convention I picked.
const COVER_DPI = 300;

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

  // Carried into the generator: trim, paper (the two things that set the spine
  // width), and their page count as the puzzle count that reaches it. The
  // cover it makes then has the spine width printed on this page.
  const link = toolLink({ trim, pages, paper });
  el.make.href = link.href;
  el.makeTop.href = link.href;
  el.carry.textContent = carryNote(link, trim, ` on ${PAPER[paper].label.toLowerCase()}`);

  const spine = spineWidthInches(pages, paper);
  const g = coverGeometry({ trim, pageCount: pages, paper });
  const w = g.width / PT;
  const h = g.height / PT;
  const t = TRIMS[trim];

  el.spine.textContent = inch(spine);
  el.spineMm.textContent = mm(spine);
  el.cover.textContent = `${inch(w)} × ${inch(h)}`;
  el.coverMm.textContent = `${mm(w)} × ${mm(h)}`;
  el.coverPx.textContent = `${Math.round(w * COVER_DPI)} × ${Math.round(h * COVER_DPI)} px`;
  el.pxNote.textContent =
    `The same cover at ${COVER_DPI} DPI — the canvas size to type into Canva, Photoshop or Affinity. `
    + `${COVER_DPI} DPI is KDP's stated minimum for print images; export CMYK, and as one PDF holding back, spine and front together.`;
  el.gutter.textContent = `${inch(gutterInches(pages))} inside margin`;
  // KDP's cover calculator gives a "Spine Safe Area" of the spine less 0.0625"
  // at each fold (checked against 120 trim/paper/page combinations 2026-09-24).
  // Being allowed spine text at 79 pages is not the same as having room for it:
  // at 80 pages of cream the safe strip is 0.075", under 5pt of type. The type
  // figure is a bold sans's full ascender-to-descender height, 1.117 em.
  const safe = spine - 2 * SPINE_FOLD_IN;
  const maxPt = Math.floor((safe * PT) / SPINE_TYPE_BOX_EM * 2) / 2;
  const room = `KDP's spine safe area is ${inch(Math.max(0, safe))} (0.0625" in from each fold)`;
  el.spineText.textContent =
    pages < SPINE_TEXT_MIN_PAGES
      ? `Not allowed — KDP needs at least ${SPINE_TEXT_MIN_PAGES} pages before you may put text on the spine. Leave it blank.`
      : maxPt < SPINE_TYPE_MIN_PT
        ? `Allowed, but there is no room — ${room}, which fits type of about ${maxPt}pt at most. Puzzle Press leaves a spine this narrow blank.`
        : `Allowed — ${room}, which fits type up to about ${maxPt}pt from the top of a capital to the bottom of a "g".`;
  el.barcode.textContent = `Leave ${BARCODE_IN.w}" × ${BARCODE_IN.h}" clear in the lower right of the back cover.`;
  el.sum.textContent =
    `0.125" bleed + ${t.w}" back + ${inch(spine)} spine + ${t.w}" front + 0.125" bleed = ${inch(w)}`;
}

for (const node of [el.trim, el.pages, el.paper]) {
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

// The load beacon, added 2026-09-23 for the same reason the guide and the
// comparison page got one that morning. "Used a calculator" was counted as a
// fetch of this bundle, and a crawler that reads a <script src> fetches it
// too. The guide's version of that number was six people; all six were
// crawlers. A module body only runs in something that executes JavaScript, so
// this line is the first honest evidence that a person is on the page — and
// naming it per calculator answers the question the handoff cannot: which of
// the three free utilities search actually carries.
px("spine");

update();
