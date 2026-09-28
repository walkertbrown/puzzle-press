import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { generateBook } from "../src/generator/book.js";
import { THEMES } from "../src/generator/wordlists.js";
import { renderBook, planPages, solutionsThatFit, solutionsPerPageFor } from "../src/pdf/render.js";
import { pageGeometry, gutterInches, marginsForPage } from "../src/pdf/kdp.js";

const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};

test("gutter follows the KDP page-count table", () => {
  assert.equal(gutterInches(24), 0.375);
  assert.equal(gutterInches(150), 0.375);
  assert.equal(gutterInches(151), 0.5);
  assert.equal(gutterInches(301), 0.625);
  assert.equal(gutterInches(501), 0.75);
  assert.equal(gutterInches(701), 0.875);
});

test("6x9 no-bleed page is 432x648pt; bleed adds 0.125in wide and 0.25in tall", () => {
  const a = pageGeometry({ trim: "6x9", bleed: false, pageCount: 24 });
  assert.equal(a.width, 432);
  assert.equal(a.height, 648);
  const b = pageGeometry({ trim: "6x9", bleed: true, pageCount: 24 });
  assert.equal(b.width, 441);
  assert.equal(b.height, 666);
  assert.equal(b.margin.outer, 36); // 0.375 + 0.125 bleed
});

test("odd pages have the gutter on the left, even pages on the right", () => {
  const g = pageGeometry({ trim: "6x9", pageCount: 24 });
  assert.equal(marginsForPage(g, 1).left, g.margin.inner);
  assert.equal(marginsForPage(g, 2).right, g.margin.inner);
});

test("planPages: a fixed shape — title, copyright, puzzles, divider, solutions, notes", () => {
  // 1 + 1 + 40 + 1 + ceil(40/4) + 4 = 57 -> 58 for an even count
  const forty = planPages(40, 4);
  assert.equal(forty.solutionPages, 10);
  assert.equal(forty.total, 58);
  assert.equal(forty.notes, 5); // 4, plus one for parity
  assert.equal(forty.total, forty.content + forty.notes);
  // A short book comes out short and says so rather than being padded.
  const five = planPages(5, 6);
  assert.equal(five.belowMinimum, true);
  // 1+1+5+1+1 = 9 pages of content, which is odd, so parity adds a fifth
  // notes page. Four or five, never more.
  assert.equal(five.notes, 5);
  assert.equal(five.total, five.content + five.notes);
  assert.equal(planPages(16, 6).belowMinimum, false);
});

test("solutions per page: 6 when three rows stay legible, else 4", () => {
  assert.equal(solutionsThatFit(pageGeometry({ trim: "6x9" })), 6);
  assert.equal(solutionsThatFit(pageGeometry({ trim: "8.5x11" })), 6);
  assert.equal(solutionsThatFit(pageGeometry({ trim: "5x8" })), 4);
});

test("renders a 6x9 book with the planned page count and embedded fonts", async () => {
  const book = generateBook({ pools: [THEMES.animals], count: 10, wordsPerPuzzle: 15, seed: "pdf6x9" });
  const bytes = await renderBook(book, { title: "Animal Word Search", subtitle: "50 puzzles for relaxing evenings", author: "Test Author", trim: "6x9", fonts });
  const pdf = await PDFDocument.load(bytes);
  // The renderer now chooses solutions-per-page itself, to fill pages with
  // answers rather than blanks; ask it what it would pick.
  assert.equal(pdf.getPageCount(), planPages(10, solutionsPerPageFor(10, solutionsThatFit(pageGeometry({ trim: "6x9" })))).total);
  const [w, h] = [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()];
  assert.equal(w, 432);
  assert.equal(h, 648);
  assert.equal(pdf.getTitle(), "Animal Word Search");
  // Embedded TrueType fonts carry a FontFile2 stream in their descriptor.
  // (Objects are in compressed object streams, so inspect via pdf-lib.)
  const dicts = pdf.context.enumerateIndirectObjects().map(([, obj]) => obj.toString());
  assert.ok(dicts.some((s) => s.includes("/FontFile2")), "TrueType font should be embedded");
  assert.ok(!dicts.some((s) => s.includes("/BaseFont /Helvetica")), "no un-embedded standard font");
  mkdirSync(new URL("../samples/test/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../samples/test/sample-6x9.pdf", import.meta.url), bytes);
});

