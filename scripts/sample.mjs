// Regenerate the public sample book (linked from the landing page).
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";
import { generateBook } from "../src/generator/book.js";
import { THEMES } from "../src/generator/wordlists.js";
import { renderBook, planPages, solutionsThatFit } from "../src/pdf/render.js";
import { renderCover } from "../src/pdf/cover.js";
import { pageGeometry } from "../src/pdf/kdp.js";
const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};

// scripts/traffic.mjs shows far more "opened a sample PDF" than "clicked
// download" every day (2026-09-16: 19 vs 1; 2026-09-19: 8 vs 0). src/pdf/
// render.js and src/pdf/cover.js have zero branding or links anywhere in
// them (checked by grep) — correct, since they also render real customers'
// paid KDP manuscripts, which must stay unbranded. But that means a sample,
// once its PDF viewer detaches from the tab the app is running in (common
// on mobile), has no way back to the site at all. This appends one promo
// page — with a full-page clickable link, since a small text link is a
// small mobile tap target — to the *sample* PDFs only, here in sample.mjs,
// never in the shared render pipeline.
//
// The same seam carries the document metadata, for the same reason. Google
// indexes PDFs and uses the file's own Title as the result headline and its
// Subject in the snippet. render.js and cover.js set Title to exactly the
// title the customer typed — correct, and not to be touched. But on a sample
// that produced a headline of "Garden & Kitchen Word Search", which tells a
// searcher nothing about what the file is, that it is free, or where it came
// from; and every Subject was null. Samples are the one asset with measured
// pull on real strangers (more addresses open one than run the app), so their
// metadata is marketing copy and belongs here.
const SITE_URL = "https://puzzlepress.bananafest-destiny.com/";

// Google cuts a result headline around 70 characters. So the searchable phrase
// leads, and the optional detail is dropped here rather than truncated
// mid-phrase by the search engine — "Large print word search" alone put the
// first draft of this at 80. Asserted in test/sample-promo.mjs.
const sampleTitle = ({ kind, theme, trim, cover }) => {
  const head = `Free ${kind.toLowerCase()} book ${cover ? "cover " : ""}sample`;
  const detail = cover ? [trim] : [theme, trim];
  const build = () => `${head} — ${[...detail, "KDP-ready PDF"].join(", ")}`;
  while (build().length > 70 && detail.length) detail.shift();
  return build();
};

const sampleSubject = ({ kind, count, trim, cover }) =>
  cover
    ? `A free ${trim} ${kind.toLowerCase()} book cover sample from Puzzle Press — one full wrap holding back cover, spine and front, with the spine width sized to the page count, as Amazon KDP requires. Make your own free at puzzlepress.bananafest-destiny.com.`
    : `A free ${trim} ${kind.toLowerCase()} book sample from Puzzle Press — ${count} puzzles with solutions, KDP gutter margins and embedded fonts, ready to upload. Make your own free at puzzlepress.bananafest-destiny.com.`;

// pdf-lib joins a keywords array with spaces, which runs the terms together
// into one nonsense phrase — so the commas are added here and the array holds
// a single string.
const sampleKeywords = ({ kind }) => [[
  `free ${kind.toLowerCase()} book`,
  `${kind.toLowerCase()} puzzle book`,
  "KDP puzzle book",
  "Kindle Direct Publishing",
  "low content book",
  "print ready PDF",
  "puzzle book generator",
  "Puzzle Press",
].join(", ")];

