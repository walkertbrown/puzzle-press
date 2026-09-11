// Page planning. Pure arithmetic, no pdf-lib — the UI needs page counts to
// quote spine widths and royalties long before anyone asks for a PDF, and it
// should not have to load a PDF engine to do it.

import { MIN_PAGES } from "./kdp.js";

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
export function solutionsThatFit(geom) {
  const h = geom.height - geom.margin.top - geom.margin.bottom - 28;
  const gap = 14;
  const sideAt3 = (h - 2 * gap) / 3 - 16;
  return sideAt3 >= 150 ? 6 : 4;
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

// The fewest puzzles that reach KDP's minimum without filler, for a given
// solutions-per-page. Used to tell someone what to change.
export function puzzlesForMinimum(fits) {
  for (let n = 1; n <= 200; n++) {
    const per = solutionsPerPageFor(n, fits);
    if (!planPages(n, per).belowMinimum) return n;
  }
  return 200;
}
