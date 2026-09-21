// The calculators, and the door they open.
//
// Why this video and not another tour of the tool: on 2026-09-21 the only page
// of this site that has ever appeared in a live search was a calculator, the
// only page bingbot fetched in a day was /royalty-calculator, and the 91
// word-list pages produced zero readers who went on to run the app. Search
// sends people to the free utilities. So the thing worth filming is the
// utility and the one-click handoff out of it — the visitor's own trim size,
// page count and list price carried into the generator, nothing re-typed.
//
// Same recorder as video.mjs and video-types.mjs; --short for 9:16.
//   node scripts/video-calc.mjs          → public/video/calculators.webm (1440×810)
//   node scripts/video-calc.mjs --short  → public/video/calculators-short.webm (1080×1920)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const SHORT = process.argv.includes("--short");
const base = process.argv.find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com";
const [W, H, Z] = SHORT ? [1080, 1920, 2] : [1440, 810, 1];
const outName = SHORT ? "calculators-short.webm" : "calculators.webm";
const tmp = mkdtempSync(join(tmpdir(), "pp-calc-"));
const outDir = new URL("../public/video/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: true, recordVideo: { dir: tmp, size: { width: W, height: H } } });
// Runs against the live domain — block the Web Analytics beacon so this does
// not get counted as a visitor (see actual/2026-09-18.md).
await ctx.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
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
// This film navigates — calculator, then the tool it hands off to — and the
// first cut had four seconds of undressed desktop layout on camera while the
// second page loaded, because the phone styling was applied after load. Inject
// it before first paint instead, so every document in the recording is already
// the phone layout the moment it appears.
if (SHORT) {
  await ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
  }, PHONE_CSS);
}
const dress = async () => { await overlay(); };

// --- the royalty calculator, used the way somebody off a search uses it -----
await page.goto(`${base}/royalty-calculator`, { waitUntil: "networkidle" });
await dress();
await wait(400);
await caption("A free KDP royalty calculator. No sign-up, nothing to install.", 2400);
await page.selectOption("#trim", "6x9");
await page.fill("#pages", "120");
await wait(700);
await page.fill("#list", "9.99");
await wait(1200);
await caption("Printing cost, royalty, and the lowest price that still covers printing.", 2600);
await caption("");

// The handoff. This is the part that shipped today and the reason for the film.
await scrollTo(".cta", "center");
await caption("Then it hands that exact book to the generator.", 2200);
await caption("");
const href = await page.$eval("#makeBtn", (a) => a.getAttribute("href"));
// Hold a caption over the navigation so the cut is a sentence, not a blank.
await caption("Same trim. Same page count. Same price.");
await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
// A watermark-free book, the way a buyer's is — same as the other two films.
await page.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "video@example.com", token: "video", verifiedAt: Date.now() })));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".grid div");
await dress();
await scrollTo(SHORT ? ".preview-stick" : "#tool");
await caption("Same trim. Same page count. Same price. Nothing re-typed.", 3000);
await caption("");
await scrollTo("#tool");
await wait(800);

// A small real book so the download is quick on camera — 14 puzzles is exactly
// KDP's 24-page minimum, so no length warning shows.
await page.fill("#count", "14");
await wait(900);
await caption("One button, and the whole paperback comes out as a PDF.", 1200);
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
const pdf = join(tmp, "book.pdf");
await dl.saveAs(pdf);
await wait(900);
await caption("");

const png = (file, pageNo, dpi) => {
  const prefix = join(tmp, `pg${Math.random().toString(36).slice(2, 7)}`);
  execFileSync("pdftoppm", ["-r", String(dpi), "-f", String(pageNo), "-l", String(pageNo), "-png", file, prefix]);
  for (const f of [`${prefix}-${String(pageNo).padStart(2, "0")}.png`, `${prefix}-${pageNo}.png`]) {
    try { return `data:image/png;base64,${readFileSync(f).toString("base64")}`; } catch {}
  }
  throw new Error("no page image");
};
const fontPx = SHORT ? 44 : 26;
const dpi = SHORT ? 160 : 96;
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
await slide([png(pdf, 3, dpi)], "A real page from the book it just made", 2200);
await slide([png(pdf, 1, dpi)], "Title page, solutions and page numbers included", 2000);

// The other two calculators exist and are free too — say so, because the
// person watching this arrived by searching for one of them.
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${SHORT ? 34 : 18}px;background:#f4f6fa;color:#1d3557;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 40px;box-sizing:border-box}
  h2{font-size:${SHORT ? 64 : 44}px;margin:0 0 ${SHORT ? 18 : 10}px;letter-spacing:-.02em}
  div.c{font-size:${SHORT ? 46 : 32}px;font-weight:700;background:#fff;padding:${SHORT ? 22 : 14}px ${SHORT ? 34 : 26}px;border-radius:14px;box-shadow:0 8px 24px rgba(20,30,50,.10)}
  p{font-size:${SHORT ? 34 : 24}px;margin:${SHORT ? 22 : 12}px 0 0;color:#5c6470}</style>
  <h2>Three free KDP calculators</h2>
  <div class="c">Royalty &amp; printing cost</div><div class="c">Spine width &amp; cover size</div><div class="c">Margins, gutter &amp; bleed</div>
  <p>Each one opens the generator with your book already set up.</p>`);
await wait(SHORT ? 3200 : 3600);

await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#1d3557;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 40px;box-sizing:border-box}
  h1{font-size:${SHORT ? 88 : 64}px;margin:0 0 ${SHORT ? 20 : 0};letter-spacing:-.02em} p{font-size:${SHORT ? 40 : 28}px;margin:0;color:#c9d3e6;line-height:1.35}
  .u{margin-top:${SHORT ? 50 : 26}px;font-size:${SHORT ? 40 : 34}px;font-weight:700;background:#fff;color:#1d3557;padding:14px 30px;border-radius:14px;word-break:break-all}</style>
  <h1>Puzzle Press</h1><p>The calculators are free and always will be.</p><p>Free books carry a watermark; $19 once removes it.</p><div class="u">puzzlepress.bananafest-destiny.com</div>`);
await wait(SHORT ? 3400 : 4000);

await ctx.close();
const src = await page.video().path();
await browser.close();
execFileSync("cp", [src, join(outDir, outName)]);
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote public/video/${outName}`);
