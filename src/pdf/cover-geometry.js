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

// Not a number KDP publishes; it is the clear area their own downloadable
// cover templates reserve in the lower right of the back cover.
export const BARCODE_IN = { w: 2, h: 1.2, margin: 0.25 };

export const PAPER = {
  white: { label: "Black & white on white paper", thickness: 0.002252 },
  cream: { label: "Black & white on cream paper", thickness: 0.0025 },
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
    backX: BLEED_IN * PT,
    spineX: (BLEED_IN + t.w) * PT,
    frontX: (BLEED_IN + t.w + spineIn) * PT,
    panelW: t.w * PT,
    panelH: t.h * PT,
    panelY: BLEED_IN * PT,
  };
}
