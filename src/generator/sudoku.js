// Sudoku generation with a guaranteed-unique solution.
//
// A sudoku book that ships a puzzle with two answers is worse than useless —
// the solver at the back is then wrong, and a reviewer will say so. So every
// puzzle here is dug out one symmetric pair at a time, and a removal is only
// kept if the grid still has exactly one solution.
//
// Grids are flat arrays of 81 numbers, 0 meaning empty, row-major.

import { makeRng } from "./rng.js";

export const SIZE = 9;
export const CELLS = 81;

// Grid sizes. 9×9 is the book-standard; 6×6 (2×3 boxes) and 4×4 (2×2) are
// what "sudoku for kids" books are made of.
export const SUDOKU_SIZES = {
  9: { size: 9, boxR: 3, boxC: 3, label: "9 × 9 — standard" },
  6: { size: 6, boxR: 2, boxC: 3, label: "6 × 6 — for kids" },
  4: { size: 4, boxR: 2, boxC: 2, label: "4 × 4 — for young children" },
};

// Printed sudoku books quote difficulty by how much is given away. These are
// the bands the big publishers use, give or take a clue. Smaller grids carry
// proportionally fewer — and even counts only: on a 4×4 or 6×6 there is no
// centre cell, so symmetric digging removes clues two at a time.
export const SUDOKU_DIFFICULTY = {
  easy: { label: "Easy", givens: 40, givens6: 20, givens4: 10 },
  medium: { label: "Medium", givens: 32, givens6: 16, givens4: 8 },
  hard: { label: "Hard", givens: 28, givens6: 12, givens4: 6 },
  // 26 is where 180-degree symmetry stops being cheap: 28 clues costs ~14ms a
  // puzzle, 26 costs ~264ms, 24 over a second. 26 is what published "expert"
  // puzzles carry, so it is the honest floor rather than an arbitrary one.
  expert: { label: "Expert", givens: 26, givens6: 10, givens4: 4 },
};
export function givensFor(spec, size) {
  return size === 6 ? spec.givens6 : size === 4 ? spec.givens4 : spec.givens;
}

// Geometry per size, with peers precomputed: every cell that shares a row,
// column or box.
const GEOM = {};
export function geometry(size = 9) {
  if (GEOM[size]) return GEOM[size];
  const v = SUDOKU_SIZES[size] ?? SUDOKU_SIZES[9];
  const n = v.size, cells = n * n;
  const ROW = (i) => Math.floor(i / n);
  const COL = (i) => i % n;
  const BOX = (i) => Math.floor(ROW(i) / v.boxR) * (n / v.boxC) + Math.floor(COL(i) / v.boxC);
  const peers = [];
  for (let i = 0; i < cells; i++) {
    const set = new Set();
    for (let j = 0; j < cells; j++) {
      if (j === i) continue;
      if (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i)) set.add(j);
    }
    peers.push([...set]);
  }
  return (GEOM[size] = { size: n, cells, boxR: v.boxR, boxC: v.boxC, peers });
}
const sizeOf = (grid) => Math.round(Math.sqrt(grid.length));

function candidates(grid, i, g = geometry(sizeOf(grid))) {
  const used = new Set();
  for (const p of g.peers[i]) if (grid[p]) used.add(grid[p]);
  const out = [];
  for (let v = 1; v <= g.size; v++) if (!used.has(v)) out.push(v);
  return out;
}

// Count solutions, stopping as soon as `limit` is reached. Picking the most
// constrained cell first keeps this fast enough to run once per dig.
export function countSolutions(grid, limit = 2) {
  const work = grid.slice();
  const g = geometry(sizeOf(grid));
  let found = 0;

  const step = () => {
    let best = -1;
    let bestCands = null;
    for (let i = 0; i < g.cells; i++) {
      if (work[i]) continue;
      const c = candidates(work, i, g);
      if (c.length === 0) return false; // dead end
      if (!bestCands || c.length < bestCands.length) {
        best = i;
        bestCands = c;
        if (c.length === 1) break;
      }
    }
    if (best === -1) {
      found++;
      return found >= limit;
    }
    for (const v of bestCands) {
      work[best] = v;
      if (step()) {
        work[best] = 0;
        return true;
      }
      work[best] = 0;
    }
    return false;
  };

  step();
  return found;
}

export function solve(grid) {
  const work = grid.slice();
  const g = geometry(sizeOf(grid));
  const step = () => {
    let best = -1;
    let bestCands = null;
    for (let i = 0; i < g.cells; i++) {
      if (work[i]) continue;
      const c = candidates(work, i, g);
      if (c.length === 0) return false;
      if (!bestCands || c.length < bestCands.length) {
        best = i;
        bestCands = c;
        if (c.length === 1) break;
      }
    }
    if (best === -1) return true;
    for (const v of bestCands) {
      work[best] = v;
      if (step()) return true;
      work[best] = 0;
    }
    return false;
  };
  return step() ? work : null;
}

