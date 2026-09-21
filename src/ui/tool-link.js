// The link from a calculator into the generator.
//
// The three calculators are the only pages of this site search has carried so
// far, so they are the front door whether or not they were meant to be. A
// visitor who reaches one has already typed the two things the generator asks
// for first — trim size and page count — into a box on the same site. Landing
// them on an empty form is that work thrown away, so carry it across.
import { TRIMS, pageGeometry } from "../pdf/kdp.js";
import { solutionsThatFit, puzzlesForPages, planPages, solutionsPerPageFor } from "../pdf/layout.js";

// Page count is not puzzle count — a book is puzzles plus solutions plus front
// matter plus the ruled pages at the back — so convert with the same planner
// the book itself is laid out by, and send the generator a number it means.
export function toolLink({ trim, pages, ...rest }) {
  const fits = solutionsThatFit(pageGeometry({ trim, bleed: false, pageCount: pages }));
  const count = puzzlesForPages(pages, fits);
  const planned = planPages(count, solutionsPerPageFor(count, fits)).total;
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