test("renders an 8.5x11 hard book with bleed, licensed (no watermark)", async () => {
  const book = generateBook({ pools: [THEMES.ocean, THEMES.space], count: 30, wordsPerPuzzle: 20, difficulty: "hard", seed: "pdfletter" });
  const bytes = await renderBook(book, { title: "Big Word Search Book", trim: "8.5x11", bleed: true, licensed: true, fonts });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), planPages(30, solutionsPerPageFor(30, solutionsThatFit(pageGeometry({ trim: "8.5x11", bleed: true })))).total);
  assert.equal(pdf.getPage(0).getWidth(), 621); // 8.625in
  assert.equal(pdf.getPage(0).getHeight(), 810); // 11.25in
  writeFileSync(new URL("../samples/test/sample-8.5x11-bleed.pdf", import.meta.url), bytes);
});

test("a long title on the title and copyright pages doesn't end on one stranded word", async (t) => {
  try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); } catch { return t.skip("pdftotext not installed"); }
  const title = "The Enormous Christmas Holiday Word Search Collection for the Whole Family";
  const book = generateBook({ pools: [THEMES.garden], count: 3, wordsPerPuzzle: 12, difficulty: "medium", seed: "balance" });
  const file = new URL("../samples/test/title-balance-5x8.pdf", import.meta.url);
  writeFileSync(file, await renderBook(book, { title, author: "A. B.", trim: "5x8", licensed: true, fonts }));
  const lines = execFileSync("pdftotext", ["-f", "1", "-l", "2", "-raw", file.pathname, "-"]).toString().split("\n").map((l) => l.trim()).filter(Boolean);
  const titleLines = lines.filter((l) => title.includes(l) && l !== "A. B.");
  // Unbalanced, the copyright page broke "…for the Whole" / "Family".
  assert.ok(titleLines.length >= 4, titleLines.join(" | "));
  for (const l of titleLines) assert.ok(l.split(" ").length > 1, `stranded word: "${l}" in ${titleLines.join(" | ")}`);
});

test("characters no embedded font has are left out and reported, not printed as boxes", async (t) => {
  try { execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); } catch { return t.skip("pdftoppm not installed"); }
  const { renderCover } = await import("../src/pdf/cover.js");
  const display = readFileSync(new URL("../public/fonts/LilitaOne-Regular.ttf", import.meta.url));
  const book = generateBook({ pools: [THEMES.garden], count: 2, wordsPerPuzzle: 10, difficulty: "easy", seed: "tofu" });
  const renders = {
    interior: (title, author, onMissing) => renderBook(book, { title, author, trim: "6x9", licensed: true, fonts, onMissing }),
    cover: (title, author, onMissing) => renderCover({ title, author, trim: "6x9", pageCount: 24, puzzleCount: 2, samplePuzzle: book.puzzles[0], palette: "ocean", fonts: { ...fonts, display }, onMissing }),
  };
  // pdftotext extracts nothing for a missing glyph, so compare pixels: with
  // the emoji and CJK left out, the page must be identical to the same book
  // typed without them. A box drawn anywhere makes them differ.
  const pixels = (name, bytes) => {
    const file = new URL(`../samples/test/tofu-${name}.pdf`, import.meta.url).pathname;
    writeFileSync(file, bytes);
    return execFileSync("pdftoppm", ["-r", "40", "-f", "1", "-l", "1", "-gray", file]);
  };
  for (const [name, render] of Object.entries(renders)) {
    let missing = [];
    const odd = pixels(`${name}-odd`, await render("Family ❤️ Puzzles 数独 👨‍👩‍👧", "Ana 🌸", (m) => (missing = m)));
    const plain = pixels(`${name}-plain`, await render("Family Puzzles", "Ana", () => assert.fail(`${name}: nothing is missing from a plain title`)));
    assert.deepEqual(missing.sort(), ["❤", "数", "独", "👧", "👨", "👩", "🌸"].sort(), name);
    assert.ok(odd.equals(plain), `${name}: the page with left-out characters differs from the plain one`);
  }
});
