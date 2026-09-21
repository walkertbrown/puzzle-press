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
// A device profile is a viewport and a user-agent, not an engine: on Chromium,
// "iPhone 13" is a desktop engine in an iPhone's clothes. This whole file is
// about a fixed element that an IntersectionObserver shows and hides, and a
// real iPhone runs WebKit — so pass the engine and find out what one does.
//
// Usage: node test/thumbbar.mjs [url] [chromium|webkit|firefox]
import * as playwright from "playwright";
import { devices } from "playwright";

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com").replace(/\/$/, "");
const ENGINE = args.find((a) => ["chromium", "firefox", "webkit"].includes(a)) || "chromium";
const fail = (m) => { console.error(`THUMB BAR FAILED (${ENGINE}) — ` + m); process.exit(1); };

const browser = await playwright[ENGINE].launch();
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

// ---- Walk down the page the way a thumb does.
//
// This section exists because the test passed green for a day on a bar that
// no human could ever see. The visibility rule was written as "is #tool
// intersecting AND is its top above the midline", read inside the observer
// callback. But an IntersectionObserver fires on a *crossing*, not on
// scrolling: #tool is 4998px tall, so on a 664px phone it crosses in exactly
// once, at the moment its top touches the bottom edge — where top is ~664 and
// never below the 332 midline — and then stays intersecting forever, so no
// callback ever runs again. data-show was stuck at 0 at every scroll depth.
//
// Every check below this one jumped: a hash link, scrollIntoViewIfNeeded, a
// scrollTo. A jump is one crossing sampled at the destination, which is the
// one place the broken condition was true. A person is sampled at the entry
// edge, which is the one place it was false. So the jumps all passed and the
// feature was invisible to every real visitor for its entire life.
//
// The rule is now declarative — rootMargin shrinks the root to the top half,
// so isIntersecting *is* "above the midline" and re-fires in both directions.
// This walk is what proves it, and no jump can stand in for it.
const walk = [];
const step = (await page.evaluate(() => window.innerHeight)) * 0.25;
for (let s = 0.25; s <= 4; s += 0.25) {
  await page.evaluate((y) => window.scrollBy(0, y), step);
  await page.waitForTimeout(150);
  walk.push({ at: s, on: (await state()).onScreen });
}
if (walk[0].on) fail("the bar is up a quarter-screen into the hero — it must wait for the form");
const firstUp = walk.find((w) => w.on);
if (!firstUp) fail("scrolling gradually to 4 screens never brought the bar up — the observer only reacts to jumps, which no person makes");
if (firstUp.at > 3) fail(`the bar waits until ${firstUp.at} screens — the first control is at 2.9 and the download is 5 screens past it`);

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.getByRole("link", { name: /make a book free/i }).first().click();
await page.waitForTimeout(1200);
if (!(await state()).onScreen) fail("the bar did not appear after the hero CTA — the 5.4-screen scroll is back");

// The other half of the same tap: the bar gives a phone visitor the action,
// this gives them the proof. Before 2026-09-20 the preview sat 6.00 screens
// below #tool, so nobody on a phone ever saw the puzzle before deciding
// whether to bother. It is a CSS `order` swap on the grid children, which is
// precisely the kind of thing a later layout edit undoes without noticing.
const layout = await page.evaluate(() => {
  const y = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null; };
  return { vh: window.innerHeight, tool: y("#tool"), puzzle: y("#page"), form: y("#settings"), how: y(".card.how") };
});
const screensDown = (layout.puzzle - layout.tool) / layout.vh;
if (screensDown > 1) fail(`the puzzle is ${screensDown.toFixed(2)} screens below #tool on a phone — the proof is buried again`);
if (!(layout.puzzle < layout.form)) fail("the form is above the puzzle on a phone — the order swap is gone");
if (!(layout.form < layout.how)) fail("'How it works' is wedged between the puzzle and the form");

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

console.log(`THUMB BAR OK — ${ENGINE}, ${base}`);
console.log(`  phone:   hidden at the hero, up in the form, out of the way at the real buttons, made ${file.suggestedFilename()}`);
console.log(`  desktop: reachable beside the sticky puzzle while the real button is off screen, made ${deskFile.suggestedFilename()}`);
await browser.close();
