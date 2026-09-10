// Build the marketing images from the real generated book, not a mockup:
//   public/hero-book.png    — a puzzle page beside its solutions page
//   public/social-card.png  — 1200x630 Open Graph / Twitter card
//
// Needs pdftoppm (poppler-utils) and Playwright's chromium.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const pdf = new URL("../public/samples/sample-6x9.pdf", import.meta.url).pathname;
const outDir = new URL("../public/", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "pp-img-"));

function pageDataUri(page, dpi = 150) {
  const prefix = join(tmp, `p${page}`);
  execFileSync("pdftoppm", ["-r", String(dpi), "-f", String(page), "-l", String(page), "-png", pdf, prefix]);
  const padded = String(page).padStart(2, "0");
  const file = [`${prefix}-${padded}.png`, `${prefix}-${page}.png`].find((f) => {
    try { readFileSync(f); return true; } catch { return false; }
  });
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

const puzzle = pageDataUri(5);
const solution = pageDataUri(24);

const shell = (body, css) => `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1a1a}
  ${css}</style>${body}`;

const browser = await chromium.launch();

// --- hero: two pages, gently angled, on a soft ground ---
const hero = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1.5 });
await hero.setContent(shell(
  `<div class="stage"><img class="a" src="${puzzle}"><img class="b" src="${solution}"></div>`,
  `body{background:linear-gradient(160deg,#eef1f6 0%,#e2e7f0 100%)}
   .stage{position:relative;width:1000px;height:700px;overflow:hidden}
   img{position:absolute;border-radius:4px;background:#fff;box-shadow:0 18px 40px rgba(20,30,50,.22),0 2px 6px rgba(20,30,50,.12)}
   .a{width:392px;left:126px;top:34px;transform:rotate(-3.5deg);z-index:2}
   .b{width:366px;right:124px;top:80px;transform:rotate(4deg);z-index:1}`,
));
await hero.waitForTimeout(300);
await hero.screenshot({ path: join(outDir, "hero-book.png") });

// --- social card: headline + one page ---
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.setContent(shell(
  `<div class="wrap">
     <div class="copy">
       <div class="kicker">Puzzle Press</div>
       <h1>Word search books,<br>ready for KDP.</h1>
       <p>Puzzles, word banks and solutions laid out as one print-ready PDF — correct trim, gutter margins and embedded fonts.</p>
       <div class="tag">puzzlepress.bananafest-destiny.com</div>
     </div>
     <div class="shot"><img src="${puzzle}"></div>
   </div>`,
  `body{background:#1d3557;color:#fff}
   .wrap{display:flex;width:1200px;height:630px;align-items:center;gap:48px;padding:0 64px}
   .copy{flex:1}
   .kicker{font-size:20px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#93a7c4;margin-bottom:18px}
   h1{font-size:60px;line-height:1.08;letter-spacing:-.02em;margin:0 0 20px}
   p{font-size:22px;line-height:1.45;color:#c6d2e4;margin:0 0 28px;max-width:22em}
   .tag{display:inline-block;font-size:19px;font-weight:600;color:#1d3557;background:#fff;padding:9px 16px;border-radius:7px}
   .shot{flex:0 0 360px;display:flex;justify-content:center}
   .shot img{width:360px;border-radius:6px;box-shadow:0 22px 50px rgba(0,0,0,.4);transform:rotate(3deg)}`,
));
await card.waitForTimeout(300);
await card.screenshot({ path: join(outDir, "social-card.png") });

await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log("wrote public/hero-book.png and public/social-card.png");
