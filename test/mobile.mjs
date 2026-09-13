// The whole flow at phone size, because that is most of what a launch sends.
// Land, pick a type, make a real book, open the unlock dialog, make a cover —
// checking at every step that nothing overflows sideways and every control is
// big enough to hit with a thumb.
import { chromium, devices } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Args in any order: a base URL and/or a Playwright device name.
const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("http")) || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
const tmp = mkdtempSync(join(tmpdir(), "pp-mob-"));
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };
const browser = await chromium.launch();
// The narrowest phone still in use, a common modern one, and an Android.
const DEVICE = args.find((a) => devices[a]) || "iPhone 13";
const ctx = await browser.newContext({ ...devices[DEVICE], acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const noOverflow = async (where) => {
  const over = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= innerWidth) return null;
    // Name the widest offender so a failure is actionable.
    let worst = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > innerWidth + 1 && (!worst || r.right > worst.right)) {
        worst = { right: Math.round(r.right), tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0, 40) || "", id: el.id };
      }
    }
    return { scrollWidth: doc.scrollWidth, innerWidth, worst };
  });
  check(!over, `${DEVICE} ${where}: no sideways scroll ${over ? JSON.stringify(over) : ""}`);
};

// A select whose label is cut off ("6\" × 9\" — most c…") is the phone bug
// that is easiest to ship and hardest to notice from a desktop.
const noTruncation = async (where) => {
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll("#tool select")]
      .filter((el) => el.offsetParent && el.scrollWidth > el.clientWidth + 2)
      .map((el) => `${el.id}:${el.scrollWidth}>${el.clientWidth}`));
  check(cut.length === 0, `${DEVICE} ${where}: select labels are not cut off (${cut.join(", ")})`);
};

await page.goto(`${base}/`, { waitUntil: "networkidle" });
await page.waitForSelector(".grid div", { timeout: 30000 });
await noOverflow("landing");
await noTruncation("landing");

// Every control the flow needs must be a comfortable thumb target (44px is
// Apple's number and the one the CSS aims at).
const small = await page.$$eval(
  "#tool button, #tool select, #tool input[type=number], #tool input[type=text], .themes label",
  (els) => els.filter((e) => e.getBoundingClientRect().height < 36 && e.offsetParent !== null)
    .map((e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}:${Math.round(e.getBoundingClientRect().height)}px`),
);
check(small.length === 0, `every control is thumb-sized (small: ${small.join(", ")})`);

// Make a real book, of a type that needs the theme list — the longest scroll.
await page.locator("#kind").selectOption("crossword");
await page.waitForSelector(".crisscross .cell i", { timeout: 30000 });
await noOverflow("crossword preview");
await noTruncation("crossword preview");
await page.locator("#count").fill("14");
await page.locator("#difficulty").selectOption("graded");
await page.waitForTimeout(500);
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 240000 }), page.locator("#download").click()]);
const pdfPath = join(tmp, "phone.pdf");
await dl.saveAs(pdfPath);
try { execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-dNODISPLAY", "-dPDFSTOPONERROR", pdfPath]); } catch { check(false, "book valid"); }
const pages = Number(execFileSync("pdfinfo", [pdfPath]).toString().match(/Pages:\s+(\d+)/)[1]);
check(pages === 24, `24 pages from a phone, got ${pages}`);

// The cover, which on the free tier opens the unlock dialog afterwards.
const [cd] = await Promise.all([page.waitForEvent("download", { timeout: 240000 }), page.locator("#downloadCover").click()]);
await cd.saveAs(join(tmp, "phone-cover.pdf"));
await page.waitForSelector("#unlockDialog[open]", { timeout: 15000 });
await noOverflow("unlock dialog");
const dialogFits = await page.evaluate(() => {
  const d = document.getElementById("unlockDialog").getBoundingClientRect();
  return d.left >= -1 && d.right <= innerWidth + 1 && d.width > 200;
});
check(dialogFits, "unlock dialog fits the screen");
const emailBox = await page.locator("#email").boundingBox();
check(emailBox.height >= 36, `email box is tappable (${Math.round(emailBox.height)}px)`);
await page.locator("#closeDialog").click();

// The pages a launch links to, at the same size.
for (const path of ["/how-to-make-a-puzzle-book", "/compare", "/margin-calculator", "/crossword-book-generator", "/word-lists/halloween"]) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await noOverflow(path);
}
check(errors.length === 0, `no console errors: ${errors.join("; ")}`);

await browser.close();
rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log(`MOBILE OK — ${DEVICE} (${devices[DEVICE].viewport.width}px): a real crossword book and cover made on the phone, nothing overflows or truncates, controls are thumb-sized`);
