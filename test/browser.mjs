// End-to-end check in a real browser: load the page, make a free-tier book,
// then a licensed 60-puzzle book, and verify both downloads are valid PDFs.
// Run: node test/browser.mjs [baseUrl] [chromium|firefox|webkit]
//
// The engine argument exists because for weeks it did not, and every test in
// this repository — this one, and the "mobile" one, which is Chromium wearing
// an iPhone's viewport — ran on Chromium alone. This app does all its work in
// the browser: it generates the puzzles, lays out sixty pages, embeds the
// fonts and hands back a PDF. That is the heaviest thing a page can ask for,
// and asking only one engine to do it is not a test of anything but that
// engine. A stranger on an iPhone is running WebKit.
//
// Getting the engines onto this machine:
//   npx playwright install webkit firefox
// Firefox then works. WebKit's dependency check asks for libwoff1 and
// libavif16 via sudo, but the only library actually missing here was
// libjxl.so.0.8 (the system has 0.7), so rather than install anything:
//   ln -s /usr/lib/x86_64-linux-gnu/libjxl.so.0.7 \
//     ~/.cache/ms-playwright/webkit-*/minibrowser-gtk/lib/libjxl.so.0.8
// JPEG XL is a format this site never decodes, so the version gap cannot
// reach anything we test. A Playwright reinstall wipes the symlink; if WebKit
// suddenly refuses to launch, that is why.
import * as playwright from "playwright";
import { PDFDocument } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const ENGINE = args.find((a) => ["chromium", "firefox", "webkit"].includes(a)) || "chromium";
const base = args.find((a) => /^https?:\/\//.test(a)) || "https://puzzlepress.bananafest-destiny.com";
// Screenshots go in per-engine folders so a Firefox run does not overwrite the
// Chromium pictures and quietly leave one engine's evidence behind.
const out = new URL(`../samples/browser/${ENGINE === "chromium" ? "" : ENGINE + "/"}`, import.meta.url);
mkdirSync(out, { recursive: true });

// HOST_MAP="example.com 1.2.3.4" pins DNS for the run — useful right after a
// custom domain is created, while a local resolver still has the old answer.
// It is a Chromium flag; the other engines simply do without it.
const browser = await playwright[ENGINE].launch({
  args: ENGINE === "chromium" && process.env.HOST_MAP ? [`--host-resolver-rules=MAP ${process.env.HOST_MAP}`] : [],
});
console.log(`engine: ${ENGINE} ${browser.version()}`);
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

// 1. Free tier: ask for 50, get 50, watermarked rather than shortened.
await page.fill("#count", "50");
await page.fill("#author", "Browser Test");
const free = await downloadPdf("free.pdf");
const freePdf = await PDFDocument.load(await (await import("node:fs")).promises.readFile(free.path));
console.log("free:", free.filename, free.status, "pages", freePdf.getPageCount());
// This once asserted exactly 24 pages, which encoded the padding bug as
// correct: a 5-puzzle book reached 24 only because 15 were blank. The free
// tier no longer shortens anything, so 50 puzzles must produce a full book.
const freePages = freePdf.getPageCount();
if (freePages < 55) {
  throw new Error(`asked for 50 puzzles free and got a ${freePages}-page book`);
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

// 4. No control clips its own label.
//
// A closed <select> cannot wrap, ellipsise or scroll — it silently cuts the
// text off mid-word, and the setting a stranger is being asked to choose reads
// as `6" × 9" — most comr`. It shipped like that on every desktop width for
// weeks because the only guard was a phone media query, and the settings
// column is capped at a fixed width, so the window being wider never helped.
// Measure the text against the box it has to fit in, at four widths, for every
// puzzle type — each type reveals a different set of controls.
const clipped = [];
for (const width of [1280, 1000, 860, 400]) {
  await page.setViewportSize({ width, height: 1000 });
  for (const type of ["wordsearch", "sudoku", "maze", "crisscross", "crossword"]) {
    await page.selectOption("#kind", type);
    await page.waitForTimeout(250);
    clipped.push(...await page.evaluate(({ width: w, type: t }) => {
      const out = [];
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
      document.body.append(probe);
      for (const s of document.querySelectorAll("select")) {
        if (!s.offsetParent) continue;
        const cs = getComputedStyle(s);
        probe.style.font = cs.font;
        probe.style.letterSpacing = cs.letterSpacing;
        // The dropdown arrow is drawn inside the padding box; 22px covers it
        // on every engine I can check, and erring high is the safe direction.
        const room = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 22;
        for (const o of s.options) {
          probe.textContent = o.textContent;
          const need = probe.getBoundingClientRect().width;
          if (need > room) out.push(`${w}px ${t} #${s.id}: "${o.textContent}" needs ${Math.round(need)}px, has ${Math.round(room)}px`);
        }
      }
      probe.remove();
      return out;
    }, { width, type }));
  }
}
if (clipped.length) throw new Error(`select labels are cut off:\n  ${clipped.join("\n  ")}`);
console.log(`no clipped control labels at 1280/1000/860/400px across all five puzzle types`);

await browser.close();
if (errors.length) {
  console.error("Browser errors:", errors);
  process.exit(1);
}
console.log(`browser test OK — ${ENGINE}`);
