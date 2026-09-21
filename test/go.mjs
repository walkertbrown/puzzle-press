// The only attribution this site has.
//
// This zone's plan refuses clientRefererHost, clientRequestReferer and
// clientRequestQuery — all present in the schema, all "zone does not have
// access to the field" — and Cloudflare logs clientRequestPath with the query
// string stripped, so ?from=youtube is invisible in the log I would read it
// from. A distinct path is logged in full. So every link published off-site
// points at /go/<channel> and the worker redirects it.
//
// What that means for this test: a broken /go/ link is not a broken page, it
// is a dead link inside a video description I cannot edit after it is sent.
// The failure is silent and permanent, which is exactly the kind that needs a
// test. Checks every slug the worker knows and every slug the dashboard reads,
// in both directions, because a slug in one and not the other is a channel
// that either cannot be measured or is measured and never used.
//
// Usage: node test/go.mjs [url]
import { readFileSync } from "node:fs";

const base = (process.argv.slice(2).find((a) => a.startsWith("http")) || "https://puzzlepress.bananafest-destiny.com").replace(/\/$/, "");
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log("FAIL " + msg); } };

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
// Both maps are hand-written object literals and neither is one-key-per-line,
// so match every `slug: "` in the block rather than anchoring to line starts.
const slugsOf = (text, re) => { const m = text.match(re); return m ? [...m[1].matchAll(/([a-z]+):\s*"/g)].map((x) => x[1]) : []; };

const worker = slugsOf(src("../src/worker.js"), /const GO = \{([\s\S]*?)\n\};/);
const dash = slugsOf(src("../scripts/traffic.mjs"), /const GO_LABEL = \{([\s\S]*?)\n  \};/);
check(worker.length > 0, "could not find the GO map in src/worker.js — this test is not checking anything");
check(dash.length > 0, "could not find GO_LABEL in scripts/traffic.mjs");
for (const s of worker) check(dash.includes(s), `/go/${s} redirects but the dashboard has no line for it — traffic through it is invisible`);
for (const s of dash) check(worker.includes(s), `the dashboard reports /go/${s} but the worker does not redirect it — that link 404s`);

for (const slug of worker) {
  const res = await fetch(`${base}/go/${slug}`, { redirect: "manual" });
  const loc = res.headers.get("location");
  check(res.status === 302, `/go/${slug} answered ${res.status}, not 302`);
  check(!!loc, `/go/${slug} sent no Location header`);
  // A /go/ URL that Google indexes competes with the page it points at, and a
  // permanent redirect would hand it that page's authority.
  check(/noindex/i.test(res.headers.get("x-robots-tag") || ""), `/go/${slug} is not noindex — it can be indexed instead of its destination`);
  if (loc) {
    const dest = await fetch(loc, { redirect: "manual" });
    check(dest.status === 200, `/go/${slug} points at ${new URL(loc).pathname}, which answers ${dest.status}`);
    console.log(`  /go/${slug.padEnd(9)} -> ${new URL(loc).pathname}`);
  }
}

// An unknown slug is my own typo in a description already published, so it has
// to land the visitor on the site. A 404 would also file them as a scanner in
// the probe rule in traffic.mjs and drop them out of their own funnel.
const bad = await fetch(`${base}/go/this-slug-does-not-exist`, { redirect: "manual" });
check(bad.status === 302, `an unknown /go/ slug answered ${bad.status} — a typo in a published link would 404 a real visitor`);
check(new URL(bad.headers.get("location") || base).pathname === "/", "an unknown /go/ slug does not fall back to the home page");

if (failed) { console.log(`\nGO FAILED — ${failed} problem(s)`); process.exit(1); }
console.log(`\nGO OK — ${worker.length} channel links redirect, are noindex, and land on a real page`);
