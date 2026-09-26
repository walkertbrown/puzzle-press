// KDP's interior rules that can be read straight out of the PDF's drawing
// operators, for every book type at three trims.
//
// Paperback Submission Guidelines (kdp.amazon.com/en_US/help/topic/G201857950),
// "Interior specifications":
//   Line width — "give the lines a minimum thickness/weight of 0.75 point or
//     0.01" (0.3 mm)". Enforced here: until 2026-09-26 every book type drew
//     thinner lines, and nothing measured it.
//   Font — "Minimum font size: 7 points". Answer-grid letters, crossword
//     clue numbers and the free book's settings line all went under it until
//     2026-09-26 (to 4.4pt). Under 7pt is REPORTED; under 6.63pt FAILS. The
//     one case left between is a grid too big for its page (19×19 answers on
//     5×8), where 7pt letters would touch.
//   Grayscale fill — "we recommend a minimum grayscale fill of 10%". Checked:
//     any fill lighter than 10% grey that is not white fails.
//
// Run: node test/kdplines.mjs
import { readFileSync } from "node:fs";
import { PDFDocument, PDFRawStream, decodePDFRawStream, PDFArray } from "pdf-lib";
let failed = 0;
import { THEMES } from "../src/generator/wordlists.js";
import { generateBook } from "../src/generator/book.js";
import { generateSudokuBook } from "../src/generator/sudoku.js";
import { generateMazeBook } from "../src/generator/maze.js";
import { generateCrissCrossBook } from "../src/generator/crisscross.js";
import { generateCrosswordBook } from "../src/generator/crossword.js";
import { CLUES } from "../src/generator/clues.js";
import { renderBook } from "../src/pdf/render.js";
const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};
const C = 20;
const books = {
  wordsearch: generateBook({ pools: [THEMES.halloween], count: C, wordsPerPuzzle: 15, difficulty: "graded", seed: "a" }),
  sudoku: generateSudokuBook({ count: C, difficulty: "graded", seed: "a" }),
  sudoku6: generateSudokuBook({ count: C, difficulty: "graded", seed: "a", size: 6 }),
  maze: generateMazeBook({ count: C, difficulty: "graded", seed: "a" }),
  crisscross: generateCrissCrossBook({ pools: [THEMES.halloween], count: C, difficulty: "graded", seed: "a" }),
  crossword: generateCrosswordBook({ pools: [THEMES.garden], builtinClues: CLUES, count: C, difficulty: "graded", seed: "a" }),
};
for (const trim of (process.env.TRIMS || "5x8,6x9,8.5x11").split(",")) for (const [name, book] of Object.entries(books)) for (const lp of name === "wordsearch" || name === "sudoku" ? [false, true] : [false]) for (const licensed of [true, false]) {
  // A free book prints the settings that made it on the copyright page, small.
  const recipe = licensed ? undefined : "Word search · 20 puzzles · graded · Halloween, Garden & Nature, Ocean Life · seed a1b2c3 · puzzlepress.bananafest-destiny.com";
  const bytes = await renderBook(book, { title: "Audit", author: "A", trim, licensed, recipe, largePrint: lp, fonts });
  const pdf = await PDFDocument.load(bytes);
  const w = new Map(), tf = new Map(), grey = new Map();
  pdf.getPages().forEach((p, i) => {
    let cs = p.node.Contents(); const arr = cs instanceof PDFArray ? cs.asArray() : [cs];
    for (const ref of arr) {
      const st = pdf.context.lookup(ref);
      const s = Buffer.from(st instanceof PDFRawStream ? decodePDFRawStream(st).decode() : st.getContents()).toString("latin1");
      for (const m of s.matchAll(/([\d.]+) w\b/g)) { const v = +m[1]; w.set(v, (w.get(v) || 0) + 1); }
      for (const m of s.matchAll(/ ([\d.]+) Tf\b/g)) { const v = +m[1]; if (!tf.has(v)) tf.set(v, `p${i+1}`); }
      for (const m of s.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (rg|RG)\b/g)) { const [r,g,b]=[+m[1],+m[2],+m[3]]; const k = 1 - (0.299*r+0.587*g+0.114*b); const key=`${(k*100).toFixed(0)}%${m[4]==="rg"?"fill":"stroke"}`; if (k > 0.005 && k < 0.10) grey.set(key,(grey.get(key)||0)+1); }
    }
  });
  const thin = [...w].filter(([v]) => v < 0.75 && v > 0).map(([v, n]) => `${+v.toFixed(3)}×${n}`);
  const small = [...tf].filter(([v]) => v < 7).map(([v, p]) => `${+v.toFixed(2)}@${p}`);
  const label = `${trim} ${name}${lp ? " large print" : ""}${licensed ? "" : " free"}`;
  if (thin.length) { failed++; console.log(`FAIL ${label}: lines under 0.75pt: ${thin.join(" ")}`); }
  if (grey.size) { failed++; console.log(`FAIL ${label}: fills under 10% grey: ${[...grey].map(([k, n]) => `${k}×${n}`).join(" ")}`); }
  const tiny = [...tf].filter(([v]) => v < 6.62).map(([v, p]) => `${+v.toFixed(2)}@${p}`);
  if (tiny.length) { failed++; console.log(`FAIL ${label}: type under 6.63pt: ${tiny.join(" ")}`); }
  if (small.length) console.log(`note ${label}: type under 7pt: ${small.join(" ")}`);
}

if (failed) { console.log(`\n${failed} problem(s)`); process.exit(1); }
console.log("KDP LINES OK — every line at least 0.75pt and every grey fill at least 10%, all book types × 3 trims");
