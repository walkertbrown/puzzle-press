// The cold visitor: what somebody who has never heard of this can see and
// press, arriving from a Product Hunt or Hacker News link.
//
// Deliberately ignorant. It never uses a selector I know from building the
// thing — it reads what is on screen, in order, by geometry and visible text.
// That is the whole point: every other suite in this repo tests that the
// product works, which is not the same question as whether a stranger can get
// to a book without help.
//
// It prints a report and then asserts the three things that report kept
// getting wrong:
//
//   1. Every control above the fold is a real thumb target (44px, Apple's
//      number). `test/mobile.mjs` also claims this, but only for controls
//      inside `#tool` — it never looked at the header or the hero, which is
//      exactly where the 18px sample links were living on 2026-09-14.
//   2. Nothing overflows sideways. A phone page that scrolls horizontally
//      reads as broken before it reads as anything.
//   3. The price is above the fold. Free-with-a-watermark and $19-once is the
//      offer; burying it under a scroll is how a free tool gets mistaken for a
//      free tool with no business model, and it is a one-line CSS change away
//      from happening by accident.
//
// Usage: node test/coldvisitor.mjs [engine] [device]
//   node test/coldvisitor.mjs webkit "iPhone 13"
//   node test/coldvisitor.mjs chromium          # desktop, report only
import * as playwright from "playwright";
import { devices } from "playwright";

const BASE = process.env.BASE || "https://puzzlepress.bananafest-destiny.com";
const engine = process.argv[2] || "chromium";
const deviceName = process.argv[3];

const browser = await playwright[engine].launch();
const ctx = await browser.newContext(
  deviceName ? { ...devices[deviceName] } : { viewport: { width: 1280, height: 800 } },
);
const page = await ctx.newPage();
const label = deviceName ? `${engine} / ${deviceName}` : `${engine} / desktop 1280`;

const t0 = Date.now();
await page.goto(`${BASE}/?ref=producthunt`, { waitUntil: "domcontentloaded" });
const domReady = Date.now() - t0;
await page.waitForLoadState("networkidle").catch(() => {});
const settled = Date.now() - t0;

const vh = page.viewportSize().height;

// What is actually above the fold — the only thing most visitors read.
const fold = await page.evaluate((vh) => {
  const out = [];
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const s = n.textContent.trim();
        if (!s) continue;
        const r = n.parentElement?.getBoundingClientRect();
        if (r && r.top < vh && r.bottom > 0 && r.width > 0) out.push({ y: Math.round(r.top), t: s });
      } else if (n.nodeType === 1) {
        const st = getComputedStyle(n);
        if (st.display === "none" || st.visibility === "hidden") continue;
        walk(n);
      }
    }
  };
  walk(document.body);
  return out.sort((a, b) => a.y - b.y);
}, vh);

// Every control a visitor could press, in document order, with its size.
const controls = await page.evaluate((vh) =>
  [...document.querySelectorAll("button, a[href], select, input, summary")]
    .map((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || r.width === 0) return null;
      const t = (el.innerText || el.value || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ");
      return { t: t.slice(0, 60), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), fold: r.top < vh };
    })
    .filter(Boolean), vh);

const overflow = await page.evaluate(() => {
  const d = document.documentElement;
  return { scrollW: d.scrollWidth, clientW: d.clientWidth };
});

console.log(`\n${"=".repeat(70)}\n${label}   dom ${domReady}ms   settled ${settled}ms\n${"=".repeat(70)}`);
console.log(`\n--- ABOVE THE FOLD (${vh}px) — everything a visitor reads without scrolling ---`);
console.log(fold.map((o) => `${String(o.y).padStart(4)}  ${o.t}`).join("\n") || "  (nothing)");

const above = controls.filter((c) => c.fold);
console.log(`\n--- CONTROLS ABOVE THE FOLD (${above.length} of ${controls.length}) ---`);
for (const c of above) console.log(`  ${String(c.w).padStart(4)}x${String(c.h).padStart(3)}  ${c.t}`);
console.log(`\n  horizontal overflow: ${overflow.scrollW > overflow.clientW + 1 ? `YES (${overflow.scrollW} > ${overflow.clientW})` : "none"}`);

// --- the assertions -------------------------------------------------------
const fails = [];
const check = (ok, what) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) fails.push(what);
};
console.log("");

// A mouse can hit an 18px link; a thumb cannot. Only assert where there is a
// thumb — the desktop run is a report, not a judgement.
if (deviceName) {
  const small = above.filter((c) => c.h < 44 && c.t.length > 1);
  check(small.length === 0, `every control above the fold is a 44px thumb target${small.length ? ` (small: ${small.map((c) => `${c.t} ${c.h}px`).join(", ")})` : ""}`);
}
check(overflow.scrollW <= overflow.clientW + 1, "nothing overflows sideways");

const foldText = fold.map((o) => o.t).join(" ");
check(/\$19/.test(foldText), "the price is above the fold");
check(/watermark/i.test(foldText), "what you get for free is above the fold");
check(above.some((c) => /make a book free/i.test(c.t)), 'the "Make a book free" button is above the fold');

await browser.close();
if (fails.length) {
  console.log(`\nCOLD VISITOR FAILED — ${label}: ${fails.length} problem(s)`);
  process.exit(1);
}
console.log(`\nCOLD VISITOR OK — ${label}: a stranger sees the offer, the price and a button they can hit`);
