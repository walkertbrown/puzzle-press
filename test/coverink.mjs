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
import { coverGeometry, BARCODE_IN, SPINE_FOLD_IN } from "../src/pdf/cover-geometry.js";
import { PT } from "../src/pdf/kdp.js";

const DPI = 100;
const INK = 235; // the cover has tinted panels, so "ink" here means clearly not-white
const tmp = mkdtempSync(join(tmpdir(), "pp-cink-"));
const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
  display: readFileSync(new URL("../public/fonts/LilitaOne-Regular.ttf", import.meta.url)),
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

// The band is flat (the field pattern skips the spine), so its shade is the
// commonest value in the region; text is whatever strays from it.
const bandOf = (png, { x0, y0, x1, y1 }) => {
  const n = new Map();
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(png.height, Math.ceil(y1)); y++)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(png.width, Math.ceil(x1)); x++) {
      const v = png.data[(png.width * y + x) << 2];
      n.set(v, (n.get(v) || 0) + 1);
    }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const offBand = (png, box) => {
  const band = bandOf(png, box);
  let worst = null;
  for (let y = Math.max(0, Math.floor(box.y0)); y < Math.min(png.height, Math.ceil(box.y1)); y++)
    for (let x = Math.max(0, Math.floor(box.x0)); x < Math.min(png.width, Math.ceil(box.x1)); x++) {
      const d = Math.abs(png.data[(png.width * y + x) << 2] - band);
      if (d > 8 && (!worst || d > worst.d)) worst = { x, y, d };
    }
  return worst;
};

for (const pageCount of [32, 66, 78, 80, 100, 300]) {
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

      // 2. Spine text only when KDP allows it (79 pages) AND it fits inside
      //    each fold with room to spare (g.spineTextFits — 100pp on cream,
      //    111 on white).
      //    Otherwise the spine must be a flat band: no glyphs, which show up
      //    as dark pixels on it. 80 pages is allowed but too narrow; 100 fits.
      //    Since 2026-09-27 the spine is the cover's colour with white text, so
      //    "text" is any pixel that differs from the band's own shade.
      const sx0 = px(g.spineX) + 2, sx1 = px(g.spineX + g.spine) - 2;
      if (sx1 > sx0) {
        const onSpine = offBand(png, { x0: sx0, y0: px(g.panelY) + 4, x1: sx1, y1: png.height - px(g.panelY) - 4 });
        if (!g.spineTextFits) {
          check(!onSpine || onSpine.d < 60, `${label}: ink on the spine of a ${pageCount}-page book, whose spine is too narrow for text inside KDP's safe area, at ${onSpine?.x},${onSpine?.y}`);
        } else {
          check(Boolean(onSpine), `${label}: spine is blank on a ${pageCount}-page book, whose spine fits the title`);
        }
      }
    }
  }
}

// 1b. The barcode area at every trim. The free cover's unlock note sits beside
//     it on the back since 2026-09-27, and at 5x8 the back panel leaves it
//     only 180pt beside the barcode area. The 6x9 loop above can't see that.
for (const trim of ["5x8", "8.5x11"]) {
  for (const licensed of [true, false]) {
    const pageCount = 120;
    const png = await render({ trim, title: "Cover Ink Check", pageCount, puzzleCount: 50, samplePuzzle: samples["word search"], licensed, seed: "cv" });
    const g = coverGeometry({ trim, pageCount, paper: "cream" });
    const px = (pts) => (pts / PT) * DPI;
    const bx1 = px(g.backX + g.panelW - BARCODE_IN.margin * PT);
    const bx0 = bx1 - px(BARCODE_IN.w * PT);
    const by1 = png.height - px(g.panelY + BARCODE_IN.margin * PT);
    const by0 = by1 - px(BARCODE_IN.h * PT);
    const inBarcode = darkestIn(png, { x0: bx0 + 1, y0: by0 + 1, x1: bx1 - 1, y1: by1 - 1 });
    check(!inBarcode, `${trim} ${licensed ? "paid" : "free"}: something is printed in the barcode area at ${inBarcode?.x},${inBarcode?.y} (grey ${inBarcode?.v})`);
  }
}

