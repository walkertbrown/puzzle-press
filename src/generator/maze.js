// Maze generation. Every maze here is "perfect": a spanning tree over the
// grid, so every cell is reachable and there is exactly one route between any
// two cells. That is what makes the solution at the back of the book correct
// by construction rather than by hope.
//
// A cell stores which of its four sides are open, as a bitmask.

import { makeRng } from "./rng.js";

export const N = 1, E = 2, S = 4, W = 8;
const DX = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
const OPPOSITE = { [N]: S, [E]: W, [S]: N, [W]: E };
const DIRS = [N, E, S, W];

// Printed maze books scale difficulty by grid size more than anything else.
export const MAZE_DIFFICULTY = {
  easy: { label: "Easy", w: 15, h: 15 },
  medium: { label: "Medium", w: 21, h: 21 },
  hard: { label: "Hard", w: 29, h: 29 },
  expert: { label: "Expert", w: 39, h: 39 },
};

// Iterative randomised depth-first search. Iterative because a 39x39 maze is
// 1521 cells deep in the worst case and recursion there is asking for trouble.
export function generateMaze({ difficulty = "medium", seed = "maze", width = null, height = null } = {}) {
  const spec = MAZE_DIFFICULTY[difficulty] ?? MAZE_DIFFICULTY.medium;
  const w = width ?? spec.w;
  const h = height ?? spec.h;
  const rng = makeRng(`${seed}|maze|${difficulty}|${w}x${h}`);

  const cells = new Array(w * h).fill(0);
  const seen = new Array(w * h).fill(false);
  const at = (x, y) => y * w + x;

  const stack = [[0, 0]];
  seen[0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = [];
    for (const d of DIRS) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (seen[at(nx, ny)]) continue;
      options.push(d);
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const d = rng.pick(options);
    const nx = x + DX[d];
    const ny = y + DY[d];
    cells[at(x, y)] |= d;
    cells[at(nx, ny)] |= OPPOSITE[d];
    seen[at(nx, ny)] = true;
    stack.push([nx, ny]);
  }

  // Enter top-left, leave bottom-right — the convention, and it keeps the
  // longest route plausible without hunting for one.
  const start = at(0, 0);
  const end = at(w - 1, h - 1);
  return { w, h, cells, start, end, difficulty, seed, solution: solveMaze({ w, h, cells, start, end }) };
}

// The one route from start to end. Breadth-first, so it is also the shortest —
// in a perfect maze they are the same thing.
export function solveMaze({ w, h, cells, start, end }) {
  const prev = new Array(w * h).fill(-1);
  const queue = [start];
  prev[start] = start;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === end) break;
    const x = cur % w;
    const y = Math.floor(cur / w);
    for (const d of DIRS) {
      if (!(cells[cur] & d)) continue;
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const next = ny * w + nx;
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      queue.push(next);
    }
  }
  if (prev[end] === -1) return [];
  const path = [end];
  while (path[path.length - 1] !== start) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

// Every cell reachable, and exactly w*h-1 openings: the definition of a tree.
export function isPerfect({ w, h, cells }) {
  let openings = 0;
  for (let i = 0; i < w * h; i++) {
    for (const d of DIRS) if (cells[i] & d) openings++;
  }
  if (openings % 2 !== 0) return false;
  if (openings / 2 !== w * h - 1) return false;
  // Reachability from cell 0.
  const seen = new Array(w * h).fill(false);
  const stack = [0];
  seen[0] = true;
  let count = 1;
  while (stack.length) {
    const cur = stack.pop();
    const x = cur % w;
    const y = Math.floor(cur / w);
    for (const d of DIRS) {
      if (!(cells[cur] & d)) continue;
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const next = ny * w + nx;
      if (seen[next]) continue;
      seen[next] = true;
      count++;
      stack.push(next);
    }
  }
  return count === w * h;
}

// Wall segments to draw, merged into runs so a 39x39 maze is a few hundred
// lines instead of a few thousand. Coordinates are in cell units, origin top
// left: { x1, y1, x2, y2 }.
export function wallSegments({ w, h, cells }, { openings = null } = {}) {
  // The way in and the way out are holes in the border. They are kept out of
  // the cell graph so the maze stays a clean spanning tree; they only exist
  // when the walls get drawn.
  const open = openings ?? new Set([`v:0:0`, `v:${w}:${h - 1}`]);
  const segs = [];
  // Horizontal walls: for each boundary row, walk across merging runs.
  for (let y = 0; y <= h; y++) {
    let runStart = null;
    for (let x = 0; x <= w; x++) {
      let blocked = false;
      if (x < w) {
        const above = y > 0 ? cells[(y - 1) * w + x] : null;
        const below = y < h ? cells[y * w + x] : null;
        if (above === null) blocked = !(below & N);
        else if (below === null) blocked = !(above & S);
        else blocked = !(above & S);
      }
      if (blocked && open.has(`h:${x}:${y}`)) blocked = false;
      if (blocked && runStart === null) runStart = x;
      if (!blocked && runStart !== null) {
        segs.push({ x1: runStart, y1: y, x2: x, y2: y });
        runStart = null;
      }
    }
  }
  // Vertical walls.
  for (let x = 0; x <= w; x++) {
    let runStart = null;
    for (let y = 0; y <= h; y++) {
      let blocked = false;
      if (y < h) {
        const left = x > 0 ? cells[y * w + (x - 1)] : null;
        const right = x < w ? cells[y * w + x] : null;
        if (left === null) blocked = !(right & W);
        else if (right === null) blocked = !(left & E);
        else blocked = !(left & E);
      }
      if (blocked && open.has(`v:${x}:${y}`)) blocked = false;
      if (blocked && runStart === null) runStart = y;
      if (!blocked && runStart !== null) {
        segs.push({ x1: x, y1: runStart, x2: x, y2: y });
        runStart = null;
      }
    }
  }
  return segs;
}

// Same idea as sudoku: a graded book starts small and ends large.
export function gradeFor(index, count, difficulty) {
  if (difficulty !== "graded") return difficulty;
  const levels = Object.keys(MAZE_DIFFICULTY);
  const band = Math.min(levels.length - 1, Math.floor((index * levels.length) / Math.max(1, count)));
  return levels[band];
}

export function generateMazeBook({ count = 20, difficulty = "medium", seed = "book" } = {}) {
  const puzzles = [];
  for (let i = 0; i < count; i++) {
    const level = gradeFor(i, count, difficulty);
    const m = generateMaze({ difficulty: level, seed: `${seed}|${i}` });
    puzzles.push({ index: i + 1, title: MAZE_DIFFICULTY[level]?.label ?? "Maze", kind: "maze", ...m });
  }
  return { kind: "maze", puzzles, warnings: [] };
}
