// Pinterest pins, 1000x1500, one per board, every one rendered from a real
// book the tool made. Written to public/pins/ so Buffer can fetch them by URL.
//
// Usage: node scripts/pins.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { generateBook } from "../src/generator/book.js";
import { generateSudokuBook } from "../src/generator/sudoku.js";
import { generateMazeBook } from "../src/generator/maze.js";
import { generateCrissCrossBook } from "../src/generator/crisscross.js";
import { generateCrosswordBook } from "../src/generator/crossword.js";
import { CLUES } from "../src/generator/clues.js";
import { THEMES } from "../src/generator/wordlists.js";
import { renderBook } from "../src/pdf/render.js";
import { renderCover } from "../src/pdf/cover.js";

const out = new URL("../public/pins/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "pp-pins-"));
const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};

// Real books, real covers.
const ws = generateBook({ pools: [THEMES.halloween], count: 50, wordsPerPuzzle: 15, difficulty: "graded", seed: "pin-ws" });
const su = generateSudokuBook({ count: 50, difficulty: "graded", seed: "pin-su" });
const mz = generateMazeBook({ count: 50, difficulty: "graded", seed: "pin-mz" });
const cc = generateCrissCrossBook({ pools: [THEMES.halloween], count: 50, difficulty: "graded", seed: "pin-cc" });
const xw = generateCrosswordBook({ pools: [THEMES.garden], builtinClues: CLUES, count: 50, difficulty: "graded", seed: "pin-xw" });

const pdf = async (name, book, title, subtitle) => {
  const f = join(tmp, `${name}.pdf`);
  writeFileSync(f, await renderBook(book, { title, subtitle, author: "", trim: "6x9", licensed: true, fonts }));
  return f;
};
const cover = async (name, book, title, subtitle) => {
  const f = join(tmp, `${name}-cover.pdf`);
  writeFileSync(f, await renderCover({ title, subtitle, author: "", trim: "6x9", paper: "cream", pageCount: 66, puzzleCount: 50, samplePuzzle: book.puzzles[0], licensed: true, fonts }));
  return f;
};

// Pins 08–10 are the money angles, and they need pictures nobody has seen in
// pins 01–07. Fresh themes, and one book rendered the way the large-print
// checkbox renders it: 8.5×11 trim, fourteen words a page, grid size left
// automatic (see LARGE_PRINT in src/ui/main.js — pinning the size to 15 is the
// bug that preset was written to avoid).
const tg = generateBook({ pools: [THEMES.thanksgiving], count: 50, wordsPerPuzzle: 15, difficulty: "graded", seed: "pin-tg" });
const lp = generateBook({ pools: [THEMES.birds], count: 50, wordsPerPuzzle: 14, difficulty: "graded", seed: "pin-lp" });
const xm = generateSudokuBook({ count: 50, difficulty: "graded", seed: "pin-xm" });

const wsPdf = await pdf("ws", ws, "Halloween Word Search", "50 spooky puzzles, easy to hard");
const suPdf = await pdf("su", su, "Sudoku for Sunday", "50 puzzles, easy to expert");
const mzPdf = await pdf("mz", mz, "Mazes for Rainy Days", "50 mazes, easy to expert");
const ccPdf = await pdf("cc", cc, "Halloween Fill-In Puzzles", "50 criss-cross puzzles, easy to expert");
const xwPdf = await pdf("xw", xw, "Garden Crosswords", "50 themed crosswords, easy to expert");
const tgPdf = await pdf("tg", tg, "Thanksgiving Word Search", "50 puzzles, easy to hard");
const xmPdf = await pdf("xm", xm, "Sudoku by the Fire", "50 puzzles, easy to expert");
const lpPdf = join(tmp, "lp.pdf");
writeFileSync(lpPdf, await renderBook(lp, { title: "Large Print Birds", subtitle: "50 word searches in large print", author: "", trim: "8.5x11", licensed: true, fonts }));

