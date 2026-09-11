// Product Hunt gallery slots 4 and 5, rendered from the real app and a real
// generated book. Writes into public/gallery/ so they are linkable too.
//
// Usage: node scripts/gallery.mjs [baseUrl]
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:8788";
const out = new URL("../public/gallery/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "pp-gal-"));

const browser = await chromium.launch();

// --- 4. the tool, mid-use, preview showing ---
const app = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.5 });
await app.goto(base, { waitUntil: "networkidle" });
// Shoot the paid product: an unlicensed shot shows the 5-puzzle cap under a
// title promising 100, which reads as a bug rather than a free tier.
await app.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "you@example.com", token: "demo", verifiedAt: Date.now() })));
await app.reload({ waitUntil: "networkidle" });
await app.waitForSelector(".grid div");
await app.fill("#title", "Large Print Word Search");
await app.fill("#subtitle", "100 puzzles for relaxing evenings");
await app.fill("#author", "M. Hartley");
await app.uncheck(".themes input[value='animals']");
await app.check(".themes input[value='garden']");
await app.fill("#count", "100");
await app.waitForTimeout(900);
// Shoot the tool as one element: settings and preview together, nothing cropped.
await app.setViewportSize({ width: 1400, height: 1500 });
await app.waitForTimeout(600);
await app.locator("main").screenshot({ path: join(out, "04-the-tool.png") });

// --- 5. a solutions page, close ---
const pdf = new URL("../public/samples/sample-6x9.pdf", import.meta.url).pathname;
const prefix = join(tmp, "sol");
execFileSync("pdftoppm", ["-r", "170", "-f", "24", "-l", "24", "-png", pdf, prefix]);
const uri = `data:image/png;base64,${readFileSync(`${prefix}-24.png`).toString("base64")}`;
const sol = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.5 });
await sol.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;height:820px;display:flex;align-items:center;justify-content:center;gap:56px;
       background:linear-gradient(160deg,#eef1f6,#e2e7f0);
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
  img{height:740px;border-radius:5px;background:#fff;box-shadow:0 20px 48px rgba(20,30,50,.24)}
  .t{max-width:15em}
  h2{font-size:40px;line-height:1.12;letter-spacing:-.02em;margin:0 0 14px}
  p{font-size:20px;line-height:1.5;color:#4a5a74;margin:0}
</style>
<img src="${uri}">
<div class="t"><h2>Solutions, laid out for you.</h2>
<p>Every book ends with a solutions section — six grids to a page, answers shaded, numbered to match. No second export, no extra work.</p></div>`);
await sol.waitForTimeout(300);
await sol.screenshot({ path: join(out, "05-solutions.png") });

// --- 6. sudoku, the other kind of book ---
const sudokuPdf = new URL("../samples/samples-sudoku.pdf", import.meta.url).pathname;
{
  const { generateSudokuBook } = await import("../src/generator/sudoku.js");
  const { renderBook } = await import("../src/pdf/render.js");
  const { readFileSync: rf, writeFileSync } = await import("node:fs");
  const fonts = {
    regular: rf(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url).pathname),
    bold: rf(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url).pathname),
  };
  const book = generateSudokuBook({ count: 20, difficulty: "hard", seed: "gallery-sudoku" });
  writeFileSync(sudokuPdf, await renderBook(book, {
    title: "Sudoku for Sunday", subtitle: "20 hard puzzles with solutions",
    author: "Puzzle Press", trim: "6x9", licensed: true, fonts,
  }));
}
const sp = join(tmp, "sud");
execFileSync("pdftoppm", ["-r", "150", "-f", "3", "-l", "3", "-png", sudokuPdf, sp]);
const ss = join(tmp, "sudsol");
execFileSync("pdftoppm", ["-r", "150", "-f", "24", "-l", "24", "-png", sudokuPdf, ss]);
const uriP = `data:image/png;base64,${readFileSync(`${sp}-03.png`).toString("base64")}`;
const uriS = `data:image/png;base64,${readFileSync(`${ss}-24.png`).toString("base64")}`;
const sud = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.5 });
await sud.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;height:820px;display:flex;align-items:center;justify-content:center;gap:40px;
       background:linear-gradient(160deg,#eef1f6,#e2e7f0);
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
  img{height:700px;border-radius:5px;background:#fff;box-shadow:0 20px 48px rgba(20,30,50,.24)}
  .t{max-width:13em}
  h2{font-size:36px;line-height:1.12;letter-spacing:-.02em;margin:0 0 14px}
  p{font-size:19px;line-height:1.5;color:#4a5a74;margin:0}
</style>
<img src="${uriP}"><img src="${uriS}">
<div class="t"><h2>Sudoku, too.</h2>
<p>Easy to expert. Every puzzle is checked to have exactly one solution before it goes in the book — so the answers at the back are right.</p></div>`);
await sud.waitForTimeout(300);
await sud.screenshot({ path: join(out, "06-sudoku.png") });

// --- 7. mazes ---
const mazePdf = new URL("../samples/samples-maze.pdf", import.meta.url).pathname;
{
  const { generateMazeBook } = await import("../src/generator/maze.js");
  const { renderBook } = await import("../src/pdf/render.js");
  const { readFileSync: rf, writeFileSync } = await import("node:fs");
  const fonts = {
    regular: rf(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url).pathname),
    bold: rf(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url).pathname),
  };
  const book = generateMazeBook({ count: 20, difficulty: "hard", seed: "gallery-maze" });
  writeFileSync(mazePdf, await renderBook(book, {
    title: "Mazes for Rainy Days", subtitle: "20 hard mazes with solutions",
    author: "Puzzle Press", trim: "6x9", licensed: true, fonts,
  }));
}
const mp = join(tmp, "mz");
execFileSync("pdftoppm", ["-r", "150", "-f", "3", "-l", "3", "-png", mazePdf, mp]);
const ms = join(tmp, "mzsol");
execFileSync("pdftoppm", ["-r", "150", "-f", "24", "-l", "24", "-png", mazePdf, ms]);
const mUriP = `data:image/png;base64,${readFileSync(`${mp}-03.png`).toString("base64")}`;
const mUriS = `data:image/png;base64,${readFileSync(`${ms}-24.png`).toString("base64")}`;
const mz = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.5 });
await mz.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;height:820px;display:flex;align-items:center;justify-content:center;gap:40px;
       background:linear-gradient(160deg,#eef1f6,#e2e7f0);
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
  img{height:700px;border-radius:5px;background:#fff;box-shadow:0 20px 48px rgba(20,30,50,.24)}
  .t{max-width:13em}
  h2{font-size:36px;line-height:1.12;letter-spacing:-.02em;margin:0 0 14px}
  p{font-size:19px;line-height:1.5;color:#4a5a74;margin:0}
</style>
<img src="${mUriP}"><img src="${mUriS}">
<div class="t"><h2>And mazes.</h2>
<p>15×15 up to 39×39. Every maze is a perfect maze — no loops, no unreachable corners, exactly one route from start to finish.</p></div>`);
await mz.waitForTimeout(300);
await mz.screenshot({ path: join(out, "07-mazes.png") });

await browser.close();
console.log("wrote gallery 04-the-tool, 05-solutions, 06-sudoku and 07-mazes");
