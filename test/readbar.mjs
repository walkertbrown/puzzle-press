// The bar that follows a reader down the long pages.
//
// Why it exists: measured 2026-09-21 on an iPhone 13, the guide is 14.2 screens
// and its ways into the tool sit at 1.22, 7.92 and 13.34 screens. Five real
// people read that page in 24h and none pressed anything. The comparison is the
// same shape. A reader who stops after three screens has passed one door, which
// was below the fold when they arrived.
//
// This walks down gradually instead of jumping, because on 2026-09-20 the
// generator's thumb bar passed its whole test suite while being invisible to
// every real visitor: every check jumped, a jump is one sample taken at the
// destination, and the destination was the one place the broken rule was true.
// A person is sampled all the way down. So is this.
//
// Usage: node test/readbar.mjs [url] [chromium|webkit|firefox]
import * as playwright from "playwright";
import { devices } from "playwright";

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com").replace(/\/$/, "");
const ENGINE = args.find((a) => ["chromium", "firefox", "webkit"].includes(a)) || "webkit";
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

const PAGES = [
  { path: "/how-to-make-a-puzzle-book", beacon: "guide" },
  { path: "/compare", beacon: "compare" },
];

const browser = await playwright[ENGINE].launch();

for (const { path, beacon } of PAGES) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  // Never let a test run show up as a visitor in the numbers it exists to protect.
  await page.route("https://static.cloudflareinsights.com/**", (r) => r.abort());
  const pixels = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/px/")) pixels.push(u.pathname); });

  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const shown = () => page.evaluate(() => {
    const el = document.getElementById("readBar");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return getComputedStyle(el).display !== "none" && r.height > 0 && r.top < window.innerHeight;
  });

  const present = await shown();
  if (present === null) { fail(`${path}: #readBar is not in the page at all`); await ctx.close(); continue; }
  if (present) fail(`${path}: the bar is up at the top of the page — it must wait until the reader has left the first screen`);

  // Down the page a quarter-screen at a time, the way a thumb goes.
  const step = (await page.evaluate(() => window.innerHeight)) * 0.25;
  const walk = [];
  for (let s = 0.25; s <= 4; s += 0.25) {
    await page.evaluate((y) => window.scrollBy(0, y), step);
    await page.waitForTimeout(90);
    walk.push({ at: s, on: await shown() });
  }
  const firstUp = walk.find((w) => w.on);
  if (!firstUp) fail(`${path}: scrolling gradually to 4 screens never brought the bar up`);
  else if (firstUp.at > 2) fail(`${path}: the bar waits until ${firstUp.at} screens — too far into a page people leave early`);

  // And it must get out of the way of the closing button rather than sit on
  // top of it: two identical "Make a book free" buttons at once is worse than
  // one. This is the one place a jump is the honest move — a reader arriving at
  // the end has scrolled all the way there either way.
  await page.evaluate(() => document.querySelector(".cta").scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  if (await shown()) fail(`${path}: the bar is still up while the closing button is on screen — two identical buttons`);

  // Back into the middle, and press it. The press has to be counted: the whole
  // reason these pages are measurable is the delegated a.btn beacon listener,
  // and a bar that does not carry class="btn" would be a silent hole in it.
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3));
  await page.waitForTimeout(400);
  if (!(await shown())) fail(`${path}: the bar came back down three screens in, mid-article`);
  else {
    await page.locator("#readBar .btn").click();
    await page.waitForTimeout(1200);
    if (!pixels.includes(`/px/${beacon}.gif`)) fail(`${path}: pressing the bar fired no /px/${beacon}.gif — presses on it are invisible`);
    const landed = new URL(page.url());
    if (landed.pathname !== "/") fail(`${path}: the bar landed on ${landed.pathname}, not the generator`);
  }

  if (!failed) console.log(`  ${path.padEnd(28)} hidden on screen 1, up by ${firstUp.at} screens, down at the closing button, press counted`);
  await ctx.close();
}

// A desktop reader has a narrow column and the next door is rarely a screen
// away, so the bar must not appear there at all.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.route("https://static.cloudflareinsights.com/**", (r) => r.abort());
  await page.goto(base + "/how-to-make-a-puzzle-book", { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
  await page.waitForTimeout(400);
  const up = await page.evaluate(() => {
    const el = document.getElementById("readBar");
    return el ? getComputedStyle(el).display !== "none" : false;
  });
  if (up) fail("desktop: the reading bar is showing — it is meant to be phone-only");
  else console.log("  desktop 1280x800            the bar stays out of it");
  await ctx.close();
}

await browser.close();
if (failed) { console.log(`\nREAD BAR FAILED (${ENGINE}) — ${failed} problem(s)`); process.exit(1); }
console.log(`\nREAD BAR OK — ${ENGINE}, ${base}`);
