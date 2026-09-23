// The press: what a person reads in the inch around the Download button.
//
// Every other suite here asks whether the product works, or whether a stranger
// can find the tool. Neither is the question any more. Measured 2026-09-22 over
// 23.5h: seven strangers ran the app, five scrolled the generator into view,
// two operated a control, and *nobody pressed Download* — with zero failures,
// so nothing was broken. The wall is the press itself, and until now no test
// had ever looked at it.
//
// What it asserts:
//
//   1. The free tier is not painted in the error colours. `.tier` and
//      `.warnings` both shipped as var(--warn-bg)/var(--warn) — the same amber
//      the page uses for "your book is the wrong length for KDP" — and `.tier`
//      only turns green once you have paid. So the palette told an unpaid
//      visitor, two lines under the button, that they were in a bad state.
//   2. The press says what comes out and what it costs you. "No sign-up, no
//      install" was true and lived in a section *below* the tool, which is not
//      where the decision is made.
//   3. The primary button is still the biggest target in the actions row.
//
// Usage: node test/press.mjs [engine]
import * as playwright from "playwright";

const BASE = process.env.BASE || "https://puzzlepress.bananafest-destiny.com";
const engine = process.argv[2] || "chromium";

const browser = await playwright[engine].launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
await page.goto(`${BASE}/#tool`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#tier:not(:empty)", { timeout: 15000 });

const press = await page.evaluate(() => {
  const bg = (sel) => {
    const e = document.querySelector(sel);
    return e ? getComputedStyle(e).backgroundColor : null;
  };
  const btn = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { t: e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
  };
  // Everything between the button and the bottom of the tool, in order — the
  // text a person actually reads while deciding whether to press.
  const zone = ["#coverNote", "#moneyNote", "#status", "#tier"]
    .map((s) => ({ sel: s, t: document.querySelector(s)?.textContent.trim() || "" }))
    .filter((o) => o.t);
  return {
    tierBg: bg("#tier"),
    warnBg: bg("#warnings"),
    licensed: document.querySelector("#tier")?.classList.contains("licensed") ?? null,
    download: btn("#download"),
    cover: btn("#downloadCover"),
    reshuffle: btn("#reshuffle"),
    zone,
  };
});

console.log(`\n${"=".repeat(70)}\nTHE PRESS — ${engine} / 1280x900   ${BASE}\n${"=".repeat(70)}\n`);
console.log("--- the actions row ---");
for (const b of [press.download, press.cover, press.reshuffle]) {
  if (b) console.log(`  ${String(b.w).padStart(4)}x${String(b.h).padStart(3)}  ${b.t}`);
}
console.log("\n--- what is written under it, in order ---");
for (const o of press.zone) console.log(`  ${o.sel.padEnd(11)} ${o.t}`);
console.log(`\n  #tier background   ${press.tierBg}${press.licensed ? "  (licensed)" : ""}`);
console.log(`  #warnings background ${press.warnBg}`);

const fails = [];
const check = (ok, what) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) fails.push(what);
};
console.log("");

// A visitor arriving cold is unlicensed; if this is ever false the rest of the
// run is measuring somebody else's page.
check(press.licensed === false, "a cold visitor sees the free tier, not the unlocked one");

// The offer is not a warning. Amber is for things that are wrong with your
// book, and the free tier is not one of them.
check(
  press.tierBg !== press.warnBg,
  `the free tier is not painted in the error colours (tier ${press.tierBg}, warnings ${press.warnBg})`,
);

const zoneText = press.zone.map((o) => o.t).join(" ");
check(/free/i.test(zoneText), "the press says the book is free");
check(/footer/i.test(zoneText), "the press says what the free mark actually is");
// The reason a stranger does not press an unknown download button is rarely the
// price. It is not knowing what it will ask them for first.
check(
  /no sign-?up|no email|no account/i.test(zoneText),
  "the press says nothing is asked of you — no sign-up, no email",
);

check(
  !!press.download && press.download.w >= (press.cover?.w || 0),
  "the interior PDF is still the primary button",
);

await browser.close();
if (fails.length) {
  console.log(`\nPRESS FAILED — ${engine}: ${fails.length} problem(s)`);
  process.exit(1);
}
console.log(`\nPRESS OK — ${engine}: the offer reads as an offer at the one step that matters`);
