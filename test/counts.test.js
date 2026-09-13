// "Ask for fifty, get fifty" — for every type, and an honest answer when it
// cannot. The first version of this product said 50 on screen and put 5 in
// the file; that is the failure this guards.
import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../src/generator/wordlists.js";
import { generateBook } from "../src/generator/book.js";
import { generateSudokuBook } from "../src/generator/sudoku.js";
import { generateMazeBook } from "../src/generator/maze.js";
import { generateCrissCrossBook } from "../src/generator/crisscross.js";
import { generateCrosswordBook } from "../src/generator/crossword.js";
import { CLUES } from "../src/generator/clues.js";
import { planPages, solutionsPerPageFor, solutionsThatFit } from "../src/pdf/layout.js";
import { pageGeometry } from "../src/pdf/kdp.js";
import { coverGeometry, spineWidthInches } from "../src/pdf/cover-geometry.js";

const make = {
  "word search": (n, pool) => generateBook({ pools: [pool], count: n, wordsPerPuzzle: 15, difficulty: "graded", seed: "c" }),
  sudoku: (n) => generateSudokuBook({ count: n, difficulty: "graded", seed: "c" }),
  "sudoku 6×6": (n) => generateSudokuBook({ count: n, difficulty: "graded", seed: "c6", size: 6 }),
  mazes: (n) => generateMazeBook({ count: n, difficulty: "graded", seed: "c" }),
  "criss-cross": (n, pool) => generateCrissCrossBook({ pools: [pool], count: n, difficulty: "graded", seed: "c" }),
  crosswords: (n, pool) => generateCrosswordBook({ pools: [pool], builtinClues: CLUES, count: n, difficulty: "graded", seed: "c" }),
};
// The thinnest built-in themes: fewest words (states, 37, all long) and a
// short-word one (space, 47).
const pools = { animals: THEMES.animals, states: THEMES.states, space: THEMES.space, kitchen: THEMES.kitchen };

test("every type delivers exactly the number of puzzles asked for, from any built-in theme", () => {
  const short = [];
  for (const [kind, f] of Object.entries(make)) {
    for (const [pname, pool] of Object.entries(pools)) {
      if (/sudoku|mazes/.test(kind) && pname !== "animals") continue;
      for (const n of [1, 14, 50]) {
        const book = f(n, pool);
        if (book.puzzles.length !== n) short.push(`${kind}/${pname}: asked ${n}, got ${book.puzzles.length}`);
        book.puzzles.forEach((p, i) => {
          if (p.index !== i + 1) short.push(`${kind}/${pname}: puzzle ${i + 1} is numbered ${p.index}`);
        });
      }
    }
  }
  assert.deepEqual(short, [], `\n${short.join("\n")}\n`);
});

test("a word list too thin to work says so once, and does not half-fill a book in silence", () => {
  const tiny = { title: "Tiny", words: ["cat", "dog", "cow", "hen", "pig", "ewe", "ram", "sow"] };
  for (const kind of ["criss-cross", "crosswords"]) {
    const book = make[kind](50, tiny);
    // Whatever it manages, it must never be a silent partial book.
    if (book.puzzles.length < 50) {
      assert.ok(book.warnings.length > 0, `${kind}: short book with no warning`);
      assert.ok(book.warnings.length <= 3, `${kind}: ${book.warnings.length} warnings — one line, not one per puzzle`);
      assert.ok(
        book.warnings.some((w) => /None of these words|could not be built/.test(w)),
        `${kind}: warning does not say what happened: ${JSON.stringify(book.warnings)}`,
      );
    }
  }
});

test("puzzles are numbered 1..n with no gaps even when some could not be built", () => {
  const thin = { title: "Thin", words: ["orange", "eagle", "ledge", "genie", "eerie", "argue", "eagre", "anger"] };
  const book = generateCrissCrossBook({ pools: [thin], count: 12, difficulty: "graded", seed: "gap" });
  assert.deepEqual(book.puzzles.map((p) => p.index), book.puzzles.map((_, i) => i + 1));
});

