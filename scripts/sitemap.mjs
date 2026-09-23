// Rewrite every <lastmod> in the sitemap from the file's actual git history.
//
// Why. On 2026-09-23 the crawl-coverage report said Googlebot had fetched
// /robots.txt 37 times and /sitemap.xml 3 times in a week, had never once
// fetched any of the six type pages, and had reached 5 of the 91 word lists.
// Looking for a cause I checked the sitemap and found it claiming:
//
//     /                              lastmod 2026-09-10
//     /compare                       lastmod 2026-09-11
//     /how-to-make-a-puzzle-book      lastmod 2026-09-11
//
// All three were edited on 2026-09-23. `lastmod` is the one field in a sitemap
// that tells a crawler whether coming back is worth its time, and mine was
// saying "nothing here has changed in two weeks" about pages I had rewritten
// that morning. It was hand-maintained, so it went stale the first time I
// forgot, and I forgot every time.
//
// Honesty matters here more than freshness. Stamping today's date on all 115
// URLs is the standard abuse of this field, and engines discount a sitemap that
// does it — so every date comes from `git log -1` on the file that actually
// produces that URL, which is a real change date or nothing at all. A page that
// genuinely has not changed since the 11th keeps the 11th.
//
// It preserves the existing <changefreq> and <priority> and the URL set: this
// fixes one field and takes no position on the rest.
//
// Usage: node scripts/sitemap.mjs [--check]     (npm run sitemap)
//   --check exits non-zero instead of writing, for the test suite.
//
// Order matters, because the date comes from git and not from the working
// tree: commit the page change first, then run this, then commit the sitemap.
// Run in the other order and it stamps the *previous* commit's date, which is
// the stale value this exists to prevent. `--check` in the suite is what makes
// getting the order wrong impossible to ship.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.join(APP, "..");
const SITEMAP = path.join(APP, "public", "sitemap.xml");
const CHECK = process.argv.includes("--check");

// The file whose history is this URL's history. Everything under public/ is
// tracked, including the 91 generated word-list pages, so a generated page's
// own commit date is the honest answer for it too — it changes when the
// generator regenerates it and not before.
function sourceFor(pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\//, "").replace(/\/$/, "/index.html");
  for (const candidate of [rel, `${rel}.html`]) {
    const abs = path.join(APP, "public", candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
}

const xml = readFileSync(SITEMAP, "utf8");
const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)];
if (!entries.length) {
  console.error("No <url> entries in sitemap.xml — refusing to rewrite it.");
  process.exit(1);
}

let out = xml;
const changed = [];
const unmapped = [];
for (const [block] of entries) {
  const loc = (block.match(/<loc>(.*?)<\/loc>/) || [])[1];
  const was = (block.match(/<lastmod>(.*?)<\/lastmod>/) || [])[1];
  const file = loc && sourceFor(new URL(loc).pathname);
  if (!file) { unmapped.push(loc); continue; }
  // %cs is the committer date as YYYY-MM-DD, which is the format sitemaps.org
  // asks for. A file with no commits yet returns empty and is left alone.
  const now = execFileSync("git", ["-C", REPO, "log", "-1", "--format=%cs", "--", path.relative(REPO, file)], {
    encoding: "utf8",
  }).trim();
  if (!now || now === was) continue;
  out = out.replace(block, block.replace(/<lastmod>.*?<\/lastmod>/, `<lastmod>${now}</lastmod>`));
  changed.push({ loc: new URL(loc).pathname, was, now });
}

if (unmapped.length) {
  // A <loc> with no file behind it is a 404 advertised to every search engine.
  console.error(`\n${unmapped.length} sitemap URL(s) have no file behind them:`);
  for (const u of unmapped) console.error(`  ${u}`);
  process.exit(1);
}

if (!changed.length) {
  console.log(`sitemap OK — all ${entries.length} lastmod dates match the file's last commit`);
  process.exit(0);
}

console.log(`${changed.length} of ${entries.length} lastmod dates are older than the file:\n`);
for (const c of changed.slice(0, 20)) console.log(`  ${c.was} -> ${c.now}   ${c.loc}`);
if (changed.length > 20) console.log(`  ... and ${changed.length - 20} more`);

if (CHECK) {
  console.log("\nStale. Run `npm run sitemap` and deploy, or the crawler is being told these pages have not moved.");
  process.exit(1);
}
writeFileSync(SITEMAP, out);
console.log(`\nwrote ${path.relative(REPO, SITEMAP)} — submit it with \`npm run indexnow\` after deploying.`);
