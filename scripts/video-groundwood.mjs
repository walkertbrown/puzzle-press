// Two KDP facts most puzzle-book advice gets wrong, both found 2026-09-24 and
// both checkable on KDP's own pages (see actual/2026-09-24.md):
//
//   1. Groundwood paper is a third paperback stock, black ink only, cheaper to
//      print than white or cream. Most calculators don't offer it.
//   2. Expanded Distribution does not currently accept puzzle books — KDP's
//      page lists puzzle books, word search, sudoku, crossword and mazes under
//      "Content not currently accepted" — so the common "tick ED for more
//      reach" advice does not apply to this kind of book at all.
//
// The royalty Short (video-calc.mjs) is the best-watched film on the channel,
// so this is the same calculator with the new facts on camera, and no generator
// handoff: the spine film already shows that. Vertical only — Buffer rejects
// landscape video for YouTube.
//
//   node scripts/video-groundwood.mjs  → public/video/groundwood-short.webm (1080x1920)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.argv.find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com";
const [W, H] = [1080, 1920];
const outName = "groundwood-short.webm";
const tmp = mkdtempSync(join(tmpdir(), "pp-gw-"));
const outDir = new URL("../public/video/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: tmp, size: { width: W, height: H } } });
// Runs against the live domain — don't count it as a visitor (actual/2026-09-18.md).
await ctx.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await ctx.route("**/px/**", (route) => route.abort());
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);
const PHONE_CSS = `html{zoom:2} main{grid-template-columns:1fr;padding:16px;gap:16px} header .wide-only{display:none} header{padding:14px 16px}`;
await ctx.addInitScript((css) => {
  const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); };
  if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
}, PHONE_CSS);
const overlay = () => page.evaluate(() => {
  const s = document.createElement("style");
  s.textContent = `#__cap{position:fixed;left:0;right:0;bottom:0;z-index:99998;display:flex;justify-content:center;pointer-events:none;padding:0 16px 60px;transition:opacity .25s}
    #__cap span{background:rgba(20,30,50,.92);color:#fff;font:600 21px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:12px 22px;border-radius:12px;max-width:900px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.25)}
    .__hl{outline:4px solid #e76f51;outline-offset:6px;border-radius:6px;transition:outline-color .3s}`;
  document.head.appendChild(s);
  const cap = document.createElement("div"); cap.id = "__cap"; cap.style.opacity = "0"; cap.innerHTML = "<span></span>"; document.body.appendChild(cap);
});
const caption = async (text, hold = 0) => {
  await page.evaluate((t) => { const c = document.getElementById("__cap"); c.style.opacity = t ? "1" : "0"; if (t) c.querySelector("span").textContent = t; }, text);
  if (hold) await wait(hold);
};
const scrollTo = async (sel, block = "start") => { await page.evaluate(([q, b]) => document.querySelector(q).scrollIntoView({ behavior: "smooth", block: b }), [sel, block]); await wait(900); };
const highlight = (sel, on) => page.evaluate(([q, o]) => document.querySelector(q)?.classList.toggle("__hl", o), [sel, on]);

await page.goto(`${base}/royalty-calculator`, { waitUntil: "networkidle" });
await overlay();
await wait(400);
await caption("A free KDP royalty calculator for puzzle books.", 2200);
await page.selectOption("#trim", "6x9");
await page.fill("#pages", "200");
await page.selectOption("#ink", "black");
await page.fill("#list", "8.99");
await page.dispatchEvent("#list", "input");
await wait(1000);
await scrollTo("#printing", "center");
await highlight("#printing", true);
await caption("200 pages, 6×9, black ink on white or cream: Amazon's printing charge.", 2800);
// The number moves on camera — that is the point of the beat.
await page.selectOption("#ink", "groundwood");
await wait(900);
await caption("Switch to groundwood paper — KDP's third stock — and it drops.", 2800);
await caption("Black ink only, and KDP says not for heavy ink. Puzzle pages are light.", 3000);
await highlight("#printing", false);
await caption("");

await scrollTo("#expanded", "center");
await highlight("#expanded", true);
await caption("Expanded Distribution pays 40% — if your book is allowed in.", 2600);
await caption("KDP lists puzzle books, word search, sudoku and mazes as not currently accepted.", 3400);
await caption("So for a puzzle book, Amazon's 50–60% is the royalty that counts.", 2800);
await highlight("#expanded", false);
await caption("");

await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;background:#f4f6fa;color:#1d3557;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 40px;box-sizing:border-box}
  h2{font-size:60px;margin:0 0 16px;letter-spacing:-.02em}
  div.c{font-size:42px;font-weight:700;background:#fff;padding:20px 30px;border-radius:14px;box-shadow:0 8px 24px rgba(20,30,50,.10)}
  p{font-size:32px;margin:20px 0 0;color:#5c6470}</style>
  <h2>Checked against KDP's own pages</h2>
  <div class="c">White, cream and groundwood</div><div class="c">Regular and large trim</div><div class="c">50% / 60% royalty split</div>
  <p>Free, no sign-up. Then it makes the book.</p>`);
await wait(3200);

await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#1d3557;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 40px;box-sizing:border-box}
  h1{font-size:88px;margin:0 0 20px;letter-spacing:-.02em} p{font-size:40px;margin:0;color:#c9d3e6;line-height:1.35}
  .u{margin-top:50px;font-size:40px;font-weight:700;background:#fff;color:#1d3557;padding:14px 30px;border-radius:14px}</style>
  <h1>Puzzle Press</h1><p>The calculators are free and always will be.</p><div class="u">puzzlepress.bananafest-destiny.com<br>/royalty-calculator</div>`);
await wait(3400);

await ctx.close();
const src = await page.video().path();
await browser.close();
execFileSync("cp", [src, join(outDir, outName)]);
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote public/video/${outName}`);
