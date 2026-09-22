// Who is behind the counts. The companion to `traffic.mjs`, and the answer to
// the question that file cannot answer on its own: "...that ran the app 2" —
// two *what*?
//
// Written 2026-09-15 15:3x CT, on the afternoon of the Product Hunt launch,
// after the dashboard reported two real browsers that both stayed on the page.
// Neither was a person. One was 35.223.235.106 (Google LLC, Chrome 101 — a
// browser build from 2022) and the other 38.181.82.181. Both loaded main.js,
// the chunks and the idle-warmed heavy chunk, which is exactly the fingerprint
// of somebody reading the page, and neither ever asked for a font or the render
// chunk, which is what making a book looks like.
//
// This is the third time the same mistake has been available to me in a week:
// 69 "strangers" who were this machine on a rotated address, four of nine
// "real browsers" that were one Azure scanner, and now this. Each time the
// count was right and the noun was wrong. `traffic.mjs` got smarter twice
// (exclude my own /64; judge an address by its 404s, not its paths) and both
// fixes were subtractive — they remove known noise. A JS-executing crawler
// from a cloud host leaves no 404s and no trace to subtract, so no filter was
// ever going to catch it. The only way to know is to look at who owns the
// address.
//
// Why not do this inside traffic.mjs: because it is a judgement call and not a
// count, and the dashboard's job is to be a number I trust. Cloud host does
// not prove crawler — a developer on a VPS or a corporate VPN is a person, and
// on launch eve the single most encouraging event of the week came from a
// Cloudflare WARP address, which is a datacentre by any test you could write.
// So this prints what it found and lets me decide, and the headline number
// upstairs stays exactly as honest as it was.
//
// Ownership comes from RDAP — the public registry lookup that answers "which
// organisation holds this netblock". It is the same question a `whois` asks,
// there is no key and no account, and it is asked only about the handful of
// addresses that ran the app. It is worth being deliberate about that: the
// site promises that nothing you type leaves your browser, and that promise is
// about puzzle content, which never goes anywhere near this script. Still, an
// address is a visitor's, so the rule here is narrow — only addresses that
// already ran the app, never a bulk dump of everyone who touched the site.
//
// Usage: node scripts/who.mjs [hoursBack]     (npm run who)
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";

// The zone refuses a range "wider than 1d", and asking for exactly 24 hours
// loses that race every time — the query is built, then a few hundred
// microseconds pass, and the span is 1d584ms. traffic.mjs already clamps to
// 23.5 for the same reason; this is the same clamp, not a new idea.
const hours = Math.min(Number(process.argv[2] || 24), 23.5);
const creds = readFileSync(new URL("../../.git-credentials", import.meta.url), "utf8");
const CF = (creds.match(/^CLOUDFLARE_API_TOKEN=(.*)$/m) || [])[1]?.trim();
const ZONE = "4169ea6b92a0920d72f9ebc5f7653e9d";
const since = new Date(Date.now() - hours * 3600e3).toISOString().replace(/\.\d+Z$/, "Z");

const graphql = async (query) => {
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${CF}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const d = await r.json();
  if (d.errors) throw new Error(d.errors.map((e) => e.message).join("; "));
  return d.data;
};

// 2026-09-21: this was `limit: 500`, and it was quietly lying. The rows are
// grouped by address x path x status x agent and ordered by count descending,
// and this machine alone puts thousands of requests across dozens of paths and
// six user-agents at the top of that list. Every stranger who asked for one
// page once sits in the tail, and the tail was being cut off. The visible
// result: this script reported "5 loaded main.js" on a day when seventeen
// addresses did, and I trusted it over the dashboard because it counts
// addresses and the dashboard was counting requests. Both were wrong. The
// dashboard was wrong about the unit; this was wrong about the sample.
//
// A truncated answer must say so rather than read as a small number, so the
// cap is checked below and printed if it is hit.
const CAP = 5000;
const rows = (
  await graphql(`query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequestsAdaptiveGroups(limit: ${CAP}, filter: {datetime_geq: "${since}", clientRequestHTTPHost_like: "%puzzle%"}, orderBy: [count_DESC]) {
      count dimensions { clientIP clientRequestPath edgeResponseStatus userAgent }
    } } } }`)
).viewer.zones[0].httpRequestsAdaptiveGroups;
if (rows.length >= CAP) {
  console.log(`\n  !! ${rows.length} rows came back and the cap is ${CAP} — this is a PARTIAL picture.`);
  console.log("     Counts below are floors, not totals. Narrow the window and run again.");
}

