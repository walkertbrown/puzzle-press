// Word-search grid generator. Pure, deterministic given a seed.
//
// generatePuzzle({ words, size, difficulty, seed }) -> {
//   grid: string[][], placements: [{ word, row, col, dr, dc }],
//   words: string[],                     // the ones placed, sorted for the word bank
//   unplaced: string[],                  // valid words that did not fit this grid
//   dropped: [{ word, reason }],         // rejected before layout (too long, nested)
// }

import { makeRng } from "./rng.js";
import { BLOCKED } from "./blocklist.js";

// Direction vectors: [dr, dc]
const DIRS = {
  E: [0, 1],
  S: [1, 0],
  SE: [1, 1],
  NE: [-1, 1],
  W: [0, -1],
  N: [-1, 0],
  NW: [-1, -1],
  SW: [1, -1],
};

export const DIFFICULTY = {
  // easy: read left-to-right and top-to-bottom only
  easy: { dirs: ["E", "S"], fill: "uniform" },
  // medium: adds diagonals, still no backwards words
  medium: { dirs: ["E", "S", "SE", "NE"], fill: "uniform" },
  // hard: all eight directions, filler letters drawn from the puzzle's own words
  hard: { dirs: ["E", "S", "SE", "NE", "W", "N", "NW", "SW"], fill: "decoy" },
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeWord(w) {
  return String(w).toUpperCase().replace(/[^A-Z]/g, "");
}

export function normalizeWords(words) {
  const seen = new Set();
  const out = [];
  for (const raw of words) {
    const w = normalizeWord(raw);
    if (w.length < 2 || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

// CAT inside CATALOG (or TAC, backwards) would be found twice, so it cannot
// be in the same puzzle. Keep the longer word, report the shorter one.
export function removeNested(words) {
  const kept = [];
  const dropped = [];
  for (const w of words) {
    const rev = w.split("").reverse().join("");
    const host = words.find((o) => o !== w && (o.includes(w) || o.includes(rev)));
    if (host) dropped.push({ word: w, reason: `inside ${host}` });
    else kept.push(w);
  }
  return { kept, dropped };
}

function canPlace(grid, word, row, col, dr, dc, size) {
  const endR = row + dr * (word.length - 1);
  const endC = col + dc * (word.length - 1);
  if (endR < 0 || endR >= size || endC < 0 || endC >= size) return false;
  let overlaps = 0;
  for (let i = 0; i < word.length; i++) {
    const cell = grid[row + dr * i][col + dc * i];
    if (cell !== null) {
      if (cell !== word[i]) return false;
      overlaps++;
    }
  }
  // A word that lies entirely on top of existing letters is a substring of
  // another placement, which would make it appear twice in the solution.
  return overlaps < word.length;
}

function place(grid, word, row, col, dr, dc) {
  for (let i = 0; i < word.length; i++) grid[row + dr * i][col + dc * i] = word[i];
}

function tryLayout(words, size, dirNames, rng) {
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const placements = [];
  const unplaced = [];
  // Longest first: hardest to fit. Shuffle within the same length for variety.
  const order = rng.shuffle(words).sort((a, b) => b.length - a.length);
  for (const word of order) {
    const candidates = [];
    for (const d of dirNames) {
      const [dr, dc] = DIRS[d];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (canPlace(grid, word, r, c, dr, dc, size)) candidates.push([r, c, dr, dc]);
        }
      }
    }
    if (candidates.length === 0) {
      unplaced.push(word);
      continue;
    }
    const [r, c, dr, dc] = rng.pick(candidates);
    place(grid, word, r, c, dr, dc);
    placements.push({ word, row: r, col: c, dr, dc });
  }
  return { grid, placements, unplaced };
}

// Every occurrence of `word` in the grid, all 8 directions, as lists of [r, c].
function findOccurrences(grid, word, size) {
  const hits = [];
  for (const [dr, dc] of Object.values(DIRS)) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const endR = r + dr * (word.length - 1);
        const endC = c + dc * (word.length - 1);
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          if (grid[r + dr * i][c + dc * i] !== word[i]) {
            ok = false;
            break;
          }
        }
        if (ok) hits.push(Array.from({ length: word.length }, (_, i) => [r + dr * i, c + dc * i]));
      }
    }
  }
  return hits;
}

