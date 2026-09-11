// Record the real app making a real book, start to finish, in real time, with
// captions on screen and no narration. Ends on pages from the PDF it just made.
//
//   node scripts/video.mjs            → public/video/puzzle-press.webm   (1440×810, ~60 s, YouTube)
//   node scripts/video.mjs --short    → public/video/puzzle-press-short.webm (1080×1920, <60 s, Shorts)
//
// Playwright ships its own ffmpeg and writes the WebM itself; nothing to install.
// The Short shows the phone layout: Chromium's screencast captures CSS pixels,
// so instead of a 2× device we use a 1080-wide viewport, zoom the page 2× and
// apply the same rules the ≤800px media query would. Same page, phone shape.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const SHORT = process.argv.includes("--short");
const base = process.argv.find((a) => a.startsWith("http")) || "https://puzzle-press.walkertbrown.workers.dev";
// Landscape: 16:9, tall enough that the sticky preview and its header both fit.
const [W, H, Z] = SHORT ? [1080, 1920, 2] : [1440, 810, 1];
const outName = SHORT ? "puzzle-press-short.webm" : "puzzle-press.webm";
const tmp = mkdtempSync(join(tmpdir(), "pp-video-"));
const outDir = new URL("../public/video/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  acceptDownloads: true,
  recordVideo: { dir: tmp, size: { width: W, height: H } },
});
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

// Phone layout for the Short: the page's own ≤800px rules, plus 2× zoom.
const PHONE_CSS = `html{zoom:2} main{grid-template-columns:1fr;padding:16px;gap:16px}
  header .wide-only{display:none} header{padding:14px 16px} .hero{padding:24px 16px 20px}
  .hero-inner{grid-template-columns:1fr;gap:24px} .preview-stick{position:static;padding:0}
  .check,.themes label,button,.btn{min-height:44px}`;
const phone = async () => { if (SHORT) await page.addStyleTag({ content: PHONE_CSS }); };

// A caption bar and a visible cursor, drawn into the page. Headless Chromium
// has no pointer of its own, so the viewer would otherwise see fields change
// with nothing touching them. Fixed elements live inside the zoomed root, so
// the cursor divides the (unzoomed) mouse coordinates by the zoom.
const overlay = () => page.evaluate((z) => {
  if (document.getElementById("__cap")) return;
  const s = document.createElement("style");
  s.textContent = `
    #__cap{position:fixed;left:0;right:0;bottom:0;z-index:99998;display:flex;justify-content:center;pointer-events:none;
      padding:0 16px ${z > 1 ? 60 : 26}px;transition:opacity .25s}
    #__cap span{background:rgba(20,30,50,.92);color:#fff;font:600 ${z > 1 ? 21 : 24}px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
      padding:12px 22px;border-radius:12px;max-width:900px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.25)}
    #__cur{position:fixed;z-index:99999;width:22px;height:22px;margin:-3px 0 0 -3px;pointer-events:none;
      transition:left .12s,top .12s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}`;
  document.head.appendChild(s);
  const cap = document.createElement("div"); cap.id = "__cap"; cap.style.opacity = "0";
  cap.innerHTML = "<span></span>"; document.body.appendChild(cap);
  const cur = document.createElement("div"); cur.id = "__cur";
  cur.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8-6 1.5L9.5 19z" fill="#fff" stroke="#1d3557" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  cur.style.left = "640px"; cur.style.top = "400px"; document.body.appendChild(cur);
  addEventListener("mousemove", (e) => { cur.style.left = e.clientX / z + "px"; cur.style.top = e.clientY / z + "px"; }, true);
}, Z);
const caption = async (text, hold = 0) => {
  await page.evaluate((t) => {
    const c = document.getElementById("__cap");
    if (!c) return;
    c.style.opacity = t ? "1" : "0";
    if (t) c.querySelector("span").textContent = t;
  }, text);
  if (hold) await wait(hold);
};

