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

// Printed sudoku books quote difficulty by how much is given away. These are
// the bands the big publishers use, give or take a clue.
export const SUDOKU_DIFFICULTY = {
  easy: { label: "Easy", givens: 40 },
  medium: { label: "Medium", givens: 32 },
  hard: { label: "Hard", givens: 28 },
  expert: { label: "Expert", givens: 24 },
};

const ROW = (i) => Math.floor(i / SIZE);
const COL = (i) => i % SIZE;
const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

// Precomputed peers: every cell that shares a row, column or box.
const PEERS = (() => {
  const peers = [];
  for (let i = 0; i < CELLS; i++) {
    const set = new Set();
    for (let j = 0; j < CELLS; j++) {
      if (j === i) continue;
      if (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i)) set.add(j);
    }
    peers.push([...set]);
  }
  return peers;
})();

function candidates(grid, i) {
  const used = new Set();
  for (const p of PEERS[i]) if (grid[p]) used.add(grid[p]);
  const out = [];
  for (let v = 1; v <= SIZE; v++) if (!used.has(v)) out.push(v);
  return out;
}

// Count solutions, stopping as soon as `limit` is reached. Picking the most
// constrained cell first keeps this fast enough to run once per dig.
export function countSolutions(grid, limit = 2) {
  const work = grid.slice();
  let found = 0;

  const step = () => {
    let best = -1;
    let bestCands = null;
    for (let i = 0; i < CELLS; i++) {
      if (work[i]) continue;
      const c = candidates(work, i);
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
  const step = () => {
    let best = -1;
    let bestCands = null;
    for (let i = 0; i < CELLS; i++) {
      if (work[i]) continue;
      const c = candidates(work, i);
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
export function completeGrid(rng) {
  const grid = new Array(CELLS).fill(0);
  const fill = (i) => {
    if (i === CELLS) return true;
    for (const v of rng.shuffle(candidates(grid, i))) {
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
  if (grid.length !== CELLS || grid.some((v) => v < 1 || v > SIZE)) return false;
  for (let i = 0; i < CELLS; i++) {
    for (const p of PEERS[i]) if (grid[p] === grid[i]) return false;
  }
  return true;
}

// generateSudoku({ difficulty, seed }) -> { puzzle, solution, givens, difficulty }
export function generateSudoku({ difficulty = "medium", seed = "sudoku" } = {}) {
  const spec = SUDOKU_DIFFICULTY[difficulty] ?? SUDOKU_DIFFICULTY.medium;
  const rng = makeRng(`${seed}|sudoku|${difficulty}`);
  const solution = completeGrid(rng);
  const puzzle = solution.slice();

  // Remove in rotationally symmetric pairs, the convention in printed books.
  const order = rng.shuffle(Array.from({ length: CELLS }, (_, i) => i));
  let givens = CELLS;
  for (const i of order) {
    if (givens <= spec.givens) break;
    const mirror = CELLS - 1 - i;
    if (puzzle[i] === 0 && puzzle[mirror] === 0) continue;
    const savedI = puzzle[i];
    const savedM = puzzle[mirror];
    const removing = (savedI ? 1 : 0) + (mirror !== i && savedM ? 1 : 0);
    if (givens - removing < spec.givens) continue;
    puzzle[i] = 0;
    puzzle[mirror] = 0;
    if (countSolutions(puzzle, 2) === 1) {
      givens -= removing;
    } else {
      puzzle[i] = savedI;
      puzzle[mirror] = savedM;
    }
  }

  return { puzzle, solution, givens, difficulty, seed };
}

// A book's worth, each with its own seed so it is reproducible.
export function generateSudokuBook({ count = 20, difficulty = "medium", seed = "book" } = {}) {
  const puzzles = [];
  for (let i = 0; i < count; i++) {
    const s = generateSudoku({ difficulty, seed: `${seed}|${i}` });
    puzzles.push({ index: i + 1, title: SUDOKU_DIFFICULTY[difficulty]?.label ?? "Sudoku", kind: "sudoku", ...s });
  }
  return { kind: "sudoku", puzzles, warnings: [] };
}
