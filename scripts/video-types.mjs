// A montage: the same tool making each of the five kinds of book, ending on
// a real page from each. Same recorder as video.mjs; --short for 9:16.
//   node scripts/video-types.mjs          → public/video/five-types.webm (1440×810)
//   node scripts/video-types.mjs --short  → public/video/five-types-short.webm (1080×1920)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const SHORT = process.argv.includes("--short");
const base = process.argv.find((a) => a.startsWith("http")) || "https://puzzle-press.walkertbrown.workers.dev";
const [W, H, Z] = SHORT ? [1080, 1920, 2] : [1440, 810, 1];
const outName = SHORT ? "five-types-short.webm" : "five-types.webm";
const tmp = mkdtempSync(join(tmpdir(), "pp-types-"));
const outDir = new URL("../public/video/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: true, recordVideo: { dir: tmp, size: { width: W, height: H } } });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const PHONE_CSS = `html{zoom:2} main{grid-template-columns:1fr;padding:16px;gap:16px} header .wide-only{display:none} header{padding:14px 16px}
  .hero{padding:24px 16px 20px} .hero-inner{grid-template-columns:1fr;gap:24px} .preview-stick{position:static;padding:0} .check,.themes label,button,.btn{min-height:44px}`;
const overlay = () => page.evaluate((z) => {
  if (document.getElementById("__cap")) return;
  const s = document.createElement("style");
  s.textContent = `#__cap{position:fixed;left:0;right:0;bottom:0;z-index:99998;display:flex;justify-content:center;pointer-events:none;padding:0 16px ${z > 1 ? 60 : 26}px;transition:opacity .25s}
    #__cap span{background:rgba(20,30,50,.92);color:#fff;font:600 ${z > 1 ? 21 : 24}px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:12px 22px;border-radius:12px;max-width:900px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.25)}`;
  document.head.appendChild(s);
  const cap = document.createElement("div"); cap.id = "__cap"; cap.style.opacity = "0"; cap.innerHTML = "<span></span>"; document.body.appendChild(cap);
}, Z);
const caption = async (text, hold = 0) => {
  await page.evaluate((t) => { const c = document.getElementById("__cap"); if (!c) return; c.style.opacity = t ? "1" : "0"; if (t) c.querySelector("span").textContent = t; }, text);
  if (hold) await wait(hold);
};
const scrollTo = async (sel, block = "start") => { await page.evaluate(([q, b]) => document.querySelector(q).scrollIntoView({ behavior: "smooth", block: b }), [sel, block]); await wait(900); };

await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "video@example.com", token: "video", verifiedAt: Date.now() })));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".grid div");
if (SHORT) await page.addStyleTag({ content: PHONE_CSS });
await overlay();
await wait(500);
await caption("One tool. Five kinds of KDP puzzle book. All print-ready.", 2400);
await caption("");
await scrollTo(SHORT ? ".preview-stick" : "#tool");

const types = [
  ["wordsearch", "Word search — 32 themes or your own list. Every word once, checked.", ".grid div"],
  ["sudoku", "Sudoku — every puzzle verified to have exactly one solution.", ".sudoku div"],
  ["maze", "Mazes — one route through, no dead pockets, solutions at the back.", ".maze svg line"],
  ["crisscross", "Criss-cross fill-ins — every grid verified to have one fill.", ".crisscross .cell"],
  ["crossword", "Themed crosswords — 1,460 clues written by hand, or paste your own.", ".crisscross .cell i"],
];
const pdfs = {};
for (const [kind, text, sel] of types) {
  await page.selectOption("#kind", kind);
  await page.selectOption("#difficulty", "graded");
  await page.waitForSelector(sel, { state: "attached" });
  // The phone layout stacks the preview under the form; bring it into view
  // before the caption so the viewer sees the puzzle, not the select box.
  await scrollTo(SHORT ? ".preview-stick" : "#tool");
  await caption(text, 300);
  await wait(SHORT ? 2200 : 2600);
  // A small real book of each for the pages at the end — 14 puzzles is
  // exactly KDP's 24-page minimum, so no warning shows.
  await page.fill("#count", "14");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
  pdfs[kind] = join(tmp, `${kind}.pdf`);
  await dl.saveAs(pdfs[kind]);
  await wait(600);
}
await caption("");
await wait(300);

const png = (file, pageNo, dpi) => {
  const prefix = join(tmp, `pg${Math.random().toString(36).slice(2, 7)}`);
  execFileSync("pdftoppm", ["-r", String(dpi), "-f", String(pageNo), "-l", String(pageNo), "-png", file, prefix]);
  for (const f of [`${prefix}-${String(pageNo).padStart(2, "0")}.png`, `${prefix}-${pageNo}.png`]) {
    try { return `data:image/png;base64,${readFileSync(f).toString("base64")}`; } catch {}
  }
  throw new Error("no page image");
};
const fontPx = SHORT ? 44 : 26;
const slide = async (imgs, text, hold) => {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${SHORT ? 40 : 22}px;
         background:linear-gradient(160deg,#eef1f6,#e2e7f0);font:600 ${fontPx}px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
    .row{display:flex;gap:26px;align-items:center;justify-content:center;max-width:92%}
    img{max-height:${SHORT ? H - 420 : H - 150}px;max-width:${SHORT ? 88 : 40}%;border-radius:4px;background:#fff;box-shadow:0 16px 40px rgba(20,30,50,.22)}
    p{margin:0;text-align:center;max-width:${SHORT ? 900 : 1200}px;padding:0 30px}</style>
    <div class="row">${imgs.map((u) => `<img src="${u}">`).join("")}</div><p>${text}</p>`);
  await wait(hold);
};
const dpi = SHORT ? 160 : 96;
if (SHORT) {
  for (const [kind, label] of [["wordsearch", "Word search"], ["sudoku", "Sudoku"], ["maze", "Mazes"], ["crisscross", "Fill-ins"], ["crossword", "Crosswords"]]) {
    await slide([png(pdfs[kind], 3, dpi)], `${label} — a real page from the book it just made`, 1800);
  }
} else {
  await slide([png(pdfs.wordsearch, 3, dpi), png(pdfs.sudoku, 3, dpi), png(pdfs.maze, 3, dpi)], "Real pages from the books it just made", 3200);
  await slide([png(pdfs.crisscross, 3, dpi), png(pdfs.crossword, 3, dpi)], "Fill-ins and crosswords — the two newest", 3000);
}
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#1d3557;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 40px;box-sizing:border-box}
  h1{font-size:${SHORT ? 88 : 64}px;margin:0 0 ${SHORT ? 20 : 0};letter-spacing:-.02em} p{font-size:${SHORT ? 40 : 28}px;margin:0;color:#c9d3e6;line-height:1.35}
  .u{margin-top:${SHORT ? 50 : 26}px;font-size:${SHORT ? 40 : 34}px;font-weight:700;background:#fff;color:#1d3557;padding:14px 30px;border-radius:14px;word-break:break-all}</style>
  <h1>Puzzle Press</h1><p>Free to use — free books carry a watermark.</p><p>$19, once, removes it. No subscription.</p><div class="u">puzzlepress.bananafest-destiny.com</div>`);
await wait(SHORT ? 3400 : 4000);
await ctx.close();
const src = await page.video().path();
await browser.close();
execFileSync("cp", [src, join(outDir, outName)]);
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote public/video/${outName}`);
