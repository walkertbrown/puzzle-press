// Page planning. Pure arithmetic, no pdf-lib — the UI needs page counts to
// quote spine widths and royalties long before anyone asks for a PDF, and it
// should not have to load a PDF engine to do it.

import { MIN_PAGES } from "./kdp.js";

// Padding a short book with lined Notes pages is a last resort, not a
// feature. A 6-puzzle book has about 10 pages of content; filling it to KDP's
// 24-page minimum meant 14 blank pages, which is not a book anyone would sell.
// Past this many, stop padding and tell the truth about the length instead.
export const MAX_FILLER = 4;

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

// A short book deserves bigger solution grids rather than more blank pages:
// spreading six answers over three pages beats cramming them onto one and
// padding the difference with ruled lines.
export function solutionsPerPageFor(puzzleCount, fits) {
  if (puzzleCount <= 12) return Math.min(fits, 2);
  if (puzzleCount <= 24) return Math.min(fits, 4);
  return fits;
}

// Page count before rendering, so the gutter is chosen for the final size.
// Returns what the book will actually be, including how much of it is filler,
// so the caller can warn rather than quietly shipping a padded book.
export function planPages(puzzleCount, solutionsPerPage = 4) {
  let content = 2 + puzzleCount; // title, copyright, puzzles
  if (content % 2 === 1) content += 1; // blank before the divider
  content += 1; // divider
  content += Math.ceil(puzzleCount / solutionsPerPage);

  let total = content;
  if (total % 2 === 1) total += 1;
  const shortfall = MIN_PAGES - total;
  const padded = shortfall > 0 && shortfall <= MAX_FILLER;
  if (padded) total = MIN_PAGES;

  return {
    total,
    content,
    filler: total - content,
    // True when the book is too short for KDP however it is padded.
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
