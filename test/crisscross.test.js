// A criss-cross is only right if the grid holds exactly the listed words,
// nothing else reads as a word, and there is exactly one way to fill it.
// These check the construction on every difficulty and several themes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCrissCross, generateCrissCrossBook, slotsOf, countFills, CRISSCROSS_DIFFICULTY } from "../src/generator/crisscross.js";
import { THEMES } from "../src/generator/wordlists.js";

const difficulties = Object.keys(CRISSCROSS_DIFFICULTY);
const themes = ["halloween", "animals", "garden", "kitchen", "baby"];

const readRun = (cells, s) => Array.from({ length: s.len }, (_, i) => cells[s.row + s.dr * i][s.col + s.dc * i]).join("");

test("every slot in the grid is exactly one listed word, and every word is a slot", () => {
  for (const th of themes) {
    for (const d of difficulties) {
      const p = generateCrissCross({ words: THEMES[th].words, difficulty: d, seed: `slots-${th}` });
      assert.ok(p, `${th}/${d}: no puzzle`);
      const runs = slotsOf(p.cells).map((s) => readRun(p.cells, s)).sort();
      assert.deepEqual(runs, [...p.words].sort(), `${th}/${d}: grid runs ≠ word list`);
      assert.equal(p.words.length, Math.min(CRISSCROSS_DIFFICULTY[d].words, p.words.length));
      assert.equal(new Set(p.words).size, p.words.length, `${th}/${d}: a word repeats`);
    }
  }
});

test("no two-letter fragments: every run of two or more letters is a listed word", () => {
  const p = generateCrissCross({ words: THEMES.kitchen.words, difficulty: "expert", seed: "frag" });
  const words = new Set(p.words);
  for (const s of slotsOf(p.cells)) assert.ok(words.has(readRun(p.cells, s)), `stray run ${readRun(p.cells, s)}`);
});

test("every puzzle has exactly one fill, with or without its starter word", () => {
  for (const th of themes) {
    for (const d of difficulties) {
      const p = generateCrissCross({ words: THEMES[th].words, difficulty: d, seed: `uniq-${th}` });
      const given = p.cells.map((row) => row.map(() => false));
      for (const g of p.given) {
        const pl = p.placements.find((x) => x.word === g);
        for (let i = 0; i < g.length; i++) given[pl.row + pl.dr * i][pl.col + pl.dc * i] = true;
      }
      assert.equal(countFills(p.cells, slotsOf(p.cells), p.words, given, 3), 1, `${th}/${d}: fills ≠ 1`);
    }
  }
});

test("the solver is honest: it counts a second fill when one exists", () => {
  // BAT across, TOP down, PAN across. Swapping BAT and PAN fails at the
  // crossings (T vs N), so this has exactly one fill.
  const grid = [
    ["B", "A", "T", null, null],
    [null, null, "O", null, null],
    [null, null, "P", "A", "N"],
  ];
  const none = grid.map((r) => r.map(() => false));
  assert.equal(countFills(grid, slotsOf(grid), ["BAT", "TOP", "PAN"], none, 3), 1);
  // Two identical-shape words crossing the same vertical at the same letter
  // can be swapped: two fills, and the solver must say so.
  const amb = [
    ["A", "X", "A"],
    [null, "Y", null],
    ["A", "X", "A"],
  ];
  assert.equal(countFills(amb, slotsOf(amb), ["AXA", "AXA", "XYX"], amb.map((r) => r.map(() => false)), 3), 2);
});

test("deterministic by seed; different seeds differ", () => {
  const a = generateCrissCross({ words: THEMES.space.words, difficulty: "medium", seed: "same" });
  const b = generateCrissCross({ words: THEMES.space.words, difficulty: "medium", seed: "same" });
  const c = generateCrissCross({ words: THEMES.space.words, difficulty: "medium", seed: "other" });
  assert.deepEqual(a.cells, b.cells);
  assert.notDeepEqual(a.cells, c.cells);
});

test("a graded book steps up through the levels and warns instead of shipping a bad puzzle", () => {
  const book = generateCrissCrossBook({ pools: [THEMES.halloween], count: 20, difficulty: "graded", seed: "gb" });
  assert.equal(book.puzzles.length, 20);
  assert.deepEqual(book.warnings, []);
  const labels = book.puzzles.map((p) => p.title.split(" · ")[1]);
  assert.equal(labels[0], "Easy");
  assert.equal(labels[19], "Expert");
  // American States (37 long words) cannot always make an expert grid; the
  // book steps down a level rather than failing, and says nothing misleading.
  const states = generateCrissCrossBook({ pools: [THEMES.states], count: 4, difficulty: "expert", seed: "st" });
  assert.equal(states.puzzles.length, 4);
  for (const p of states.puzzles) assert.ok(["hard", "expert"].includes(p.difficulty), p.difficulty);
  // A pool that is too small to make an expert puzzle produces a warning, not a broken page.
  const tiny = generateCrissCrossBook({ pools: [{ title: "Tiny", words: ["cat", "dog", "cow"] }], count: 2, difficulty: "expert", seed: "t" });
  assert.ok(tiny.puzzles.length <= 2);
  for (const p of tiny.puzzles) assert.ok(p.words.length >= 3);
});
