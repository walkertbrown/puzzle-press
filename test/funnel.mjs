// The launch dashboard reads the funnel out of Cloudflare's request log: no
// analytics script, no cookie, no beacon — the site's promise that nothing you
// type leaves your browser has to stay true on launch day too.
//
// That only works while each step of the funnel maps to a file that is fetched
// at that step and no other. On 2026-09-13 it did not: "made a book" was keyed
// on any chunk-*.js, and a browser fetches four of those just by opening the
// page, so the dashboard credited a book to everyone who landed.
//
// Nothing in the app declares that mapping, and a bundler is free to move code
// between chunks on any build. So this drives three sessions that each do
// exactly one thing, records what the network actually asked for, and fails if
// the signals the dashboard depends on have stopped being distinct.
//
// Run: node test/funnel.mjs [baseUrl]
import { chromium } from "playwright";

const base = (process.argv[2] || "https://puzzlepress.bananafest-destiny.com").replace(/\/$/, "");
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

// The patterns scripts/traffic.mjs counts. Keep the two in step.
const SIGNAL = {
  ranTheApp: /^\/js\/main\.js$/,
  madeBook: /^\/js\/render-/,
  madeCover: /^\/js\/cover-/,
  fonts: /^\/fonts\//,
};

const browser = await chromium.launch();

// One session, one action. Returns the set of paths the network asked for.
async function session(name, act) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  const paths = new Set();
  page.on("request", (r) => {
    try { paths.add(new URL(r.url()).pathname); } catch {}
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".grid div");
  await act(page);
  await page.waitForTimeout(1500);
  await ctx.close();
  const has = (re) => [...paths].some((p) => re.test(p));
  console.log(`  ${name}: ${Object.entries(SIGNAL).filter(([, re]) => has(re)).map(([k]) => k).join(", ") || "nothing"}`);
  return has;
}

// 1. Landed and left. This is the case that was being counted as a sale-shaped
// event, so it is the one that matters most.
const landed = await session("landed only", async () => {});
check(landed(SIGNAL.ranTheApp), "a real browser that lands fetches main.js");
check(!landed(SIGNAL.madeBook), "landing must NOT look like making a book");
check(!landed(SIGNAL.madeCover), "landing must NOT look like making a cover");
check(!landed(SIGNAL.fonts), "landing must NOT fetch the fonts");

// 2. Made a book.
const book = await session("made a book", async (page) => {
  await page.fill("#count", "2");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
  await dl.path();
});
check(book(SIGNAL.madeBook), "making a book fetches the render module");
check(book(SIGNAL.fonts), "making a book fetches the fonts");
check(!book(SIGNAL.madeCover), "making a book must not look like making a cover");

// 3. Made a cover.
const cover = await session("made a cover", async (page) => {
  await page.fill("#count", "2");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#downloadCover")]);
  await dl.path();
});
check(cover(SIGNAL.madeCover), "making a cover fetches the cover module");

// A crawler that does not run JavaScript must appear as a page request and
// nothing else — that gap is how the dashboard separates people from bots.
const res = await fetch(`${base}/`, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } });
const html = await res.text();
check(res.status === 200, "a crawler gets the page");
check(!/\/js\/render-|\/fonts\//.test(html), "the page does not reference the render module or fonts in its HTML");

await browser.close();
if (failed) { console.log(`${failed} check(s) failed — the dashboard's funnel is lying`); process.exit(1); }
console.log("FUNNEL OK — landing, making a book and making a cover are each distinguishable in the request log");
