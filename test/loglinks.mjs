// Every build-log entry must carry a link to a specific product page.
//
// Why this exists (2026-09-24): the build log is one of two channels left, and
// the only one with evidence behind it — a domain-restricted search finds five
// of its posts on dev.to and *nothing at all* on the product domain, which has
// 116 published URLs and zero index entries. A new domain is discovered by
// being linked to from pages that are already indexed, so these posts are the
// only inbound route that exists.
//
// They were mostly not doing that job. Of the five indexed posts, four link to
// the bare homepage and nothing else; the fifth links to /spine-calculator and
// /royalty-calculator and is the only post of mine that has ever surfaced in a
// search result. Worse, the entries still queued to publish were emptier still:
// 2026-09-21 had thirty-one sections and not one product link, 2026-09-22 had
// eight and none.
//
// A bare homepage link does not count. The homepage is the one URL that already
// gets crawled; it is the 115 others that have no route in.
//
// Only entries from the day the rule started are checked — the earlier ones are
// already published and cannot be edited, and a test that fails on history
// nobody can fix is a test people learn to ignore.
//
// Run: node test/loglinks.mjs
import { readdirSync, readFileSync } from "node:fs";

const RULE_STARTS = "2026-09-24";
const HOST = "https://puzzlepress.bananafest-destiny.com";
const dir = new URL("../../actual/", import.meta.url).pathname;

const files = readdirSync(dir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .filter((f) => f.slice(0, 10) >= RULE_STARTS)
  .sort();

let failed = 0;
const fail = (msg) => { failed++; console.log(`FAIL ${msg}`); };

// An empty set must not read as "everything passed" — same rule as
// test/sample-promo.mjs. If no entry is ever checked, say so and fail.
if (files.length === 0) fail(`no actual/*.md entries dated ${RULE_STARTS} or later — nothing was checked`);

for (const f of files) {
  const text = readFileSync(dir + f, "utf8");
  const urls = [...text.matchAll(/https:\/\/puzzlepress\.bananafest-destiny\.com[a-zA-Z0-9/_.#?=-]*/g)].map((m) => m[0]);
  const deep = [...new Set(urls.filter((u) => u.replace(HOST, "").replace(/^\//, "") !== ""))];
  const sections = (text.match(/^## /gm) || []).length;
  if (deep.length === 0) {
    fail(`${f}: ${sections} sections, ${urls.length} product link(s), none of them deep — `
      + `the homepage is the one URL that is already crawled`);
  } else {
    console.log(`  ok    ${f}  ${sections} sections, ${deep.length} deep link(s): ${deep.map((u) => u.replace(HOST, "")).join(" ")}`);
  }
}

// The README is the other half of the same job, and the more valuable half: a
// brand search returns this repo above everything, so it is the highest-ranked
// asset pointing at a domain with no index entries. On 2026-09-24 it carried
// 132 lines and exactly one product link — the bare homepage.
//
// Its links are checked against the sitemap rather than over the network, so
// this stays offline and deterministic. A renamed page would otherwise sever
// the only inbound route the site has, silently.
const failedBeforeReadme = failed;
const readme = readFileSync(new URL("../README.md", import.meta.url).pathname, "utf8");
const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url).pathname, "utf8");
const published = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/\/$/, "")),
);

const readmeUrls = [...new Set(
  [...readme.matchAll(/https:\/\/puzzlepress\.bananafest-destiny\.com[a-zA-Z0-9/_.#?=-]*/g)].map((m) => m[0]),
)];
const readmeDeep = readmeUrls.filter((u) => u.replace(HOST, "").replace(/^\//, "") !== "");

// One link is what it had. Ten is not a magic number — it is "the five puzzle
// types, the calculators and the samples are all reachable", which is the whole
// point of the README carrying links at all.
if (readmeDeep.length < 10) {
  fail(`README.md has ${readmeDeep.length} deep link(s) — the repo outranks the site, so it is the main route in`);
}
for (const u of readmeUrls) {
  if (!published.has(u.replace(/\/$/, "").replace(/#.*$/, ""))) {
    fail(`README.md links ${u}, which is not in the sitemap — renamed or mistyped`);
  }
}
if (failed === failedBeforeReadme) {
  console.log(`  ok    README.md  ${readmeDeep.length} deep links, all present in the sitemap`);
}

if (failed) {
  console.log(`\n${failed} problem(s) — a page with no route into the site cannot do its one job`);
  process.exit(1);
}
console.log(`\nLOG LINKS OK — ${files.length} entr${files.length === 1 ? "y" : "ies"} since ${RULE_STARTS} plus the README, each with a route into a specific page`);
