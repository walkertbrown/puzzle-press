// Amazon.com paperback printing cost and royalty.
//
// Figures quoted from KDP's "Paperback Printing Cost" help page for the
// Amazon.com (US) marketplace. They are marketplace-specific: these numbers
// are wrong for amazon.co.uk or amazon.de, which is why everything here says
// "Amazon.com" out loud rather than implying it works everywhere.
//
// Large trim means more than 6.12" wide or more than 9" tall. 6x9 is regular
// trim — exactly 9" is not "more than" 9".
//
// No pdf-lib, no fonts: a calculator page can import this on its own.

import { TRIMS } from "./kdp.js";

export const MARKETPLACE = "Amazon.com (US)";

export const INKS = {
  black: { label: "Black ink" },
  premiumColor: { label: "Premium colour" },
  standardColor: { label: "Standard colour" },
};

// [fixed, perPage] by ink, with a flat band for short books where KDP has one.
const RATES = {
  regular: {
    black: { flat: { max: 110, cost: 2.3 }, fixed: 1.0, perPage: 0.012, min: 24, max: 828 },
    premiumColor: { flat: { max: 40, cost: 3.6 }, fixed: 1.0, perPage: 0.065, min: 24, max: 828 },
    standardColor: { flat: null, fixed: 1.0, perPage: 0.0255, min: 72, max: 600 },
  },
  large: {
    black: { flat: { max: 110, cost: 2.84 }, fixed: 1.0, perPage: 0.017, min: 24, max: 828 },
    premiumColor: { flat: null, fixed: 1.0, perPage: 0.08, min: 42, max: 828 },
    standardColor: { flat: null, fixed: 1.0, perPage: 0.0402, min: 72, max: 600 },
  },
};

export function isLargeTrim(trim) {
  const t = TRIMS[trim] ?? TRIMS["6x9"];
  return t.w > 6.12 || t.h > 9;
}

// printingCost({ trim, pages, ink }) -> { cost, band, large, note }
// `cost` is null when the combination is outside what KDP will print.
export function printingCost({ trim = "6x9", pages = 24, ink = "black" } = {}) {
  const large = isLargeTrim(trim);
  const r = RATES[large ? "large" : "regular"][ink] ?? RATES.regular.black;

  if (pages < r.min || pages > r.max) {
    return {
      cost: null,
      large,
      band: null,
      note: `${INKS[ink].label} on ${large ? "large" : "regular"} trim is printed from ${r.min} to ${r.max} pages.`,
    };
  }
  if (r.flat && pages <= r.flat.max) {
    return { cost: r.flat.cost, large, band: `flat rate up to ${r.flat.max} pages`, note: null };
  }
  const cost = r.fixed + pages * r.perPage;
  return {
    cost: Math.round(cost * 100) / 100,
    large,
    band: `${r.fixed.toFixed(2)} + ${pages} × ${r.perPage}`,
    note: null,
  };
}

// KDP pays 60% of list above a threshold and 50% at or below it.
export const ROYALTY_THRESHOLD = 9.99;
export function royaltyRate(listPrice) {
  return listPrice >= ROYALTY_THRESHOLD ? 0.6 : 0.5;
}

// royalty({ list, trim, pages, ink }) -> { rate, printing, royalty, minList }
export function royalty({ list = 9.99, trim = "6x9", pages = 24, ink = "black" } = {}) {
  const { cost, large, band, note } = printingCost({ trim, pages, ink });
  if (cost === null) return { rate: null, printing: null, royalty: null, minList: null, large, band, note };
  const rate = royaltyRate(list);
  const earned = rate * list - cost;
  return {
    rate,
    printing: cost,
    royalty: Math.round(earned * 100) / 100,
    // The lowest list price that still covers printing, at the rate that price
    // would itself qualify for.
    minList: minimumListPrice(cost),
    large,
    band,
    note,
  };
}

// Below the threshold KDP pays 50%, so a cheap book needs a higher price to
// break even than a naive cost/0.6 suggests. Check the low band first.
export function minimumListPrice(printing) {
  const low = Math.ceil((printing / 0.5) * 100) / 100;
  if (low < ROYALTY_THRESHOLD) return low;
  return Math.max(ROYALTY_THRESHOLD, Math.ceil((printing / 0.6) * 100) / 100);
}
