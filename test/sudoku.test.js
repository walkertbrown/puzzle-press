// A sudoku book that ships a puzzle with two answers makes its own solutions
// page wrong. These tests exist so that cannot happen quietly.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSudoku, generateSudokuBook, countSolutions, solve, completeGrid,
  isValidComplete, SUDOKU_DIFFICULTY, CELLS,
} from "../src/generator/sudoku.js";
import { makeRng } from "../src/generator/rng.js";

const difficulties = Object.keys(SUDOKU_DIFFICULTY);

test("a generated complete grid obeys every sudoku constraint", () => {
  for (let i = 0; i < 10; i++) {
    const g = completeGrid(makeRng(`cg${i}`));
    assert.equal(g.length, CELLS);
    assert.ok(isValidComplete(g), `grid ${i} is not a valid solution`);
  }
});

test("every puzzle has exactly one solution, at every difficulty", () => {
  for (const d of difficulties) {
    for (let i = 0; i < 6; i++) {
      const s = generateSudoku({ difficulty: d, seed: `u${i}` });
      assert.equal(countSolutions(s.puzzle, 3), 1, `${d} #${i} does not have a unique solution`);
    }
  }
});

test("the stated solution is the solution the solver finds", () => {
  for (const d of difficulties) {
    const s = generateSudoku({ difficulty: d, seed: `agree-${d}` });
    assert.deepEqual(solve(s.puzzle), s.solution);
    assert.ok(isValidComplete(s.solution));
  }
});

test("the puzzle is the solution with cells removed, never altered", () => {
  for (const d of difficulties) {
    const s = generateSudoku({ difficulty: d, seed: `sub-${d}` });
    for (let i = 0; i < CELLS; i++) {
      if (s.puzzle[i] !== 0) assert.equal(s.puzzle[i], s.solution[i], `cell ${i} disagrees with the solution`);
    }
  }
});

test("harder difficulties really do give away fewer clues", () => {
  const given = (d) => generateSudoku({ difficulty: d, seed: "clues" }).puzzle.filter(Boolean).length;
  const easy = given("easy"), medium = given("medium"), hard = given("hard"), expert = given("expert");
  assert.ok(easy > medium, `easy ${easy} should beat medium ${medium}`);
  assert.ok(medium > hard, `medium ${medium} should beat hard ${hard}`);
  assert.ok(hard > expert, `hard ${hard} should beat expert ${expert}`);
  for (const [d, got] of [["easy", easy], ["medium", medium], ["hard", hard], ["expert", expert]]) {
    assert.equal(got, SUDOKU_DIFFICULTY[d].givens, `${d} should hit its stated clue count`);
  }
});

test("clues are laid out with 180-degree symmetry, as printed books do", () => {
  const s = generateSudoku({ difficulty: "medium", seed: "sym" });
  for (let i = 0; i < CELLS; i++) {
    const mirror = CELLS - 1 - i;
    assert.equal(
      s.puzzle[i] === 0,
      s.puzzle[mirror] === 0,
      `cell ${i} and its mirror ${mirror} disagree about being blank`,
    );
  }
});

test("same seed, same puzzle; different seed, different puzzle", () => {
  const a = generateSudoku({ difficulty: "hard", seed: "same" });
  const b = generateSudoku({ difficulty: "hard", seed: "same" });
  const c = generateSudoku({ difficulty: "hard", seed: "other" });
  assert.deepEqual(a.puzzle, b.puzzle);
  assert.notDeepEqual(a.puzzle, c.puzzle);
});

test("a 40-puzzle book is 40 different puzzles, each uniquely solvable", () => {
  const book = generateSudokuBook({ count: 40, difficulty: "medium", seed: "bk" });
  assert.equal(book.puzzles.length, 40);
  assert.equal(new Set(book.puzzles.map((p) => p.puzzle.join(""))).size, 40);
  for (const p of book.puzzles) assert.equal(countSolutions(p.puzzle, 2), 1, `puzzle ${p.index}`);
});