test("the preview is the first pages of the book you asked for, not a differently graded sample", () => {
  // A graded book spreads four bands across the count. Building three puzzles
  // to show would grade them 1-of-3 — easy, medium, hard — while the file's
  // first three are all easy. The preview must grade against the real count.
  const pool = THEMES.animals;
  const cases = [
    ["word search", (n, g) => generateBook({ pools: [pool], count: n, gradeCount: g, wordsPerPuzzle: 15, difficulty: "graded", seed: "p" }), (p) => p.grid.flat().join("")],
    ["sudoku", (n, g) => generateSudokuBook({ count: n, gradeCount: g, difficulty: "graded", seed: "p" }), (p) => p.puzzle.join(",")],
    ["mazes", (n, g) => generateMazeBook({ count: n, gradeCount: g, difficulty: "graded", seed: "p" }), (p) => `${p.w}x${p.h}:${p.cells.join(",")}`],
    ["criss-cross", (n, g) => generateCrissCrossBook({ pools: [pool], count: n, gradeCount: g, difficulty: "graded", seed: "p" }), (p) => p.cells.flat().join("")],
    ["crosswords", (n, g) => generateCrosswordBook({ pools: [pool], builtinClues: CLUES, count: n, gradeCount: g, difficulty: "graded", seed: "p" }), (p) => p.cells.flat().join("")],
  ];
  for (const [kind, make, fingerprint] of cases) {
    const preview = make(3, 50);
    const book = make(50, null);
    for (let i = 0; i < 3; i++) {
      assert.equal(preview.puzzles[i].title, book.puzzles[i].title, `${kind}: preview puzzle ${i + 1} is graded differently from the book`);
      assert.equal(fingerprint(preview.puzzles[i]), fingerprint(book.puzzles[i]), `${kind}: preview puzzle ${i + 1} is not the puzzle the book contains`);
    }
  }
});

test("a cover sized from a short book matches that book, not the count asked for", () => {
  // The tool sizes the spine from the book it actually made. This is the
  // arithmetic that must agree: a book of 38 puzzles is not a book of 50.
  const fits = solutionsThatFit(pageGeometry({ trim: "6x9" }));
  const asked = planPages(50, solutionsPerPageFor(50, fits)).total;
  const made = planPages(38, solutionsPerPageFor(38, fits)).total;
  assert.notEqual(asked, made, "the two page counts must differ or this test proves nothing");
  const spineAsked = spineWidthInches(asked, "cream");
  const spineMade = spineWidthInches(made, "cream");
  // 12 fewer pages on cream is 0.03" of spine — enough to matter on a wrap.
  assert.ok(Math.abs(spineAsked - spineMade) > 0.02, `spines differ by ${(spineAsked - spineMade).toFixed(4)}"`);
  assert.equal(coverGeometry({ trim: "6x9", pageCount: made, paper: "cream" }).pageCount, made);
});

test("the same seed and settings make the same book, for every type", () => {
  const fingerprint = (b) => JSON.stringify(b.puzzles.map((p) => [p.index, p.title, p.grid ?? p.puzzle ?? p.cells]));
  const pools = [THEMES.animals, THEMES.space];
  const each = {
    "word search": (seed) => generateBook({ pools, count: 8, wordsPerPuzzle: 15, difficulty: "graded", seed }),
    sudoku: (seed) => generateSudokuBook({ count: 5, difficulty: "graded", seed }),
    "sudoku 6×6": (seed) => generateSudokuBook({ count: 5, difficulty: "graded", seed, size: 6 }),
    mazes: (seed) => generateMazeBook({ count: 5, difficulty: "graded", seed }),
    "criss-cross": (seed) => generateCrissCrossBook({ pools, count: 5, difficulty: "graded", seed }),
    crosswords: (seed) => generateCrosswordBook({ pools, builtinClues: CLUES, count: 5, difficulty: "graded", seed }),
  };
  for (const [kind, make] of Object.entries(each)) {
    assert.equal(fingerprint(make("same-seed")), fingerprint(make("same-seed")), `${kind}: same seed gave a different book`);
    assert.notEqual(fingerprint(make("same-seed")), fingerprint(make("other-seed")), `${kind}: the seed is being ignored`);
  }
});

test("a free book carries its recipe on the page; a paid one carries it only in the file's properties", async () => {
  const { renderBook } = await import("../src/pdf/render.js");
  const { readFileSync } = await import("node:fs");
  const fonts = {
    regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
    bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
  };
  const book = generateBook({ pools: [THEMES.halloween], count: 3, wordsPerPuzzle: 15, seed: "rec" });
  const recipe = "Made with Puzzle Press · word search · seed rec";
  const { PDFDocument } = await import("pdf-lib");
  for (const licensed of [true, false]) {
    const bytes = await renderBook(book, { title: "T", trim: "6x9", licensed, fonts, recipe });
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getSubject(), recipe, `${licensed ? "paid" : "free"}: the recipe should be in the file's properties`);
  }
  // $19 removes every mark from the page — including this one.
  const paid = await renderBook(book, { title: "T", trim: "6x9", licensed: true, fonts, recipe });
  const free = await renderBook(book, { title: "T", trim: "6x9", licensed: false, fonts, recipe });
  assert.ok(free.length > paid.length, "the free book should carry more ink than the paid one");
});
