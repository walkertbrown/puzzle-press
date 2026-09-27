// Page planning. Pure arithmetic, no pdf-lib — the UI needs page counts to
// quote spine widths and royalties long before anyone asks for a PDF, and it
// should not have to load a PDF engine to do it.

import { MIN_PAGES, MAX_PAGES, SAFETY_IN, PT, gutterInches } from "./kdp.js";

// Padding a short book with lined Notes pages is a last resort, not a
// feature. A 6-puzzle book has about 10 pages of content; filling it to KDP's
// 24-page minimum meant 14 blank pages, which is not a book anyone would sell.
// Past this many, stop padding and tell the truth about the length instead.
// Ruled pages at the back, always. Part of the book, not padding.
export const NOTES_PAGES = 4;
export const MAX_FILLER = 4;

// KDP prints black ink at a flat rate up to this many pages, so below it an
// extra page costs the seller nothing.
export const FLAT_RATE_PAGES = 110;

// Two columns of solution grids, three rows when each grid can still be at
// least ~2.1" (a 15×15 grid at 7pt letters, the usual size in printed
// books), otherwise two. Fewer solution pages means a cheaper print cost
// per copy for the seller.
//
// Large print is the exception: one answer grid a page. At six a page the
// answer letters are ~8pt and at two ~12pt, under the 16pt KDP gives as what
// large print "usually" means — a reader who bought the book for its print
// size gets an answer key they can't read. At one a page every letter in the
// book is 16pt or more, and on 8.5×11 a book of up to 50 puzzles still fits
// in KDP's flat-rate 110 pages.
//
// And KDP's "Minimum font size: 7 points" (G201857950) sets a floor under
// that density. An answer letter takes 0.85 of its cell at most, so a grid of
// `maxGrid` cells a side needs a square of maxGrid × 7 / 0.85 points. Until
// 2026-09-27 the grid size was never asked: a 30×30 grid typed in on 5×8 got
// four answers a page at 4.2pt. Now the page steps down — 6, 4, 2, 1 — until
// the biggest grid in the book (src/generator/gridbound.js) fits at 7pt.
export const LETTER_SHARE = 0.85;
export const MIN_TYPE = 7;
export function solutionsThatFit(geom, largePrint = false, maxGrid = 0, puzzleCount = 0) {
  if (largePrint) return 1;
  const s = SAFETY_IN * PT;
  // The gutter grows with the page count, and the page count depends on the
  // answer this returns — so each layout is judged at the gutter of the book
  // it would make. With no count, the widest gutter any book can get: a wider
  // gutter only ever narrows the square, so that errs toward readable.
  const width = (per) => {
    const pages = puzzleCount ? planPages(puzzleCount, per).total : MAX_PAGES;
    return geom.width - Math.max(geom.margin.inner, gutterInches(pages) * PT) - geom.margin.outer - 2 * s;
  };
  const h = geom.height - geom.margin.top - geom.margin.bottom - 2 * s - 28;
  const gap = 14;
  const sideAt3 = (h - 2 * gap) / 3 - 16;
  const densest = sideAt3 >= 150 ? 6 : 4;
  const need = (maxGrid * MIN_TYPE) / LETTER_SHARE;
  // The square each layout gives a grid, as drawSolutionsPage computes it.
  const side = (per) => {
    const cols = per <= 2 ? 1 : 2;
    const rows = Math.ceil(per / cols);
    const label = per === 1 ? 16 : 10;
    return Math.min((width(per) - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows - label - 6);
  };
  for (const per of [6, 4, 2]) if (per <= densest && side(per) >= need) return per;
  return 1;
}

// Solutions are packed at the density the page allows, which is the fewest
// pages and the cheapest to print. An earlier version spread them out to
// avoid blank pages, which meant a 12-puzzle book got one grid per page and a
// 20-puzzle book got four — the book changed character with the count, for no
// reason a reader would understand.
export function solutionsPerPageFor(puzzleCount, fits) {
  void puzzleCount;
  return fits;
}

// Page count before rendering, so the gutter is chosen for the final size.
// Returns what the book will actually be, including how much of it is filler,
// so the caller can warn rather than quietly shipping a padded book.
// The book has a fixed shape: title, copyright, the puzzles, a Solutions
// divider, the solutions packed as tightly as the page allows, and NOTES_PAGES
// ruled pages at the back. Ruled pages at the end of a puzzle book are a
// normal thing to want — somewhere to work out a hard one — so they are part
// of the design rather than padding, and there are always the same number.
export function planPages(puzzleCount, solutionsPerPage = 4) {
  const solutionPages = Math.ceil(puzzleCount / solutionsPerPage);
  const content = 1 + 1 + puzzleCount + 1 + solutionPages; // title, copyright, puzzles, divider, solutions
  let total = content + NOTES_PAGES;
  if (total % 2 === 1) total += 1; // KDP wants an even page count

  return {
    total,
    content,
    solutionPages,
    notes: total - content,
    // Kept for callers that still ask; nothing is "filler" any more.
    filler: total - content,
    belowMinimum: total < MIN_PAGES,
    minimum: MIN_PAGES,
  };
}

// The inverse of planPages, for the calculators. Somebody on the royalty page
// has typed a page count and priced a book against it; the generator asks for
// a puzzle count instead. Hand back the most puzzles that still fit inside
// their number, so the book they land on is no longer — and so no dearer to
// print — than the one they just priced.
export function puzzlesForPages(targetPages, fits, max = 200) {
  let best = 1;
  for (let n = 1; n <= max; n++) {
    if (planPages(n, solutionsPerPageFor(n, fits)).total > targetPages) break;
    best = n;
  }
  return best;
}

// The fewest puzzles that reach KDP's minimum without filler, for a given
// solutions-per-page. Used to tell someone what to change.
export function puzzlesForMinimum(fits) {
  for (let n = 1; n <= 200; n++) {
    const per = solutionsPerPageFor(n, fits);
    if (!planPages(n, per).belowMinimum) return n;
  }
  return 200;
}
