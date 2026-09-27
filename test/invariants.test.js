// The cover's spine width is derived from planPages(). The interior is built
// by renderBook(). If those two ever disagree about how long a book is, every
// cover printed from this app is the wrong size. This file pins them together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { generateBook, distinctSetsPossible } from "../src/generator/book.js";
import { THEMES } from "../src/generator/wordlists.js";
import { renderBook, planPages, solutionsThatFit, solutionsPerPageFor } from "../src/pdf/render.js";
import { pageGeometry, TRIMS, MIN_PAGES } from "../src/pdf/kdp.js";
import { coverGeometry } from "../src/pdf/cover.js";

const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};

const trims = Object.keys(TRIMS);
const counts = [1, 4, 5, 11, 20, 41, 60];

test("rendered page count always equals planPages, across trims and counts", async () => {
  for (const trim of trims) {
    for (const count of counts) {
      for (const bleed of [false, true]) {
        const perPage = solutionsPerPageFor(count, solutionsThatFit(pageGeometry({ trim, bleed })));
        const predicted = planPages(count, perPage).total;
        const book = generateBook({ pools: [THEMES.animals], count, wordsPerPuzzle: 12, seed: `inv-${trim}-${count}-${bleed}` });
        const bytes = await renderBook(book, { title: "Invariant", trim, bleed, licensed: true, fonts });
        const actual = (await PDFDocument.load(bytes)).getPageCount();
        assert.equal(actual, predicted, `${trim} bleed=${bleed} count=${count}: rendered ${actual}, planned ${predicted}`);
      }
    }
  }
});

test("every book has an even page count, and says when it is too short for KDP", () => {
  for (const trim of trims) {
    const fits = solutionsThatFit(pageGeometry({ trim }));
    for (const count of counts) {
      const plan = planPages(count, solutionsPerPageFor(count, fits));
      assert.equal(plan.total % 2, 0, `${trim} count=${count} -> ${plan.total} is odd`);
      // Either it clears KDP's minimum, or it admits that it does not.
      assert.equal(plan.belowMinimum, plan.total < MIN_PAGES, `${trim} count=${count}`);
      // The ruled pages at the back are fixed: four, or five when parity needs it.
      assert.ok(plan.notes === 4 || plan.notes === 5, `${trim} count=${count} -> ${plan.notes} notes pages`);
      // And the book is exactly its parts, with nothing invented in between.
      assert.equal(plan.total, plan.content + plan.notes, `${trim} count=${count}`);
    }
  }
});

test("cover width equals back + spine + front + two bleeds for every trim", () => {
  for (const trim of trims) {
    for (const paper of ["white", "cream", "groundwood", "premiumColor"]) {
      const g = coverGeometry({ trim, pageCount: 120, paper });
      const sum = 0.125 * 72 + g.panelW + g.spine + g.panelW + 0.125 * 72;
      assert.ok(Math.abs(g.width - sum) < 1e-9, `${trim}/${paper}`);
      assert.ok(Math.abs(g.height - (TRIMS[trim].h + 0.25) * 72) < 1e-9, `${trim}/${paper} height`);
    }
  }
});

test("a pasted list of two words that nest still produces a usable puzzle", () => {
  const book = generateBook({ pools: [{ title: "Mine", words: ["cat", "catalog"] }], count: 2, wordsPerPuzzle: 5, seed: "nest" });
  assert.equal(book.puzzles.length, 2);
  for (const p of book.puzzles) {
    assert.ok(p.words.length >= 1);
    assert.equal(p.unplaced.length, 0);
    for (const row of p.grid) for (const cell of row) assert.match(cell, /^[A-Z]$/);
  }
});

test("punctuation, accents and casing in a pasted list do not break a book", () => {
  const words = ["ice cream", "CAFÉ", "rock'n'roll", "twenty-one", "a", "", "  spaced  ", "Ünïcödé"];
  const book = generateBook({ pools: [{ title: "Messy", words }], count: 1, wordsPerPuzzle: 8, seed: "messy" });
  assert.equal(book.puzzles.length, 1);
  for (const w of book.puzzles[0].words) assert.match(w, /^[A-Z]+$/);
});

test("distinctSetsPossible counts combinations and caps cleanly", () => {
  assert.equal(distinctSetsPossible(10, 8), 45);
  assert.equal(distinctSetsPossible(8, 8), 1);
  assert.equal(distinctSetsPossible(12, 10), 66);
  assert.equal(distinctSetsPossible(52, 15, 1000), 1001); // stopped early, not overflowed
});

test("a pool too small for the book warns instead of silently repeating words", () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => "wordone" + String.fromCharCode(97 + i));
  const book = generateBook({ pools: [{ title: "Short", words: mk(8) }], count: 20, wordsPerPuzzle: 8, seed: "short" });
  const sets = new Set(book.puzzles.map((p) => p.words.join(",")));
  assert.equal(sets.size, 1, "this pool genuinely can only make one word list");
  const warned = book.warnings.some((w) => w.includes("different word list"));
  assert.ok(warned, "the book must say so rather than shipping 20 identical word lists quietly");
});

