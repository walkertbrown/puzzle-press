// Regenerate the public sample book (linked from the landing page).
import { readFileSync, writeFileSync } from "node:fs";
import { generateBook } from "../src/generator/book.js";
import { THEMES } from "../src/generator/wordlists.js";
import { renderBook, planPages, solutionsThatFit } from "../src/pdf/render.js";
import { renderCover } from "../src/pdf/cover.js";
import { pageGeometry } from "../src/pdf/kdp.js";
const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};
const book = generateBook({ pools: [THEMES.garden, THEMES.kitchen], count: 20, wordsPerPuzzle: 16, difficulty: "medium", seed: "public-sample-1" });
const bytes = await renderBook(book, { title: "Garden & Kitchen Word Search", subtitle: "20 puzzles with solutions — sample book", author: "Puzzle Press", trim: "6x9", licensed: true, fonts });
writeFileSync(new URL("../public/samples/sample-6x9.pdf", import.meta.url), bytes);
console.log("wrote public/samples/sample-6x9.pdf", bytes.length, "bytes,", book.warnings);

// The matching cover, so a visitor can judge the paid half before paying.
const pages = planPages(20, solutionsThatFit(pageGeometry({ trim: "6x9" }))).total;
const cover = await renderCover({
  title: "Garden & Kitchen Word Search",
  subtitle: "20 puzzles with solutions — sample book",
  author: "Puzzle Press",
  trim: "6x9",
  paper: "cream",
  pageCount: pages,
  puzzleCount: 20,
  samplePuzzle: book.puzzles[0],
  seed: "public-sample-1",
  fonts,
});
writeFileSync(new URL("../public/samples/sample-cover-6x9.pdf", import.meta.url), cover);
console.log("wrote public/samples/sample-cover-6x9.pdf", cover.length, "bytes, sized for", pages, "pages");

// A sudoku sample, so the second puzzle type can be judged before paying too.
const { generateSudokuBook } = await import("../src/generator/sudoku.js");
const sudoku = generateSudokuBook({ count: 20, difficulty: "graded", seed: "public-sudoku-1" });
const sudokuBytes = await renderBook(sudoku, {
  title: "Sudoku for Sunday",
  subtitle: "20 puzzles, easy to expert — sample book",
  author: "Puzzle Press",
  trim: "6x9",
  licensed: true,
  fonts,
});
writeFileSync(new URL("../public/samples/sample-sudoku-6x9.pdf", import.meta.url), sudokuBytes);
console.log("wrote public/samples/sample-sudoku-6x9.pdf", sudokuBytes.length, "bytes");

const { generateMazeBook } = await import("../src/generator/maze.js");
const mazes = generateMazeBook({ count: 20, difficulty: "graded", seed: "public-maze-1" });
const mazeBytes = await renderBook(mazes, {
  title: "Mazes for Rainy Days",
  subtitle: "20 mazes, easy to expert — sample book",
  author: "Puzzle Press",
  trim: "6x9",
  licensed: true,
  fonts,
});
writeFileSync(new URL("../public/samples/sample-maze-6x9.pdf", import.meta.url), mazeBytes);
console.log("wrote public/samples/sample-maze-6x9.pdf", mazeBytes.length, "bytes");

// Covers for the sudoku and maze samples too, so each type can be judged
// whole — interior and wrap — before anyone pays.
for (const [name, book, title, subtitle, seed] of [
  ["sudoku", sudoku, "Sudoku for Sunday", "20 puzzles, easy to expert — sample book", "public-sudoku-1"],
  ["maze", mazes, "Mazes for Rainy Days", "20 mazes, easy to expert — sample book", "public-maze-1"],
]) {
  const pc = planPages(20, solutionsThatFit(pageGeometry({ trim: "6x9" }))).total;
  const c = await renderCover({ title, subtitle, author: "Puzzle Press", trim: "6x9", paper: "cream", pageCount: pc, puzzleCount: 20, samplePuzzle: book.puzzles[0], seed, fonts });
  writeFileSync(new URL(`../public/samples/sample-${name}-cover-6x9.pdf`, import.meta.url), c);
  console.log(`wrote public/samples/sample-${name}-cover-6x9.pdf`, c.length, "bytes, sized for", pc, "pages");
}
