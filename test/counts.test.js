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
