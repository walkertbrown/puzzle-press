// The biggest letter grid a book can contain, known from its settings alone,
// before a single puzzle exists. The answer pages are laid out by it (see
// solutionsThatFit in src/pdf/layout.js), and the page count that sets the
// cover's spine is quoted before the book is generated — so this has to be an
// upper bound the generator can never exceed, not the size it happens to pick.
import { normalizeWords, suggestSize, DIFFICULTY } from "./wordsearch.js";
import { longestPlaceable } from "./crisscross.js";

export function gridBound({ kind = "wordsearch", pools = [], wordsPerPuzzle = 15, size = null, difficulty = "medium" } = {}) {
  if (kind === "sudoku" || kind === "maze") return 0; // no letters to shrink
  if (kind === "crisscross" || kind === "crossword") return longestPlaceable(difficulty);
  if (size) return size; // book.js uses a typed size as-is for every puzzle
  // suggestSize grows with a puzzle's total letters and its longest word, so
  // the longest `wordsPerPuzzle` words of any one list bound every draw from it.
  const levels = difficulty === "graded" ? Object.keys(DIFFICULTY) : [difficulty];
  let most = 0;
  for (const p of pools) {
    const longest = normalizeWords(p.words).sort((a, b) => b.length - a.length).slice(0, wordsPerPuzzle);
    if (longest.length) for (const l of levels) most = Math.max(most, suggestSize(longest, l));
  }
  return most;
}

// The same figure read off a finished book, for callers that hold puzzles and
// no settings (scripts, tests). Never larger than gridBound for those settings.
export function largestGrid(puzzles) {
  let most = 0;
  for (const p of puzzles) {
    if (p.kind === "sudoku" || p.kind === "maze") continue;
    most = Math.max(most, p.w || 0, p.h || 0, p.kind ? 0 : p.size || 0);
  }
  return most;
}
