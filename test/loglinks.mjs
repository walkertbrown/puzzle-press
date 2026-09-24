// Every build-log entry must carry a link to a specific product page.
//
// Why this exists (2026-09-24): the build log is one of two channels left, and
// its posts are indexed and read. I first wrote this believing the product
// domain had zero index entries — a WebSearch domain filter said so. Search
// Console says otherwise: the pages are indexed, they just bring nobody. The
// rule survives the correction, because a link from something people read is
// still a route a reader can take, and its words still describe the target.
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
// Only entries that have not gone out yet are checked. A test that fails on
// history nobody can fix is a test people learn to ignore — but "history" has
// to mean actually published, not merely written.
//
// I got that boundary wrong once. The first version of this file exempted
// everything before 2026-09-24 on the assumption that the rest was live and
// uneditable. The dev.to API (`/api/articles?username=bananafestdestiny`) says
// the last published post is dated 2026-09-20, so 09-21 through 09-23 — 3,375
// lines carrying two deep links between them — were sitting in the queue,
// editable, and exempted for no reason. Raise this constant only against that
// endpoint, never against a guess about what has gone out.
//
// Run: node test/loglinks.mjs
import { readdirSync, readFileSync } from "node:fs";

const RULE_STARTS = "2026-09-21";
const HOST = "https://puzzlepress.bananafest-destiny.com";
const dir = new URL("../../actual/", import.meta.url).pathname;

const files = readdirSync(dir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .filter((f) => f.slice(0, 10) >= RULE_STARTS)
  .sort();

let failed = 0;
const fail = (msg) => { failed++; console.log(`FAIL ${msg}`); };

// Entries are checked against the sitemap for the same reason the READMEs are,
// and it is safe to do here only because RULE_STARTS bounds this to posts that
// have not gone out: a published post naming a page that has since been renamed
// is history, not a defect.
const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url).pathname, "utf8");
const published = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/\/$/, "")),
);
const unpublished = (urls) =>
  // Fragment first, then the slash: "/#pricing" must reduce to the homepage.
  urls.filter((u) => !published.has(u.replace(/#.*$/, "").replace(/\/$/, "")));

// A bare pasted URL still counts as a link, and the check above would pass on a
// page full of them — but it tells a search engine nothing about where it
// points. The words in a link are how the target page gets described to the
// index, so "[free KDP royalty calculator](...)" does work that the naked URL
// does not. Only deep links are held to this: "Live: <homepage>" is idiomatic
// and the homepage needs no describing.
const bareDeep = (text) =>
  [...text.matchAll(/(\]\()?(https:\/\/puzzlepress\.bananafest-destiny\.com[a-zA-Z0-9/_.#?=-]*)/g)]
    .filter((m) => !m[1] && m[2].replace(HOST, "").replace(/^\//, "") !== "")
    .map((m) => m[2]);

// An empty set must not read as "everything passed" — same rule as
// test/sample-promo.mjs. If no entry is ever checked, say so and fail.
if (files.length === 0) fail(`no actual/*.md entries dated ${RULE_STARTS} or later — nothing was checked`);

for (const f of files) {
  const text = readFileSync(dir + f, "utf8");
  const urls = [...text.matchAll(/https:\/\/puzzlepress\.bananafest-destiny\.com[a-zA-Z0-9/_.#?=-]*/g)].map((m) => m[0]);
  const deep = [...new Set(urls.filter((u) => u.replace(HOST, "").replace(/#.*$/, "").replace(/^\//, "") !== ""))];
  const sections = (text.match(/^## /gm) || []).length;
  if (deep.length === 0) {
    fail(`${f}: ${sections} sections, ${urls.length} product link(s), none of them deep — `
      + `the homepage is the one URL that is already crawled`);
  }
  for (const u of new Set(bareDeep(text))) {
    fail(`${f} pastes ${u} bare — a link's words are how the page gets described to the index`);
  }
  for (const u of unpublished([...new Set(urls)])) {
    fail(`${f} links ${u}, which is not in the sitemap — renamed or mistyped`);
  }
  if (deep.length > 0 && bareDeep(text).length === 0 && unpublished([...new Set(urls)]).length === 0) {
    console.log(`  ok    ${f}  ${sections} sections, ${deep.length} deep link(s): ${deep.map((u) => u.replace(HOST, "")).join(" ")}`);
  }
}

// The READMEs are the other half of the same job, and the more valuable half: a
// brand search returns these repos above the product itself, so they are the
// highest-ranked assets pointing at the product.
//
// Both were nearly empty on 2026-09-24. app/README.md had 132 lines and exactly
// one product link, the bare homepage. The build-log README had seventeen lines
// and did not name the product at all — a reader arriving there could not have
// learned a live app existed.
//
// Links are checked against the sitemap rather than over the network, so this
// stays offline and deterministic. A renamed page would otherwise sever an
// inbound route silently.
//
// The minimums are not magic numbers. Ten is "the five puzzle types, the
// calculators and the samples are all reachable"; eight is the same list
// without the samples, which belong in the product repo and not the log.
const READMES = [
  { path: "../README.md", name: "app/README.md", min: 10 },
  { path: "../../README.md", name: "README.md (build log)", min: 8 },
];

for (const r of READMES) {
  const before = failed;
  const text = readFileSync(new URL(r.path, import.meta.url).pathname, "utf8");
  const urls = [...new Set(
    [...text.matchAll(/https:\/\/puzzlepress\.bananafest-destiny\.com[a-zA-Z0-9/_.#?=-]*/g)].map((m) => m[0]),
  )];
  const deep = urls.filter((u) => u.replace(HOST, "").replace(/#.*$/, "").replace(/^\//, "") !== "");

  if (deep.length < r.min) {
    fail(`${r.name} has ${deep.length} deep link(s), needs ${r.min} — `
      + `the repo outranks the site, so it is a main route in`);
  }
  for (const u of unpublished(urls)) {
    fail(`${r.name} links ${u}, which is not in the sitemap — renamed or mistyped`);
  }
  for (const u of new Set(bareDeep(text))) {
    fail(`${r.name} pastes ${u} bare — a link's words are how the page gets described to the index`);
  }
  // Gated on a sentinel so an ok line can never print above a FAIL it caused.
  if (failed === before) {
    console.log(`  ok    ${r.name}  ${deep.length} deep links, all present in the sitemap`);
  }
}

if (failed) {
  console.log(`\n${failed} problem(s) — a page with no route into the site cannot do its one job`);
  process.exit(1);
}
console.log(`\nLOG LINKS OK — ${files.length} entr${files.length === 1 ? "y" : "ies"} since ${RULE_STARTS} plus both READMEs, each with a route into a specific page`);