// Palindromes read the same both ways, so one placement is found twice.
function expectedHits(word) {
  return word === word.split("").reverse().join("") ? 2 : 1;
}

function fillGrid(grid, size, mode, words, rng) {
  const pool = mode === "decoy" ? words.join("") : ALPHABET;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === null) grid[r][c] = pool[rng.int(pool.length)];
    }
  }
}

// After filling, every puzzle word must appear exactly once, and no blocked
// string may be spelled using any filler cell. Blocked strings lying wholly
// inside the user's own words (GRASS, SHELL, CLASS) are their business.
function isClean(grid, size, placements) {
  const placed = Array.from({ length: size }, () => Array(size).fill(false));
  for (const p of placements) {
    for (let i = 0; i < p.word.length; i++) placed[p.row + p.dr * i][p.col + p.dc * i] = true;
  }
  for (const p of placements) {
    if (findOccurrences(grid, p.word, size).length !== expectedHits(p.word)) return false;
  }
  for (const b of BLOCKED) {
    for (const cells of findOccurrences(grid, b, size)) {
      if (cells.some(([r, c]) => !placed[r][c])) return false;
    }
  }
  return true;
}

export function generatePuzzle({ words, size = 15, difficulty = "medium", seed = "puzzle" }) {
  const spec = DIFFICULTY[difficulty] ?? DIFFICULTY.medium;
  const normalized = normalizeWords(words);
  const tooLong = normalized.filter((w) => w.length > size).map((w) => ({ word: w, reason: "longer than grid" }));
  const { kept: clean, dropped: nested } = removeNested(normalized.filter((w) => w.length <= size));
  const dropped = [...tooLong, ...nested];
  const rng = makeRng(`${seed}|${size}|${difficulty}`);

  // Outer loop: layouts. A layout can itself be bad — crossing words can spell
  // a puzzle word a second time (EEL out of ANEMONE and FLOUNDER) — and no
  // fill can repair that, so such layouts are thrown away. Inner loop: fills.
  const MAX_LAYOUTS = 40;
  const MAX_FILLS = 20;
  let best = null; // fallback when some words never fit
  let result = null;
  for (let attempt = 0; attempt < MAX_LAYOUTS && !result; attempt++) {
    const layout = tryLayout(clean, size, spec.dirs, rng);
    if (!best || layout.unplaced.length < best.unplaced.length) best = layout;
    if (layout.unplaced.length > 0) continue;
    const filled = fillClean(layout, size, spec.fill, rng, MAX_FILLS);
    if (filled) result = { ...layout, grid: filled };
  }
  if (!result) {
    // Could not place every word in this grid size. Return the best attempt
    // with its unplaced list so the caller can warn or enlarge the grid.
    const filled = fillClean(best, size, spec.fill, rng, MAX_FILLS * 3) ?? fillAny(best, size, spec.fill, rng);
    result = { ...best, grid: filled };
  }

  const placedWords = result.placements.map((p) => p.word);
  return {
    size,
    difficulty,
    seed,
    grid: result.grid,
    placements: result.placements,
    words: placedWords.slice().sort(),
    unplaced: result.unplaced,
    dropped,
  };
}

function fillAny(layout, size, mode, rng) {
  const g = layout.grid.map((row) => row.slice());
  fillGrid(g, size, mode, layout.placements.map((p) => p.word), rng);
  return g;
}

function fillClean(layout, size, mode, rng, tries) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const g = fillAny(layout, size, mode, rng);
    if (isClean(g, size, layout.placements)) return g;
  }
  return null;
}

// Recommended grid size for a word list at a difficulty. Rule of thumb from
// published puzzle books: cells ≈ 2.2–3× total letters, and ≥ longest word + 2.
export function suggestSize(words, difficulty = "medium") {
  const clean = normalizeWords(words);
  const letters = clean.reduce((n, w) => n + w.length, 0);
  const longest = clean.reduce((n, w) => Math.max(n, w.length), 0);
  const factor = difficulty === "easy" ? 3 : difficulty === "hard" ? 2.2 : 2.6;
  const bySize = Math.ceil(Math.sqrt(letters * factor));
  return Math.max(8, Math.min(30, Math.max(bySize, longest + 2)));
}
