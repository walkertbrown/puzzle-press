// Big grids, live: a 30×30 word search typed into a 5×8 book has to put one
// answer a page to keep its letters at KDP's 7 pt (layout.js), and the page
// count the tool shows before download, the PDF, and the cover's spine must
// all say the same number. Added 2026-09-27, when the answer pages started
// stepping down by grid size.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planPages } from "../src/pdf/layout.js";
import { coverGeometry } from "../src/pdf/cover-geometry.js";

const base = (process.argv[2] || "https://puzzlepress.bananafest-destiny.com").replace(/\/$/, "");
const tmp = mkdtempSync(join(tmpdir(), "pp-big-"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, userAgent: "puzzle-press-test/biggrid" });
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/#tool`, { waitUntil: "networkidle" });
await page.selectOption("#trim", "5x8");
await page.fill("#count", "20");
await page.fill("#size", "30");
await page.waitForTimeout(800);
const meta = await page.$eval("#meta", (e) => e.textContent);
const shown = Number(meta.match(/(\d+) pages/)?.[1]);
const want = planPages(20, 1).total;
if (shown !== want) throw new Error(`the tool shows ${shown} pages ("${meta}"), one answer a page makes ${want}`);

const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
const pdfPath = join(tmp, "book.pdf");
await dl.saveAs(pdfPath);
const pages = (await PDFDocument.load(readFileSync(pdfPath))).getPageCount();
if (pages !== shown) throw new Error(`PDF has ${pages} pages, the tool said ${shown}`);

const [cd] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#downloadCover")]);
const coverPath = join(tmp, "cover.pdf");
await cd.saveAs(coverPath);
const cover = (await PDFDocument.load(readFileSync(coverPath))).getPage(0).getSize();
const paper = await page.$eval("#paper", (e) => e.value);
const g = coverGeometry({ trim: "5x8", pageCount: pages, paper });
if (Math.abs(cover.width - g.width) > 0.01) throw new Error(`cover is ${cover.width}pt wide, a ${pages}-page ${paper} book needs ${g.width}pt`);
await browser.close();
rmSync(tmp, { recursive: true, force: true });
if (errors.length) throw new Error(errors.join("\n"));
console.log(`BIG GRID LIVE OK — 30×30 on 5×8: tool says ${shown} pages, PDF has ${pages}, cover spine sized for ${pages}`);
