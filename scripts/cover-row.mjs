// public/cover-row.webp (+ .jpg fallback): the front panels of the sample
// covers side by side, for the landing page. Cropped from the same PDFs the
// sample links serve, so the picture is exactly what the links open. Rerun
// after `node scripts/sample.mjs` whenever the cover design changes.
// Needs pdftoppm (poppler-utils) and Playwright's chromium.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { TRIMS } from "../src/pdf/kdp.js";
import { BLEED_IN } from "../src/pdf/cover-geometry.js";

export const COVERS = [
  ["sample-cover-6x9.pdf", "6x9", "Word search"],
  ["sample-sudoku-cover-6x9.pdf", "6x9", "Sudoku"],
  ["sample-large-print-cover-8.5x11.pdf", "8.5x11", "Large print word search"],
  ["sample-crossword-cover-6x9.pdf", "6x9", "Crosswords"],
  ["sample-maze-cover-6x9.pdf", "6x9", "Mazes"],
];
const DPI = 60;
const tmp = mkdtempSync(join(tmpdir(), "pp-row-"));
const dir = new URL("../public/", import.meta.url).pathname;
const fronts = [];
for (const [file, trim] of COVERS) {
  const path = join(dir, "samples", file);
  const { width, height } = (await PDFDocument.load(readFileSync(path))).getPage(0).getSize();
  const px = (pt) => Math.round((pt / 72) * DPI);
  const t = TRIMS[trim], b = BLEED_IN * 72;
  const x = px(width - b - t.w * 72), y = px(b), w = px(t.w * 72), h = px(height - 2 * b);
  const prefix = join(tmp, file);
  execFileSync("pdftoppm", ["-r", String(DPI), "-png", "-singlefile", "-x", String(x), "-y", String(y), "-W", String(w), "-H", String(h), path, prefix]);
  fronts.push(`data:image/png;base64,${readFileSync(prefix + ".png").toString("base64")}`);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 420 } });
// Same bottom edge for every book; the large-print one stands taller, as it would on a shelf.
await page.setContent(`<style>body{margin:0;background:transparent}
  .row{display:flex;gap:22px;align-items:flex-end;justify-content:center;padding:18px 20px 26px;width:1160px}
  img{height:300px;box-shadow:0 12px 28px rgba(20,30,50,.25),0 2px 5px rgba(20,30,50,.15);border-radius:2px}
  img.tall{height:346px}</style><div class="row">${fronts.map((s, i) => `<img class="${COVERS[i][1] === "8.5x11" ? "tall" : ""}" src="${s}">`).join("")}</div>`);
await page.waitForTimeout(200);
const shot = await page.locator(".row").screenshot({ omitBackground: true, type: "png" });
const enc = await page.evaluate(async (uri) => {
  const img = new Image(); img.src = uri; await img.decode();
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const webp = c.toDataURL("image/webp", 0.82);
  g.globalCompositeOperation = "destination-over"; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  const strip = (d) => d.slice(d.indexOf(",") + 1);
  return { w: c.width, h: c.height, webp: strip(webp), jpeg: strip(c.toDataURL("image/jpeg", 0.84)) };
}, `data:image/png;base64,${shot.toString("base64")}`);
await browser.close();
writeFileSync(join(dir, "cover-row.webp"), Buffer.from(enc.webp, "base64"));
writeFileSync(join(dir, "cover-row.jpg"), Buffer.from(enc.jpeg, "base64"));
rmSync(tmp, { recursive: true, force: true });
console.log(`cover-row ${enc.w}x${enc.h}: webp ${Math.round(enc.webp.length * 0.75 / 1024)} KB, jpeg ${Math.round(enc.jpeg.length * 0.75 / 1024)} KB`);
