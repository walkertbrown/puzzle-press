// These figures come from KDP's own Paperback Printing Cost page for
// Amazon.com. If Amazon changes them this test should fail loudly rather than
// the site quietly quoting stale money.
import { test } from "node:test";
import assert from "node:assert/strict";
import { printingCost, royalty, royaltyRate, minimumListPrice, isLargeTrim } from "../src/pdf/kdp-cost.js";

test("large trim is more than 6.12in wide or more than 9in tall — 6x9 is regular", () => {
  assert.equal(isLargeTrim("5x8"), false);
  assert.equal(isLargeTrim("5.5x8.5"), false);
  assert.equal(isLargeTrim("6x9"), false, "exactly 9in is not more than 9in");
  assert.equal(isLargeTrim("7x10"), true);
  assert.equal(isLargeTrim("8x10"), true);
  assert.equal(isLargeTrim("8.5x11"), true);
});

test("regular trim black ink: flat 2.30 to 110 pages, then 1.00 + 0.012 a page", () => {
  assert.equal(printingCost({ trim: "6x9", pages: 24, ink: "black" }).cost, 2.3);
  assert.equal(printingCost({ trim: "6x9", pages: 110, ink: "black" }).cost, 2.3);
  assert.equal(printingCost({ trim: "6x9", pages: 200, ink: "black" }).cost, 3.4);
  assert.equal(printingCost({ trim: "6x9", pages: 300, ink: "black" }).cost, 4.6);
});

test("large trim black ink: flat 2.84 to 110 pages, then 1.00 + 0.017 a page", () => {
  assert.equal(printingCost({ trim: "8.5x11", pages: 100, ink: "black" }).cost, 2.84);
  assert.equal(printingCost({ trim: "8.5x11", pages: 200, ink: "black" }).cost, 4.4);
});

test("colour rates differ by trim", () => {
  assert.equal(printingCost({ trim: "6x9", pages: 100, ink: "premiumColor" }).cost, 7.5);
  assert.equal(printingCost({ trim: "8.5x11", pages: 100, ink: "premiumColor" }).cost, 9.0);
  assert.equal(printingCost({ trim: "6x9", pages: 100, ink: "standardColor" }).cost, 3.55);
});

test("combinations KDP will not print return no cost and say why", () => {
  const tooShort = printingCost({ trim: "6x9", pages: 50, ink: "standardColor" });
  assert.equal(tooShort.cost, null);
  assert.match(tooShort.note, /72 to 600 pages/);
  assert.equal(printingCost({ trim: "6x9", pages: 900, ink: "black" }).cost, null);
});

test("royalty is 60% at or above 9.99 and 50% below", () => {
  assert.equal(royaltyRate(9.98), 0.5);
  assert.equal(royaltyRate(9.99), 0.6);
  assert.equal(royaltyRate(16.99), 0.6);
});

test("a 300-page 6x9 at 16.99 earns 5.59, which is KDP's own worked example", () => {
  const r = royalty({ list: 16.99, trim: "6x9", pages: 300, ink: "black" });
  assert.equal(r.printing, 4.6);
  assert.equal(r.rate, 0.6);
  assert.equal(r.royalty, 5.59);
});

test("minimum list price covers printing at the rate that price qualifies for", () => {
  // Cheap short book: 2.30 printing, 50% band -> 4.60 covers it.
  assert.equal(minimumListPrice(2.3), 4.6);
  // Expensive book: 50% band cannot cover it, so it lands in the 60% band.
  assert.ok(minimumListPrice(7.5) >= 9.99);
  assert.equal(minimumListPrice(7.5), 12.5);
});

test("a book priced below its minimum earns a negative royalty, and says so", () => {
  const r = royalty({ list: 4.99, trim: "6x9", pages: 300, ink: "black" });
  assert.ok(r.royalty < 0, "priced below cost");
  assert.ok(r.minList > 4.99);
});