const wsCover = await cover("ws", ws, "Halloween Word Search", "50 spooky puzzles, easy to hard");
const suCover = await cover("su", su, "Sudoku for Sunday", "50 puzzles, easy to expert");

const png = (file, page, dpi = 150) => {
  const prefix = join(tmp, `p${Math.random().toString(36).slice(2, 7)}`);
  execFileSync("pdftoppm", ["-r", String(dpi), "-f", String(page), "-l", String(page), "-png", file, prefix]);
  const pad = String(page).padStart(2, "0");
  for (const f of [`${prefix}-${pad}.png`, `${prefix}-${page}.png`]) {
    try { return `data:image/png;base64,${readFileSync(f).toString("base64")}`; } catch {}
  }
  throw new Error("no page image");
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 1 });

const css = `
  *{box-sizing:border-box} body{margin:0;width:1000px;height:1500px;overflow:hidden;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557;
    background:linear-gradient(160deg,#eef1f6,#e2e7f0);display:flex;flex-direction:column;align-items:center}
  .top{padding:54px 60px 0;text-align:center}
  .kicker{font-size:22px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#5c6a82;margin-bottom:12px}
  h1{font-size:60px;line-height:1.08;letter-spacing:-.02em;margin:0 0 16px}
  p{font-size:26px;line-height:1.4;color:#4a5a74;margin:0}
  .shot{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;width:100%;padding:34px 60px}
  .shot img{max-height:100%;max-width:100%;border-radius:6px;box-shadow:0 24px 60px rgba(20,30,50,.24);background:#fff}
  /* A full cover wrap is landscape; in a tall pin show only the front panel. */
  .front{height:100%;aspect-ratio:2/3;max-width:100%;overflow:hidden;border-radius:6px;box-shadow:0 24px 60px rgba(20,30,50,.24);background:#fff}
  .front img{height:100%;width:auto;max-width:none;position:relative;left:-100%;box-shadow:none;border-radius:0}
  .foot{padding:0 60px 46px;text-align:center;font-size:24px;font-weight:600;color:#1d3557}
  .foot span{background:#1d3557;color:#fff;padding:12px 22px;border-radius:10px}
`;
const pin = async (file, { kicker, title, body, img, foot, front = false }) => {
  // The front panel is the right-hand 6" of a 12.4" wrap; scale the image to
  // the frame's height and slide it left so the right panel is what shows.
  const shot = front
    ? `<div class="front"><img src="${img}" style="left:auto;right:0;position:absolute"></div>`
    : `<img src="${img}">`;
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css} .front{position:relative}</style>
    <div class="top"><div class="kicker">${kicker}</div><h1>${title}</h1><p>${body}</p></div>
    <div class="shot">${shot}</div>
    <div class="foot"><span>${foot}</span></div>`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, file) });
  console.log("wrote", file);
};

// 1. The product itself → board "Puzzle Press — KDP puzzle books"
await pin("01-puzzle-press.png", {
  kicker: "Puzzle Press",
  title: "A finished KDP puzzle book in about a minute",
  body: "Word search, sudoku or mazes — interior and cover, laid out to Amazon KDP's rules. Free to use.",
  img: png(wsCover, 1, 130),
  foot: "puzzlepress.bananafest-destiny.com",
  front: true,
});

// 2. Spine → board "KDP cover & spine tips"
await pin("02-spine.png", {
  kicker: "KDP cover tip",
  title: "Spine width = pages × paper thickness. Nothing added.",
  body: "Several top calculators add 0.06\". Amazon's own docs don't — that's a hardcover rule, and it gets paperback covers rejected.",
  img: png(suCover, 1, 130),
  foot: "Free spine calculator →",
});

// 3. Word search → board "Word search book ideas"
await pin("03-word-search.png", {
  kicker: "Word search book ideas",
  title: "Pick a niche. Halloween sells every October.",
  body: "32 built-in themes or paste your own list. Every word appears exactly once — checked, not hoped.",
  img: png(wsPdf, 4),
  foot: "How to make a puzzle book for KDP →",
});

// 4. Sudoku → board "Sudoku books"
await pin("04-sudoku.png", {
  kicker: "Sudoku books",
  title: "Every puzzle has exactly one answer.",
  body: "Graded easy to expert, 40 → 26 clues, symmetric like the printed books. A sudoku with two solutions makes your own answer key wrong.",
  img: png(suPdf, 4),
  foot: "Make a sudoku book free →",
});

// 5. Mazes → board "Maze books for kids"
await pin("05-mazes.png", {
  kicker: "Maze books for kids",
  title: "One way in, one way out, no dead corners.",
  body: "Perfect mazes from 15×15 to 39×39, solutions at the back. A 50-maze book prints for $2.30 on KDP.",
  img: png(mzPdf, 4),
  foot: "Make a maze book free →",
});

// 6. Criss-cross → board "Puzzle Press — KDP puzzle books" (no board of its own yet)
await pin("06-crisscross.png", {
  kicker: "Word fill-in books",
  title: "Every fill-in has exactly one answer.",
  body: "Crossword grids with the word list instead of clues. Each grid is solved before it is kept, so the answer key is always right.",
  img: png(ccPdf, 20),
  foot: "Make a fill-in book free →",
});

// 7. Crossword
await pin("07-crossword.png", {
  kicker: "Themed crossword books",
  title: "Crosswords with clues, a whole book at a time.",
  body: "Plain-language clues for 1,400 words across 32 themes, or paste your own word — clue lines. Solutions at the back.",
  img: png(xwPdf, 20),
  foot: "Make a crossword book free →",
});

// ---- The money pins. Every figure below came out of src/pdf/kdp-cost.js on
// 2026-09-14, not out of memory: the rate table is RATES there, the 50/60%
// split is ROYALTY_THRESHOLD, and the page counts are planPages(n, 4). If that
// table is ever updated to a new KDP rate card, these three pins are stale and
// have to be re-rendered before they are pinned again.

// 8. The $9.99 cliff. 100 puzzles → 132pp; 8.5×11 prints at $3.24, so
//    0.5 × 8.99 − 3.24 = $1.25 and 0.6 × 9.99 − 3.24 = $2.75.
await pin("08-royalty-cliff.png", {
  kicker: "KDP royalty math",
  title: "One dollar on the price. Royalty more than doubles.",
  body: "Amazon pays 50% of list below $9.99 and 60% at or above it — and printing comes off your side either way. A 100-puzzle large-print book: $1.25 at $8.99, $2.75 at $9.99.",
  img: png(tgPdf, 4),
  foot: "Free royalty calculator →",
});

// 9. The flat band. Black ink, regular trim, $2.30 flat to 110 pages, then
//    $1.00 + 1.2¢ a page. 20 puzzles is 32pp; 82 puzzles is exactly 110pp.
await pin("09-flat-rate.png", {
  kicker: "KDP printing cost",
  title: "A 32-page book costs the same to print as a 110-page one.",
  body: "Amazon charges a flat $2.30 for black ink on 6×9 up to 110 pages, then $1.00 plus 1.2¢ a page. Under that ceiling a thin book isn't cheaper to make — it's just thinner. 82 puzzles still fit.",
  img: png(xmPdf, 4),
  foot: "Free royalty calculator →",
});

// 10. Large print. 8.5×11 is large trim, so the flat band is $2.84 rather than
//     $2.30 — 54¢, for the biggest sub-category in the store.
await pin("10-large-print.png", {
  kicker: "Large print puzzle books",
  title: "Large print is one checkbox, and 54¢ a copy.",
  body: "8.5×11 counts as large trim, so printing goes from $2.30 to $2.84 under 110 pages. Fourteen words a page puts the grid letters at around 22pt, against about 14pt on a standard 6×9.",
  img: png(lpPdf, 4),
  foot: "Make a large-print book free →",
});

await browser.close();
rmSync(tmp, { recursive: true, force: true });
