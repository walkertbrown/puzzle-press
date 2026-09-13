// Crosswords, live: pick the type (clues load lazily), the preview shows
// numbered cells and clue lists, a pasted "word — clue" list is honoured,
// a graded book downloads valid, and so does its cover.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planPages, solutionsThatFit, solutionsPerPageFor } from "../src/pdf/layout.js";
import { pageGeometry } from "../src/pdf/kdp.js";

const base = (process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
const tmp = mkdtempSync(join(tmpdir(), "pp-xw-"));
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const requests = [];
page.on("request", (r) => requests.push(r.url()));

await page.goto(`${base}/?kind=crossword#tool`, { waitUntil: "networkidle" });
await page.waitForSelector(".crisscross .cell i");
check((await page.$eval("#kind", (e) => e.value)) === "crossword", "kind selected");
check(requests.some((u) => /\/js\/clues-/.test(u)), "clue table fetched lazily");
const acrossCount = await page.$$eval(".clues div div", (ds) => ds.length);
check(acrossCount >= 8, `preview shows clues (${acrossCount})`);
const firstClue = await page.$eval(".clues div div", (d) => d.textContent);
check(/^\d+\. .+ \(\d+\)$/.test(firstClue), `clue format "${firstClue}"`);

// A pasted list with clues, and one word without one.
await page.uncheck(".themes input[value='animals']");
await page.fill("#custom", "harbor — Sheltered place for ships\nreef: Ridge of coral near the surface\nanchor - Heavy hook that holds a ship\ntide — Twice-daily rise and fall\nlighthouse — Tower that warns ships\nzorblat");
await page.fill("#customTitle", "Coast");
await page.waitForTimeout(600);
const warn = await page.$eval("#warnings", (e) => e.textContent);
check(/zorblat/.test(warn), `unclued pasted word reported: "${warn.slice(0, 80)}"`);
const clueText = await page.$$eval(".clues div div", (ds) => ds.map((d) => d.textContent).join(" | "));
check(/Sheltered place for ships|Ridge of coral|Heavy hook|Twice-daily|Tower that warns/.test(clueText), "own clues used in the preview");

// Back to a theme, graded book, download + cover.
await page.fill("#custom", "");
await page.check(".themes input[value='garden']");
await page.fill("#count", "24");
await page.selectOption("#difficulty", "graded");
await page.waitForTimeout(500);
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
const pdfPath = join(tmp, "xw.pdf");
await dl.saveAs(pdfPath);
const doc = await PDFDocument.load(await fs.readFile(pdfPath));
const want = planPages(24, solutionsPerPageFor(24, solutionsThatFit(pageGeometry({ trim: "6x9" })))).total;
check(doc.getPageCount() === want, `pages ${doc.getPageCount()} = ${want}`);
try { execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-dNODISPLAY", "-dPDFSTOPONERROR", pdfPath]); } catch { check(false, "ghostscript clean"); }
const [cd] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#downloadCover")]);
const coverPath = join(tmp, "cover.pdf");
await cd.saveAs(coverPath);
try { execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-dNODISPLAY", "-dPDFSTOPONERROR", coverPath]); } catch { check(false, "cover ghostscript clean"); }
check(errors.length === 0, `page errors: ${errors.join("; ")}`);
await browser.close();
rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log(`CROSSWORD LIVE OK — ${want}-page graded book and cover valid; own clues honoured; unclued word reported`);
