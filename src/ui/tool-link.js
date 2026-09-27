// The link from a calculator into the generator.
//
// The three calculators are the only pages of this site search has carried so
// far, so they are the front door whether or not they were meant to be. A
// visitor who reaches one has already typed the two things the generator asks
// for first — trim size and page count — into a box on the same site. Landing
// them on an empty form is that work thrown away, so carry it across.
import { TRIMS, pageGeometry } from "../pdf/kdp.js";
import { solutionsThatFit, planPages, solutionsPerPageFor } from "../pdf/layout.js";

// Page count is not puzzle count — a book is puzzles plus solutions plus front
// matter plus the ruled pages at the back — so convert with the same planner
// the book itself is laid out by, and send the generator a number it means.
//
// The generator opens on the animals list, medium, 15 words a puzzle, which can
// reach a 19×19 grid. On 5×8 and 5.5×8.5 a grid that big needs fewer answers a
// page to keep its letters at 7 pt, so the book is planned at that size too —
// otherwise the note said 110 pages and the generator opened on 130.
// test/invariants.test.js holds this to gridBound() of those settings.
export const OPENS_WITH_GRID = 19;

export function toolLink({ trim, pages, ...rest }) {
  const geom = pageGeometry({ trim, bleed: !!rest.bleed });
  const total = (n) => planPages(n, solutionsPerPageFor(n, solutionsThatFit(geom, false, OPENS_WITH_GRID, n))).total;
  let count = 1;
  for (let n = 1; n <= 200 && total(n) <= pages; n++) count = n;
  const planned = total(count);
  const q = new URLSearchParams({ trim, count: String(count) });
  for (const [k, v] of Object.entries(rest)) {
    if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  }
  return { href: `/?${q}#tool`, count, pages: planned, requested: pages };
}

// One sentence saying what the button will do, so the click is not a leap.
// When the generator's 200-puzzle ceiling means the book cannot be as long as
// the page count they typed, say so here rather than let them find out.
export function carryNote(link, trim, extra = "") {
  const short = link.pages < link.requested
    ? ` — ${link.count} puzzles is the longest book the generator makes, so it comes to ${link.pages} pages, not ${link.requested}`
    : "";
  return `The button opens the generator with this book already set up — ${TRIMS[trim].label}, ` +
    `${link.count} puzzle${link.count === 1 ? "" : "s"}, ${link.pages} pages${extra}${short}. Nothing to re-type.`;
}
