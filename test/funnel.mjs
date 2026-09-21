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
  // Fetched during idle time after the first render, to have the 1.3 MB PDF
  // chunk in hand before anybody presses the button. It is its own module for
  // exactly this reason: warming through render.js would have made every
  // visitor indistinguishable from a visitor who made a book.
  warmed: /^\/js\/heavy-/,
  madeBook: /^\/js\/render-/,
  madeCover: /^\/js\/cover-/,
  fonts: /^\/fonts\//,
  // The interaction beacons (src/ui/main.js, 2026-09-21). Unlike everything
  // above, these are not a side effect of a bundle layout — they are fired on
  // purpose, which makes them easy to delete by accident and impossible to
  // notice: the dashboard would simply show zeroes and read as a quiet day.
  sawTool: /^\/px\/tool\.gif$/,
  touched: /^\/px\/touched\.gif$/,
  browsed: /^\/px\/browsed\.gif$/,
  pressed: /^\/px\/click\.gif$/,
  made: /^\/px\/made\.gif$/,
  failed: /^\/px\/failed\.gif$/,
  handoff: /^\/px\/handoff\.gif$/,
  handoffTop: /^\/px\/handofftop\.gif$/,
  // The two long article pages, which have no module of their own and so fire
  // their beacon from a few lines of plain script in the page.
  fromCompare: /^\/px\/compare\.gif$/,
  fromGuide: /^\/px\/guide\.gif$/,
};

const browser = await chromium.launch();

// One session, one action. Returns the set of paths the network asked for.
async function session(name, act) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
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
check(landed(SIGNAL.warmed), "a real browser that lands warms the PDF chunk");
check(!landed(SIGNAL.madeBook), "landing must NOT look like making a book");
check(!landed(SIGNAL.madeCover), "landing must NOT look like making a cover");
check(!landed(SIGNAL.fonts), "landing must NOT fetch the fonts");
// At 1280x1000 the generator is on screen the moment the page paints, so this
// is the desktop answer and it should be immediate. What must NOT be there is
// any beacon that claims the visitor did something: a landing is a landing.
check(landed(SIGNAL.sawTool), "a landing on a desktop viewport sees the tool");
check(!landed(SIGNAL.touched), "landing must NOT look like touching a control");
check(!landed(SIGNAL.pressed), "landing must NOT look like pressing Download");
check(!landed(SIGNAL.made), "landing must NOT look like a finished book");

// 2. Made a book.
const book = await session("made a book", async (page) => {
  await page.fill("#count", "2");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
  await dl.path();
});
check(book(SIGNAL.madeBook), "making a book fetches the render module");
check(book(SIGNAL.fonts), "making a book fetches the fonts");
check(!book(SIGNAL.madeCover), "making a book must not look like making a cover");
check(book(SIGNAL.touched), "setting the count counts as touching a control");
check(book(SIGNAL.pressed), "pressing Download fires the press beacon");
check(book(SIGNAL.made), "a book that downloads fires the finished beacon");
check(!book(SIGNAL.failed), "a book that downloads must NOT fire the failure beacon");

// 3. Made a cover.
const cover = await session("made a cover", async (page) => {
  await page.fill("#count", "2");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#downloadCover")]);
  await dl.path();
});
check(cover(SIGNAL.madeCover), "making a cover fetches the cover module");

// 4. Looked at the preview and left. The whole reason the beacons exist is to
// tell this apart from a bounce, so it gets its own session.
const looked = await session("browsed the preview", async (page) => {
  await page.click("#next");
  await page.click("#next");
});
check(looked(SIGNAL.browsed), "paging the preview fires the browse beacon");
check(!looked(SIGNAL.pressed), "browsing the preview must NOT look like pressing Download");
check(!looked(SIGNAL.made), "browsing the preview must NOT look like a finished book");

// 5. The handoff out of a calculator. This is the number the whole current
// strategy is judged by — the calculators are the only pages search has ever
// carried here — and it is the most fragile beacon on the site, because the
// click navigates away and an outgoing document's <img> request is cancelled.
// src/ui/px.js fires this one with keepalive for exactly that reason, so the
// check that matters is that it survives the navigation at all.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
  const paths = new Set();
  page.on("request", (r) => { try { paths.add(new URL(r.url()).pathname); } catch {} });
  await page.goto(`${base}/royalty-calculator`, { waitUntil: "networkidle" });
  await page.fill("#pages", "120");
  await page.click("#makeBtn");
  await page.waitForSelector(".grid div");
  await page.waitForTimeout(1500);
  await ctx.close();
  const has = (re) => [...paths].some((p) => re.test(p));
  console.log(`  calculator handoff: ${Object.entries(SIGNAL).filter(([, re]) => has(re)).map(([k]) => k).join(", ") || "nothing"}`);
  check(has(SIGNAL.handoff), "the calculator's make-a-book button fires the handoff beacon");
  check(has(SIGNAL.ranTheApp), "the handoff lands on the generator");
  check(!has(SIGNAL.made), "arriving from a calculator must NOT look like a finished book");
  check(!has(SIGNAL.handoffTop), "the end-of-article button must not claim to be the one beside the answer");
}