// 3. Spine text clear of KDP's line, in pixels at 1200 DPI. KDP: "at least
//    0.0625" (1.6 mm) of space between the text and the edge of the spine".
//    At 100 DPI a pixel is 0.01", coarser than the whole question: laid out on
//    exactly 0.0625", descenders measured 0.0624"-0.0634" from the fold, and
//    this check passed. So crop just the spine, count a pixel as ink if it
//    differs at all from the band (white text on colour since 09-27), and hold the renderer to its own promise —
//    SPINE_TEXT_IN, 1/64" further in than KDP's line — to within a pixel.
//    "At least 0.0625"" alone passes text sitting exactly on the line. The
//    figure is written out here, not imported, so zeroing the inset in
//    cover-geometry.js fails this test instead of moving it.
const HI = 1200;
const CLEAR = SPINE_FOLD_IN + 1 / 64;
let spinesChecked = 0;
for (const paper of ["cream", "white"]) {
  let first = 79;
  while (!coverGeometry({ trim: "6x9", pageCount: first, paper }).spineTextFits) first++;
  for (const pageCount of [first, first + 3, 150, 200]) {
    for (const [title, author] of [["Jiggly Puppy Quiz Hijinks", ""], ["Big Word Search", "Gypsy Quigley"]]) {
      const f = join(tmp, `s${Math.random().toString(36).slice(2, 7)}.pdf`);
      writeFileSync(f, await renderCover({ trim: "6x9", paper, title, author, pageCount, puzzleCount: 50, samplePuzzle: samples["word search"], licensed: true, seed: "cv", fonts }));
      const g = coverGeometry({ trim: "6x9", pageCount, paper });
      const hp = (pts) => (pts / PT) * HI;
      // One pixel either side of the spine, so the fold columns are included.
      const x0 = Math.floor(hp(g.spineX)) - 1, w = Math.ceil(hp(g.spine)) + 3;
      const y0 = Math.floor(hp(g.panelY)), h = Math.floor(hp(g.panelH));
      const prefix = join(tmp, `h${Math.random().toString(36).slice(2, 7)}`);
      execFileSync("pdftoppm", ["-r", String(HI), "-png", "-gray", "-x", String(x0), "-y", String(y0), "-W", String(w), "-H", String(h), "-singlefile", f, prefix]);
      const png = PNG.sync.read(readFileSync(`${prefix}.png`));
      // The band's own shade: the commonest value inside the folds.
      const band = bandOf(png, { x0: 2, y0: 0, x1: png.width - 2, y1: png.height });
      // Only between the folds: the front's selling strip starts at the fold
      // and runs out through the bleed, which is cover art, not spine text.
      // Text that crossed a fold would still measure ~0" from it and fail.
      const fx0 = Math.ceil(hp(g.spineX)) - x0, fx1 = Math.floor(hp(g.spineX + g.spine)) - x0;
      let lo = Infinity, hi = -Infinity;
      for (let y = 0; y < png.height; y++) for (let x = fx0; x < fx1; x++) {
        if (Math.abs(png.data[(png.width * y + x) << 2] - band) <= 8) continue;
        lo = Math.min(lo, x); hi = Math.max(hi, x + 1);
      }
      const label = `spine ${paper} ${pageCount}pp "${title}"${author ? " + author" : ""}`;
      check(lo < hi, `${label}: no spine text found`);
      const left = (x0 + lo) / HI - g.spineX / PT, right = (g.spineX + g.spine) / PT - (x0 + hi) / HI;
      check(Math.min(left, right) >= CLEAR - 1 / HI,
        `${label}: spine text ${left.toFixed(4)}" and ${right.toFixed(4)}" from the folds; KDP wants at least ${SPINE_FOLD_IN}" and we keep ${CLEAR.toFixed(4)}"`);
      if (process.env.SHOW) console.log(label, "band", band, left.toFixed(4), right.toFixed(4));
      spinesChecked++;
    }
  }
}

rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`\n${failed} cover problem(s)`); process.exit(1); }
console.log(`COVER INK OK — 4 sample types × 6 page counts × free and paid: barcode area clear, spine text only where it fits KDP's spine safe area; ${spinesChecked} spines at ${HI} DPI keep ${CLEAR.toFixed(3)}" from both folds (KDP: 0.0625")`);
