// KDP cover geometry. Deliberately free of pdf-lib and every other heavy
// import, so pages that only need the arithmetic — the spine calculator —
// can use the same numbers as the renderer without shipping a PDF engine.
//
// From KDP's "Create a Paperback Cover" help page:
//   spine width  = page count x per-page paper thickness (nothing is added)
//   cover width  = bleed + back width + spine + front width + bleed
//   cover height = bleed + trim height + bleed
//   bleed        = 0.125" on every outside edge
//   spine text   = allowed only at 79 pages or more

import { PT, TRIMS } from "./kdp.js";

export const BLEED_IN = 0.125;
export const SPINE_TEXT_MIN_PAGES = 79;
// KDP's cover calculator: "Spine Safe Area" is the spine less 0.0625" at each
// fold. Our spine type is Liberation Sans Bold, whose ascender-to-descender box
// is 1.117 em; below 6pt it is not worth printing. So from 79 pages KDP allows
// spine text, but it only fits once the spine is about 0.218" — 88 pages on
// cream, 97 on white.
export const SPINE_FOLD_IN = 0.0625;
export const SPINE_TYPE_MIN_PT = 6;
export const SPINE_TYPE_BOX_EM = 1.1171875;

// Not a number KDP publishes; it is the clear area their own downloadable
// cover templates reserve in the lower right of the back cover.
export const BARCODE_IN = { w: 2, h: 1.2, margin: 0.25 };

export const PAPER = {
  white: { label: "Black & white on white paper", thickness: 0.002252 },
  cream: { label: "Black & white on cream paper", thickness: 0.0025 },
  // Not on KDP's help pages. Their cover calculator returns 0.235" of spine
  // at 100 pages and 1.946" at 828 (checked 2026-09-24): 0.00235 a page.
  groundwood: { label: "Black & white on groundwood paper", thickness: 0.00235 },
  premiumColor: { label: "Premium colour", thickness: 0.002347 },
  standardColor: { label: "Standard colour", thickness: 0.002252 },
};

export function spineWidthInches(pageCount, paper = "cream") {
  const t = (PAPER[paper] ?? PAPER.cream).thickness;
  return pageCount * t;
}

export function coverGeometry({ trim = "6x9", pageCount = 24, paper = "cream" }) {
  const t = TRIMS[trim] ?? TRIMS["6x9"];
  const spineIn = spineWidthInches(pageCount, paper);
  const widthIn = BLEED_IN + t.w + spineIn + t.w + BLEED_IN;
  const heightIn = BLEED_IN + t.h + BLEED_IN;
  return {
    width: widthIn * PT,
    height: heightIn * PT,
    spine: spineIn * PT,
    bleed: BLEED_IN * PT,
    trim: t,
    pageCount,
    paper,
    spineTextAllowed: pageCount >= SPINE_TEXT_MIN_PAGES,
    spineTextFits: pageCount >= SPINE_TEXT_MIN_PAGES &&
      (spineIn - 2 * SPINE_FOLD_IN) * PT >= SPINE_TYPE_MIN_PT * SPINE_TYPE_BOX_EM,
    backX: BLEED_IN * PT,
    spineX: (BLEED_IN + t.w) * PT,
    frontX: (BLEED_IN + t.w + spineIn) * PT,
    panelW: t.w * PT,
    panelH: t.h * PT,
    panelY: BLEED_IN * PT,
  };
}