// A complete, valid grid, built by randomised backtracking.
export function completeGrid(rng, size = 9) {
  const g = geometry(size);
  const grid = new Array(g.cells).fill(0);
  const fill = (i) => {
    if (i === g.cells) return true;
    for (const v of rng.shuffle(candidates(grid, i, g))) {
      grid[i] = v;
      if (fill(i + 1)) return true;
      grid[i] = 0;
    }
    grid[i] = 0;
    return false;
  };
  fill(0);
  return grid;
}

export function isValidComplete(grid) {
  const g = geometry(sizeOf(grid));
  if (grid.length !== g.cells || grid.some((v) => v < 1 || v > g.size)) return false;
  for (let i = 0; i < g.cells; i++) {
    for (const p of g.peers[i]) if (grid[p] === grid[i]) return false;
  }
  return true;
}

// generateSudoku({ difficulty, seed }) -> { puzzle, solution, givens, difficulty }
// One symmetric dig over one complete grid. Some grids simply will not dig as
// deep as others, so this reports what it managed rather than pretending.
function dig(solution, target, rng) {
  const puzzle = solution.slice();
  const cells = solution.length;
  let givens = cells;
  // Several passes: a pair that could not be removed early often can be once
  // its neighbours are gone.
  for (let pass = 0; pass < 3 && givens > target; pass++) {
    for (const i of rng.shuffle(Array.from({ length: cells }, (_, k) => k))) {
      if (givens <= target) break;
      const mirror = cells - 1 - i;
      const savedI = puzzle[i];
      const savedM = puzzle[mirror];
      if (!savedI && !savedM) continue;
      const removing = (savedI ? 1 : 0) + (mirror !== i && savedM ? 1 : 0);
      if (givens - removing < target) continue; // would overshoot the band
      puzzle[i] = 0;
      puzzle[mirror] = 0;
      if (countSolutions(puzzle, 2) === 1) {
        givens -= removing;
      } else {
        puzzle[i] = savedI;
        puzzle[mirror] = savedM;
      }
    }
  }
  return { puzzle, givens };
}

export function generateSudoku({ difficulty = "medium", seed = "sudoku", size = 9 } = {}) {
  const spec = SUDOKU_DIFFICULTY[difficulty] ?? SUDOKU_DIFFICULTY.medium;
  const n = SUDOKU_SIZES[size] ? Number(size) : 9;
  const target = givensFor(spec, n);
  // The 9×9 seed string is unchanged, so every existing book regenerates identically.
  const rng = makeRng(n === 9 ? `${seed}|sudoku|${difficulty}` : `${seed}|sudoku${n}|${difficulty}`);

  // Try whole grids until one digs down to the band. Expert sits close to what
  // 180-degree symmetry allows at all, so this matters most there.
  let best = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const solution = completeGrid(rng, n);
    const { puzzle, givens } = dig(solution, target, rng);
    if (!best || givens < best.givens) best = { puzzle, solution, givens };
    if (givens <= target) break;
  }

  return { puzzle: best.puzzle, solution: best.solution, givens: best.givens, difficulty, seed, size: n };
}

// Published sudoku books are graded: easy at the front, hardest at the back.
// "graded" spreads the book evenly across the four levels in order.
export function gradeFor(index, count, difficulty) {
  if (difficulty !== "graded") return difficulty;
  const levels = Object.keys(SUDOKU_DIFFICULTY);
  const band = Math.min(levels.length - 1, Math.floor((index * levels.length) / Math.max(1, count)));
  return levels[band];
}

// "Easy" on a 9×9; "6 × 6 · Easy" on the smaller grids, so the page says so.
function titleFor(level, size) {
  const label = SUDOKU_DIFFICULTY[level]?.label ?? "Sudoku";
  return size === 9 ? label : `${size} × ${size} · ${label}`;
}

// A book's worth, each with its own seed so it is reproducible.
export function generateSudokuBook({ count = 20, difficulty = "medium", seed = "book", size = 9 } = {}) {
  const puzzles = [];
  for (let i = 0; i < count; i++) {
    const level = gradeFor(i, count, difficulty);
    const s = generateSudoku({ difficulty: level, seed: `${seed}|${i}`, size });
    puzzles.push({ index: i + 1, title: titleFor(level, s.size), kind: "sudoku", ...s });
  }
  return { kind: "sudoku", puzzles, warnings: [] };
}

// The same, but yielding to the event loop between puzzles so a browser tab
// stays alive and can report progress. An expert book is real work — around a
// quarter of a second per puzzle — and a frozen tab reads as a crash.
export async function generateSudokuBookAsync(
  { count = 20, difficulty = "medium", seed = "book", size = 9 } = {},
  onProgress = null,
) {
  const puzzles = [];
  for (let i = 0; i < count; i++) {
    const level = gradeFor(i, count, difficulty);
    const s = generateSudoku({ difficulty: level, seed: `${seed}|${i}`, size });
    puzzles.push({ index: i + 1, title: titleFor(level, s.size), kind: "sudoku", ...s });
    if (onProgress) onProgress(i + 1, count);
    await new Promise((r) => setTimeout(r, 0));
  }
  return { kind: "sudoku", puzzles, warnings: [] };
}