// 6. The same handoff from the button beside the answer, which is the one a
// phone visitor can actually reach — the end-of-article CTA is 4.4 screens
// down. It counts as a handoff like the other, and says so twice, so the
// placement can be judged rather than assumed.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 } });
  const page = await ctx.newPage();
  await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
  const paths = new Set();
  page.on("request", (r) => { try { paths.add(new URL(r.url()).pathname); } catch {} });
  // The check that is the whole point of the button, on all three pages: on a
  // phone it has to be reachable without reading the article. Under two
  // screens of scrolling, not four and a half. An article grows, and the day
  // somebody adds two paragraphs above the fold this should fail rather than
  // quietly slide back down to where it started.
  for (const calc of ["royalty-calculator", "spine-calculator", "margin-calculator"]) {
    await page.goto(`${base}/${calc}`, { waitUntil: "networkidle" });
    await page.fill("#pages", "120");
    const top = await page.evaluate(() => {
      const t = document.getElementById("makeBtnTop").getBoundingClientRect();
      const o = document.getElementById("makeBtn").getBoundingClientRect();
      return { screens: (t.top + scrollY) / innerHeight, old: (o.top + scrollY) / innerHeight, h: Math.round(t.height), href: document.getElementById("makeBtnTop").getAttribute("href") };
    });
    console.log(`  ${calc.padEnd(19)} door beside the answer ${top.screens.toFixed(2)} screens down (end of article: ${top.old.toFixed(2)})`);
    check(top.screens < 2, `${calc}: the door beside the answer must be within two screens (is ${top.screens.toFixed(2)})`);
    check(top.h >= 44, `${calc}: and thumb-sized`);
    check(/^\/\?trim=.*#tool$/.test(top.href), `${calc}: and carries the book across (href was ${top.href})`);
  }
  await page.goto(`${base}/royalty-calculator`, { waitUntil: "networkidle" });
  await page.fill("#pages", "120");
  await page.click("#makeBtnTop");
  await page.waitForSelector(".grid div");
  await page.waitForTimeout(1500);
  await ctx.close();
  const has = (re) => [...paths].some((p) => re.test(p));
  console.log(`  calculator handoff (top): ${Object.entries(SIGNAL).filter(([, re]) => has(re)).map(([k]) => k).join(", ") || "nothing"}`);
  check(has(SIGNAL.handoff), "the button beside the answer counts as a handoff");
  check(has(SIGNAL.handoffTop), "and says which button it was");
  check(has(SIGNAL.ranTheApp), "and lands on the generator");
}

// 7. The two long article pages. /how-to-make-a-puzzle-book is the highest
// intent page on the site — somebody searching that phrase is the buyer — and
// on 2026-09-21 its only button was 13.05 screens down a 14-screen phone page;
// /compare's was 7.94 of 8.6. Same defect as the calculators, found only
// because the calculators' fix prompted a sweep. Guard it the same way: the
// prose will grow, and it must fail here rather than slide back down.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 } });
  const page = await ctx.newPage();
  await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
  const paths = new Set();
  page.on("request", (r) => { try { paths.add(new URL(r.url()).pathname); } catch {} });
  for (const [slug, beacon] of [["compare", SIGNAL.fromCompare], ["how-to-make-a-puzzle-book", SIGNAL.fromGuide]]) {
    await page.goto(`${base}/${slug}`, { waitUntil: "networkidle" });
    const doors = await page.evaluate(() => {
      const page = document.documentElement.scrollHeight / innerHeight;
      return {
        page,
        all: [...document.querySelectorAll("a.btn")].map((a) => ({
          screens: (a.getBoundingClientRect().top + scrollY) / innerHeight,
          h: Math.round(a.getBoundingClientRect().height),
          text: a.textContent.trim(),
        })),
      };
    });
    const first = doors.all[0];
    console.log(`  ${slug.padEnd(26)} ${doors.all.length} door(s) on a ${doors.page.toFixed(1)}-screen page, first at ${first.screens.toFixed(2)} — "${first.text}"`);
    check(first.screens < 2, `${slug}: a door must be reachable within two screens (first is ${first.screens.toFixed(2)})`);
    check(first.h >= 44, `${slug}: and thumb-sized`);
    // A long read needs one at the end as well as one near the top: the reader
    // who actually reads it is the best prospect on the page.
    check(doors.all[doors.all.length - 1].screens > doors.page - 2.5, `${slug}: and one still waiting at the end of the article`);
    await page.click("a.btn");
    await page.waitForTimeout(1200);
    check([...paths].some((p) => beacon.test(p)), `${slug}: the door fires its own beacon, or the placement cannot be judged`);
    paths.clear();
  }
  await ctx.close();
}

// A crawler that does not run JavaScript must appear as a page request and
// nothing else — that gap is how the dashboard separates people from bots.
const res = await fetch(`${base}/`, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } });
const html = await res.text();
check(res.status === 200, "a crawler gets the page");
check(!/\/js\/render-|\/fonts\//.test(html), "the page does not reference the render module or fonts in its HTML");

await browser.close();
if (failed) { console.log(`${failed} check(s) failed — the dashboard's funnel is lying`); process.exit(1); }
console.log("FUNNEL OK — landing, making a book and making a cover are each distinguishable in the request log");
