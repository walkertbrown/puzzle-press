// The Product Hunt gallery, rendered from the real app and real generated
// books. Writes into public/gallery/ so they are linkable too.
//
// Every frame is 1270x760 at 2x. Product Hunt recommends exactly 1270x760 for
// gallery images, and the shape matters more than the pixels: anything a
// different shape gets letterboxed or cropped by their viewer. These were
// 1920x1230 (1.56:1, close but not it) and "the tool" was 1920x2699 — a tall
// portrait screenshot that would have been shown as a sliver down the middle
// of a wide frame.
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

// Product Hunt's recommended gallery size, shot at 2x so it stays sharp on a
// retina screen and still lands well under their 3 MB limit.
const SHOT = { width: 1270, height: 760 };
const view = { viewport: SHOT, deviceScaleFactor: 2 };

const browser = await chromium.launch();

// Pages out of the real sample book, for the frames that are pure composition.
const samplePdf = new URL("../public/samples/sample-6x9.pdf", import.meta.url).pathname;
const pageUri = (n, dpi = 150) => {
  const prefix = join(tmp, `s${n}`);
  execFileSync("pdftoppm", ["-r", String(dpi), "-f", String(n), "-l", String(n), "-png", samplePdf, prefix]);
  const file = [`${prefix}-${String(n).padStart(2, "0")}.png`, `${prefix}-${n}.png`]
    .find((f) => { try { readFileSync(f); return true; } catch { return false; } });
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
};
const puzzleUri = pageUri(5);
const solUri = pageUri(24);

// --- 1. the card, which sets the frame ---
// public/social-card.png is 1200x630 because that is the Open Graph size and
// must stay that way. Product Hunt needs 1270x760, so the same idea is redrawn
// at their shape rather than an OG card being stretched into it.
const card = await browser.newPage(view);
await card.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await card.setContent(`<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;background:#1d3557;color:#fff;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .wrap{display:flex;width:${SHOT.width}px;height:${SHOT.height}px;align-items:center;gap:56px;padding:0 72px}
  .copy{flex:1}
  .kicker{font-size:21px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#93a7c4;margin-bottom:20px}
  h1{font-size:64px;line-height:1.06;letter-spacing:-.02em;margin:0 0 22px}
  p{font-size:23px;line-height:1.45;color:#c6d2e4;margin:0 0 30px;max-width:21em}
  .tag{display:inline-block;font-size:20px;font-weight:600;color:#1d3557;background:#fff;padding:10px 18px;border-radius:7px}
  .shot{flex:0 0 400px;display:flex;justify-content:center}
  .shot img{width:400px;border-radius:6px;box-shadow:0 22px 50px rgba(0,0,0,.4);transform:rotate(3deg)}
</style>
<div class="wrap">
  <div class="copy">
    <div class="kicker">Puzzle Press</div>
    <h1>Puzzle books,<br>ready for KDP.</h1>
    <p>Word search, sudoku, mazes, fill-ins and crosswords. Interior and cover, print-ready, in your browser.</p>
    <div class="tag">puzzlepress.bananafest-destiny.com</div>
  </div>
  <div class="shot"><img src="${puzzleUri}"></div>
</div>`);
await card.waitForTimeout(300);
await card.screenshot({ path: join(out, "01-card.png") });

// --- 2. what comes out: a puzzle page beside its solutions page ---
const pages = await browser.newPage(view);
await pages.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await pages.setContent(`<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;height:${SHOT.height}px;overflow:hidden;
    background:linear-gradient(160deg,#eef1f6,#e2e7f0);
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
  .stage{position:relative;width:${SHOT.width}px;height:${SHOT.height}px}
  img{position:absolute;border-radius:4px;background:#fff;
      box-shadow:0 18px 44px rgba(20,30,50,.24),0 2px 6px rgba(20,30,50,.12)}
  .a{height:640px;left:96px;top:52px;transform:rotate(-3.5deg);z-index:2}
  .b{height:600px;right:104px;top:96px;transform:rotate(4deg);z-index:1}
</style>
<div class="stage"><img class="a" src="${puzzleUri}"><img class="b" src="${solUri}"></div>`);
await pages.waitForTimeout(300);
await pages.screenshot({ path: join(out, "02-pages.png") });

// --- 3. the tool, mid-use, preview showing ---
const app = await browser.newPage(view);
await app.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
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
// Shoot the viewport, not the <main> element. The element is 1400x2699 — the
// whole form plus the whole preview — and a portrait image of that shape is
// useless in a 1.67:1 frame. Scrolled to the tool, the viewport shows the
// settings column and the live preview side by side, which is the thing worth
// showing anyway. Scroll to an explicit offset rather than with
// scrollIntoViewIfNeeded, which on an element three times taller than the
// viewport lands wherever it likes: it put the frame's top edge at "Trim
// size", with the puzzle type, title, subtitle and author cut off above.
await app.evaluate(() => window.scrollTo(0, document.getElementById("tool").offsetTop - 8));
await app.waitForTimeout(600);
await app.screenshot({ path: join(out, "03-the-tool.png") });

