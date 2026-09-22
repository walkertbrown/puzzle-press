// The funnel rung, and the speed win it is made of.
//
// The two TrueType files are 825 KB and used to be fetched only at the click,
// which put them on the critical path of the one moment somebody has decided
// they want the thing. They are now prefetched the first time a person touches
// a control — not on a timer, because that spends the bytes on visitors who
// never press anything.
//
// Both halves have to hold:
//   - a real interaction warms them (the speed win, and the funnel rung)
//   - arriving from a calculator or a word-list link does NOT (those set
//     .value straight and dispatch one synthetic `change`; a synthetic event
//     must not count as a person, or every visitor looks engaged and the rung
//     measures nothing)
//
// Run: node test/fontwarm.mjs [baseUrl] [chromium|webkit|firefox]
import * as playwright from "playwright";

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com").replace(/\/$/, "");
const ENGINE = args.find((a) => ["chromium", "firefox", "webkit"].includes(a)) || "chromium";
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

const browser = await playwright[ENGINE].launch();

// Returns the font requests seen, after doing whatever `act` does.
const watch = async (url, act) => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
  const fonts = [];
  page.on("request", (r) => { if (/\/fonts\/.*\.ttf/.test(r.url())) fonts.push(r.url().split("/").pop()); });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".grid div");
  await act(page);
  // The warm-up is deliberately idle-time work; give it room to happen.
  await page.waitForTimeout(2500);
  await page.close();
  return { fonts, errors };
};

// 1. Landing and touching nothing must not spend 825 KB.
const cold = await watch(`${base}/#tool`, async () => {});
check(cold.fonts.length === 0, `landed and touched nothing, yet fetched ${JSON.stringify(cold.fonts)}`);
console.log(`  landed, touched nothing        → ${cold.fonts.length} font requests`);

// 2. Arriving from a calculator carries values in programmatically. That is
//    not a person choosing anything, and must not look like one.
await (async () => {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${base}/spine-calculator`, { waitUntil: "networkidle" });
  await page.selectOption("#trim", "6x9");
  await page.fill("#pages", "100");
  const href = await page.$eval("#makeBtn", (a) => a.getAttribute("href"));
  await page.close();
  const carried = await watch(`${base}${href}`, async () => {});
  check(carried.fonts.length === 0, `the calculator handoff alone fetched ${JSON.stringify(carried.fonts)} — a synthetic event counted as a person`);
  console.log(`  arrived from the calculator    → ${carried.fonts.length} font requests`);
})();

// 3. One real interaction must warm both files.
//
// Ticking a theme, not choosing a trim size, and the difference is a trap.
// Playwright's selectOption assigns .value and dispatches a synthetic change,
// so isTrusted is false and this test would fail on a product that is working
// correctly — a person opening a real <select> does produce a trusted event.
// click() and fill() go through the browser's actual input pipeline, so they
// are what a person looks like here. Ticking a theme is also the commonest
// first thing anyone does.
const warm = await watch(`${base}/#tool`, async (page) => {
  await page.click("#themes input[value='halloween']");
});
check(warm.fonts.length === 2, `a real interaction fetched ${JSON.stringify(warm.fonts)}, want both fonts`);
check(warm.errors.length === 0, `page errors: ${warm.errors.join("; ")}`);
console.log(`  ticked a theme                 → ${warm.fonts.length} font requests (${warm.fonts.join(", ")})`);

// 4. And only once, however much more they fiddle.
const again = await watch(`${base}/#tool`, async (page) => {
  await page.click("#themes input[value='halloween']");
  await page.fill("#count", "24");
  await page.fill("#title", "Autumn");
});
check(again.fonts.length === 2, `three interactions fetched ${again.fonts.length} font requests, want 2`);
console.log(`  three interactions             → ${again.fonts.length} font requests`);

await browser.close();
if (failed) { console.log(`\nFONT WARM FAILED — ${failed} problem(s)`); process.exit(1); }
console.log(`\nFONT WARM OK — ${ENGINE}, ${base}: a person warms them, a handoff does not`);
