// Amazon KDP paperback manuscript rules, in points (72/in).
// Source: KDP "Set Trim Size, Bleed, and Margins" help page, as of 2026.

export const PT = 72;

export const TRIMS = {
  "5x8": { label: '5" × 8"', w: 5, h: 8 },
  "5.5x8.5": { label: '5.5" × 8.5"', w: 5.5, h: 8.5 },
  "6x9": { label: '6" × 9"', w: 6, h: 9 },
  "7x10": { label: '7" × 10"', w: 7, h: 10 },
  "8x10": { label: '8" × 10"', w: 8, h: 10 },
  "8.5x11": { label: '8.5" × 11"', w: 8.5, h: 11 },
};

export const MIN_PAGES = 24;
export const MAX_PAGES = 828;

// Inside (gutter) margin by total page count.
export function gutterInches(pageCount) {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

// Page geometry for a given trim, bleed setting and page count.
// With bleed, KDP wants the PDF page 0.125" wider (outside edge) and 0.25"
// taller, and the outside/top/bottom margins measured from the trim line
// to be at least 0.375" instead of 0.25".
export function pageGeometry({ trim = "6x9", bleed = false, pageCount = MIN_PAGES }) {
  const t = TRIMS[trim] ?? TRIMS["6x9"];
  const bleedIn = bleed ? 0.125 : 0;
  const width = (t.w + bleedIn) * PT;
  const height = (t.h + 2 * bleedIn) * PT;
  const outer = (bleed ? 0.375 : 0.25) + bleedIn; // measured from the PDF page edge
  const topBottom = (bleed ? 0.375 : 0.25) + bleedIn;
  const inner = gutterInches(pageCount);
  return {
    width,
    height,
    bleed: bleedIn * PT,
    // Safe area margins in points, from the PDF page edge.
    margin: { inner: inner * PT, outer: outer * PT, top: topBottom * PT, bottom: topBottom * PT },
    trim: t,
  };
}

// In a bound book, odd pages (1, 3, 5…) are right-hand pages: their inside
// edge is the left. Even pages are left-hand: inside edge is the right.
export function marginsForPage(geom, pageNumber) {
  const rightHand = pageNumber % 2 === 1;
  return {
    left: rightHand ? geom.margin.inner : geom.margin.outer,
    right: rightHand ? geom.margin.outer : geom.margin.inner,
    top: geom.margin.top,
    bottom: geom.margin.bottom,
    rightHand,
  };
}
