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
  // Groundwood is not on the help page; KDP's cover calculator returns 0.235"
  // at 100 pages, 0.056 at 24, 0.783 at 333 and 1.946 at 828 (checked
  // 2026-09-24) — 0.00235 a page, thicker than white, thinner than cream.
  assert.ok(Math.abs(spineWidthInches(100, "groundwood") - 0.235) < 1e-9);
  assert.equal(spineWidthInches(828, "groundwood").toFixed(3), "1.946");
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

test("large print adds a corner badge and still renders one page", async () => {
  const book = generateBook({ pools: [THEMES.animals], count: 20, wordsPerPuzzle: 14, seed: "lp" });
  const pages = planPages(20, 6).total;
  const bytes = await renderCover({
    title: "Large Print Animal Word Search",
    author: "A. Maker",
    trim: "8.5x11",
    pageCount: pages,
    paper: "white",
    puzzleCount: 20,
    samplePuzzle: book.puzzles[0],
    largePrint: true,
    fonts,
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  mkdirSync(new URL("../samples/test/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../samples/test/cover-large-print.pdf", import.meta.url), bytes);
});

test("a short book gets a cover with no spine text and still renders", async () => {
  const bytes = await renderCover({ title: "Tiny Book", trim: "5x8", pageCount: 24, paper: "white", fonts });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(pdf.getPage(0).getWidth() > 0);
});

// KDP's cover calculator gives a safe area for every trim: text 0.125" inside
// the trim on the front and back, 0.0625" inside each spine fold (its "Spine
// Safe Area" is spine − 0.125). Nothing checked where the text actually landed
// until 2026-09-24, when a 120-character title on 5.5x8.5 grew the front band
// off the top of the page and "LARGE PRINT" was simply gone, and 8pt spine text
// on an 80-page book sat across both folds. Measured from the PDF itself.
test("cover text stays inside KDP's safe areas, and the whole title is printed", async (t) => {
  const { execFileSync } = await import("node:child_process");
  const { TRIMS } = await import("../src/pdf/kdp.js");
  try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); } catch { return t.skip("pdftotext not installed"); }
  mkdirSync(new URL("../samples/test/", import.meta.url), { recursive: true });
  const file = new URL("../samples/test/safearea.pdf", import.meta.url).pathname;
  // As long as the tool's inputs allow (maxlength 120 / 160 / 80).
  const title = "Large Print Word Search Puzzles for Seniors and Adults Volume Two: Gardens, Birds, Seasons and Other Gentle Themes!";
  const author = "Margaret Elizabeth Worthington-Smythe and Friends of the Library";
  const PT = 72, safe = 0.125 * PT, fold = 0.0625 * PT;
  const bad = [];
  for (const trim of Object.keys(TRIMS)) for (const pageCount of [80, 90, 130, 600]) for (const paper of ["white", "cream"]) {
    const g = coverGeometry({ trim, pageCount, paper });
    writeFileSync(file, await renderCover({ title, subtitle: "100 relaxing puzzles with solutions, large print", author, trim, pageCount, paper, puzzleCount: 100, fonts }));
    const html = execFileSync("pdftotext", ["-bbox", file, "-"]).toString();
    const words = [...html.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g)]
      .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], w: m[5] }))
      .filter((w) => w.w.length > 1); // single letters are the background field and puzzle cells
    const tag = `${trim} ${pageCount}pp ${paper}`;
    const top = g.bleed + safe, bottom = g.height - g.bleed - safe;
    for (const w of words) {
      if (w.y0 < top - 0.01 || w.y1 > bottom + 0.01) bad.push(`${tag}: "${w.w}" past top/bottom safe line`);
      const spine = w.x0 >= g.spineX - 1 && w.x1 <= g.frontX + 1;
      const [lo, hi] = spine ? [g.spineX + fold, g.frontX - fold]
        : w.x1 <= g.spineX ? [g.backX + safe, g.spineX - fold]
        : [g.frontX + fold, g.frontX + g.panelW - safe];
      if (w.x0 < lo - 0.01 || w.x1 > hi + 0.01) bad.push(`${tag}: "${w.w}" outside the ${spine ? "spine" : "panel"} safe area`);
    }
    const front = words.filter((w) => w.x0 >= g.frontX).map((w) => w.w).join(" ");
    for (const word of title.toUpperCase().split(/\s+/)) {
      if (!front.includes(word)) bad.push(`${tag}: front cover is missing "${word}"`);
    }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} problems`);
});

test("spine text appears once it fits KDP's spine safe area, and not before", async () => {
  const { execFileSync } = await import("node:child_process");
  try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); } catch { return; }
  const file = new URL("../samples/test/spine.pdf", import.meta.url).pathname;
  const spineWords = async (pageCount, paper) => {
    const g = coverGeometry({ trim: "6x9", pageCount, paper });
    writeFileSync(file, await renderCover({ title: "Animal Word Search", author: "Ann Lee", trim: "6x9", pageCount, paper, puzzleCount: 50, fonts }));
    const html = execFileSync("pdftotext", ["-bbox", file, "-"]).toString();
    return [...html.matchAll(/xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">([^<]{2,})</g)]
      .filter((m) => +m[1] >= g.spineX - 1 && +m[2] <= g.frontX + 1).map((m) => m[3]);
  };
  // 88 pages of cream is 0.22": 6pt fits inside the folds. 87 is 0.2175": no.
  assert.ok(coverGeometry({ trim: "6x9", pageCount: 88, paper: "cream" }).spineTextFits);
  assert.ok(!coverGeometry({ trim: "6x9", pageCount: 87, paper: "cream" }).spineTextFits);
  assert.deepEqual(await spineWords(87, "cream"), []);
  assert.deepEqual(await spineWords(88, "cream"), ["Animal", "Word", "Search", "Ann", "Lee"]);
  assert.deepEqual(await spineWords(96, "white"), []);
  assert.ok((await spineWords(97, "white")).includes("Search"));
});
