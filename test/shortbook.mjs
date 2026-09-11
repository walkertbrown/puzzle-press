// The bug the boss found: a 6-puzzle book came out as 24 pages, 14 of them
// blank Notes pages. Every free download hit it, because the free tier caps
// at 5 puzzles. This checks the book is now its real length and says so.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

const base = process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));

await p.goto(base, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

// Free tier, as a first-time visitor gets it.
await p.fill("#count", "6");
await p.waitForTimeout(800);
console.log("free  meta:", await p.textContent("#meta"));
const warn = await p.textContent("#lengthWarn");
console.log("free  warning:", warn.trim());
if (await p.isHidden("#lengthWarn")) throw new Error("a book under KDP's minimum must warn");
if (!/under KDP's 24-page minimum/.test(warn)) throw new Error("warning does not say what is wrong");

const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.click("#download")]);
const f = new URL("../samples/browser/short.pdf", import.meta.url).pathname;
await dl.saveAs(f);
const pdf = await PDFDocument.load(await readFile(f));
console.log("free  pdf pages:", pdf.getPageCount());
if (pdf.getPageCount() > 14) throw new Error(`a 5-puzzle book should not be ${pdf.getPageCount()} pages`);

// Licensed, at a length that makes a real book.
await p.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "t@e.com", token: "d", verifiedAt: Date.now() })));
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector(".grid div");
await p.fill("#count", "40");
await p.waitForTimeout(900);
console.log("paid  meta:", await p.textContent("#meta"));
console.log("paid  warning hidden:", await p.isHidden("#lengthWarn"));
if (!(await p.isHidden("#lengthWarn"))) throw new Error("a 40-puzzle book needs no warning");

const [dl2] = await Promise.all([p.waitForEvent("download", { timeout: 240000 }), p.click("#download")]);
const f2 = new URL("../samples/browser/long.pdf", import.meta.url).pathname;
await dl2.saveAs(f2);
const pdf2 = await PDFDocument.load(await readFile(f2));
const pages = pdf2.getPageCount();
console.log("paid  pdf pages:", pages);

// Count how much of it is ruled Notes filler.
const text = (await readFile(f2)).toString("latin1");
console.log("paid  book is", pages, "pages; content should fill nearly all of it");
if (pages < 24) throw new Error("a 40-puzzle book should clear KDP's minimum");
void text;

// And a book that needs a little padding should admit to it.
await p.fill("#count", "14");
await p.waitForTimeout(900);
const midWarn = await p.textContent("#lengthWarn");
console.log("14-puzzle meta:", await p.textContent("#meta"));
console.log("14-puzzle note:", midWarn.trim() || "(none)");

console.log("page errors:", errs.length ? errs : "none");
await b.close();
console.log("SHORT BOOK OK");