// Group the raw rows by address. Everything below is a question about a
// visitor, not about a request.
const by = new Map();
for (const r of rows) {
  const { clientIP: ip, clientRequestPath: path, edgeResponseStatus: status, userAgent: ua } = r.dimensions;
  if (!by.has(ip)) by.set(ip, { n: 0, paths: new Map(), uas: new Set(), s404: 0 });
  const e = by.get(ip);
  e.n += r.count;
  e.paths.set(path, (e.paths.get(path) ?? 0) + r.count);
  e.uas.add(ua);
  // A 404 on a path the browser asked for by itself is not a probe — see the
  // BROWSER_ASKS_FOR note in traffic.mjs. iOS asks for three touch icons
  // unprompted, which is exactly the scanner threshold.
  if (status === 404 && !/^\/(favicon\.ico|apple-touch-icon.*\.png|browserconfig\.xml|site\.webmanifest|manifest\.json|sw\.js|\.well-known\/)/.test(path)) e.s404 += r.count;
}

// The same four fingerprints traffic.mjs keys the funnel on, so this file and
// the dashboard can never disagree about what a visitor did.
const did = (paths) => ({
  ranApp: [...paths.keys()].some((p) => p === "/js/main.js"),
  // 2026-09-21: this was called `stayed` and printed as "landed and stayed",
  // which I had been reading every day as "engaged with the tool". It is not.
  // heavy-*.js is the pdf-lib warm-up at main.js:1117, fired by a 1.2s timer
  // after load on every visitor who is not on Save-Data or 2G. Nobody chose
  // it. All it proves is that the page finished loading and the tab was still
  // open a second later — barely more than ranApp, and the difference between
  // the two is an instant bounce, which is worth knowing but is not interest.
  //
  // So the ladder currently has a hole exactly where the money is: between
  // "the page loaded" and "made a book" there is no rung at all. Fourteen
  // strangers ran the app in the last day and none made a book, and I cannot
  // tell whether they bounced on sight or built a book they liked and balked
  // at the last step. Those need opposite fixes. Next rung to build: one
  // server-observable chunk behind a choice the visitor actually makes.
  loaded: [...paths.keys()].some((p) => p.startsWith("/js/heavy-")),
  // Real intent, both of them: render-*.js and cover-*.js are imported in the
  // download handlers (main.js:31, :36) and load for nothing else.
  madeBook: [...paths.keys()].some((p) => p.startsWith("/js/render-")),
  madeCover: [...paths.keys()].some((p) => p.startsWith("/js/cover-")),
  // clues-*.js is summoned on purpose too — it arrives only when they switch
  // to crossword or fill-in.
  pickedType: [...paths.keys()].some((p) => p.startsWith("/js/clues-")),
  // The rung built for the hole described above, same day. The two TrueType
  // files are prefetched on the first *trusted* sign of intent — pressing
  // "Make a book free", or changing any control — and at no other time before
  // the click (main.js, under the warm-up block). So a font fetch with no
  // render-*.js after it is the thing I could not see yesterday: somebody who
  // got to the tool and did not take the book.
  //
  // Deliberately not called "used the tool": the CTA press only proves they
  // asked to see the controls. Reached is what is observed, so reached is what
  // the row says.
  reachedTool: [...paths.keys()].some((p) => /^\/fonts\/.*\.ttf$/.test(p)),
  // 2026-09-21: the dashboard's "Opened a sample PDF" jumped 0 -> 4 overnight
  // while Download stayed at 0, and a bare count cannot say whether that was a
  // person deciding against the tool or Googlebot walking the links. It is the
  // difference between a conversion problem and no signal at all, so name the
  // files and let the owner/agent on the same row settle it.
  samples: [...paths.keys()].filter((p) => p.startsWith("/samples/")).map((p) => p.slice(9)),
});