// Move the pointer to an element like a hand would, then act.
const moveTo = async (sel) => {
  const box = await page.locator(sel).first().boundingBox();
  if (!box) throw new Error(`no box for ${sel}`);
  await page.mouse.move(box.x + Math.min(box.width / 2, 60 * Z), box.y + box.height / 2, { steps: 18 });
  await wait(180);
};
const click = async (sel) => { await moveTo(sel); await page.click(sel); };
const typeInto = async (sel, text) => {
  await click(sel);
  await page.fill(sel, "");
  await page.locator(sel).pressSequentially(text, { delay: 55 });
  await wait(300);
};
const choose = async (sel, value) => { await moveTo(sel); await page.selectOption(sel, value); await wait(300); };
// Scroll the way a person does, so the viewer can follow.
const scrollTo = async (sel, block = "start") => {
  await page.evaluate(([q, b]) => document.querySelector(q).scrollIntoView({ behavior: "smooth", block: b }), [sel, block]);
  await wait(1100);
};
const download = async (sel, name) => {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), click(sel)]);
  const f = join(tmp, name);
  await dl.saveAs(f);
  return f;
};

// ---- 1. The page, as a visitor sees it.
await page.goto(base, { waitUntil: "networkidle" });
// Show it as a paying user sees it, so the pages at the end are clean; the
// end card says what the free tier is.
await page.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "video@example.com", token: "video", verifiedAt: Date.now() })));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".grid div");
await phone();
await overlay();
await wait(600);
await caption("Puzzle Press makes print-ready puzzle books for Amazon KDP — in your browser.", SHORT ? 2600 : 3200);

let pdfPath, coverPath;
if (!SHORT) {
  // ---- 2. Down to the tool: title it, size it.
  await caption("");
  await scrollTo("#tool");
  await caption("Give it a title.", 500);
  await typeInto("#title", "Halloween Word Search");
  await typeInto("#subtitle", "60 spooky puzzles, easy to hard");
  await wait(400);
  await caption("Choose how many puzzles. Page count, printing cost and royalty update as you type.", 500);
  await typeInto("#count", "60");
  await moveTo("#meta");
  await wait(2800);

  // ---- 3. Pick a theme — the preview redraws.
  await caption("Word search draws on 32 themes, or a list you paste. Pick one.", 300);
  await scrollTo(".themes");
  await click(".themes input[value='animals']");
  await wait(500);
  await click(".themes input[value='halloween']");
  await wait(2200);

  // ---- 4. Download — the real thing, in real time.
  await caption("Grade it easy to hard, then download. The whole interior, laid out to KDP's rules.", 300);
  await scrollTo("#download", "center");
  await choose("#difficulty", "graded");
  await wait(500);
  pdfPath = await download("#download", "book.pdf");
  await moveTo("#status");
  await wait(2000);

  // ---- 5. And its cover.
  await caption("Then the cover — spine width worked out from that book's page count.", 400);
  coverPath = await download("#downloadCover", "cover.pdf");
  await wait(2000);

  // ---- 6. Other types, briefly.
  await caption("Same tool for sudoku — every puzzle has exactly one solution.", 300);
  await scrollTo("#tool");
  await choose("#kind", "sudoku");
  await page.waitForSelector(".sudoku div");
  await wait(2600);
  await caption("And mazes — one route through, solutions at the back.", 300);
  await choose("#kind", "maze");
  await page.waitForSelector(".maze svg line", { state: "attached" });
  await wait(2600);
} else {
  // The phone layout stacks form above preview, so the Short scrolls between
  // them and has to fit under 60 seconds — the same steps, fewer pauses.
  await caption("");
  await scrollTo("#tool");
  await caption("Title it. Choose how many puzzles.", 300);
  await typeInto("#title", "Halloween Word Search");
  await typeInto("#subtitle", "60 spooky puzzles, easy to hard");
  await typeInto("#count", "60");
  await wait(600);
  await caption("Pick a theme — 32 built in, or paste your own words.", 300);
  await scrollTo(".themes");
  await click(".themes input[value='animals']");
  await wait(300);
  await click(".themes input[value='halloween']");
  await wait(600);
  await caption("Grade it easy to hard, then download the whole interior.", 300);
  await scrollTo("#download", "center");
  await choose("#difficulty", "graded");
  await wait(300);
  pdfPath = await download("#download", "book.pdf");
  await moveTo("#status");
  await wait(1600);
  await caption("Then the cover — spine sized from that book's page count.", 300);
  coverPath = await download("#downloadCover", "cover.pdf");
  await wait(1600);
}
await caption("");
await wait(300);

