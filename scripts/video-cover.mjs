// The cover, which is the part people get wrong and the part Amazon rejects.
//
// Why a fourth film: the three already published cover the generator, the five
// puzzle types and the royalty calculator. None of them is titled for the
// question people actually type, which is some form of "how wide is the spine"
// or "KDP cover template". Buffer will only post vertical video to YouTube —
// it rejects a 1440x810 upload as "must be vertical for Shorts" — so this is
// rendered 9:16 like the others and there is no landscape cut worth making.
//
// The shape is the same as video-calc.mjs on purpose: a free utility somebody
// arrived at from a search, then the one-click handoff into the tool, then the
// real file it produced. The one new beat is switching the paper stock and
// letting the spine number move on camera, because that is the whole argument
// for using a calculator instead of a number somebody posted on a forum.
//
//   node scripts/video-cover.mjs          → public/video/cover.webm (1440x810)
//   node scripts/video-cover.mjs --short  → public/video/cover-short.webm (1080x1920)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const SHORT = process.argv.includes("--short");
const base = process.argv.find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com";
const [W, H, Z] = SHORT ? [1080, 1920, 2] : [1440, 810, 1];
const outName = SHORT ? "cover-short.webm" : "cover.webm";
const tmp = mkdtempSync(join(tmpdir(), "pp-cover-"));
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
// Two documents in one film. Style the phone layout before first paint so the
// second page never appears as undressed desktop while it loads — the same
// mistake video-calc.mjs had in its first cut.
if (SHORT) {
  await ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
  }, PHONE_CSS);
}
const dress = async () => { await overlay(); };

// --- the spine calculator, used the way somebody off a search uses it -------
await page.goto(`${base}/spine-calculator`, { waitUntil: "networkidle" });
await dress();
await wait(400);
await caption("A free KDP spine width calculator. Amazon's own formula.", 2400);
await page.selectOption("#trim", "6x9");
await page.fill("#pages", "120");
await page.selectOption("#paper", "white");
await wait(1200);
await caption("Spine width and the full wrap size, ready for the cover template.", 2400);
// The paper stock is the part a forum answer gets wrong: cream is thicker than
// white, so the same page count is a different spine. Let the number move.
await page.selectOption("#paper", "cream");
await wait(900);
await caption("Cream paper is thicker than white — same book, different spine.", 2600);
await caption("");

// The one thing on this page nobody else says. It is the reason the page was
// written and it is checkable against Amazon's own "Create a Paperback Cover"
// help page, so it leads the description too.
await scrollTo(".warnbox", "center");
await caption("Several top-ranking calculators add 0.06\" to a paperback spine.", 2800);
await caption("Amazon's own formula adds nothing. That 0.06\" gets covers rejected.", 3000);
await caption("");

await scrollTo(".cta", "center");
await caption("Then it makes the cover, with that exact spine.", 2200);
await caption("");
const href = await page.$eval("#makeBtn", (a) => a.getAttribute("href"));
await caption("Same trim. Same page count. Same paper.");
await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
// A watermark-free cover, the way a buyer's is — same as the other three films.
await page.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "video@example.com", token: "video", verifiedAt: Date.now() })));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".grid div");
await dress();
await scrollTo(SHORT ? ".preview-stick" : "#tool");
await caption("Same trim. Same page count. Same paper. Nothing re-typed.", 2600);
await caption("");
await scrollTo("#tool");
await page.fill("#title", "Halloween Word Search");
await wait(900);
await caption("A title, and the cover comes out as a print-ready PDF.", 1400);
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#downloadCover")]);
const pdf = join(tmp, "cover.pdf");
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
// A wraparound cover is one very wide page, so it wants the full width rather
// than the portrait-page sizing the other films use.
const slide = async (imgs, text, hold) => {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${SHORT ? 46 : 26}px;
         background:linear-gradient(160deg,#eef1f6,#e2e7f0);font:600 ${fontPx}px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d3557}
    img{max-width:${SHORT ? 94 : 78}%;max-height:${SHORT ? H - 520 : H - 220}px;border-radius:4px;background:#fff;box-shadow:0 16px 40px rgba(20,30,50,.22)}
    p{margin:0;text-align:center;max-width:${SHORT ? 900 : 1200}px;padding:0 30px}</style>
    ${imgs.map((u) => `<img src="${u}">`).join("")}<p>${text}</p>`);
  await wait(hold);
};
await slide([png(pdf, 1, dpi)], "The full wrap it just made — back, spine and front", 3000);

await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${SHORT ? 30 : 16}px;background:#f4f6fa;color:#1d3557;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:0 40px;box-sizing:border-box}
  h2{font-size:${SHORT ? 60 : 42}px;margin:0 0 ${SHORT ? 16 : 10}px;letter-spacing:-.02em}
  div.c{font-size:${SHORT ? 42 : 30}px;font-weight:700;background:#fff;padding:${SHORT ? 20 : 14}px ${SHORT ? 30 : 26}px;border-radius:14px;box-shadow:0 8px 24px rgba(20,30,50,.10)}
  p{font-size:${SHORT ? 32 : 24}px;margin:${SHORT ? 20 : 12}px 0 0;color:#5c6470}</style>
  <h2>Sized from the page count, every time</h2>
  <div class="c">Spine width &amp; full cover size</div><div class="c">Bleed and inside margin</div><div class="c">Barcode space left clear</div>
  <p>Free, no sign-up. The calculator opens the generator with your book already set up.</p>`);
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
