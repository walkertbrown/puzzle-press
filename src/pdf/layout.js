// Page planning. Pure arithmetic, no pdf-lib — the UI needs page counts to
// quote spine widths and royalties long before anyone asks for a PDF, and it
// should not have to load a PDF engine to do it.

import { MIN_PAGES } from "./kdp.js";

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

// Page count before rendering, so the gutter is chosen for the final size.
export function planPages(puzzleCount, solutionsPerPage = 4) {
  let n = 2 + puzzleCount; // title, copyright, puzzles
  if (n % 2 === 1) n += 1; // blank before divider
  n += 1; // divider
  n += Math.ceil(puzzleCount / solutionsPerPage);
  while (n < MIN_PAGES || n % 2 === 1) n += 1;
  return { total: n };
}
