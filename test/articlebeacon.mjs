// The two long article pages must be able to report a human being.
//
// /how-to-make-a-puzzle-book is the highest-intent phrase on this site — it is
// the sentence a person types when they have already decided to try — and until
// 2026-09-23 it was the one page I could say nothing true about. It fired no
// beacon on arrival, so "Read the how-to guide  6" on the dashboard was counted
// out of request paths alone. Intersecting those six addresses with everyone
// who ran a line of JavaScript anywhere on the site that day gave zero. Six
// crawlers. The number had been on the report for two days reading like readers.
//
// Both pages now fire on load, and the button fires its own name, exactly as
// the word-list pages have since they were built. Same rule as
// test/listbeacon.mjs: prove the instrument, then the zero is evidence. If this
// suite is green and the middle number on those two lines is still zero, nobody
// is reading them — and that is worth knowing before writing a third article.
//
// Usage: node test/articlebeacon.mjs [chromium|webkit]
import * as playwright from "playwright";

const BASE = process.env.BASE || "https://puzzlepress.bananafest-destiny.com";
const ENGINE = process.argv[2] || "chromium";

const PAGES = [
  { path: "/how-to-make-a-puzzle-book", load: "guide", click: "guideclick" },
  { path: "/compare", load: "compare", click: "compareclick" },
];

let failed = 0;
const ok = (cond, what, got = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${what}${got ? `   (${got})` : ""}`);
  if (!cond) failed++;
};

const browser = await playwright[ENGINE].launch();

for (const p of PAGES) {
  console.log(`\n${p.path}`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const px = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/px/")) px.push(u.pathname.replace(/^\/px\/|\.gif$/g, ""));
  });
  // Somebody else's script, and not what is being tested.
  await page.route("https://static.cloudflareinsights.com/**", (r) => r.abort());

  await page.goto(BASE + p.path, { waitUntil: "networkidle" });
  ok(px.filter((n) => n === p.load).length === 1, `/px/${p.load} fires once on load`, px.join(" ") || "nothing");
  ok(!px.includes(p.click), `and ${p.click} does not fire by itself`, px.join(" ") || "nothing");

  // Every call to action on the page, not just the first. The guide carries
  // four of them down its length and the end-of-article one is the only one a
  // reader who actually read it will reach.
  const hrefs = await page.$$eval("a.btn", (as) => as.map((a) => a.getAttribute("href")));
  ok(hrefs.length > 0, "the page has a call to action at all", `${hrefs.length} of them`);
  ok(hrefs.every((h) => /^\/($|#|\?)/.test(h || "")), "and every one of them goes to the generator", hrefs.join(" "));

  await page.click("a.btn");
  await page.waitForTimeout(1500);
  ok(px.filter((n) => n === p.click).length === 1, `/px/${p.click} fires once when one is pressed`, px.join(" "));
  ok(px.includes("tool"), "and /px/tool fires where it lands, so the crossover is visible", px.join(" "));

  await ctx.close();
}

await browser.close();

if (failed) {
  console.log(`\nARTICLE BEACON FAILED — ${failed} check(s), ${ENGINE}.`);
  console.log("Until this is green, a zero on the guide or comparison line means nothing at all.");
  process.exit(1);
}
console.log(`\nARTICLE BEACON OK — ${ENGINE}: both articles can report a human, so their silence is evidence`);
