// When we say somebody "reached the generator", do they have a button to press?
//
// `/px/tool` fires from an IntersectionObserver at threshold 0 — one pixel of
// #tool crossing the bottom of the viewport. That is the honest line between
// "read the pitch and left" and "got to the thing", and it is what the
// 2026-09-22 read meant by *five of seven scrolled the generator into view*.
//
// It is not the same statement as "had a way to press Download". The in-flow
// actions row sits under the whole left-hand form — measured 2026-09-23, three
// screens below the beacon on desktop and six and a half on a phone. What
// closes that gap is the pinned pair: #previewDownload rides the sticky preview
// header on desktop, #thumbDownload rides the fixed thumb bar on a phone, and
// both delegate to the real button with `real.click()`.
//
// So the question is not where #download sits in the document. It is: from the
// scroll position where the beacon fires, how far must somebody go before any
// download affordance is actually on screen? Measure that, not the markup.
//
// (Two mistakes are available here and I have now made both. On 2026-09-21 a
// funnel test gave a pinned element a document position it does not have. The
// first draft of this file did the opposite and ignored the pinned ones
// entirely, which produced an alarming and wrong finding. Hence: read the
// rendered viewport at a real scroll position, and trust nothing else.)
//
// Usage: node test/reachbutton.mjs [engine] [device]
import * as playwright from "playwright";
import { devices } from "playwright";

const BASE = process.env.BASE || "https://puzzlepress.bananafest-destiny.com";
const engine = process.argv[2] || "chromium";
const deviceName = process.argv[3];

const browser = await playwright[engine].launch();
const ctx = await browser.newContext(
  deviceName ? { ...devices[deviceName] } : { viewport: { width: 1280, height: 900 } },
);
const page = await ctx.newPage();
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#tier:not(:empty)", { timeout: 15000 });

const IDS = ["download", "thumbDownload", "previewDownload"];

// Where the beacon fires: #tool's top edge crossing the bottom of the viewport.
const start = await page.evaluate(() => {
  const r = document.getElementById("tool").getBoundingClientRect();
  return { at: Math.max(0, Math.round(r.top + scrollY - innerHeight)), vh: innerHeight };
});

// Walk down from there in tenths of a screen, asking the rendered page — not the
// stylesheet — whether a person could press something.
const step = Math.round(start.vh / 10);
const probe = async (y) => {
  await page.evaluate((v) => scrollTo(0, v), y);
  await page.waitForTimeout(120); // the thumb bar transitions in
  return page.evaluate((ids) => {
    const out = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.bottom <= 0 || r.top >= innerHeight) continue;
      // Genuinely hittable, not merely positioned: the middle of the button has
      // to belong to the button.
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && (hit === el || el.contains(hit))) out.push(id);
    }
    return out;
  }, IDS);
};

const label = deviceName ? `${engine} / ${deviceName}` : `${engine} / desktop 1280x900`;
console.log(`\n${"=".repeat(70)}\nA BUTTON TO PRESS — ${label}\n${"=".repeat(70)}\n`);
console.log(`  viewport ${start.vh}px; /px/tool fires at scrollY ${start.at}\n`);

const atBeacon = await probe(start.at);
let firstY = atBeacon.length ? start.at : null;
let firstWhat = atBeacon;
const trail = [{ y: start.at, has: atBeacon }];
for (let i = 1; i <= 80 && firstY === null; i++) {
  const y = start.at + i * step;
  const has = await probe(y);
  if (i % 5 === 0 || has.length) trail.push({ y, has });
  if (has.length) { firstY = y; firstWhat = has; }
}

for (const t of trail) {
  const screens = ((t.y - start.at) / start.vh).toFixed(2);
  console.log(`  +${String(screens).padStart(5)} screens (scrollY ${String(t.y).padStart(5)})  ${t.has.length ? t.has.join(", ") : "— nothing pressable"}`);
}

const gap = firstY === null ? Infinity : (firstY - start.at) / start.vh;
console.log(`\n  first pressable download: ${firstY === null ? "never found" : `${gap.toFixed(2)} screens after the beacon (${firstWhat.join(", ")})`}\n`);

const fails = [];
const check = (ok, what) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) fails.push(what);
};

// Why 0.75 and not some rounder number: the thumb bar's own rule is
// `rootMargin: "0px 0px -50% 0px"` — it appears once #tool's top reaches the
// viewport midline, which is half a screen after the beacon fires, plus the
// sampling step and the transition. So ~0.6 is the mechanism working, and the
// deliberate part: showing it earlier would float it over the hero. This
// asserts that the midline rule still holds, not an invented comfort number.
// Anything much past 0.75 means the bar has come loose again — it once sat 7px
// below the fold at every scroll depth for two days (see index.html:810).
check(
  gap <= 0.75,
  `a download button is pressable within a flick of /px/tool (it is ${gap === Infinity ? "never" : gap.toFixed(2)} screens)`,
);

await browser.close();
if (fails.length) {
  console.log(`\nREACH FAILED — ${label}: reaching the tool is not the same as having a button`);
  process.exit(1);
}
console.log(`\nREACH OK — ${label}: reaching the tool puts a button within a thumb's reach`);
