// Clued crosswords: the same sparse themed grid as a criss-cross, with each
// answer clued instead of listed. Built-in themes carry a clue per word
// (clues.js); a pasted list can supply its own as "word — clue" lines. A word
// without a clue cannot be in a crossword, and the book says which were left
// out rather than inventing a clue.
//
// Numbering follows convention: cells are scanned row by row, and a cell gets
// the next number if a word starts there across or down (one number serves
// both). Clues are listed by number under Across and Down.

import { makeRng } from "./rng.js";
import { normalizeWord, normalizeWords } from "./wordsearch.js";
import { buildGrid, CRISSCROSS_DIFFICULTY, slotsOf } from "./crisscross.js";

export const CROSSWORD_DIFFICULTY = CRISSCROSS_DIFFICULTY;
const MAX_LAYOUTS = 40;

// "word — clue", "word: clue", "word - clue" → { word, clue }; a bare word → { word }.
export function parseClueLine(line) {
  // Separators: em/en dash, colon, or a hyphen with spaces round it — so
  // "forget-me-not — Small blue flower" keeps its hyphens.
  const m = line.match(/^\s*(.+?)\s*(?:—|–|:|\s-\s)\s*(.+?)\s*$/);
  if (m) return { word: m[1], clue: m[2] };
  return { word: line.trim() };
}

// Clue lookup for a pool: its own clues first, then the built-in list
// (passed in — clues.js is loaded only when a crossword is asked for, so the
// page does not carry 1,400 clues for everyone).
export function cluesFor(pool, builtin = {}) {
  const own = pool.clues ?? {};
  return (word) => {
    const k = normalizeWord(word).toLowerCase();
    return own[k] ?? own[word] ?? builtin[k] ?? null;
  };
}

export function numberGrid(cells) {
  const slots = slotsOf(cells);
  const starts = new Map(); // "r,c" → number
  let n = 0;
  const across = [], down = [];
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[0].length; c++) {
      const a = slots.find((s) => s.dr === 0 && s.row === r && s.col === c);
      const d = slots.find((s) => s.dr === 1 && s.row === r && s.col === c);
      if (!a && !d) continue;
      n++;
      starts.set(`${r},${c}`, n);
      const word = (s) => Array.from({ length: s.len }, (_, i) => cells[s.row + s.dr * i][s.col + s.dc * i]).join("");
      if (a) across.push({ num: n, row: r, col: c, len: a.len, answer: word(a) });
      if (d) down.push({ num: n, row: r, col: c, len: d.len, answer: word(d) });
    }
  }
  return { starts, across, down };
}

export function generateCrossword({ words, clueOf, difficulty = "medium", seed = "crossword" } = {}) {
  const usable = [...new Set(normalizeWords(words))].filter((w) => clueOf(w));
  if (usable.length < 3) return null;
  // Long-worded themes (jobs, states) may not lay at the level's grid size;
  // allow one size up before giving up, exactly as the criss-cross does.
  for (let attempt = 0; attempt < MAX_LAYOUTS * 2; attempt++) {
    const g = buildGrid({ words: usable, difficulty, seed: `${seed}|xw`, attempt, grow: attempt >= MAX_LAYOUTS ? 2 : 0 });
    if (!g) continue;
    const { starts, across, down } = numberGrid(g.cells);
    const withClues = (list) => list.map((e) => ({ ...e, clue: clueOf(e.answer) }));
    return {
      kind: "crossword",
      difficulty,
      seed,
      w: g.w,
      h: g.h,
      cells: g.cells,
      placements: g.placements,
      words: g.words,
      numbers: Object.fromEntries(starts),
      across: withClues(across),
      down: withClues(down),
      given: [],
    };
  }
  return null;
}

export function gradeFor(index, count, difficulty) {
  if (difficulty !== "graded") return difficulty;
  const levels = Object.keys(CROSSWORD_DIFFICULTY);
  const band = Math.min(levels.length - 1, Math.floor((index * levels.length) / Math.max(1, count)));
  return levels[band];
}

export function generateCrosswordBook({ pools, builtinClues = {}, count = 20, difficulty = "medium", seed = "book" } = {}) {
  const warnings = [];
  const puzzles = [];
  const rng = makeRng(`${seed}|crossword-book`);
  // Say once, up front, which pasted words have no clue.
  for (const pool of pools) {
    const clueOf = cluesFor(pool, builtinClues);
    const missing = [...new Set(normalizeWords(pool.words))].filter((w) => !clueOf(w));
    if (missing.length) {
      const shown = missing.slice(0, 6).map((w) => w.toLowerCase()).join(", ");
      warnings.push(`${pool.title}: no clue for ${shown}${missing.length > 6 ? ` and ${missing.length - 6} more` : ""} — write lines as "word — clue" to use them in crosswords.`);
    }
  }
  for (let i = 0; i < count; i++) {
    let level = gradeFor(i, count, difficulty);
    const pool = pools.length > 1 ? rng.pick(pools) : pools[0];
    const clueOf = cluesFor(pool, builtinClues);
    let puzzle = generateCrossword({ words: pool.words, clueOf, difficulty: level, seed: `${seed}|${i}` });
    const levels = Object.keys(CROSSWORD_DIFFICULTY);
    while (!puzzle && levels.indexOf(level) > 0) {
      level = levels[levels.indexOf(level) - 1];
      puzzle = generateCrossword({ words: pool.words, clueOf, difficulty: level, seed: `${seed}|${i}|${level}` });
    }
    if (!puzzle) {
      warnings.push(`Puzzle ${i + 1}: could not build a crossword from "${pool.title}" — it needs more clued words of varied lengths.`);
      continue;
    }
    const title = pools.length > 1 || difficulty === "graded"
      ? `${pool.title} · ${CROSSWORD_DIFFICULTY[level].label}`
      : pool.title;
    puzzles.push({ index: puzzles.length + 1, title, ...puzzle });
  }
  return { kind: "crossword", puzzles, warnings };
}
