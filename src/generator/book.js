// A book is N puzzles drawn from one or more word pools. Each puzzle takes a
// fresh random subset of its pool, so no two puzzles share the same word set.

import { makeRng } from "./rng.js";
import { generatePuzzle, normalizeWords, removeNested, suggestSize, DIFFICULTY } from "./wordsearch.js";

// A graded book works up from easy to hard, the way published puzzle books do.
export function gradeFor(index, count, difficulty) {
  if (difficulty !== "graded") return difficulty;
  const levels = Object.keys(DIFFICULTY);
  const band = Math.min(levels.length - 1, Math.floor((index * levels.length) / Math.max(1, count)));
  return levels[band];
}

// pools: [{ title, words: string[] }]
// Returns { puzzles: [{ index, title, ...puzzle }], warnings: string[] }
export function generateBook({
  pools,
  count = 20,
  wordsPerPuzzle = 15,
  size = null, // null -> suggested from the words chosen for each puzzle
  difficulty = "medium",
  seed = "book",
}) {
  const rng = makeRng(`${seed}|book`);
  const warnings = [];

  // DEER and REINDEER can both live in the pool; they just cannot share a
  // puzzle. Nesting is resolved per draw, below.
  const cleanPools = pools
    .map((p) => ({ title: p.title, words: normalizeWords(p.words) }))
    .filter((p) => p.words.length >= 2);

  if (cleanPools.length === 0) return { puzzles: [], warnings: ["No usable word lists."] };

  const puzzles = [];
  const seenSets = new Set();
  for (let i = 0; i < count; i++) {
    const pool = cleanPools[i % cleanPools.length];
    const take = Math.min(wordsPerPuzzle, pool.words.length);
    if (take < wordsPerPuzzle && i < cleanPools.length) {
      warnings.push(`${pool.title}: only ${pool.words.length} words, wanted ${wordsPerPuzzle} per puzzle`);
    }
    // A reader notices a repeated word list long before they notice a repeated
    // grid, so say so up front rather than quietly shipping duplicates.
    if (i < cleanPools.length) {
      const wanted = Math.ceil(count / cleanPools.length);
      const possible = distinctSetsPossible(pool.words.length, take, wanted);
      if (possible < wanted) {
        warnings.push(
          `${pool.title}: ${pool.words.length} words taken ${take} at a time makes only ` +
            `${possible} different word list${possible === 1 ? "" : "s"}, but this book needs ${wanted}. ` +
            "Some puzzles will repeat the same words — add more words, or lower words per puzzle.",
        );
      }
    }

    // Draw a subset with no nested pairs, not used before in this book.
    let chosen = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = drawSubset(rng.shuffle(pool.words), take).sort();
      const key = candidate.join(",");
      if (!seenSets.has(key) || attempt === 24) {
        seenSets.add(key);
        chosen = candidate;
        break;
      }
    }

    const level = gradeFor(i, count, difficulty);
    const gridSize = size ?? suggestSize(chosen, level);
    const puzzle = generatePuzzle({ words: chosen, size: gridSize, difficulty: level, seed: `${seed}|${i}` });
    if (puzzle.unplaced.length) {
      warnings.push(`Puzzle ${i + 1}: could not fit ${puzzle.unplaced.join(", ")}`);
    }
    // A graded book has to say which band each puzzle is in, or "graded" is
    // invisible to the person solving it. Word search pages show the theme
    // top right, so the level joins it there.
    const label = { easy: "Easy", medium: "Medium", hard: "Hard" }[level];
    const title = difficulty === "graded" ? `${pool.title} · ${label}` : pool.title;
    puzzles.push({ index: i + 1, title, ...puzzle });
  }

  return { puzzles, warnings };
}

// How many different word lists a pool can produce, i.e. C(n, k), stopped
// early once it exceeds `cap` so a big pool never overflows.
export function distinctSetsPossible(poolSize, take, cap = Number.MAX_SAFE_INTEGER) {
  const k = Math.min(take, poolSize);
  if (k <= 0 || k >= poolSize) return 1;
  let total = 1;
  for (let i = 1; i <= Math.min(k, poolSize - k); i++) {
    total = (total * (poolSize - i + 1)) / i;
    if (total > cap) return cap + 1;
  }
  return Math.round(total);
}

// Walk a shuffled pool, taking words until `take`, skipping any that nest
// with one already taken (forwards or backwards).
function drawSubset(shuffled, take) {
  const out = [];
  for (const w of shuffled) {
    if (out.length >= take) break;
    if (removeNested([...out, w]).dropped.length === 0) out.push(w);
  }
  return out;
}
