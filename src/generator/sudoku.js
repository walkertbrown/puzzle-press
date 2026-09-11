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
  // 26 is where 180-degree symmetry stops being cheap: 28 clues costs ~14ms a
  // puzzle, 26 costs ~264ms, 24 over a second. 26 is what published "expert"
  // puzzles carry, so it is the honest floor rather than an arbitrary one.
  expert: { label: "Expert", givens: 26 },
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
// One symmetric dig over one complete grid. Some grids simply will not dig as
// deep as others, so this reports what it managed rather than pretending.
function dig(solution, target, rng) {
  const puzzle = solution.slice();
  let givens = CELLS;
  // Several passes: a pair that could not be removed early often can be once
  // its neighbours are gone.
  for (let pass = 0; pass < 3 && givens > target; pass++) {
    for (const i of rng.shuffle(Array.from({ length: CELLS }, (_, k) => k))) {
      if (givens <= target) break;
      const mirror = CELLS - 1 - i;
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

export function generateSudoku({ difficulty = "medium", seed = "sudoku" } = {}) {
  const spec = SUDOKU_DIFFICULTY[difficulty] ?? SUDOKU_DIFFICULTY.medium;
  const rng = makeRng(`${seed}|sudoku|${difficulty}`);

  // Try whole grids until one digs down to the band. Expert sits close to what
  // 180-degree symmetry allows at all, so this matters most there.
  let best = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const solution = completeGrid(rng);
    const { puzzle, givens } = dig(solution, spec.givens, rng);
    if (!best || givens < best.givens) best = { puzzle, solution, givens };
    if (givens <= spec.givens) break;
  }

  return { puzzle: best.puzzle, solution: best.solution, givens: best.givens, difficulty, seed };
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

// The same, but yielding to the event loop between puzzles so a browser tab
// stays alive and can report progress. An expert book is real work — around a
// quarter of a second per puzzle — and a frozen tab reads as a crash.
export async function generateSudokuBookAsync(
  { count = 20, difficulty = "medium", seed = "book" } = {},
  onProgress = null,
) {
  const puzzles = [];
  for (let i = 0; i < count; i++) {
    const s = generateSudoku({ difficulty, seed: `${seed}|${i}` });
    puzzles.push({ index: i + 1, title: SUDOKU_DIFFICULTY[difficulty]?.label ?? "Sudoku", kind: "sudoku", ...s });
    if (onProgress) onProgress(i + 1, count);
    await new Promise((r) => setTimeout(r, 0));
  }
  return { kind: "sudoku", puzzles, warnings: [] };
}
