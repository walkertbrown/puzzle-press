import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { coverGeometry, spineWidthInches, renderCover, PAPER, SPINE_TEXT_MIN_PAGES } from "../src/pdf/cover.js";
import { generateBook } from "../src/generator/book.js";
import { THEMES } from "../src/generator/wordlists.js";
import { planPages } from "../src/pdf/render.js";

const fonts = {
  regular: readFileSync(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url)),
  bold: readFileSync(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url)),
};

test("spine width is page count x paper thickness, with nothing added", () => {
  // KDP: "page count x 0.002252" for white, x 0.0025" for cream. No allowance.
  assert.equal(spineWidthInches(100, "white"), 0.2252);
  assert.equal(spineWidthInches(100, "cream"), 0.25);
  assert.ok(Math.abs(spineWidthInches(200, "premiumColor") - 0.4694) < 1e-9);
  // Guard against the widespread "+0.06" figure, which is a hardcover rule.
  assert.notEqual(spineWidthInches(200, "white"), 200 * PAPER.white.thickness + 0.06);
});

test("cover width = bleed + back + spine + front + bleed, height = trim + two bleeds", () => {
  const g = coverGeometry({ trim: "6x9", pageCount: 100, paper: "cream" });
  // (0.125 + 6 + 0.25 + 6 + 0.125) x (0.125 + 9 + 0.125) inches, in points
  assert.equal(g.width, 12.5 * 72);
  assert.equal(g.height, 9.25 * 72);
  assert.equal(g.spine, 0.25 * 72);
});

test("panels sit next to each other with no gap or overlap", () => {
  const g = coverGeometry({ trim: "8.5x11", pageCount: 150, paper: "white" });
  assert.equal(g.backX, 0.125 * 72);
  assert.equal(g.spineX, g.backX + g.panelW);
  assert.equal(g.frontX, g.spineX + g.spine);
  assert.ok(Math.abs(g.frontX + g.panelW + 0.125 * 72 - g.width) < 1e-9);
});

test("spine text is allowed only from 79 pages", () => {
  assert.equal(coverGeometry({ pageCount: SPINE_TEXT_MIN_PAGES - 1 }).spineTextAllowed, false);
  assert.equal(coverGeometry({ pageCount: SPINE_TEXT_MIN_PAGES }).spineTextAllowed, true);
});

test("renders a one-page cover at the computed size", async () => {
  const book = generateBook({ pools: [THEMES.halloween], count: 60, wordsPerPuzzle: 15, seed: "cov" });
  const pages = planPages(60, 6).total;
  const bytes = await renderCover({
    title: "Halloween Word Search",
    subtitle: "60 spooky puzzles with solutions",
    author: "A. Maker",
    trim: "6x9",
    pageCount: pages,
    paper: "cream",
    puzzleCount: 60,
    samplePuzzle: book.puzzles[0],
    fonts,
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const g = coverGeometry({ trim: "6x9", pageCount: pages, paper: "cream" });
  assert.ok(Math.abs(pdf.getPage(0).getWidth() - g.width) < 0.01);
  assert.ok(Math.abs(pdf.getPage(0).getHeight() - g.height) < 0.01);
  const dicts = pdf.context.enumerateIndirectObjects().map(([, o]) => o.toString());
  assert.ok(dicts.some((s) => s.includes("/FontFile2")), "cover fonts must be embedded too");
  mkdirSync(new URL("../samples/test/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../samples/test/cover-6x9.pdf", import.meta.url), bytes);
});

test("a short book gets a cover with no spine text and still renders", async () => {
  const bytes = await renderCover({ title: "Tiny Book", trim: "5x8", pageCount: 24, paper: "white", fonts });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(pdf.getPage(0).getWidth() > 0);
});
