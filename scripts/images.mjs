// Build the marketing images from the real generated book, not a mockup:
//   public/hero-book.webp   — a puzzle page beside its solutions page (jpg fallback)
//   public/social-card.png  — 1200x630 Open Graph / Twitter card
//   public/thumbnail.png    — 512x512 square mark, for the Product Hunt feed row
//
// Needs pdftoppm (poppler-utils) and Playwright's chromium.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
// JPEG, not PNG: this is a photographic composition on a gradient and the
// PNG was 520 KB — the single heaviest thing on the page, above the fold.
await hero.screenshot({ path: join(outDir, "hero-book.jpg"), type: "jpeg", quality: 86 });

// That JPEG came out 1500px wide and 226 KB — about 90% of the page's weight
// and 660 ms of the 987 ms to first puzzle on a throttled phone. Nothing ever
// displays it wider than ~1100 device pixels, so re-encode at 1200 and offer
// WebP first. Chromium's canvas does both, so there is no new dependency, and
// the JPEG stays as the <picture> fallback.
const source = `data:image/jpeg;base64,${readFileSync(join(outDir, "hero-book.jpg")).toString("base64")}`;
const encoded = await hero.evaluate(async (uri) => {
  const img = new Image();
  img.src = uri;
  await img.decode();
  const w = 1200, h = Math.round((img.naturalHeight / img.naturalWidth) * 1200);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  const strip = (d) => d.slice(d.indexOf(",") + 1);
  return { w, h, webp: strip(c.toDataURL("image/webp", 0.8)), jpeg: strip(c.toDataURL("image/jpeg", 0.85)) };
}, source);
writeFileSync(join(outDir, "hero-book.webp"), Buffer.from(encoded.webp, "base64"));
writeFileSync(join(outDir, "hero-book.jpg"), Buffer.from(encoded.jpeg, "base64"));
console.log(`hero ${encoded.w}x${encoded.h}: webp ${Math.round(Buffer.from(encoded.webp, "base64").length / 1024)} KB, jpeg ${Math.round(Buffer.from(encoded.jpeg, "base64").length / 1024)} KB`);

// --- Product Hunt thumbnail: square, and it has to read at 48px ---
//
// Product Hunt asks for a square and recommends 240x240, but in the feed the
// row is nearer 48px, and in a comment list smaller still. The first version
// of this was a crop of a real printed page — which is what every other image
// here is, and the right instinct — and at 48px it was a grey square. I put it
// beside the name and tagline at 96, 64, 48 and 36px and looked: fifteen
// letters across a 48px square is three pixels a letter. Photographic detail
// cannot survive that, so this one is a drawn mark rather than product output.
// Four cells of a solved word search, the found word shaded the way the
// solutions pages shade answers. At full size it is legibly a word search; at
// 48px it is a white page with a dark diagonal, which is the same idea.
// WORD down the diagonal; the other twelve letters are filler chosen so no
// row, column or diagonal spells anything — the same rule the generator's own
// filler pass enforces.
const GRID = [
  ["W", "J", "V", "K"],
  ["T", "O", "B", "H"],
  ["X", "M", "R", "L"],
  ["P", "Q", "Z", "D"],
];
const thumb = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await thumb.setContent(shell(
  `<div class="page"><div class="grid">${GRID.map((row, y) =>
    row.map((ch, x) => `<div class="${x === y ? "hit" : ""}">${ch}</div>`).join(""),
  ).join("")}</div></div>`,
  `body{background:#1d3557;display:flex;align-items:center;justify-content:center;height:512px}
   .page{width:412px;height:412px;background:#fff;border-radius:30px;padding:26px;
         box-shadow:0 18px 46px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.3)}
   .grid{display:grid;grid-template-columns:repeat(4,1fr);width:100%;height:100%}
   .grid div{display:flex;align-items:center;justify-content:center;font-size:64px;font-weight:700;
             letter-spacing:.01em;color:#1a1a1a;border-radius:12px}
   .hit{background:#1d3557;color:#fff}`,
));
await thumb.waitForTimeout(300);
await thumb.screenshot({ path: join(outDir, "thumbnail.png") });

// --- social card: headline + one page ---
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.setContent(shell(
  `<div class="wrap">
     <div class="copy">
       <div class="kicker">Puzzle Press</div>
       <h1>Word search books,<br>ready for KDP.</h1>
       <p>Interior and cover, print-ready. Correct trim, gutter margins, embedded fonts, and a spine measured to your page count.</p>
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
console.log("wrote public/hero-book.webp, public/hero-book.jpg, public/thumbnail.png and public/social-card.png");
