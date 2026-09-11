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

await browser.close();
console.log("wrote public/gallery/04-the-tool.png and 05-solutions.png");
