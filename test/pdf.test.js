import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { generateBook } from "../src/generator/book.js";
import { THEMES } from "../src/generator/wordlists.js";
import { renderBook, planPages, solutionsThatFit, solutionsPerPageFor } from "../src/pdf/render.js";
import { pageGeometry, gutterInches, marginsForPage } from "../src/pdf/kdp.js";

const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};

test("gutter follows the KDP page-count table", () => {
  assert.equal(gutterInches(24), 0.375);
  assert.equal(gutterInches(150), 0.375);
  assert.equal(gutterInches(151), 0.5);
  assert.equal(gutterInches(301), 0.625);
  assert.equal(gutterInches(501), 0.75);
  assert.equal(gutterInches(701), 0.875);
});

test("6x9 no-bleed page is 432x648pt; bleed adds 0.125in wide and 0.25in tall", () => {
  const a = pageGeometry({ trim: "6x9", bleed: false, pageCount: 24 });
  assert.equal(a.width, 432);
  assert.equal(a.height, 648);
  const b = pageGeometry({ trim: "6x9", bleed: true, pageCount: 24 });
  assert.equal(b.width, 441);
  assert.equal(b.height, 666);
  assert.equal(b.margin.outer, 36); // 0.375 + 0.125 bleed
});

test("odd pages have the gutter on the left, even pages on the right", () => {
  const g = pageGeometry({ trim: "6x9", pageCount: 24 });
  assert.equal(marginsForPage(g, 1).left, g.margin.inner);
  assert.equal(marginsForPage(g, 2).right, g.margin.inner);
});

test("planPages: a fixed shape — title, copyright, puzzles, divider, solutions, notes", () => {
  // 1 + 1 + 40 + 1 + ceil(40/4) + 4 = 57 -> 58 for an even count
  const forty = planPages(40, 4);
  assert.equal(forty.solutionPages, 10);
  assert.equal(forty.total, 58);
  assert.equal(forty.notes, 5); // 4, plus one for parity
  assert.equal(forty.total, forty.content + forty.notes);
  // A short book comes out short and says so rather than being padded.
  const five = planPages(5, 6);
  assert.equal(five.belowMinimum, true);
  // 1+1+5+1+1 = 9 pages of content, which is odd, so parity adds a fifth
  // notes page. Four or five, never more.
  assert.equal(five.notes, 5);
  assert.equal(five.total, five.content + five.notes);
  assert.equal(planPages(16, 6).belowMinimum, false);
});

test("solutions per page: 6 when three rows stay legible, else 4", () => {
  assert.equal(solutionsThatFit(pageGeometry({ trim: "6x9" })), 6);
  assert.equal(solutionsThatFit(pageGeometry({ trim: "8.5x11" })), 6);
  assert.equal(solutionsThatFit(pageGeometry({ trim: "5x8" })), 4);
});

test("renders a 6x9 book with the planned page count and embedded fonts", async () => {
  const book = generateBook({ pools: [THEMES.animals], count: 10, wordsPerPuzzle: 15, seed: "pdf6x9" });
  const bytes = await renderBook(book, { title: "Animal Word Search", subtitle: "50 puzzles for relaxing evenings", author: "Test Author", trim: "6x9", fonts });
  const pdf = await PDFDocument.load(bytes);
  // The renderer now chooses solutions-per-page itself, to fill pages with
  // answers rather than blanks; ask it what it would pick.
  assert.equal(pdf.getPageCount(), planPages(10, solutionsPerPageFor(10, solutionsThatFit(pageGeometry({ trim: "6x9" })))).total);
  const [w, h] = [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()];
  assert.equal(w, 432);
  assert.equal(h, 648);
  assert.equal(pdf.getTitle(), "Animal Word Search");
  // Embedded TrueType fonts carry a FontFile2 stream in their descriptor.
  // (Objects are in compressed object streams, so inspect via pdf-lib.)
  const dicts = pdf.context.enumerateIndirectObjects().map(([, obj]) => obj.toString());
  assert.ok(dicts.some((s) => s.includes("/FontFile2")), "TrueType font should be embedded");
  assert.ok(!dicts.some((s) => s.includes("/BaseFont /Helvetica")), "no un-embedded standard font");
  mkdirSync(new URL("../samples/test/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../samples/test/sample-6x9.pdf", import.meta.url), bytes);
});

test("renders an 8.5x11 hard book with bleed, licensed (no watermark)", async () => {
  const book = generateBook({ pools: [THEMES.ocean, THEMES.space], count: 30, wordsPerPuzzle: 20, difficulty: "hard", seed: "pdfletter" });
  const bytes = await renderBook(book, { title: "Big Word Search Book", trim: "8.5x11", bleed: true, licensed: true, fonts });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), planPages(30, solutionsPerPageFor(30, solutionsThatFit(pageGeometry({ trim: "8.5x11", bleed: true })))).total);
  assert.equal(pdf.getPage(0).getWidth(), 621); // 8.625in
  assert.equal(pdf.getPage(0).getHeight(), 810); // 11.25in
  writeFileSync(new URL("../samples/test/sample-8.5x11-bleed.pdf", import.meta.url), bytes);
});
