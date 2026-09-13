// Does the ink actually stay inside the margins?
//
// Every other check on the interior is arithmetic: the code computes a gutter
// and the code is asked whether it computed it. This one rasterises the real
// PDF and looks at pixels, which is the only way to catch a page that draws
// outside the box it was given — the exact thing KDP rejects files for.
//
// Run: node test/inkcheck.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { THEMES } from "../src/generator/wordlists.js";
import { generateBook } from "../src/generator/book.js";
import { generateSudokuBook } from "../src/generator/sudoku.js";
import { generateMazeBook } from "../src/generator/maze.js";
import { generateCrissCrossBook } from "../src/generator/crisscross.js";
import { generateCrosswordBook } from "../src/generator/crossword.js";
import { CLUES } from "../src/generator/clues.js";
import { renderBook } from "../src/pdf/render.js";
import { pageGeometry, marginsForPage, PT } from "../src/pdf/kdp.js";
import { planPages, solutionsThatFit, solutionsPerPageFor } from "../src/pdf/layout.js";

const DPI = 100;
const tmp = mkdtempSync(join(tmpdir(), "pp-ink-"));
const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

const COUNT = 8;
const books = {
  "word search": generateBook({ pools: [THEMES.halloween], count: COUNT, wordsPerPuzzle: 15, difficulty: "graded", seed: "ink" }),
  sudoku: generateSudokuBook({ count: COUNT, difficulty: "graded", seed: "ink" }),
  "sudoku 6×6": generateSudokuBook({ count: COUNT, difficulty: "graded", seed: "ink6", size: 6 }),
  mazes: generateMazeBook({ count: COUNT, difficulty: "graded", seed: "ink" }),
  "criss-cross": generateCrissCrossBook({ pools: [THEMES.halloween], count: COUNT, difficulty: "graded", seed: "ink" }),
  crosswords: generateCrosswordBook({ pools: [THEMES.garden], builtinClues: CLUES, count: COUNT, difficulty: "graded", seed: "ink" }),
};

// Pixels darker than this count as ink; JPEG-free PNG output makes this exact.
const INK = 200;

for (const trim of ["6x9", "8.5x11", "5x8"]) {
  for (const [name, book] of Object.entries(books)) {
    for (const licensed of [true, false]) {
      const pdf = join(tmp, `${name.replace(/\W/g, "")}-${trim}-${licensed}.pdf`);
      writeFileSync(pdf, await renderBook(book, { title: "Ink Check", subtitle: "margins", author: "Puzzle Press", trim, licensed, fonts }));
      const plan = planPages(COUNT, solutionsPerPageFor(COUNT, solutionsThatFit(pageGeometry({ trim }))));
      const geom = pageGeometry({ trim, pageCount: plan.total });

      const prefix = join(tmp, `p${Math.random().toString(36).slice(2, 7)}`);
      execFileSync("pdftoppm", ["-r", String(DPI), "-png", "-gray", pdf, prefix]);
      const files = readdirSync(tmp).filter((f) => f.startsWith(prefix.split("/").pop())).sort();
      check(files.length === plan.total, `${name} ${trim}: ${files.length} rendered pages, plan says ${plan.total}`);

      for (const [i, f] of files.entries()) {
        const pageNo = i + 1;
        const png = PNG.sync.read(readFileSync(join(tmp, f)));
        const m = marginsForPage(geom, pageNo);
        // Margins in points → pixels, minus one pixel of tolerance for the
        // rasteriser rounding a glyph edge.
        const px = (pts) => Math.floor((pts / PT) * DPI) - 1;
        const left = px(m.left), right = png.width - px(m.right);
        const top = px(m.top), bottom = png.height - px(m.bottom);
        let worst = null;
        for (let y = 0; y < png.height; y++) {
          for (let x = 0; x < png.width; x++) {
            const v = png.data[(png.width * y + x) << 2];
            if (v >= INK) continue;
            const outside = x < left || x >= right || y < top || y >= bottom;
            if (!outside) continue;
            const where = x < left ? "left" : x >= right ? "right" : y < top ? "top" : "bottom";
            if (!worst || v < worst.v) worst = { x, y, v, where };
          }
        }
        check(
          !worst,
          `${name} ${trim} ${licensed ? "paid" : "free"} p${pageNo} (${m.rightHand ? "odd" : "even"}): ink in the ${worst?.where} margin at ${worst?.x},${worst?.y} — box is x ${left}..${right}, y ${top}..${bottom} of ${png.width}×${png.height}`,
        );
        if (worst) break; // one report per book is enough to act on
      }
      for (const f of files) rmSync(join(tmp, f));
    }
  }
}

rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`\n${failed} margin problem(s)`); process.exit(1); }
console.log(`INK OK — ${Object.keys(books).length} book types × 3 trims × free and paid: every pixel of ink inside KDP's margins`);
