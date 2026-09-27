// KDP's safe zone for cover text, checked in pixels.
//
// KDP, "Create a Paperback Cover" (https://kdp.amazon.com/en_US/help/topic/G201953020):
//   "When adding text, make sure it's at least 0.125" (3.2 mm) inside the trim lines."
//
// coverink.mjs covers the barcode area and the spine. Nothing covered the four
// outer edges until 2026-09-27, after a redesign moved every piece of type.
//
// All text on the coloured ground is white (title, subtitle, author, captions),
// and the white boxes (front card, back blurb and puzzle, barcode) sit well
// inside. The art that does run into the bleed is the background, its faint
// letter field and the accent strip, and none of it is near white: measured at
// 150 and 300 DPI, the brightest art in the edge band is grey 227 (rust's
// strip). So a near-white pixel in the outer
// 0.125" + bleed means text, or a white box, too close to a trim line.
//
// Run: node test/coversafe.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { THEMES } from "../src/generator/wordlists.js";
import { generateBook } from "../src/generator/book.js";
import { generateSudokuBook } from "../src/generator/sudoku.js";
import { renderCover } from "../src/pdf/cover.js";
import { PALETTE_HEX } from "../src/pdf/palettes.js";
import { BLEED_IN } from "../src/pdf/cover-geometry.js";

const DPI = 150;
const SAFE_IN = 0.125;
const WHITE = 232; // art tops out at 227; the sample stamp's lightest type is 235
const tmp = mkdtempSync(join(tmpdir(), "pp-csafe-"));
const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};
let failed = 0, checked = 0;

const raster = (pdf) => {
  const prefix = join(tmp, `r${Math.random().toString(36).slice(2, 7)}`);
  execFileSync("pdftoppm", ["-r", String(DPI), "-png", "-gray", pdf, prefix]);
  const file = readdirSync(tmp).find((n) => n.startsWith(prefix.split("/").pop()) && n.endsWith(".png"));
  return PNG.sync.read(readFileSync(join(tmp, file)));
};

// Near-white pixels within bleed + 0.125" of any outer edge. The spine folds
// are not trim lines; coverink.mjs holds spine text to its own rule.
const tooClose = (png) => {
  const m = Math.ceil((BLEED_IN + SAFE_IN) * DPI);
  let worst = null;
  for (let y = 0; y < png.height; y++) {
    const edgeRow = y < m || y >= png.height - m;
    for (let x = 0; x < png.width; x++) {
      if (!edgeRow && x >= m && x < png.width - m) { x = png.width - m - 1; continue; }
      const v = png.data[(png.width * y + x) << 2];
      if (v >= WHITE) {
        const d = Math.min(x, y, png.width - 1 - x, png.height - 1 - y) / DPI - BLEED_IN;
        if (!worst || d < worst.d) worst = { x, y, d };
      }
    }
  }
  return worst;
};

const check = (label, png) => {
  checked++;
  const w = tooClose(png);
  if (w) { failed++; console.log(`FAIL ${label}: near-white at ${w.x},${w.y}px, ${w.d.toFixed(3)}" from the trim (KDP: text at least ${SAFE_IN}" inside)`); }
};

// The instrument has to see what it is looking for: the faintest type any
// cover carries (the sample stamp: 7.5pt regular in 0.92 grey), set smaller
// still at 7pt, 0.05" from the trim, must fail.
{
  const { PDFDocument, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(await renderCover({ title: "Probe", pageCount: 60, fonts, seed: "cs", palette: "navy" }));
  const page = doc.getPage(0);
  const font = await doc.embedFont((await import("pdf-lib")).StandardFonts.Helvetica);
  page.drawText("edge", { x: (BLEED_IN + 0.05) * 72, y: page.getHeight() / 2, size: 7, font, color: rgb(0.92, 0.92, 0.92) });
  const f = join(tmp, "probe.pdf");
  writeFileSync(f, await doc.save());
  if (!tooClose(raster(f))) { console.log("FAIL the probe: 7pt type in 0.92 grey, 0.05\" from the trim, was not seen"); process.exit(1); }
}

const puzzles = {
  "word search": generateBook({ pools: [THEMES.halloween], count: 2, wordsPerPuzzle: 15, seed: "cs" }).puzzles,
  sudoku: generateSudokuBook({ count: 2, seed: "cs" }).puzzles,
};
const long = {
  title: "The Enormous Extra Large Print Holiday Word Search Collection For Everyone",
  subtitle: "One hundred and fifty puzzles with every solution at the back of the book, easy to expert",
  author: "Bartholomew Montgomery-Fitzwilliam Esq. and Associates",
};
for (const trim of ["5x8", "6x9", "8.5x11"]) {
  for (const { name: palette } of PALETTE_HEX) {
    for (const [kind, [samplePuzzle, backPuzzle]] of Object.entries(puzzles)) {
      for (const licensed of [true, false]) {
        for (const text of [{ title: "Word Search", subtitle: "", author: "" }, long]) {
          const f = join(tmp, "c.pdf");
          writeFileSync(f, await renderCover({ ...text, trim, pageCount: 120, puzzleCount: 150, samplePuzzle, backPuzzle, largePrint: text === long, licensed, palette, seed: "cs", fonts }));
          check(`${trim} ${palette} ${kind} ${licensed ? "paid" : "free"} ${text === long ? "long text + large print" : "short text"}`, raster(f));
        }
      }
    }
  }
}

// And the covers people actually download from the site.
const samples = readdirSync(new URL("../public/samples/", import.meta.url)).filter((n) => /cover.*\.pdf$/.test(n));
for (const n of samples) check(`public/samples/${n}`, raster(new URL(`../public/samples/${n}`, import.meta.url).pathname));

rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`\n${failed} of ${checked} covers put text inside KDP's 0.125" margin`); process.exit(1); }
console.log(`COVER SAFE ZONE OK — ${checked} covers (3 trims × 8 colours × 2 types × free/paid × short/long text, plus ${samples.length} published samples): no text within 0.125" of a trim line, and the probe proves 7pt type in 0.92 grey at 0.05" is seen`);
