// Kids' sudoku, live: the Grid control appears only for sudoku, 6×6 and 4×4
// previews have the right cell counts and box rules, clue labels follow the
// size, and a 6×6 book downloads valid with its cover.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SUDOKU_DIFFICULTY, givensFor } from "../src/generator/sudoku.js";

const base = (process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
const tmp = mkdtempSync(join(tmpdir(), "pp-kid-"));
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/?kind=wordsearch#tool`, { waitUntil: "networkidle" });
await page.waitForSelector(".grid div");
check(!(await page.isVisible("#sudokuSize")), "Grid control hidden for word search");

await page.selectOption("#kind", "sudoku");
await page.waitForSelector(".sudoku div");
check(await page.isVisible("#sudokuSize"), "Grid control shown for sudoku");
check((await page.$$eval(".sudoku div", (d) => d.length)) === 81, "9×9 by default");

for (const [size, cells] of [["6", 36], ["4", 16]]) {
  await page.selectOption("#sudokuSize", size);
  await page.waitForTimeout(400);
  check((await page.$$eval(".sudoku div", (d) => d.length)) === cells, `${size}×${size} preview has ${cells} cells`);
  const labels = await page.$$eval("#difficulty option", (o) => o.map((x) => x.textContent));
  for (const [k, v] of Object.entries(SUDOKU_DIFFICULTY)) {
    const want = `${v.label} — ${givensFor(v, Number(size))} clues`;
    check(labels.includes(want), `${size}×${size}: difficulty label "${want}" (got ${labels.join(" / ")})`);
  }
  const title = await page.$eval("#page h3", (e) => e.textContent);
  check(title.includes(`${size} × ${size}`), `${size}×${size}: preview title says the size ("${title}")`);
}

// A real 6×6 book and its cover.
await page.selectOption("#sudokuSize", "6");
await page.fill("#count", "24");
await page.selectOption("#difficulty", "graded");
await page.waitForTimeout(400);
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
const pdfPath = join(tmp, "kid.pdf");
await dl.saveAs(pdfPath);
try { execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-dNODISPLAY", "-dPDFSTOPONERROR", pdfPath]); } catch { check(false, "ghostscript clean"); }
const [cd] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#downloadCover")]);
const coverPath = join(tmp, "kid-cover.pdf");
await cd.saveAs(coverPath);
try { execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-dNODISPLAY", "-dPDFSTOPONERROR", coverPath]); } catch { check(false, "cover ghostscript clean"); }

// Back to 9×9 and the control disappears for another type.
await page.selectOption("#sudokuSize", "9");
await page.selectOption("#kind", "maze");
await page.waitForSelector(".maze svg line", { state: "attached" });
check(!(await page.isVisible("#sudokuSize")), "Grid control hidden again for mazes");
check(errors.length === 0, `page errors: ${errors.join("; ")}`);

await browser.close();
rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("KIDS SUDOKU OK — 6×6 and 4×4 previews, labels and a graded 6×6 book with cover");
