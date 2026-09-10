// End-to-end check in a real browser: load the page, make a free-tier book,
// then a licensed 60-puzzle book, and verify both downloads are valid PDFs.
// Run: node test/browser.mjs [baseUrl]   (default http://127.0.0.1:8787)
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8787";
const out = new URL("../samples/browser/", import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector(".grid div");
await page.screenshot({ path: new URL("ui-desktop.png", out).pathname, fullPage: true });

async function downloadPdf(name) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click("#download")]);
  const path = new URL(name, out).pathname;
  await dl.saveAs(path);
  const status = await page.textContent("#status");
  return { path, status, filename: dl.suggestedFilename() };
}

// 1. Free tier: ask for 50, get 5, watermark on.
await page.fill("#count", "50");
await page.fill("#author", "Browser Test");
const free = await downloadPdf("free.pdf");
const freePdf = await PDFDocument.load(await (await import("node:fs")).promises.readFile(free.path));
console.log("free:", free.filename, free.status, "pages", freePdf.getPageCount());
if (freePdf.getPageCount() !== 24) throw new Error("free-tier book should be 24 pages");

// 2. Licensed: fake a licence record in localStorage, 60 puzzles, hard, 8.5x11, custom words.
await page.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "test@example.com", token: "dev", verifiedAt: Date.now() })));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".grid div");
const tier = await page.textContent("#tier");
if (!tier.includes("Unlocked")) throw new Error("licence not recognised: " + tier);
await page.selectOption("#trim", "8.5x11");
await page.selectOption("#difficulty", "hard");
await page.fill("#count", "60");
await page.fill("#custom", "apple, banana, cherry, dragonfruit, elderberry, fig, grape, honeydew, kiwi, lemon, mango, nectarine, orange, papaya, quince, raspberry, strawberry, tangerine, watermelon");
await page.fill("#customTitle", "Fruit Bowl");
await page.waitForTimeout(400);
const warnings = await page.textContent("#warnings");
const licensed = await downloadPdf("licensed.pdf");
const licPdf = await PDFDocument.load(await (await import("node:fs")).promises.readFile(licensed.path));
console.log("licensed:", licensed.filename, licensed.status, "pages", licPdf.getPageCount(), "warnings:", JSON.stringify(warnings));
if (licPdf.getPage(0).getWidth() !== 612) throw new Error("expected 8.5x11 page");

// 3. Phone width renders without horizontal overflow.
await page.setViewportSize({ width: 400, height: 800 });
await page.waitForTimeout(200);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
await page.screenshot({ path: new URL("ui-phone.png", out).pathname, fullPage: true });
if (overflow) throw new Error("horizontal overflow at 400px");

await browser.close();
if (errors.length) {
  console.error("Browser errors:", errors);
  process.exit(1);
}
console.log("browser test OK");