// Applied to every generated sample, interior and cover alike. `cover: true`
// skips the promo page, because a KDP cover is a single-page full-wrap artefact
// and appending to it would destroy the file (asserted in test/sample-promo.mjs).
async function finishSample(bytes, meta) {
  const doc = await PDFDocument.load(bytes);
  doc.setTitle(sampleTitle(meta));
  doc.setSubject(sampleSubject(meta));
  doc.setKeywords(sampleKeywords(meta));
  doc.setAuthor("Puzzle Press");
  doc.setCreator("Puzzle Press — puzzlepress.bananafest-destiny.com");
  doc.setProducer("Puzzle Press — puzzlepress.bananafest-destiny.com");
  if (meta.cover) return doc.save();

  const { width: w, height: h } = doc.getPage(0).getSize();
  const page = doc.addPage([w, h]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const cx = w / 2;
  const center = (text, font, size) => cx - font.widthOfTextAtSize(text, size) / 2;

  const headline = "Made with Puzzle Press";
  page.drawText(headline, { x: center(headline, bold, 22), y: h / 2 + 54, size: 22, font: bold, color: rgb(0.1, 0.1, 0.1) });

  const line1 = "Turn any word list into a finished KDP puzzle book, free, in your browser.";
  page.drawText(line1, { x: center(line1, regular, 12), y: h / 2 + 22, size: 12, font: regular, color: rgb(0.35, 0.35, 0.35) });

  const url = "puzzlepress.bananafest-destiny.com";
  page.drawText(url, { x: center(url, bold, 15), y: h / 2 - 4, size: 15, font: bold, color: rgb(0.11, 0.21, 0.34) });

  const line2 = "Tap anywhere on this page to go back and make your own.";
  page.drawText(line2, { x: center(line2, regular, 11), y: h / 2 - 32, size: 11, font: regular, color: rgb(0.5, 0.5, 0.5) });

  const linkAnnot = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [0, 0, w, h],
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(SITE_URL) },
  });
  page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(linkAnnot)]));

  return doc.save();
}
const book = generateBook({ pools: [THEMES.garden, THEMES.kitchen], count: 20, wordsPerPuzzle: 16, difficulty: "medium", seed: "public-sample-1" });
const bytes = await finishSample(await renderBook(book, { title: "Garden & Kitchen Word Search", subtitle: "20 puzzles with solutions — sample book", author: "Puzzle Press", trim: "6x9", licensed: true, fonts }), { kind: "Word search", theme: "Garden & Kitchen", trim: "6x9", count: 20 });
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
writeFileSync(new URL("../public/samples/sample-cover-6x9.pdf", import.meta.url), await finishSample(cover, { kind: "Word search", theme: "Garden & Kitchen", trim: "6x9", count: 20, cover: true }));
console.log("wrote public/samples/sample-cover-6x9.pdf", cover.length, "bytes, sized for", pages, "pages");

// A sudoku sample, so the second puzzle type can be judged before paying too.
const { generateSudokuBook } = await import("../src/generator/sudoku.js");
const sudoku = generateSudokuBook({ count: 20, difficulty: "graded", seed: "public-sudoku-1" });
const sudokuBytes = await finishSample(await renderBook(sudoku, {
  title: "Sudoku for Sunday",
  subtitle: "20 puzzles, easy to expert — sample book",
  author: "Puzzle Press",
  trim: "6x9",
  licensed: true,
  fonts,
}), { kind: "Sudoku", theme: "easy to expert", trim: "6x9", count: 20 });
writeFileSync(new URL("../public/samples/sample-sudoku-6x9.pdf", import.meta.url), sudokuBytes);
console.log("wrote public/samples/sample-sudoku-6x9.pdf", sudokuBytes.length, "bytes");

const { generateMazeBook } = await import("../src/generator/maze.js");
const mazes = generateMazeBook({ count: 20, difficulty: "graded", seed: "public-maze-1" });
const mazeBytes = await finishSample(await renderBook(mazes, {
  title: "Mazes for Rainy Days",
  subtitle: "20 mazes, easy to expert — sample book",
  author: "Puzzle Press",
  trim: "6x9",
  licensed: true,
  fonts,
}), { kind: "Maze", theme: "easy to expert", trim: "6x9", count: 20 });
writeFileSync(new URL("../public/samples/sample-maze-6x9.pdf", import.meta.url), mazeBytes);
console.log("wrote public/samples/sample-maze-6x9.pdf", mazeBytes.length, "bytes");

// Covers for the sudoku and maze samples too, so each type can be judged
// whole — interior and wrap — before anyone pays.
for (const [name, book, title, subtitle, seed, kind] of [
  ["sudoku", sudoku, "Sudoku for Sunday", "20 puzzles, easy to expert — sample book", "public-sudoku-1", "Sudoku"],
  ["maze", mazes, "Mazes for Rainy Days", "20 mazes, easy to expert — sample book", "public-maze-1", "Maze"],
]) {
  const pc = planPages(20, solutionsThatFit(pageGeometry({ trim: "6x9" }))).total;
  const c = await finishSample(await renderCover({ title, subtitle, author: "Puzzle Press", trim: "6x9", paper: "cream", pageCount: pc, puzzleCount: 20, samplePuzzle: book.puzzles[0], seed, fonts }), { kind, theme: "easy to expert", trim: "6x9", count: 20, cover: true });
  writeFileSync(new URL(`../public/samples/sample-${name}-cover-6x9.pdf`, import.meta.url), c);
  console.log(`wrote public/samples/sample-${name}-cover-6x9.pdf`, c.length, "bytes, sized for", pc, "pages");
}