// ---- 7. What came out: real pages from the PDF it just made.
const png = (file, pageNo, dpi = 96) => {
  const prefix = join(tmp, `pg${Math.random().toString(36).slice(2, 7)}`);
  execFileSync("pdftoppm", ["-r", String(dpi), "-f", String(pageNo), "-l", String(pageNo), "-png", file, prefix]);
  for (const f of [`${prefix}-${String(pageNo).padStart(2, "0")}.png`, `${prefix}-${pageNo}.png`]) {
    try { return `data:image/png;base64,${readFileSync(f).toString("base64")}`; } catch {}
  }
  throw new Error("no page image");
};
const fontPx = SHORT ? 44 : 26;
const slide = async (imgs, text, wide = false, hold = 3000) => {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${SHORT ? 40 : 22}px;
         background:linear-gradient(160deg,#eef1f6,#e2e7f0);font:600 ${fontPx}px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
    .row{display:flex;gap:26px;align-items:center;justify-content:center;max-width:92%}
    img{max-height:${SHORT ? H - 420 : H - 150}px;max-width:${wide ? 92 : SHORT ? 88 : 40}%;border-radius:4px;background:#fff;box-shadow:0 16px 40px rgba(20,30,50,.22)}
    p{margin:0;text-align:center;max-width:${SHORT ? 900 : 1200}px;padding:0 30px}</style>
    <div class="row">${imgs.map((u) => `<img src="${u}">`).join("")}</div><p>${text}</p>`);
  await wait(hold);
};
if (!SHORT) {
  await slide([png(pdfPath, 1), png(pdfPath, 3)], "Title page, then the puzzles — every word placed exactly once, checked.");
  await slide([png(pdfPath, 40), png(pdfPath, 64)], "Graded easy to hard. Solutions packed at the back.");
  await slide([png(coverPath, 1, 80)], "Full-wrap cover: back, spine and front, bleed included, at KDP's exact size.", true);
} else {
  // 60 puzzles → pages 3–62 are puzzles, solutions from 64.
  await slide([png(pdfPath, 3, 160)], "Every word placed exactly once — checked, not hoped.", false, 2600);
  await slide([png(pdfPath, 64, 160)], "Solutions packed at the back.", false, 2400);
  await slide([png(coverPath, 1, 110)], "Full-wrap cover: back, spine, front, bleed — at KDP's exact size.", true, 2800);
}

// ---- 8. End card.
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
       background:#1d3557;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 40px;box-sizing:border-box}
  h1{font-size:${SHORT ? 88 : 64}px;margin:0 0 ${SHORT ? 20 : 0};letter-spacing:-.02em} p{font-size:${SHORT ? 40 : 28}px;margin:0;color:#c9d3e6;line-height:1.35}
  .u{margin-top:${SHORT ? 50 : 26}px;font-size:${SHORT ? 40 : 34}px;font-weight:700;background:#fff;color:#1d3557;padding:14px 30px;border-radius:14px;word-break:break-all}</style>
  <h1>Puzzle Press</h1>
  <p>Free to use — free books carry a watermark.</p>
  <p>$19, once, removes it. No subscription.</p>
  <div class="u">puzzlepress.bananafest-destiny.com</div>`);
await wait(SHORT ? 3600 : 4200);

await ctx.close();
const src = await page.video().path();
await browser.close();
execFileSync("cp", [src, join(outDir, outName)]);
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote public/video/${outName}`);
