import * as playwright from "playwright";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { pdfText, COVER_MARK } from "./pdftext.mjs";
// Args in any order: a base URL and/or an engine. The cover is drawn to a
// canvas and embedded, which is the most engine-dependent thing the app does.
const args = process.argv.slice(2);
const base = args.find((a) => /^https?:\/\//.test(a)) || "https://puzzlepress.bananafest-destiny.com";
const ENGINE = args.find((a) => ["chromium", "firefox", "webkit"].includes(a)) || "chromium";
const b = await playwright[ENGINE].launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
await p.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
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

// The mark must actually be in the file. This used to grep the bytes, find
// nothing — the font is subset, so the word is glyph ids in a compressed
// stream — and print "checked visually instead", which meant it was not
// checked by anything. Ask an extractor.
const freeText = await pdfText(f);
if (!freeText.includes(COVER_MARK)) {
  throw new Error(`the free cover carries no PREVIEW mark — it is a sellable cover being given away. Extracted: ${JSON.stringify(freeText.slice(0, 200))}`);
}
console.log("free cover is marked:", JSON.stringify(freeText.replace(/\s+/g, " ").trim().slice(0, 80)));

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
// The mark is gone. File size was standing in for this and is a bad proxy —
// it would also have passed if the two covers differed by a stray whitespace.
const paidText = await pdfText(f2);
if (paidText.includes(COVER_MARK)) throw new Error("the paid cover still carries the PREVIEW mark");
if (!/Halloween/i.test(paidText)) throw new Error("the extractor read nothing from the paid cover, so 'no mark' proves nothing");
console.log("paid cover is clean; sizes", bytes.length, "free vs", paid.length, "paid");
if (await p.isVisible("#unlockDialog")) throw new Error("paid users should not get the unlock dialog");
console.log("page errors:", errs.length ? errs : "none");
await b.close();
console.log(`FREE COVER OK — ${ENGINE}`);
