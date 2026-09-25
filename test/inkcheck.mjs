// Does the ink actually stay inside the margins?
//
// Every other check on the interior is arithmetic: the code computes a gutter
// and the code is asked whether it computed it. This one rasterises the real
// PDF and looks at pixels, which is the only way to catch a page that draws
// outside the box it was given — the exact thing KDP rejects files for.
//
// Run: node test/inkcheck.mjs  (ONLY=custom to run just the books whose name
// starts with "custom"; TRIMS=5x8,6x9 to narrow the trims — both for iterating)
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
import { pageGeometry, marginsForPage, PT, TRIMS } from "../src/pdf/kdp.js";
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
const LONG_POOL = {
  title: "Grandma Margaret's Complete Garden, Kitchen and Orchard Words",
  words: THEMES.garden.words,
  clues: Object.fromEntries(THEMES.garden.words.map((w) => [w.toLowerCase(),
    `Something you might find growing, crawling or resting somewhere in an old English country garden in late summer (${w.length} letters)`])),
};
// Every word as long as a grid allows: the generator drops a word longer than
// the grid, and an auto-sized grid tops out at 30, so 28 letters (plus the
// two-cell margin suggestSize keeps) is the longest word any buyer can print.
const LONG_WORDS = {
  title: "Long Words",
  words: ["antidisestablishmentarianism", "floccinaucinihilipilification", "incomprehensibilities", "counterrevolutionaries",
    "uncharacteristically", "internationalization", "electroencephalograph", "institutionalization", "compartmentalization",
    "deinstitutionalization", "overintellectualization", "psychophysiologically", "transubstantiation", "honorificabilitudinitatibus",
    "spectrophotometrically", "immunoelectrophoresis", "otorhinolaryngologist", "ethylenediaminetetraacetate"].filter((w) => w.length <= 28),
};
// Criss-cross and crossword grids hold 19 letters at most (17 + 2), and a
// list of nothing but longer words rightly makes no puzzle at all — so their
// book mixes the longest placeable words into an ordinary list.
const LONG_GRID_WORDS = {
  title: "Long Words",
  words: [...THEMES.garden.words, "internationalism", "counterintuitive", "photosynthesising", "transubstantiation",
    "institutionalising", "incomprehensibility", "unsympathetically"],
  clues: {},
};
const books = {
  "word search": generateBook({ pools: [THEMES.halloween], count: COUNT, wordsPerPuzzle: 15, difficulty: "graded", seed: "ink" }),
  sudoku: generateSudokuBook({ count: COUNT, difficulty: "graded", seed: "ink" }),
  "sudoku 6×6": generateSudokuBook({ count: COUNT, difficulty: "graded", seed: "ink6", size: 6 }),
  mazes: generateMazeBook({ count: COUNT, difficulty: "graded", seed: "ink" }),
  "criss-cross": generateCrissCrossBook({ pools: [THEMES.halloween], count: COUNT, difficulty: "graded", seed: "ink" }),
  crosswords: generateCrosswordBook({ pools: [THEMES.garden], builtinClues: CLUES, count: COUNT, difficulty: "graded", seed: "ink" }),
  // The longest things a buyer can type into a puzzle page: the name of their
  // own list (maxlength 60, printed on every puzzle) and, for crosswords, their
  // own clues — which have no length limit at all.
  "custom list": generateBook({ pools: [LONG_POOL], count: COUNT, wordsPerPuzzle: 15, difficulty: "graded", seed: "ink" }),
  "custom criss-cross": generateCrissCrossBook({ pools: [LONG_POOL], count: COUNT, difficulty: "graded", seed: "ink" }),
  "custom long words": generateBook({ pools: [LONG_WORDS], count: COUNT, wordsPerPuzzle: 15, difficulty: "graded", seed: "ink" }),
  "custom long criss-cross": generateCrissCrossBook({ pools: [LONG_GRID_WORDS], count: COUNT, difficulty: "graded", seed: "ink" }),
  "custom crosswords": generateCrosswordBook({ pools: [LONG_POOL], builtinClues: {}, count: COUNT, difficulty: "graded", seed: "ink" }),
};

// Pixels darker than this count as ink; JPEG-free PNG output makes this exact.
const INK = 200;

// The title, subtitle and author as long as the tool's inputs allow (maxlength
// 120 / 160 / 80): a long title is what pushed text off the cover on
// 2026-09-24, and the interior prints all three on its title page.
const title = "Large Print Word Search Puzzles for Seniors and Adults Volume Two: Gardens, Birds, Seasons and Other Gentle Themes!";
const subtitle = "One hundred relaxing large print puzzles with full solutions at the back, printed big enough to read without glasses, for quiet evenings";
const author = "Margaret Elizabeth Worthington-Smythe and Friends of the Library";

// Every trim the tool offers, with and without bleed (a checkbox in the tool;
// untested here until 2026-09-24).
for (const trim of (process.env.TRIMS?.split(",") ?? Object.keys(TRIMS))) for (const bleed of [false, true]) {
  for (const [name, book] of Object.entries(books).filter(([n]) => !process.env.ONLY || n.startsWith(process.env.ONLY))) {
    for (const licensed of [true, false]) {
      const pdf = join(tmp, `${name.replace(/\W/g, "")}-${trim}-${bleed}-${licensed}.pdf`);
      writeFileSync(pdf, await renderBook(book, { title, subtitle, author, trim, bleed, licensed, fonts }));
      const plan = planPages(COUNT, solutionsPerPageFor(COUNT, solutionsThatFit(pageGeometry({ trim, bleed }))));
      const geom = pageGeometry({ trim, bleed, pageCount: plan.total });

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
          `${name} ${trim}${bleed ? " bleed" : ""} ${licensed ? "paid" : "free"} p${pageNo} (${m.rightHand ? "odd" : "even"}): ink in the ${worst?.where} margin at ${worst?.x},${worst?.y} — box is x ${left}..${right}, y ${top}..${bottom} of ${png.width}×${png.height}`,
        );
        if (worst) break; // one report per book is enough to act on
      }
      for (const f of files) rmSync(join(tmp, f));
    }
  }
}

rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`\n${failed} margin problem(s)`); process.exit(1); }
console.log(`INK OK — ${Object.keys(books).length} book types × ${Object.keys(TRIMS).length} trims × bleed on and off × free and paid, longest title: every pixel of ink inside KDP's margins`);