test("a pool large enough to vary does not warn", () => {
  const book = generateBook({ pools: [THEMES.birds], count: 100, wordsPerPuzzle: 15, seed: "wide" });
  assert.equal(book.warnings.filter((w) => w.includes("different word list")).length, 0);
  assert.equal(new Set(book.puzzles.map((p) => p.words.join(","))).size, 100);
});

test("the same seed and settings rebuild the identical book", () => {
  const opts = { pools: [THEMES.desserts], count: 12, wordsPerPuzzle: 14, difficulty: "hard", seed: "repeat-me" };
  const a = generateBook(opts);
  const b = generateBook(opts);
  assert.deepEqual(a.puzzles.map((p) => p.grid), b.puzzles.map((p) => p.grid));
  assert.deepEqual(a.puzzles.map((p) => p.words), b.puzzles.map((p) => p.words));
});

test("a long book renders and stays consistent with its plan", async () => {
  const perPage = solutionsPerPageFor(120, solutionsThatFit(pageGeometry({ trim: "8.5x11" })));
  const book = generateBook({ pools: [THEMES.birds, THEMES.flowers], count: 120, wordsPerPuzzle: 18, difficulty: "hard", seed: "long" });
  const bytes = await renderBook(book, { title: "Long", trim: "8.5x11", licensed: true, fonts });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), planPages(120, perPage).total);
  assert.deepEqual(book.warnings, []);
});

// Answers a page now depend on the biggest grid (layout.js, gridbound.js), so
// the book the UI predicts has to be judged by the same number the renderer is
// handed. A typed 30×30 on 5×8 and a graded criss-cross on 5×8 are the cases
// that step down; a 200-puzzle book is the one whose gutter widens.
test("predicted pages equal rendered pages when big grids step the answer pages down", async () => {
  const { gridBound, largestGrid } = await import("../src/generator/gridbound.js");
  const { generateCrissCrossBook } = await import("../src/generator/crisscross.js");
  const cases = [
    { kind: "wordsearch", trim: "5x8", size: 30, count: 11 },
    { kind: "wordsearch", trim: "6x9", size: 25, count: 60 },
    { kind: "wordsearch", trim: "8.5x11", size: 30, count: 41 },
    { kind: "wordsearch", trim: "5.5x8.5", size: null, count: 20, difficulty: "easy" },
    { kind: "crisscross", trim: "5x8", size: null, count: 20, difficulty: "graded" },
  ];
  for (const c of cases) {
    const s = { pools: [THEMES.animals], wordsPerPuzzle: 15, difficulty: "medium", seed: `big-${c.trim}`, ...c };
    const book = c.kind === "crisscross" ? generateCrissCrossBook(s) : generateBook(s);
    const maxGrid = gridBound(s);
    assert.ok(largestGrid(book.puzzles) <= maxGrid, `${c.kind} ${c.trim}: a grid of ${largestGrid(book.puzzles)} beat the bound ${maxGrid}`);
    const n = book.puzzles.length;
    const predicted = planPages(n, solutionsPerPageFor(n, solutionsThatFit(pageGeometry({ trim: c.trim }), false, maxGrid, n))).total;
    const bytes = await renderBook(book, { title: "Big", trim: c.trim, licensed: true, fonts, maxGrid });
    const actual = (await PDFDocument.load(bytes)).getPageCount();
    assert.equal(actual, predicted, `${c.kind} ${c.trim} size=${c.size}: rendered ${actual}, planned ${predicted}`);
  }
});

// The calculators promise a page count before the generator opens. The
// generator plans answer pages by gridBound() of the settings it opens with,
// so the promise must too (it read 110 pages for a 130-page 5×8 book, 09-27).
test("a calculator's page count is the page count the generator opens on", async () => {
  const { toolLink, OPENS_WITH_GRID } = await import("../src/ui/tool-link.js");
  const { gridBound } = await import("../src/generator/gridbound.js");
  assert.equal(OPENS_WITH_GRID, gridBound({ kind: "wordsearch", pools: [THEMES.animals], wordsPerPuzzle: 15, difficulty: "medium" }));
  for (const trim of Object.keys(TRIMS)) for (const bleed of [false, true]) for (const pages of [24, 40, 60, 80, 110, 111, 150, 200, 300, 828]) {
    const link = toolLink({ trim, pages, bleed: bleed ? "1" : "" });
    const fits = solutionsThatFit(pageGeometry({ trim, bleed }), false, OPENS_WITH_GRID, link.count);
    const opens = planPages(link.count, solutionsPerPageFor(link.count, fits)).total;
    assert.equal(link.pages, opens, `${trim} bleed=${bleed} ${pages}p`);
    if (link.count < 200) assert.ok(link.pages <= pages, `${trim} ${pages}p: note says ${link.pages}`);
  }
});
