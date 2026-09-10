// Record public/demo.gif — a short loop of the real app making a real book,
// ending on pages from the PDF it produced. Shareable anywhere a GIF works.
//
// Usage: node scripts/demo.mjs [baseUrl]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;

const base = process.argv[2] || "http://127.0.0.1:8788";
const W = 900, H = 620;
const tmp = mkdtempSync(join(tmpdir(), "pp-demo-"));
const frames = []; // { png: Buffer, ms }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, acceptDownloads: true, deviceScaleFactor: 1 });

const shoot = async (ms = 900) => frames.push({ png: await page.screenshot(), ms });

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector(".grid div");

// 1. Land on the tool itself.
await page.evaluate(() => document.getElementById("tool").scrollIntoView());
await page.waitForTimeout(400);
await shoot(1400);

// 2. Title it.
await page.fill("#title", "Christmas Word Search");
await page.fill("#subtitle", "60 festive puzzles with solutions");
await page.waitForTimeout(500);
await shoot(1000);

// 3. Pick a theme — the preview redraws.
await page.uncheck(".themes input[value='animals']");
await page.check(".themes input[value='christmas']");
await page.waitForTimeout(700);
await shoot(1200);

// 4. Make it a real-sized book.
await page.fill("#count", "60");
await page.selectOption("#difficulty", "hard");
await page.waitForTimeout(700);
await shoot(1200);

// 5. Download, and catch the file.
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
const pdfPath = join(tmp, "demo.pdf");
await dl.saveAs(pdfPath);
await page.waitForTimeout(300);
await shoot(1600);

await browser.close();

// 6. Finish on real pages from the PDF it just made.
const shots = await chromium.launch();
const viewer = await shots.newPage({ viewport: { width: W, height: H } });
for (const [pageNo, caption] of [[3, "Every puzzle unique"], [4, "Solutions included"]]) {
  const prefix = join(tmp, `pg${pageNo}`);
  execFileSync("pdftoppm", ["-r", "110", "-f", String(pageNo), "-l", String(pageNo), "-png", pdfPath, prefix]);
  const file = `${prefix}-0${pageNo}.png`;
  const uri = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  await viewer.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;height:${H}px;display:flex;align-items:center;justify-content:center;gap:34px;
         background:linear-gradient(160deg,#eef1f6,#e2e7f0);font:600 26px system-ui,sans-serif;color:#1d3557}
    img{height:${H - 70}px;border-radius:4px;background:#fff;box-shadow:0 16px 40px rgba(20,30,50,.22)}
    span{max-width:9em}</style><img src="${uri}"><span>${caption}</span>`);
  await viewer.waitForTimeout(250);
  frames.push({ png: await viewer.screenshot(), ms: 1800 });
}
await shots.close();

// Encode.
const gif = GIFEncoder();
for (const { png, ms } of frames) {
  const { data, width, height } = PNG.sync.read(png);
  const palette = quantize(data, 256);
  gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: ms });
}
gif.finish();
writeFileSync(new URL("../public/demo.gif", import.meta.url).pathname, Buffer.from(gif.bytes()));
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote public/demo.gif — ${frames.length} frames`);
