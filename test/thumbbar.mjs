// The phone download bar.
//
// Why this test exists: on 2026-09-20 the r/KDP post brought the first real
// humans to the site, and the dashboard read "ran the app 4, did not bounce 2,
// Clicked Download 0". Measured on an iPhone 13 against production that night,
// tapping the hero's "Make a book free" put you at the top of the form with
// #download 3,592px further down — 5.4 phone screens. Every field is already
// filled in, so the book was finished on arrival and there was no way to know.
//
// The bar carries the existing primary action down the form. It is deliberately
// not a second download path: it forwards the click to #download, so there is
// one handler and one funnel signal. That forwarding is the part most likely to
// rot silently — a renamed id breaks the button with no visible error — so the
// test presses the bar and insists a real PDF comes out the other side.
//
// Usage: node test/thumbbar.mjs [url]     (npm run test:thumbbar)
import { chromium, devices } from "playwright";

const base = (process.argv.slice(2).find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com").replace(/\/$/, "");
const fail = (m) => { console.error("THUMB BAR FAILED — " + m); process.exit(1); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], acceptDownloads: true });
const page = await ctx.newPage();
// Never let a test run show up as a visitor in the numbers it exists to protect.
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());

const state = () => page.evaluate(() => {
  const el = document.getElementById("thumbBar");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { onScreen: r.top < window.innerHeight - 4 && r.bottom > 0 };
});

await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const atHero = await state();
if (!atHero) fail("#thumbBar is not in the page at all");
if (atHero.onScreen) fail("the bar covers the hero — it must stay down until the form is on screen");

await page.getByRole("link", { name: /make a book free/i }).first().click();
await page.waitForTimeout(1200);
if (!(await state()).onScreen) fail("the bar did not appear after the hero CTA — the 5.4-screen scroll is back");

// Two identical Download buttons visible at once is worse than none.
await page.locator("#actions").scrollIntoViewIfNeeded();
await page.waitForTimeout(700);
if ((await state()).onScreen) fail("the bar is still up while the real buttons are visible — duplicate Download buttons");

// And the click has to actually make the book, not just look like a button.
await page.getByRole("link", { name: /make a book free/i }).first().click();
await page.waitForTimeout(900);
const download = page.waitForEvent("download", { timeout: 120000 });
await page.locator("#thumbDownload").click();
const file = await download.catch(() => fail("pressing the bar produced no PDF — the forward to #download is broken"));
if (!/\.pdf$/i.test(file.suggestedFilename())) fail("the bar produced " + file.suggestedFilename() + ", not a PDF");

// ---- Desktop's half of the same problem.
//
// 1280x800: the preview is sticky so the puzzle sits at the fold, but #download
// is 3.64 screens down the form column — you can see what you made and cannot
// act on it. The button in the sticky preview header is the fix, and it must
// stay desktop-only: on a phone the preview is six screens below the form and
// the fixed bar already covers that ground.
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const dp = await desk.newPage();
await dp.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await dp.goto(base + "/", { waitUntil: "networkidle" });
await dp.waitForTimeout(900);
await dp.evaluate(() => document.querySelector("#tool").scrollIntoView());
await dp.waitForTimeout(400);
await dp.evaluate(() => window.scrollBy(0, 1200));
await dp.waitForTimeout(600);

const deskState = await dp.evaluate(() => {
  const on = (el) => { const r = el.getBoundingClientRect(); return r.top > 0 && r.bottom < window.innerHeight; };
  return { btn: on(document.getElementById("previewDownload")),
           real: on(document.getElementById("download")),
           puzzle: (() => { const r = document.getElementById("page").getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; })() };
});
if (!deskState.puzzle) fail("desktop: the preview stopped sticking — the puzzle is not on screen inside the form");
if (deskState.real) fail("desktop: this check is meaningless, the real button is already visible here");
if (!deskState.btn) fail("desktop: no reachable Download while scrolling the form — the 3.6-screen gap is back");

const deskDownload = dp.waitForEvent("download", { timeout: 120000 });
await dp.locator("#previewDownload").click();
const deskFile = await deskDownload.catch(() => fail("desktop: the preview-header button produced no PDF"));
if (!/\.pdf$/i.test(deskFile.suggestedFilename())) fail("desktop: got " + deskFile.suggestedFilename() + ", not a PDF");

// And it must not double up on a phone.
if (await page.locator("#previewDownload").isVisible()) fail("the desktop button is showing on a phone — two Download buttons in one column");

console.log(`THUMB BAR OK — ${base}`);
console.log(`  phone:   hidden at the hero, up in the form, out of the way at the real buttons, made ${file.suggestedFilename()}`);
console.log(`  desktop: reachable beside the sticky puzzle while the real button is off screen, made ${deskFile.suggestedFilename()}`);
await browser.close();