// --- 4. a solutions page, close ---
const pdf = new URL("../public/samples/sample-6x9.pdf", import.meta.url).pathname;
const prefix = join(tmp, "sol");
execFileSync("pdftoppm", ["-r", "170", "-f", "24", "-l", "24", "-png", pdf, prefix]);
const uri = `data:image/png;base64,${readFileSync(`${prefix}-24.png`).toString("base64")}`;
const sol = await browser.newPage(view);
await sol.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await sol.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;height:${SHOT.height}px;display:flex;align-items:center;justify-content:center;gap:56px;
       background:linear-gradient(160deg,#eef1f6,#e2e7f0);
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
  img{height:680px;border-radius:5px;background:#fff;box-shadow:0 20px 48px rgba(20,30,50,.24)}
  .t{max-width:15em}
  h2{font-size:40px;line-height:1.12;letter-spacing:-.02em;margin:0 0 14px}
  p{font-size:20px;line-height:1.5;color:#4a5a74;margin:0}
</style>
<img src="${uri}">
<div class="t"><h2>Solutions, laid out for you.</h2>
<p>Every book ends with a solutions section — six grids to a page, answers shaded, numbered to match. No second export, no extra work.</p></div>`);
await sol.waitForTimeout(300);
await sol.screenshot({ path: join(out, "04-solutions.png") });

// --- 5. sudoku, the other kind of book ---
const sudokuPdf = new URL("../samples/samples-sudoku.pdf", import.meta.url).pathname;
{
  const { generateSudokuBook } = await import("../src/generator/sudoku.js");
  const { renderBook } = await import("../src/pdf/render.js");
  const { readFileSync: rf, writeFileSync } = await import("node:fs");
  const fonts = {
    regular: rf(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url).pathname),
    bold: rf(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url).pathname),
  };
  const book = generateSudokuBook({ count: 20, difficulty: "graded", seed: "gallery-sudoku" });
  writeFileSync(sudokuPdf, await renderBook(book, {
    title: "Sudoku for Sunday", subtitle: "20 puzzles, easy to expert, with solutions",
    author: "Puzzle Press", trim: "6x9", licensed: true, fonts,
  }));
}
const sp = join(tmp, "sud");
execFileSync("pdftoppm", ["-r", "150", "-f", "3", "-l", "3", "-png", sudokuPdf, sp]);
const ss = join(tmp, "sudsol");
execFileSync("pdftoppm", ["-r", "150", "-f", "24", "-l", "24", "-png", sudokuPdf, ss]);
const uriP = `data:image/png;base64,${readFileSync(`${sp}-03.png`).toString("base64")}`;
const uriS = `data:image/png;base64,${readFileSync(`${ss}-24.png`).toString("base64")}`;
const sud = await browser.newPage(view);
await sud.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await sud.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;height:${SHOT.height}px;display:flex;align-items:center;justify-content:center;gap:40px;
       background:linear-gradient(160deg,#eef1f6,#e2e7f0);
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
  img{height:650px;border-radius:5px;background:#fff;box-shadow:0 20px 48px rgba(20,30,50,.24)}
  .t{max-width:13em}
  h2{font-size:36px;line-height:1.12;letter-spacing:-.02em;margin:0 0 14px}
  p{font-size:19px;line-height:1.5;color:#4a5a74;margin:0}
</style>
<img src="${uriP}"><img src="${uriS}">
<div class="t"><h2>Sudoku, too.</h2>
<p>Easy to expert. Every puzzle is checked to have exactly one solution before it goes in the book — so the answers at the back are right.</p></div>`);
await sud.waitForTimeout(300);
await sud.screenshot({ path: join(out, "05-sudoku.png") });

// --- 6. mazes ---
const mazePdf = new URL("../samples/samples-maze.pdf", import.meta.url).pathname;
{
  const { generateMazeBook } = await import("../src/generator/maze.js");
  const { renderBook } = await import("../src/pdf/render.js");
  const { readFileSync: rf, writeFileSync } = await import("node:fs");
  const fonts = {
    regular: rf(new URL("../public/fonts/LiberationSans-Regular.ttf", import.meta.url).pathname),
    bold: rf(new URL("../public/fonts/LiberationSans-Bold.ttf", import.meta.url).pathname),
  };
  const book = generateMazeBook({ count: 20, difficulty: "graded", seed: "gallery-maze" });
  writeFileSync(mazePdf, await renderBook(book, {
    title: "Mazes for Rainy Days", subtitle: "20 mazes, easy to expert, with solutions",
    author: "Puzzle Press", trim: "6x9", licensed: true, fonts,
  }));
}
const mp = join(tmp, "mz");
execFileSync("pdftoppm", ["-r", "150", "-f", "3", "-l", "3", "-png", mazePdf, mp]);
const ms = join(tmp, "mzsol");
execFileSync("pdftoppm", ["-r", "150", "-f", "24", "-l", "24", "-png", mazePdf, ms]);
const mUriP = `data:image/png;base64,${readFileSync(`${mp}-03.png`).toString("base64")}`;
const mUriS = `data:image/png;base64,${readFileSync(`${ms}-24.png`).toString("base64")}`;
const mz = await browser.newPage(view);
await mz.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await mz.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;height:${SHOT.height}px;display:flex;align-items:center;justify-content:center;gap:40px;
       background:linear-gradient(160deg,#eef1f6,#e2e7f0);
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
  img{height:650px;border-radius:5px;background:#fff;box-shadow:0 20px 48px rgba(20,30,50,.24)}
  .t{max-width:13em}
  h2{font-size:36px;line-height:1.12;letter-spacing:-.02em;margin:0 0 14px}
  p{font-size:19px;line-height:1.5;color:#4a5a74;margin:0}
</style>
<img src="${mUriP}"><img src="${mUriS}">
<div class="t"><h2>And mazes.</h2>
<p>15×15 up to 39×39. Every maze is a perfect maze — no loops, no unreachable corners, exactly one route from start to finish.</p></div>`);
await mz.waitForTimeout(300);
await mz.screenshot({ path: join(out, "06-mazes.png") });

await browser.close();
console.log("wrote gallery 01-card, 02-pages, 03-the-tool, 04-solutions, 05-sudoku and 06-mazes");
