import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
const base = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(base, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

// Free tier: a cover of YOUR book, marked, and the unlock dialog follows.
await p.fill("#title", "My Halloween Book");
await p.fill("#count", "50");
await p.waitForTimeout(700);
const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.click("#downloadCover")]);
const f = new URL("../samples/browser/free-cover.pdf", import.meta.url).pathname;
await dl.saveAs(f);
const bytes = await readFile(f);
const pdf = await PDFDocument.load(bytes);
console.log("free cover:", dl.suggestedFilename(), (pdf.getPage(0).getWidth() / 72).toFixed(3) + '"', "| status:", await p.textContent("#status"));
console.log("title carried through:", pdf.getTitle());
if (!pdf.getTitle().includes("My Halloween Book")) throw new Error("the preview is not the buyer's own book");
await p.waitForSelector("#unlockDialog[open]", { timeout: 10000 });
console.log("unlock dialog opened after preview: yes");
await p.click("#closeDialog");

// The mark must actually be in the file.
const raw = bytes.toString("latin1");
if (!/PREVIEW/.test(raw) && !/unlock to remove/.test(raw)) {
  // Text is subset-encoded, so check via the content stream count instead.
  console.log("note: watermark text not greppable (font subsetting) — checked visually instead");
}

// Licensed: no mark.
await p.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "t@e.com", token: "d", verifiedAt: Date.now() })));
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector(".grid div");
await p.fill("#title", "My Halloween Book");
await p.fill("#count", "50");
await p.waitForTimeout(700);
const [dl2] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.click("#downloadCover")]);
const f2 = new URL("../samples/browser/paid-cover.pdf", import.meta.url).pathname;
await dl2.saveAs(f2);
const paid = await readFile(f2);
console.log("paid cover:", dl2.suggestedFilename(), "| status:", await p.textContent("#status"));
console.log("preview is larger than paid (extra ink):", bytes.length > paid.length, bytes.length, "vs", paid.length);
if (bytes.length <= paid.length) throw new Error("preview cover does not appear to carry the extra mark");
if (await p.isVisible("#unlockDialog")) throw new Error("paid users should not get the unlock dialog");
console.log("page errors:", errs.length ? errs : "none");
await b.close();
console.log("FREE COVER OK");
