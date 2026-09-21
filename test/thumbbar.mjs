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

console.log(`THUMB BAR OK — ${base}: hidden at the hero, up in the form, out of the way at the real buttons, and it made ${file.suggestedFilename()}`);
await browser.close();
