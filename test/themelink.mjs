// The word-list pages are 91 of the site's pages and every one of them ends in
// a link to /?theme=<slug>#tool. Until 2026-09-21 nothing tested that link.
//
// What it must do: land with that theme ticked and no other, and with a title
// naming it. What it must then keep doing: hold that title while the visitor
// changes anything else. The title was a placeholder as far as refreshKind()
// was concerned, so one keystroke in the puzzle count box turned "Halloween
// Word Search" back into "Animal Word Search" while they were looking at it.
//
// Run: node test/themelink.mjs [baseUrl] [chromium|webkit|firefox]
import * as playwright from "playwright";

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com").replace(/\/$/, "");
const ENGINE = args.find((a) => ["chromium", "firefox", "webkit"].includes(a)) || "chromium";
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

const browser = await playwright[ENGINE].launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

for (const [slug, word] of [["halloween", "Halloween"], ["thanksgiving", "Thanksgiving"]]) {
  // Straight to the link the word-list page publishes, not a hand-built one.
  await page.goto(`${base}/word-lists/${slug}`, { waitUntil: "networkidle" });
  const href = await page.$eval(`a[href*="theme=${slug}"]`, (a) => a.getAttribute("href"));
  check(!!href, `/word-lists/${slug}: no link into the tool carrying the theme`);

  await page.goto(`${base}${href.startsWith("http") ? new URL(href).pathname + new URL(href).search : href}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".grid div");
  const ticked = await page.$$eval("#themes input", (els) => els.filter((e) => e.checked).map((e) => e.value));
  check(ticked.length === 1 && ticked[0] === slug, `${slug}: ticked ${JSON.stringify(ticked)}, want only ["${slug}"]`);
  const title = await page.inputValue("#title");
  check(title.includes(word), `${slug}: landed with the title "${title}"`);

  // One keystroke somewhere else must not take the title away.
  await page.fill("#count", "60");
  await page.waitForTimeout(300);
  const after = await page.inputValue("#title");
  check(after === title, `${slug}: typing a puzzle count changed the title from "${title}" to "${after}"`);
  // ...and the subtitle, which is a placeholder, must follow the new count.
  const subtitle = await page.inputValue("#subtitle");
  check(subtitle.includes("60"), `${slug}: subtitle reads "${subtitle}" on a 60-puzzle book`);
  console.log(`  /word-lists/${slug.padEnd(14)} → ${title} · ${subtitle}`);
}

check(errors.length === 0, `page errors: ${errors.join("; ")}`);
await browser.close();
if (failed) { console.log(`\nTHEME LINK FAILED — ${failed} problem(s)`); process.exit(1); }
console.log(`\nTHEME LINK OK — ${ENGINE}, ${base}`);
