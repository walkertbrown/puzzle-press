// Criss-cross (word fill-in) puzzles: a crossword-shaped grid with the word
// list printed instead of clues. The solver fits words by length and by the
// letters where they cross. Every puzzle here is verified to have exactly one
// way to fill it — by solving it, counting solutions with a cap of two, the
// same way the sudoku is checked. If a layout admits a second fill, the
// longest word is printed into the grid as a starter (fill-in books do this),
// and if that still is not enough the layout is thrown away.
//
// Grid convention: `cells[r][c]` is a letter or null (blank). Placements are
// { word, row, col, dr, dc } with dr/dc ∈ {0,1}.

import { makeRng } from "./rng.js";
import { normalizeWords } from "./wordsearch.js";

export const CRISSCROSS_DIFFICULTY = {
  easy: { label: "Easy", words: 8, size: 11 },
  medium: { label: "Medium", words: 12, size: 13 },
  hard: { label: "Hard", words: 16, size: 15 },
  expert: { label: "Expert", words: 22, size: 17 },
};

const MAX_LAYOUTS = 60;

// Can `word` sit at (row, col) going (dr, dc)? It must stay in bounds, only
// overlap existing letters where they match, cross at least one existing
// letter (unless the grid is empty), have blank cells before and after it,
// and never run alongside another word: every non-crossing cell must have
// blank perpendicular neighbours. That last rule is what keeps stray two-
// letter "words" out of the grid.
function fits(cells, n, word, row, col, dr, dc, first) {
  const end = { r: row + dr * (word.length - 1), c: col + dc * (word.length - 1) };
  if (row < 0 || col < 0 || end.r >= n || end.c >= n) return false;
  const before = cells[row - dr]?.[col - dc];
  const after = cells[end.r + dr]?.[end.c + dc];
  if (before || after) return false;
  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i, c = col + dc * i;
    const cur = cells[r][c];
    if (cur) {
      if (cur !== word[i]) return false;
      crossings++;
    } else {
      // Perpendicular neighbours must be blank, or we would create an
      // unintended adjacent word.
      const p1 = cells[r - dc]?.[c - dr];
      const p2 = cells[r + dc]?.[c + dr];
      if (p1 || p2) return false;
    }
  }
  return first ? crossings === 0 : crossings > 0;
}

function place(cells, word, row, col, dr, dc) {
  for (let i = 0; i < word.length; i++) cells[row + dr * i][col + dc * i] = word[i];
}

// Try to lay `want` words from `pool` into an n×n grid. Longest first, each
// new word crossing an existing one; words that do not fit are skipped and
// retried after others have gone in. Returns null if too few fit.
function layout(pool, want, n, rng) {
  const cells = Array.from({ length: n }, () => Array(n).fill(null));
  const placements = [];
  const order = rng.shuffle(pool).sort((a, b) => b.length - a.length);
  const first = order.shift();
  if (!first || first.length > n) return null;
  const r0 = Math.floor(n / 2), c0 = Math.floor((n - first.length) / 2);
  place(cells, first, r0, c0, 0, 1);
  placements.push({ word: first, row: r0, col: c0, dr: 0, dc: 1 });

  let remaining = order;
  let progress = true;
  while (placements.length < want && remaining.length && progress) {
    progress = false;
    const next = [];
    for (const word of remaining) {
      if (placements.length >= want) { next.push(word); continue; }
      const options = [];
      for (const p of placements) {
        // Perpendicular to p, crossing at any shared letter.
        const dr = p.dc, dc = p.dr;
        for (let i = 0; i < p.word.length; i++) {
          for (let j = 0; j < word.length; j++) {
            if (p.word[i] !== word[j]) continue;
            const row = p.row + p.dr * i - dr * j;
            const col = p.col + p.dc * i - dc * j;
            if (fits(cells, n, word, row, col, dr, dc, false)) options.push({ row, col, dr, dc });
          }
        }
      }
      if (options.length === 0) { next.push(word); continue; }
      const o = rng.pick(options);
      place(cells, word, o.row, o.col, o.dr, o.dc);
      placements.push({ word, ...o });
      progress = true;
    }
    remaining = next;
  }
  if (placements.length < want) return null;
  return { cells, placements };
}

// Crop the grid to the cells that were used.
function crop(cells, placements) {
  let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
  for (const p of placements) {
    const er = p.row + p.dr * (p.word.length - 1), ec = p.col + p.dc * (p.word.length - 1);
    r0 = Math.min(r0, p.row); c0 = Math.min(c0, p.col); r1 = Math.max(r1, er); c1 = Math.max(c1, ec);
  }
  const out = cells.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1));
  const moved = placements.map((p) => ({ ...p, row: p.row - r0, col: p.col - c0 }));
  return { cells: out, placements: moved, h: r1 - r0 + 1, w: c1 - c0 + 1 };
}

// Slots are the maximal runs of length ≥ 2, across then down — the things a
// solver has to fill. By construction each is exactly one placed word.
export function slotsOf(cells) {
  const h = cells.length, w = cells[0].length;
  const slots = [];
  const scan = (dr, dc) => {
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (!cells[r][c]) continue;
        const pr = r - dr, pc = c - dc;
        if (cells[pr]?.[pc]) continue; // not the start of a run
        let len = 0;
        while (cells[r + dr * len]?.[c + dc * len]) len++;
        if (len >= 2) slots.push({ row: r, col: c, dr, dc, len });
      }
    }
  };
  scan(0, 1);
  scan(1, 0);
  return slots;
}

