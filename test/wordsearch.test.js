import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePuzzle, normalizeWords, removeNested, suggestSize } from "../src/generator/wordsearch.js";
import { generateBook } from "../src/generator/book.js";
import { THEMES } from "../src/generator/wordlists.js";
import { BLOCKED } from "../src/generator/blocklist.js";

const DIRS8 = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];

function occurrences(grid, word) {
  const size = grid.length;
  const hits = [];
  for (const [dr, dc] of DIRS8) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          const rr = r + dr * i, cc = c + dc * i;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size || grid[rr][cc] !== word[i]) { ok = false; break; }
        }
        if (ok) hits.push(Array.from({ length: word.length }, (_, i) => [r + dr * i, c + dc * i]));
      }
    }
  }
  return hits;
}

test("normalizeWords uppercases, strips punctuation and spaces, dedupes", () => {
  assert.deepEqual(normalizeWords(["ice cream", "Ice-Cream", "a", "dog", "DOG "]), ["ICECREAM", "DOG"]);
});

test("removeNested drops words contained in others, forwards or backwards", () => {
  const { kept, dropped } = removeNested(["CATALOG", "CAT", "GOL", "DOG"]);
  assert.deepEqual(kept, ["CATALOG", "DOG"]);
  assert.deepEqual(dropped.map((d) => d.word), ["CAT", "GOL"]);
});

test("every word is placed exactly once and the grid is fully filled", () => {
  const words = THEMES.animals.words.slice(0, 15);
  const p = generatePuzzle({ words, size: 15, difficulty: "hard", seed: "t1" });
  assert.equal(p.unplaced.length, 0);
  assert.equal(p.placements.length, 15);
  for (const row of p.grid) for (const cell of row) assert.match(cell, /^[A-Z]$/);
  for (const w of p.words) {
    const isPal = w === w.split("").reverse().join("");
    assert.equal(occurrences(p.grid, w).length, isPal ? 2 : 1, `${w} should appear once`);
  }
});

test("placements match the grid letters", () => {
  const p = generatePuzzle({ words: THEMES.food.words.slice(0, 12), size: 14, seed: "t2" });
  for (const { word, row, col, dr, dc } of p.placements) {
    for (let i = 0; i < word.length; i++) assert.equal(p.grid[row + dr * i][col + dc * i], word[i]);
  }
});

test("easy difficulty only uses E and S directions", () => {
  const p = generatePuzzle({ words: THEMES.space.words.slice(0, 10), size: 14, difficulty: "easy", seed: "t3" });
  for (const { dr, dc } of p.placements) assert.ok((dr === 0 && dc === 1) || (dr === 1 && dc === 0));
});

test("deterministic for the same seed, different for another", () => {
  const a = generatePuzzle({ words: THEMES.music.words.slice(0, 10), size: 12, seed: "same" });
  const b = generatePuzzle({ words: THEMES.music.words.slice(0, 10), size: 12, seed: "same" });
  const c = generatePuzzle({ words: THEMES.music.words.slice(0, 10), size: 12, seed: "other" });
  assert.deepEqual(a.grid, b.grid);
  assert.notDeepEqual(a.grid, c.grid);
});

test("words longer than the grid are reported as dropped, not silently lost", () => {
  const p = generatePuzzle({ words: ["supercalifragilistic", "dog"], size: 8, seed: "t4" });
  assert.deepEqual(p.dropped.map((d) => d.word), ["SUPERCALIFRAGILISTIC"]);
  assert.deepEqual(p.words, ["DOG"]);
});

test("no blocked string is spelled through filler cells", () => {
  // Many puzzles, many chances for random filler to misbehave.
  for (let i = 0; i < 40; i++) {
    const theme = Object.values(THEMES)[i % Object.keys(THEMES).length];
    const p = generatePuzzle({ words: theme.words.slice(0, 12), size: 12, difficulty: i % 2 ? "hard" : "easy", seed: `blk${i}` });
    const placed = p.grid.map((row) => row.map(() => false));
    for (const { word, row, col, dr, dc } of p.placements) {
      for (let k = 0; k < word.length; k++) placed[row + dr * k][col + dc * k] = true;
    }
    for (const b of BLOCKED) {
      for (const cells of occurrences(p.grid, b)) {
        assert.ok(cells.every(([r, c]) => placed[r][c]), `blocked ${b} via filler in seed blk${i}`);
      }
    }
  }
});

test("suggestSize grows with the word list and never below longest+2", () => {
  assert.ok(suggestSize(["a".repeat(14)]) >= 16);
  assert.ok(suggestSize(THEMES.animals.words.slice(0, 10)) < suggestSize(THEMES.animals.words.slice(0, 25)));
});

test("a book of 30 puzzles from one theme has 30 distinct word sets and no failures", () => {
  const book = generateBook({ pools: [THEMES.animals], count: 30, wordsPerPuzzle: 15, seed: "bk" });
  assert.equal(book.puzzles.length, 30);
  const sets = new Set(book.puzzles.map((p) => p.words.join(",")));
  assert.equal(sets.size, 30);
  for (const p of book.puzzles) assert.equal(p.unplaced.length, 0, `puzzle ${p.index}`);
  assert.deepEqual(book.warnings, []);
});

test("every built-in theme generates a clean 20-puzzle hard book", () => {
  for (const [id, theme] of Object.entries(THEMES)) {
    const book = generateBook({ pools: [theme], count: 20, wordsPerPuzzle: 15, difficulty: "hard", seed: id });
    for (const p of book.puzzles) assert.equal(p.unplaced.length, 0, `${id} puzzle ${p.index}`);
  }
});
