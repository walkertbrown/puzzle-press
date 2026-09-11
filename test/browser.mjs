// End-to-end check in a real browser: load the page, make a free-tier book,
// then a licensed 60-puzzle book, and verify both downloads are valid PDFs.
// Run: node test/browser.mjs [baseUrl]   (default http://127.0.0.1:8787)
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] || "http://127.0.0.1:8787";
const out = new URL("../samples/browser/", import.meta.url);
mkdirSync(out, { recursive: true });

// HOST_MAP="example.com 1.2.3.4" pins DNS for the run — useful right after a
// custom domain is created, while a local resolver still has the old answer.
const browser = await chromium.launch({
  args: process.env.HOST_MAP ? [`--host-resolver-rules=MAP ${process.env.HOST_MAP}`] : [],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// Expected: /api/verify answers 4xx/5xx for unknown emails; that is not a page error.
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

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

// 1. Free tier: ask for 50, get the free limit, watermark on.
await page.fill("#count", "50");
await page.fill("#author", "Browser Test");
const free = await downloadPdf("free.pdf");
const freePdf = await PDFDocument.load(await (await import("node:fs")).promises.readFile(free.path));
console.log("free:", free.filename, free.status, "pages", freePdf.getPageCount());
// This once asserted exactly 24 pages, which encoded the padding bug as
// correct: a 5-puzzle book reached 24 only because 15 were blank. The free
// tier now makes a genuine 12-puzzle book, so 24 pages is right again — but
// for the opposite reason, and it must be mostly content.
const freePages = freePdf.getPageCount();
if (freePages < 24 || freePages > 30) {
  throw new Error(`a free book should be a real KDP-length book, got ${freePages} pages`);
}

// 1b. Unlock dialog: shows the Buy link when the Worker injected a pay URL,
// and a wrong email is refused without breaking the page.
const payUrl = await page.evaluate(() => window.PUZZLE_PRESS_PAY_URL || "");
await page.click("#unlockLink");
await page.waitForSelector("#unlockDialog[open]");
const buyLine = await page.textContent("#buyLine");
console.log("pay url:", JSON.stringify(payUrl), "| dialog:", buyLine.trim());
if (payUrl && !(await page.$("#buyLine a"))) throw new Error("Buy link missing although pay URL is set");
await page.fill("#email", "nobody@example.com");
await page.click("#verify");
await page.waitForFunction(() => document.getElementById("unlockErr").textContent.length > 0);
console.log("verify(nobody):", await page.textContent("#unlockErr"));
await page.click("#closeDialog");

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
