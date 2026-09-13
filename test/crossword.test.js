// Crosswords: every built-in word has a clue that does not give the answer
// away; every numbered entry matches the grid; pasted words without a clue
// are reported, not invented.
import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES } from "../src/generator/wordlists.js";
import { CLUES } from "../src/generator/clues.js";
import { normalizeWord } from "../src/generator/wordsearch.js";
import { generateCrossword, generateCrosswordBook, cluesFor, parseClueLine, numberGrid, CROSSWORD_DIFFICULTY } from "../src/generator/crossword.js";

test("every built-in word has a clue, and no clue contains its answer or a whole-word piece of it", () => {
  for (const [id, t] of Object.entries(THEMES)) {
    for (const w of t.words) {
      const k = normalizeWord(w).toLowerCase();
      const c = CLUES[k];
      assert.ok(c, `${id}: no clue for ${k}`);
      assert.ok(c.length >= 3 && c.length <= 90, `${id}: odd clue length for ${k}`);
      const parts = c.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
      const leak = parts.find((x) => x.length >= 4 && (k.includes(x) || x.includes(k)));
      assert.ok(!leak, `${id}: clue for ${k} leaks "${leak}": ${c}`);
    }
  }
});

test("numbering and clue lists match the grid on every difficulty", () => {
  for (const th of ["halloween", "jobs", "birds", "cars"]) {
    for (const d of Object.keys(CROSSWORD_DIFFICULTY)) {
      const p = generateCrossword({ words: THEMES[th].words, clueOf: cluesFor(THEMES[th], CLUES), difficulty: d, seed: `n-${th}` });
      assert.ok(p, `${th}/${d}: no puzzle`);
      assert.equal(p.across.length + p.down.length, p.placements.length, `${th}/${d}: entries ≠ placements`);
      for (const e of [...p.across, ...p.down]) {
        assert.equal(p.numbers[`${e.row},${e.col}`], e.num, "number at start cell");
        assert.equal(e.answer.length, e.len);
        assert.ok(e.clue, `no clue for ${e.answer}`);
        assert.ok(p.words.includes(e.answer));
      }
      // Numbers rise row by row and never repeat across the two lists at different cells.
      const nums = [...p.across, ...p.down].map((e) => e.num);
      const cells = new Map();
      for (const e of [...p.across, ...p.down]) {
        const key = `${e.row},${e.col}`;
        assert.ok(!cells.has(key) || cells.get(key) === e.num);
        cells.set(key, e.num);
      }
      assert.equal(new Set(nums).size, cells.size);
    }
  }
});

test("pasted lists: word — clue lines parse; unclued words are reported and left out", () => {
  assert.deepEqual(parseClueLine("harbor — Sheltered place for ships"), { word: "harbor", clue: "Sheltered place for ships" });
  assert.deepEqual(parseClueLine("harbor: Sheltered place for ships"), { word: "harbor", clue: "Sheltered place for ships" });
  assert.deepEqual(parseClueLine("harbor"), { word: "harbor" });
  const pool = { title: "Mine", words: ["gadget", "widget", "gizmo", "doohickey", "thing"], clues: { gadget: "Handy device", widget: "Small mechanical part", gizmo: "Contraption", doohickey: "Whatchamacallit" } };
  const book = generateCrosswordBook({ pools: [pool], count: 1, difficulty: "easy", seed: "c" });
  assert.ok(book.warnings.some((w) => w.toLowerCase().includes("thing")), "unclued word reported");
  if (book.puzzles.length) assert.ok(!book.puzzles[0].words.includes("THING"));
});

test("a graded book steps through the levels", () => {
  const book = generateCrosswordBook({ pools: [THEMES.garden], builtinClues: CLUES, count: 20, difficulty: "graded", seed: "g" });
  assert.equal(book.puzzles.length, 20);
  assert.deepEqual(book.warnings, []);
  assert.equal(book.puzzles[0].title.split(" · ")[1], "Easy");
  assert.equal(book.puzzles[19].title.split(" · ")[1], "Expert");
});
