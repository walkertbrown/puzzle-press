import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument, PDFPage } from "pdf-lib";
import { generateBook } from "../src/generator/book.js";
import { generateSudokuBook } from "../src/generator/sudoku.js";
import { THEMES } from "../src/generator/wordlists.js";
import { renderBook, planPages, solutionsThatFit } from "../src/pdf/render.js";
import { pageGeometry } from "../src/pdf/kdp.js";

const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};

// KDP, beside its Large Print checkbox: "Large-print books usually have a font
// size of 16 points or higher." The puzzles always were; the answer key was
// 7.5–8.4pt at six grids a page. Every size is recorded as drawn, not read
// back off a raster, so this cannot pass on a lucky measurement.
for (const [kind, make] of [
  ["word search", () => generateBook({ pools: [THEMES.garden, THEMES.birds], count: 12, wordsPerPuzzle: 14, difficulty: "easy", trim: "8.5x11", seed: "lp" })],
  ["sudoku", () => generateSudokuBook({ count: 12, difficulty: "graded", seed: "lp" })],
]) test(`a large-print ${kind} book prints nothing a reader must read below 16pt`, async () => {
  const draws = [];
  const pages = new Map();
  const orig = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function (text, o = {}) {
    if (!pages.has(this)) pages.set(this, pages.size + 1);
    draws.push({ text: String(text), size: o.size ?? 24, page: pages.get(this) });
    return orig.call(this, text, o);
  };
  try {
    const book = make();
    const bytes = await renderBook(book, { title: "Large Print Garden", subtitle: "12 puzzles", author: "A", trim: "8.5x11", licensed: true, largePrint: true, fonts });
    // The copyright page (page 2) and page numbers are not reading text.
    const small = draws.filter((d) => d.size < 16 && d.page !== 2 && !/^\d+$/.test(d.text.trim()));
    assert.deepEqual([...new Set(small.map((d) => `${d.size}pt "${d.text.slice(0, 20)}"`))], []);
    // One answer grid a page, and the page count everything else quotes agrees.
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), planPages(12, solutionsThatFit(pageGeometry({ trim: "8.5x11" }), true)).total);
  } finally {
    PDFPage.prototype.drawText = orig;
  }
});

test("large print keeps a 50-puzzle 8.5×11 book inside KDP's flat-rate 110 pages", () => {
  assert.equal(solutionsThatFit(pageGeometry({ trim: "8.5x11" }), true), 1);
  assert.ok(planPages(50, 1).total <= 110);
  // And an ordinary book is untouched.
  assert.equal(solutionsThatFit(pageGeometry({ trim: "8.5x11" })), 6);
});