// Large print sample and its cover — the exact preset `el.largePrint` sets:
// 8.5x11, automatic grid size, 14 words per puzzle.
{
  const lp = generateBook({ pools: [THEMES.garden, THEMES.birds], count: 20, wordsPerPuzzle: 14, difficulty: "easy", trim: "8.5x11", seed: "public-large-print-1" });
  const lpBytes = await finishSample(await renderBook(lp, { title: "Large Print Garden Word Search", subtitle: "20 puzzles with solutions — sample book", author: "Puzzle Press", trim: "8.5x11", licensed: true, fonts }), { kind: "Large print word search", theme: "Garden & Birds", trim: "8.5x11", count: 20 });
  writeFileSync(new URL("../public/samples/sample-large-print-8.5x11.pdf", import.meta.url), lpBytes);
  console.log("wrote public/samples/sample-large-print-8.5x11.pdf", lpBytes.length, "bytes", lp.warnings);
  const pc = planPages(20, solutionsThatFit(pageGeometry({ trim: "8.5x11" }))).total;
  const c = await finishSample(await renderCover({
    title: "Large Print Garden Word Search", subtitle: "20 puzzles with solutions — sample book", author: "Puzzle Press",
    trim: "8.5x11", paper: "cream", pageCount: pc, puzzleCount: 20, samplePuzzle: lp.puzzles[0], seed: "public-large-print-1", largePrint: true, fonts,
  }), { kind: "Large print word search", theme: "Garden & Birds", trim: "8.5x11", count: 20, cover: true });
  writeFileSync(new URL("../public/samples/sample-large-print-cover-8.5x11.pdf", import.meta.url), c);
  console.log("wrote public/samples/sample-large-print-cover-8.5x11.pdf", c.length, "bytes, sized for", pc, "pages");
}

// Criss-cross sample and its cover.
const { generateCrissCrossBook } = await import("../src/generator/crisscross.js");
const cc = generateCrissCrossBook({ pools: [THEMES.halloween], count: 20, difficulty: "graded", seed: "public-crisscross-1" });
const ccBytes = await finishSample(await renderBook(cc, { title: "Halloween Fill-In Puzzles", subtitle: "20 criss-cross puzzles, easy to expert — sample book", author: "Puzzle Press", trim: "6x9", licensed: true, fonts }), { kind: "Criss-cross", theme: "Halloween", trim: "6x9", count: 20 });
writeFileSync(new URL("../public/samples/sample-crisscross-6x9.pdf", import.meta.url), ccBytes);
console.log("wrote public/samples/sample-crisscross-6x9.pdf", ccBytes.length, "bytes", cc.warnings);
{
  const pc = planPages(20, solutionsThatFit(pageGeometry({ trim: "6x9" }))).total;
  const c = await finishSample(await renderCover({ title: "Halloween Fill-In Puzzles", subtitle: "20 criss-cross puzzles, easy to expert — sample book", author: "Puzzle Press", trim: "6x9", paper: "cream", pageCount: pc, puzzleCount: 20, samplePuzzle: cc.puzzles[0], seed: "public-crisscross-1", fonts }), { kind: "Criss-cross", theme: "Halloween", trim: "6x9", count: 20, cover: true });
  writeFileSync(new URL("../public/samples/sample-crisscross-cover-6x9.pdf", import.meta.url), c);
  console.log("wrote public/samples/sample-crisscross-cover-6x9.pdf", c.length, "bytes");
}

// Crossword sample and its cover.
const { generateCrosswordBook } = await import("../src/generator/crossword.js");
const { CLUES } = await import("../src/generator/clues.js");
const xw = generateCrosswordBook({ pools: [THEMES.garden], builtinClues: CLUES, count: 20, difficulty: "graded", seed: "public-crossword-1" });
const xwBytes = await finishSample(await renderBook(xw, { title: "Garden Crosswords", subtitle: "20 themed crosswords, easy to expert — sample book", author: "Puzzle Press", trim: "6x9", licensed: true, fonts }), { kind: "Crossword", theme: "Garden", trim: "6x9", count: 20 });
writeFileSync(new URL("../public/samples/sample-crossword-6x9.pdf", import.meta.url), xwBytes);
console.log("wrote public/samples/sample-crossword-6x9.pdf", xwBytes.length, "bytes", xw.warnings);
{
  const pc = planPages(20, solutionsThatFit(pageGeometry({ trim: "6x9" }))).total;
  const c = await finishSample(await renderCover({ title: "Garden Crosswords", subtitle: "20 themed crosswords, easy to expert — sample book", author: "Puzzle Press", trim: "6x9", paper: "cream", pageCount: pc, puzzleCount: 20, samplePuzzle: xw.puzzles[0], seed: "public-crossword-1", fonts }), { kind: "Crossword", theme: "Garden", trim: "6x9", count: 20, cover: true });
  writeFileSync(new URL("../public/samples/sample-crossword-cover-6x9.pdf", import.meta.url), c);
  console.log("wrote public/samples/sample-crossword-cover-6x9.pdf", c.length, "bytes");
}
