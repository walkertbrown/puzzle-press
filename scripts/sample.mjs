// Regenerate the public sample book (linked from the landing page).
import { readFileSync, writeFileSync } from "node:fs";
import { generateBook } from "../src/generator/book.js";
import { THEMES } from "../src/generator/wordlists.js";
import { renderBook } from "../src/pdf/render.js";
const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};
const book = generateBook({ pools: [THEMES.garden, THEMES.kitchen], count: 20, wordsPerPuzzle: 16, difficulty: "medium", seed: "public-sample-1" });
const bytes = await renderBook(book, { title: "Garden & Kitchen Word Search", subtitle: "20 puzzles with solutions — sample book", author: "Puzzle Press", trim: "6x9", licensed: true, fonts });
writeFileSync(new URL("../public/samples/sample-6x9.pdf", import.meta.url), bytes);
console.log("wrote public/samples/sample-6x9.pdf", bytes.length, "bytes,", book.warnings);
