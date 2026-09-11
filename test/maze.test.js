// A maze book's solutions page is only right if every maze has exactly one
// route through it. That is guaranteed by construction — a spanning tree — so
// these tests check the construction, not a sample of outputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateMaze, generateMazeBook, solveMaze, isPerfect, wallSegments,
  MAZE_DIFFICULTY, N, E, S, W,
} from "../src/generator/maze.js";

const difficulties = Object.keys(MAZE_DIFFICULTY);

test("every maze is perfect: all cells reachable, no loops", () => {
  for (const d of difficulties) {
    for (let i = 0; i < 4; i++) {
      const m = generateMaze({ difficulty: d, seed: `p${i}` });
      assert.ok(isPerfect(m), `${d} #${i} is not a spanning tree`);
    }
  }
});

test("openings are always reciprocal — no one-way walls", () => {
  const m = generateMaze({ difficulty: "hard", seed: "recip" });
  const dirs = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]];
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const i = y * m.w + x;
      for (const [d, dx, dy, back] of dirs) {
        if (!(m.cells[i] & d)) continue;
        const nx = x + dx, ny = y + dy;
        assert.ok(nx >= 0 && ny >= 0 && nx < m.w && ny < m.h, `cell ${x},${y} opens off the grid`);
        assert.ok(m.cells[ny * m.w + nx] & back, `cell ${x},${y} opens to a neighbour that does not open back`);
      }
    }
  }
});

test("the solution is a real walk from entrance to exit", () => {
  for (const d of difficulties) {
    const m = generateMaze({ difficulty: d, seed: `walk-${d}` });
    assert.equal(m.solution[0], m.start);
    assert.equal(m.solution[m.solution.length - 1], m.end);
    assert.equal(new Set(m.solution).size, m.solution.length, "the route doubles back on itself");
    for (let i = 1; i < m.solution.length; i++) {
      const a = m.solution[i - 1], b = m.solution[i];
      const ax = a % m.w, ay = Math.floor(a / m.w);
      const bx = b % m.w, by = Math.floor(b / m.w);
      assert.equal(Math.abs(ax - bx) + Math.abs(ay - by), 1, "route jumps between non-adjacent cells");
      const dir = bx > ax ? E : bx < ax ? W : by > ay ? S : N;
      assert.ok(m.cells[a] & dir, "route passes through a wall");
    }
  }
});

test("harder means bigger, and a longer way through", () => {
  const len = (d) => generateMaze({ difficulty: d, seed: "len" });
  const easy = len("easy"), expert = len("expert");
  assert.ok(expert.w > easy.w);
  assert.ok(expert.solution.length > easy.solution.length);
});

test("wall runs are merged, and the border is opened twice", () => {
  const m = generateMaze({ difficulty: "medium", seed: "walls" });
  const segs = wallSegments(m);
  // Unmerged there would be one segment per wall side; merging must beat that.
  assert.ok(segs.length < m.w * m.h, `expected merged runs, got ${segs.length}`);
  const border = segs.filter((g) => g.x1 === 0 && g.x2 === 0);
  assert.ok(border.length >= 1, "left border should still be mostly walled");
  // The entrance hole means the left border is not one unbroken run.
  const fullLeft = border.some((g) => g.y1 === 0 && g.y2 === m.h);
  assert.ok(!fullLeft, "entrance was not opened");
});

test("same seed, same maze", () => {
  const a = generateMaze({ difficulty: "hard", seed: "same" });
  const b = generateMaze({ difficulty: "hard", seed: "same" });
  const c = generateMaze({ difficulty: "hard", seed: "diff" });
  assert.deepEqual(a.cells, b.cells);
  assert.notDeepEqual(a.cells, c.cells);
});

test("a 30-maze book is 30 different mazes, each solvable", () => {
  const book = generateMazeBook({ count: 30, difficulty: "medium", seed: "bk" });
  assert.equal(book.puzzles.length, 30);
  assert.equal(new Set(book.puzzles.map((p) => p.cells.join(","))).size, 30);
  for (const p of book.puzzles) {
    assert.ok(isPerfect(p), `maze ${p.index}`);
    assert.ok(solveMaze(p).length > 1, `maze ${p.index} has no route`);
  }
});
