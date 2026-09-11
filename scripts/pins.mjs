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

const wsPdf = await pdf("ws", ws, "Halloween Word Search", "50 spooky puzzles, easy to hard");
const suPdf = await pdf("su", su, "Sudoku for Sunday", "50 puzzles, easy to expert");
const mzPdf = await pdf("mz", mz, "Mazes for Rainy Days", "50 mazes, easy to expert");
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

await browser.close();
rmSync(tmp, { recursive: true, force: true });
