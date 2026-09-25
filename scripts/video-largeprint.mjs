// Large print, answers included (actual/2026-09-25.md). KDP: "Large-print
// books usually have a font size of 16 points or higher." Our puzzles always
// were; the answer key printed six grids a page at about 8pt. Now one grid a
// page, 16pt and up, and a 50-puzzle book still fits KDP's flat 110-page price.
//
// The before/after card uses real pages: the previous large-print sample's
// answer page and the current one, rendered with pdftoppm. Pass the old sample
// with OLD=path/to/old.pdf (page 26); without it the card shows only the new page.
//
//   node scripts/video-largeprint.mjs  → public/video/largeprint-short.webm (1080x1920)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.argv.find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com";
const [W, H] = [1080, 1920];
const outName = "largeprint-short.webm";
const tmp = mkdtempSync(join(tmpdir(), "pp-lp-"));
const outDir = new URL("../public/video/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const pagePng = (pdf, n, name) => {
  execFileSync("pdftoppm", ["-r", "70", "-png", "-f", String(n), "-l", String(n), "-singlefile", pdf, join(tmp, name)]);
  return `data:image/png;base64,${readFileSync(join(tmp, `${name}.png`)).toString("base64")}`;
};
const NEW = pagePng(new URL("../public/samples/sample-large-print-8.5x11.pdf", import.meta.url).pathname, 25, "new");
const OLD = process.env.OLD && existsSync(process.env.OLD) ? pagePng(process.env.OLD, 26, "old") : null;

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

await page.goto(`${base}/?kind=sudoku&largePrint=1#tool`, { waitUntil: "networkidle" });
await page.waitForSelector(".sudoku div");
await overlay();
await scrollTo(".preview-stick");
await caption("A large-print sudoku book, for a grandparent who can't read the small ones.", 2800);
await scrollTo("#largePrintRow", "center");
await highlight("#largePrintRow", true);
await caption("One box: 8.5×11, big digits, \"Large Print\" in the title.", 2800);
await highlight("#largePrintRow", false);
await scrollTo("#meta", "center");
await highlight("#meta", true);
await caption("KDP: large-print books \"usually have a font size of 16 points or higher.\"", 3200);
await highlight("#meta", false);
await caption("");

const card = (img, label, sub) => `<figure><img src="${img}"><figcaption><b>${label}</b><br>${sub}</figcaption></figure>`;
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:#f4f6fa;color:#1d3557;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 30px;box-sizing:border-box}
  h2{font-size:54px;margin:0 0 10px;letter-spacing:-.02em;line-height:1.15}
  .row{display:flex;gap:24px;justify-content:center}
  figure{margin:0;flex:1;max-width:${OLD ? 490 : 700}px} img{width:100%;border-radius:8px;box-shadow:0 8px 24px rgba(20,30,50,.18);background:#fff}
  figcaption{font-size:32px;margin-top:16px;line-height:1.3;color:#5c6470} figcaption b{color:#1d3557}</style>
  <h2>The answer key is where<br>large print used to stop.</h2>
  <div class="row">${OLD ? card(OLD, "Before", "word search answers,<br>six a page, ~8pt") : ""}${card(NEW, OLD ? "Now" : "The answer key", "word search answers,<br>one a page, 16pt and up")}</div>`);
await wait(4200);

await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;background:#f4f6fa;color:#1d3557;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 40px;box-sizing:border-box}
  h2{font-size:60px;margin:0 0 16px;letter-spacing:-.02em}
  div.c{font-size:42px;font-weight:700;background:#fff;padding:20px 30px;border-radius:14px;box-shadow:0 8px 24px rgba(20,30,50,.10)}
  p{font-size:32px;margin:20px 0 0;color:#5c6470}</style>
  <h2>Large print on every page</h2>
  <div class="c">Word search and sudoku</div><div class="c">Up to 50 puzzles: 108 pages</div><div class="c">Inside KDP's flat 110-page print price</div>
  <p>Free to try, no sign-up.</p>`);
await wait(3400);

await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#1d3557;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 40px;box-sizing:border-box}
  h1{font-size:88px;margin:0 0 20px;letter-spacing:-.02em} p{font-size:40px;margin:0;color:#c9d3e6;line-height:1.35}
  .u{margin-top:50px;font-size:40px;font-weight:700;background:#fff;color:#1d3557;padding:14px 30px;border-radius:14px}</style>
  <h1>Puzzle Press</h1><p>Link on the channel page:</p><p>@BananafestDestinyDev</p><div class="u">puzzlepress.bananafest-destiny.com</div>`);
await wait(3400);

await ctx.close();
const src = await page.video().path();
await browser.close();
execFileSync("cp", [src, join(outDir, outName)]);
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote public/video/${outName}`);
