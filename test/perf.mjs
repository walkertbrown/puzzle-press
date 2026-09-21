// The first five seconds, for a stranger arriving on a phone.
//
// Everything else in this suite asks whether the product is correct. This one
// asks whether anybody gets far enough to find out. Product Hunt traffic is
// mostly phones on a mediocre connection, and the decision is made before the
// page has finished settling.
//
// Two things are pinned here, because both drifted once already:
//
//   Weight. The hero image was a 1500px JPEG at 226 KB — about 90% of the whole
//   page and 660 ms of the 987 ms to first puzzle. It is now a 1200px WebP at
//   81 KB. Nothing should quietly put that back.
//
//   The fold. On an iPhone 13 the usable viewport is 390x664 once the browser
//   chrome is gone. What has to be inside it: what this makes, proof it works,
//   what to do next, and what it costs. The tick list used to sit between the
//   buttons and the picture of a real printed page, which pushed the proof a
//   screen and a half down.
//
// Run: node test/perf.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] || "https://puzzlepress.bananafest-destiny.com";
// Budgets, not records: set with room above today's numbers so this fails on a
// regression rather than on a slow afternoon.
const BUDGET = { total: 200 * 1024, asset: 120 * 1024, firstPuzzle: 4000 };
const FOLD = 664;

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

const b = await chromium.launch();
// Mid-range phone on 4G — what most Product Hunt traffic actually is.
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
const client = await ctx.newCDPSession(p);
await client.send("Network.enable");
await client.send("Network.emulateNetworkConditions", {
  offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8,
});
await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const t0 = Date.now();
await p.goto(base, { waitUntil: "domcontentloaded" });
const domReady = Date.now() - t0;
await p.waitForSelector(".grid div", { timeout: 120000 });
const interactive = Date.now() - t0;
await p.waitForLoadState("networkidle");
const settled = Date.now() - t0;

const res = await p.evaluate(() =>
  performance.getEntriesByType("resource").map((r) => ({
    url: new URL(r.name).pathname,
    transfer: r.transferSize,
    decoded: r.decodedBodySize,
    dur: Math.round(r.duration),
  })),
);
const total = res.reduce((a, r) => a + r.transfer, 0);
console.log(`DOM ready:      ${domReady} ms`);
console.log(`First puzzle:   ${interactive} ms   <-- when the page becomes useful`);
console.log(`Network idle:   ${settled} ms`);
console.log(`Transferred:    ${(total / 1024).toFixed(0)} KB`);
for (const r of res.sort((a, b2) => b2.transfer - a.transfer).slice(0, 8)) {
  console.log(`   ${(r.transfer / 1024).toFixed(0).padStart(5)} KB over the wire (${(r.decoded / 1024).toFixed(0)} KB unpacked, ${r.dur} ms)  ${r.url}`);
}

check(total <= BUDGET.total, `page weight ${(total / 1024).toFixed(0)} KB is over the ${BUDGET.total / 1024} KB budget`);
check(interactive <= BUDGET.firstPuzzle, `first puzzle took ${interactive} ms, budget ${BUDGET.firstPuzzle} ms`);
for (const r of res) {
  check(r.transfer <= BUDGET.asset, `${r.url} is ${(r.transfer / 1024).toFixed(0)} KB over the wire, budget ${BUDGET.asset / 1024} KB`);
}
// The hero must be the WebP: a browser that silently fell back to the JPEG
// means the <picture> source is broken or the file was not deployed.
check(res.some((r) => r.url === "/hero-book.webp"), "the hero is served as WebP");

// --- the fold, on a real phone viewport ---
await ctx.close();
const phone = await b.newContext({ viewport: { width: 390, height: FOLD }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await phone.newPage();
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await page.goto(base, { waitUntil: "networkidle" });

const top = async (sel) => (await page.locator(sel).first().boundingBox()).y;
const bottom = async (sel) => { const box = await page.locator(sel).first().boundingBox(); return box.y + box.height; };

// Whole, above the fold: the four things a stranger decides on.
for (const [what, sel] of [
  ["the headline", ".hero h2"],
  ["what it makes", ".lede"],
  ["the primary button", ".hero-cta .btn-primary"],
  ["the finished-book sample", ".hero-cta .btn-ghost"],
  // By class, not :last-of-type: the price used to be the last note and is now
  // the first, because on a phone only one of the two notes fits.
  ["the price", ".hero-cta .note.price"],
]) {
  const y = await bottom(sel);
  check(y <= FOLD, `${what} ends at ${Math.round(y)}px, below the ${FOLD}px fold`);
}
// The whole picture, not a visible edge of it.
//
// This check used to ask only that the image *start* above the fold, and it
// passed for months on a 240px picture showing a 70px strip — and at 320x568 it
// was 0px and the check still passed, because `top` was above the fold by a
// hair while nothing was on screen at all. A strip of a printed page is not
// proof of anything; it is a texture. On 2026-09-21 both of the real phone
// visitors loaded the app, stayed, and never scrolled to the generator, with a
// first screen made of a headline, a sentence and two buttons.
const shotTop = await top(".hero-shot img");
const shotBottom = await bottom(".hero-shot img");
check(shotTop < FOLD, `the picture of a finished page starts at ${Math.round(shotTop)}px, entirely below the fold`);
check(shotBottom <= FOLD, `only ${Math.round(FOLD - shotTop)}px of the picture is on the first screen — it ends at ${Math.round(shotBottom)}px, past the ${FOLD}px fold`);
console.log(`\n  First screen (390x${FOLD}): headline, what it makes, both buttons, the price, and the whole book image, ${Math.round(shotTop)}px to ${Math.round(shotBottom)}px.`);

await b.close();
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("PERF OK — within budget, and the first screen answers what/proof/next/price");
