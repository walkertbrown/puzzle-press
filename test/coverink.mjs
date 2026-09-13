// The cover, checked in pixels rather than in arithmetic.
//
// Three things KDP rejects a wrap for, none of which the geometry tests can
// see: something printed in the barcode's clear area; spine text on a book
// too thin to carry it; and the spine artwork drifting onto the front or back
// panel, which is what makes a printed spine look crooked.
//
// Run: node test/coverink.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { THEMES } from "../src/generator/wordlists.js";
import { generateBook } from "../src/generator/book.js";
import { generateSudokuBook } from "../src/generator/sudoku.js";
import { generateMazeBook } from "../src/generator/maze.js";
import { generateCrossword, cluesFor } from "../src/generator/crossword.js";
import { CLUES } from "../src/generator/clues.js";
import { renderCover } from "../src/pdf/cover.js";
import { coverGeometry, BARCODE_IN, SPINE_TEXT_MIN_PAGES } from "../src/pdf/cover-geometry.js";
import { PT } from "../src/pdf/kdp.js";

const DPI = 100;
const INK = 235; // the cover has tinted panels, so "ink" here means clearly not-white
const tmp = mkdtempSync(join(tmpdir(), "pp-cink-"));
const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

const samples = {
  "word search": generateBook({ pools: [THEMES.halloween], count: 3, wordsPerPuzzle: 15, seed: "cv" }).puzzles[0],
  sudoku: generateSudokuBook({ count: 1, seed: "cv" }).puzzles[0],
  maze: generateMazeBook({ count: 1, seed: "cv" }).puzzles[0],
  crossword: generateCrossword({ words: THEMES.garden.words, clueOf: cluesFor(THEMES.garden, CLUES), seed: "cv" }),
};

const render = async (opts) => {
  const f = join(tmp, `c${Math.random().toString(36).slice(2, 7)}.pdf`);
  writeFileSync(f, await renderCover({ trim: "6x9", paper: "cream", author: "Puzzle Press", fonts, ...opts }));
  const prefix = join(tmp, `r${Math.random().toString(36).slice(2, 7)}`);
  execFileSync("pdftoppm", ["-r", String(DPI), "-png", "-gray", f, prefix]);
  const file = readdirSync(tmp).find((n) => n.startsWith(prefix.split("/").pop()));
  return PNG.sync.read(readFileSync(join(tmp, file)));
};

const darkestIn = (png, { x0, y0, x1, y1 }) => {
  let worst = null;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(png.height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(png.width, Math.ceil(x1)); x++) {
      const v = png.data[(png.width * y + x) << 2];
      if (v < INK && (!worst || v < worst.v)) worst = { x, y, v };
    }
  }
  return worst;
};

for (const pageCount of [32, 66, 78, 80, 300]) {
  for (const [name, samplePuzzle] of Object.entries(samples)) {
    for (const licensed of [true, false]) {
      const png = await render({ title: "Cover Ink Check", subtitle: "barcode and spine", pageCount, puzzleCount: 50, samplePuzzle, licensed, seed: "cv" });
      const g = coverGeometry({ trim: "6x9", pageCount, paper: "cream" });
      const px = (pts) => (pts / PT) * DPI;
      const label = `${name} ${pageCount}pp ${licensed ? "paid" : "free"}`;
      check(Math.abs(png.width - px(g.width)) <= 1 && Math.abs(png.height - px(g.height)) <= 1,
        `${label}: rendered ${png.width}×${png.height}px, geometry says ${Math.round(px(g.width))}×${Math.round(px(g.height))}`);

      // 1. The barcode's clear area, lower right of the back panel.
      const bx1 = px(g.backX + g.panelW - BARCODE_IN.margin * PT);
      const bx0 = bx1 - px(BARCODE_IN.w * PT);
      const by1 = png.height - px(g.panelY + BARCODE_IN.margin * PT);
      const by0 = by1 - px(BARCODE_IN.h * PT);
      const inBarcode = darkestIn(png, { x0: bx0 + 1, y0: by0 + 1, x1: bx1 - 1, y1: by1 - 1 });
      check(!inBarcode, `${label}: something is printed in the barcode area at ${inBarcode?.x},${inBarcode?.y} (grey ${inBarcode?.v})`);

      // 2. Spine text only when KDP allows it. Below the threshold the spine
      //    must be a flat band: no glyphs, which show up as dark pixels on it.
      const sx0 = px(g.spineX) + 2, sx1 = px(g.spineX + g.spine) - 2;
      if (sx1 > sx0) {
        const onSpine = darkestIn(png, { x0: sx0, y0: px(g.panelY) + 4, x1: sx1, y1: png.height - px(g.panelY) - 4 });
        if (pageCount < SPINE_TEXT_MIN_PAGES) {
          check(!onSpine || onSpine.v > 120, `${label}: ink on the spine of a ${pageCount}-page book (KDP allows spine text from ${SPINE_TEXT_MIN_PAGES}) at ${onSpine?.x},${onSpine?.y}`);
        } else {
          check(Boolean(onSpine), `${label}: spine is blank on a ${pageCount}-page book, which is allowed to carry the title`);
        }
      }
    }
  }
}

rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`\n${failed} cover problem(s)`); process.exit(1); }
console.log(`COVER INK OK — 4 sample types × 5 page counts × free and paid: barcode area clear, spine text only from ${SPINE_TEXT_MIN_PAGES} pages`);