// Count the ways to fill the slots from the word list (each word used once),
// respecting crossing letters and any letters already given. Stops at `limit`.
export function countFills(cells, slots, words, given, limit = 2) {
  const h = cells.length, w = cells[0].length;
  const grid = Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => (given[r]?.[c] ? cells[r][c] : cells[r][c] ? "" : null)));
  const used = new Array(words.length).fill(false);
  const byLen = new Map();
  words.forEach((wd, i) => { (byLen.get(wd.length) ?? byLen.set(wd.length, []).get(wd.length)).push(i); });
  let count = 0;
  const canWrite = (s, wd) => {
    for (let i = 0; i < s.len; i++) {
      const cur = grid[s.row + s.dr * i][s.col + s.dc * i];
      if (cur && cur !== wd[i]) return false;
    }
    return true;
  };
  const write = (s, wd) => {
    const undo = [];
    for (let i = 0; i < s.len; i++) {
      const r = s.row + s.dr * i, c = s.col + s.dc * i;
      if (!grid[r][c]) { grid[r][c] = wd[i]; undo.push([r, c]); }
    }
    return undo;
  };
  const rec = () => {
    if (count >= limit) return;
    // Most constrained slot first: fewest words that could still go there.
    let best = null, bestOpts = null;
    for (const s of slots) {
      if (s.done) continue;
      const opts = (byLen.get(s.len) ?? []).filter((i) => !used[i] && canWrite(s, words[i]));
      if (!best || opts.length < bestOpts.length) { best = s; bestOpts = opts; }
      if (opts.length === 0) break;
    }
    if (!best) { count++; return; }
    if (bestOpts.length === 0) return;
    for (const i of bestOpts) {
      used[i] = true; best.done = true;
      const undo = write(best, words[i]);
      rec();
      for (const [r, c] of undo) grid[r][c] = "";
      used[i] = false; best.done = false;
      if (count >= limit) return;
    }
  };
  rec();
  return count;
}

export function generateCrissCross({ words, difficulty = "medium", seed = "crisscross" } = {}) {
  const spec = CRISSCROSS_DIFFICULTY[difficulty] ?? CRISSCROSS_DIFFICULTY.medium;
  const pool = [...new Set(normalizeWords(words))].filter((w) => w.length >= 3 && w.length <= spec.size);
  const rng = makeRng(`${seed}|crisscross|${difficulty}`);
  const want = Math.min(spec.words, pool.length);
  if (want < 3) return null;

  for (let attempt = 0; attempt < MAX_LAYOUTS; attempt++) {
    // A slightly larger candidate set than we need, so skipped words have
    // replacements; a different draw each attempt.
    const candidates = rng.shuffle(pool).slice(0, Math.min(pool.length, want + 8));
    const laid = layout(candidates, want, spec.size, rng);
    if (!laid) continue;
    const { cells, placements, w, h } = crop(laid.cells, laid.placements);
    const list = placements.map((p) => p.word).sort();
    const slots = slotsOf(cells);
    if (slots.length !== placements.length) continue; // an unintended run — should not happen, but never ship it

    // Unique without help? Then with the longest word given as a starter?
    const none = cells.map((row) => row.map(() => false));
    if (countFills(cells, slots, list, none, 2) === 1) {
      return { kind: "crisscross", difficulty, seed, w, h, cells, placements, words: list, given: [] };
    }
    const longest = placements.reduce((a, b) => (b.word.length > a.word.length ? b : a));
    const givenMask = cells.map((row) => row.map(() => false));
    for (let i = 0; i < longest.word.length; i++) givenMask[longest.row + longest.dr * i][longest.col + longest.dc * i] = true;
    if (countFills(cells, slots, list, givenMask, 2) === 1) {
      return { kind: "crisscross", difficulty, seed, w, h, cells, placements, words: list, given: [longest.word] };
    }
  }
  return null;
}

export function gradeFor(index, count, difficulty) {
  if (difficulty !== "graded") return difficulty;
  const levels = Object.keys(CRISSCROSS_DIFFICULTY);
  const band = Math.min(levels.length - 1, Math.floor((index * levels.length) / Math.max(1, count)));
  return levels[band];
}

// A book: each puzzle draws its own words from the pool(s), themed like the
// word search books. Falls back a difficulty level when a pool is too small
// for the word count asked for.
export function generateCrissCrossBook({ pools, count = 20, difficulty = "medium", seed = "book" } = {}) {
  const warnings = [];
  const puzzles = [];
  const all = [...new Set(pools.flatMap((p) => normalizeWords(p.words)))];
  const rng = makeRng(`${seed}|crisscross-book`);
  for (let i = 0; i < count; i++) {
    let level = gradeFor(i, count, difficulty);
    const pool = pools.length > 1 ? rng.pick(pools) : pools[0];
    let puzzle = generateCrissCross({ words: pool.words, difficulty: level, seed: `${seed}|${i}` });
    if (!puzzle) {
      // Try the whole combined pool, then easier levels, before giving up.
      puzzle = generateCrissCross({ words: all, difficulty: level, seed: `${seed}|${i}|all` });
      const levels = Object.keys(CRISSCROSS_DIFFICULTY);
      while (!puzzle && levels.indexOf(level) > 0) {
        level = levels[levels.indexOf(level) - 1];
        puzzle = generateCrissCross({ words: pool.words, difficulty: level, seed: `${seed}|${i}|${level}` });
      }
    }
    if (!puzzle) {
      warnings.push(`Puzzle ${i + 1}: could not build a criss-cross with a unique fill from "${pool.title}" — add more words of varied lengths.`);
      continue;
    }
    // Title after any fallback, so the printed level is the real one.
    const title = pools.length > 1 || difficulty === "graded"
      ? `${pool.title} · ${CRISSCROSS_DIFFICULTY[level].label}`
      : pool.title;
    puzzles.push({ index: puzzles.length + 1, title, ...puzzle });
  }
  return { kind: "crisscross", puzzles, warnings };
}