// RDAP: registry first, then follow the referral the regional registry gives
// for space it does not hold itself. ARIN answers for everything with a
// pointer, so one request usually does, and a failure prints as "unknown"
// rather than as a guess.
const orgOf = async (ip) => {
  try {
    const r = await fetch(`https://rdap.arin.net/registry/ip/${ip}`, {
      headers: { accept: "application/rdap+json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    for (const e of d.entities ?? []) {
      const fn = (e.vcardArray?.[1] ?? []).find((f) => f[0] === "fn");
      if (fn) return `${fn[3]}${d.name ? ` (${d.name})` : ""}`;
    }
    return d.name ?? null;
  } catch {
    return null;
  }
};

// This machine, both address families and the whole /64 — the same three
// lessons traffic.mjs learned the hard way, and the first run of this file
// walked into all of them at once. It listed an AT&T address at the top with
// 679 requests that had MADE A BOOK and made a cover, which is the most
// exciting line this dashboard has ever printed and was me: node, curl,
// HeadlessChrome and Chrome 140 all under one address, which is the test suite
// and this session. Marked rather than dropped, because a drill-down that
// silently hides rows is how I would fail to notice the exclusion had broken.
const traceIp = (flag) =>
  new Promise((res) =>
    execFile("curl", ["-s", flag, "--max-time", "10", "https://puzzlepress.bananafest-destiny.com/cdn-cgi/trace"],
      (err, out) => res(err ? null : (String(out).match(/^ip=(.*)$/m) || [])[1]?.trim() || null)));
const nowIps = (await Promise.all([traceIp("-4"), traceIp("-6")])).filter(Boolean);
const myPrefixes = nowIps.filter((ip) => ip.includes(":")).map((ip) => ip.split(":").slice(0, 4).join(":") + ":");
const isMine = (ip) => nowIps.includes(ip) || myPrefixes.some((p) => ip.startsWith(p));

const visitors = [...by].sort((a, b) => b[1].n - a[1].n);
const ranTheApp = visitors.filter(([, e]) => did(e.paths).ranApp);

const strangers = ranTheApp.filter(([ip]) => !isMine(ip));
console.log(`\nWho ran the app — last ${hours}h   ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`);
console.log(`  ${visitors.length} addresses touched the site; ${ranTheApp.length} loaded main.js; ${strangers.length} of those were not this machine.\n`);

if (!strangers.length) {
  console.log("  Nobody but me ran the app in this window. Everything else was a crawler.\n");
}

for (const [ip, e] of ranTheApp) {
  const d = did(e.paths);
  const mine = isMine(ip);
  const org = mine ? null : await orgOf(ip);
  // Say what was actually observed, not what I wish it meant. Only the first
  // of these is a visitor doing something; the other two are the page loading.
  const stage = d.madeBook
    ? "MADE A BOOK"
    : d.pickedType
      ? "CHANGED THE PUZZLE TYPE, took no book" // furthest anyone got short of a book
      : d.reachedTool
        ? "REACHED THE TOOL, took no book" // the balk — the row worth chasing
      : d.loaded
        ? "page finished loading, nothing chosen"
        : "gone before the page finished loading";
  // A scanner that also runs JavaScript still counts its 404s, and that is the
  // only thing separating it from a reader. Say so on the row: traffic.mjs
  // drops these from the funnel, so a row here that is not marked is a row the
  // headline number believed.
  const scanner = !mine && e.s404 >= 3;
  console.log(`  ${ip}${mine ? "   <-- THIS MACHINE, not a visitor" : scanner ? `   <-- SCANNER (${e.s404} 404s), excluded from the funnel` : ""}`);
  if (!mine) console.log(`    owner       ${org ?? "unknown (RDAP had no answer — do not assume person)"}`);
  for (const ua of e.uas) console.log(`    agent       ${ua.slice(0, 100)}`);
  console.log(`    did         ${stage}${d.madeCover ? " + made a cover" : ""}   (${e.n} requests${e.s404 ? `, ${e.s404} were 404s` : ""})`);
  if (d.samples.length) console.log(`    opened      ${d.samples.join(", ")}`);
  console.log("");
}

// Sample PDFs are linked from the landing page, so anything that follows links
// finds them — including things that never run main.js and therefore never
// appear above. Listing them separately is what stops a crawler's tour of the
// samples directory from being read as six people considering the product.
const sampleOnly = visitors.filter(([, e]) => did(e.paths).samples.length && !did(e.paths).ranApp);
if (sampleOnly.length) {
  console.log("  Opened a sample without ever running the app:");
  for (const [ip, e] of sampleOnly) {
    console.log(`    ${ip}   ${did(e.paths).samples.join(", ")}   ${[...e.uas][0]?.slice(0, 60) ?? "no agent"}`);
  }
  console.log("");
}

// The scanners are not interesting individually, but their size is: it is the
// reason the headline number needs defending at all.
const scanners = visitors.filter(([, e]) => e.s404 >= 3);
if (scanners.length) {
  const total = scanners.reduce((a, [, e]) => a + e.n, 0);
  console.log(`  Ignored: ${scanners.length} scanner${scanners.length > 1 ? "s" : ""}, ${total} requests, all probing for files that do not exist.\n`);
}

// word-lists/* pages are static content — no main.js needed to read them —
// so they never show in the section above, which is keyed on ranApp. Added
// 2026-09-19 after traffic.mjs was widened to count these pages for the
// first time and found 158 hits/day in one day, spread thin across pages
// nothing has promoted. User-agent only, no RDAP: the deliberate scope above
// ("only addresses that already ran the app, never a bulk dump of everyone
// who touched the site") stays as written, and a self-declared bot UA
// (Googlebot, bingbot both name themselves) needs no registry lookup anyway.
// isMine, because this list is the one place in the file that looks at
// addresses which never ran the app, and my own rotated /64 is exactly that —
// `npm run test:links` walks all 91 word-list pages with node and fetches no
// script. On 2026-09-21 the top two entries here were 765 and 432 requests
// from this laptop, printed as visitors, under a list headed by the number of
// addresses. The same rotation caught traffic.mjs out on 09-14; every other
// list in this file is built from `strangers`, which already excludes them.
const wordListOnly = visitors.filter(
  ([ip, e]) => !isMine(ip) && [...e.paths.keys()].some((p) => p.startsWith("/word-lists/")) && !did(e.paths).ranApp,
);
if (wordListOnly.length) {
  const total = wordListOnly.reduce((a, [, e]) => a + e.n, 0);
  console.log(`  Visited a word-list page without ever running the app: ${wordListOnly.length} addresses, ${total} requests.`);
  for (const [ip, e] of wordListOnly.slice(0, 15)) {
    const pages = [...e.paths.keys()].filter((p) => p.startsWith("/word-lists/")).length;
    console.log(`    ${ip}  ${String(e.n).padStart(3)} req, ${pages} word-list page${pages === 1 ? "" : "s"}  ${[...e.uas][0] ?? ""}`);
  }
  if (wordListOnly.length > 15) console.log(`    ...and ${wordListOnly.length - 15} more`);
  console.log("");
}

console.log(`  A cloud host is not proof of a crawler — a developer on a VPS is a person, and
  the most encouraging visit of launch week came from a Cloudflare WARP address.
  Read the owner and the agent together: Chrome 101 from Google LLC is a robot,
  and Firefox 135 from a consumer ISP is somebody's afternoon.\n`);
