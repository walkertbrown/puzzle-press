// Launch-day dashboard, built from data Cloudflare and Stripe already hold.
// 2026-09-16: every page also carries Cloudflare's Web Analytics beacon now
// (boss's token) — cookieless, no PII, records pageviews/referrer/country
// only. It does not touch the site's actual promise, which was always about
// typed content specifically: "nothing you type leaves your browser" is
// still true and still enforced by test/privacy.mjs. This dashboard's own
// numbers below are unaffected too — they come from Worker/Stripe logs, not
// the beacon, which Cloudflare's Web Analytics UI reads separately.
//
// The funnel falls out of how the app is built. The PDF engine and the fonts
// are only fetched when somebody actually clicks Download, so a request for
// them is a person making a book — not a person who merely landed.
//
// Usage: node scripts/traffic.mjs [hoursBack]
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";

const hours = Number(process.argv[2] || 24);
const creds = readFileSync(new URL("../../.git-credentials", import.meta.url), "utf8");
const get = (k) => (creds.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();

const CF = get("CLOUDFLARE_API_TOKEN");
const ACCOUNT = get("CLOUDFLARE_ACCOUNT_ID");
const STRIPE = get("STRIPE_KEY");
const since = new Date(Date.now() - hours * 3600e3).toISOString().replace(/\.\d+Z$/, "Z");

async function graphql(query) {
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${CF}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const d = await r.json();
  if (d.errors) throw new Error(d.errors.map((e) => e.message).join("; "));
  return d.data;
}

// Worker-level totals. Per-path breakdown needs zone analytics, which this
// token does not have — see the note printed at the end.
const worker = await graphql(`query { viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
  workersInvocationsAdaptive(limit: 100, filter: {datetime_geq: "${since}", scriptName: "puzzle-press"}) {
    sum { requests errors subrequests } quantiles { cpuTimeP99 }
  } } } }`);

const w = worker.viewer.accounts[0].workersInvocationsAdaptive[0]?.sum ?? { requests: 0, errors: 0, subrequests: 0 };
console.log(`\nPuzzle Press — last ${hours}h (since ${since})\n`);
// The Worker only runs for /config.js, /api/* and paths that are not assets
// (404s, i.e. scanners) — real page views are served as static assets and
// never show up here. Both hosts are counted, including my test runs on
// workers.dev. The zone funnel below is the number that means something.
console.log(`  Worker invocations          ${w.requests}   (config.js, /api, and 404s on both hosts — not page views)`);
console.log(`  Errors                      ${w.errors}${w.errors ? "   <-- look at these" : ""}`);

// Money. The only source of truth for a sale. Ask Stripe for the window
// itself rather than the newest hundred and filtering — on a good day a
// hundred sessions is less than a day, and the dashboard would quietly
// under-report exactly when it mattered most.
const cutoff = Math.floor(Date.now() / 1000 - hours * 3600);
const recent = [];
for (let page = 0, after = null; page < 20; page++) {
  const q = new URLSearchParams({ limit: "100", "created[gte]": String(cutoff) });
  if (after) q.set("starting_after", after);
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions?${q}`, {
    headers: { authorization: `Bearer ${STRIPE}` },
  });
  const body = await res.json();
  const data = body.data ?? [];
  recent.push(...data);
  if (!body.has_more || data.length === 0) break;
  after = data[data.length - 1].id;
}
// test/livecheckout.mjs walks the live Buy link to the card form on every run,
// and loading a payment link creates a session. Those are mine, not customers.
// They are shown on their own line rather than dropped: if that number climbs
// on its own, something is opening checkout with my tag and I want to see it.
// Before this date nothing was tagged, and every session in the account was
// one of my own runs — there has never been a real one. Say so, rather than
// let a wider window (`npm run traffic 72`) show them as customers.
const TAGGED_SINCE = Date.parse("2026-09-13T22:25:00Z") / 1000;
// Two sessions that are mine and cannot prove it. On launch eve I wanted to
// confirm the Buy link really showed $19 in live mode, and I loaded the raw
// payment link in playwright instead of running test/livecheckout.mjs — which
// exists for exactly this, and whose header comment warns about exactly this.
// The tag rides in on the URL, so it can only be applied at creation; there is
// no way to label these after the fact. Naming them here is the only honest
// option, because the alternative is a line in the runbook telling me to
// subtract two at 9am, and that runbook already says a dashboard I have to
// mentally subtract from is one I will misread.
//
// **Do not open the Buy link directly. Run `node test/livecheckout.mjs`.**
const UNTAGGED_MINE = new Set([
  "cs_live_a1eUdkrksG9hi7ZNspJMgIfG3tTeVZk6hK1Mi1Emn7Y96EYYznHWd2wdPP", // 2026-09-15 04:29Z
  "cs_live_a13fMtn9S062QFhAyzHn4StU4FA9otu0DRU1m4sdn44TUEKzzCnbifO5Rt", // 2026-09-15 04:28Z
  // 2026-09-19: did it again, three times in a row — opened the raw Buy link
  // directly in Playwright to screenshot the checkout page instead of running
  // test/livecheckout.mjs, exactly what the warning above exists to stop.
  "cs_live_a1U8Kr6O2we6DytubBD3noD5x42RVxMhA6f13ghEf8dUuJnSPWMDxdZ18f", // 2026-09-19 13:07:53Z
  "cs_live_a18p5vNTcnrQdL89fieq6I4fX8EH1LF2RdnucGDoZk3Uf2xe1by8M8qLT5", // 2026-09-19 13:08:28Z
  "cs_live_a1NuwEEs9FY6GDpUBsO6OwlPXYEKrFo9TnvI4sqiUg6yFAtLxWfj1G9Zh1", // 2026-09-19 13:08:43Z
]);
const isSelfTest = (s) => s.created < TAGGED_SINCE || UNTAGGED_MINE.has(s.id) || String(s.client_reference_id ?? "").startsWith("selftest-");
const selftests = recent.filter(isSelfTest);
const real = recent.filter((s) => !isSelfTest(s));
const paid = real.filter((s) => s.payment_status === "paid");
const money = paid.reduce((a, s) => a + (s.amount_total ?? 0), 0) / 100;

console.log(`\n  Checkouts started           ${real.length}`);
console.log(`  Checkouts paid              ${paid.length}`);
console.log(`  Revenue                     $${money.toFixed(2)}`);
if (selftests.length) console.log(`  (my own test runs ignored:  ${selftests.length})`);
if (paid.length) {
  console.log("\n  Sales:");
  for (const s of paid) {
    const when = new Date(s.created * 1000).toISOString().slice(0, 16).replace("T", " ");
    console.log(`    ${when}  $${((s.amount_total ?? 0) / 100).toFixed(2)}  ${(s.customer_details || {}).email ?? "?"}`);
  }
}
if (real.length && !paid.length) {
  console.log("\n  Someone opened checkout and did not pay. Worth knowing why.");
}
// Per-path funnel. The free plan keeps zone analytics for 24 hours — but that
// is a limit on how far BACK this can reach, not on how narrow the window can
// be, so it follows the hours argument like everything above it and only caps
// at a day. This used to be hard-wired to 23.5h while the header above said
// "last 2h", which on launch morning is a trap with my name on it: I would ask
// for the last two hours, read a whole day's funnel underneath it, and think a
// launch was happening.
const ZONE = "4169ea6b92a0920d72f9ebc5f7653e9d";
const funnelHours = Math.min(hours, 23.5);
const daySince = new Date(Date.now() - funnelHours * 3600e3).toISOString().replace(/\.\d+Z$/, "Z");
// The live suites now run against the customer-facing domain — which is the
// right thing for testing and the wrong thing for this dashboard, because a
// full sweep makes dozens of books and covers and every one lands in the
// funnel. So ask twice and subtract: everything, and everything from this
// machine. Cloudflare tells us which IP it sees us as, so no guessing.
// Two queries rather than grouping by IP, because grouping truncates once a
// launch brings thousands of addresses and this has to survive that day.
//
// Both address families, and this is not a detail. Node reached the trace
// endpoint over IPv6 and that is the only address this ever excluded — but
// Playwright's browsers went out over IPv4, so every book and cover the test
// suite made was being counted as a stranger doing it. The pre-launch baseline
// on 2026-09-13 read "4 real browsers, 2 made a book, 3 made a cover"; three of
// those browsers were WebKit and two iPhone profiles on this machine, and the
// real number was one person who landed and left. curl picks the family, which
// fetch() will not.
const traceIp = (flag) =>
  new Promise((res) =>
    execFile("curl", ["-s", flag, "--max-time", "10", "https://puzzlepress.bananafest-destiny.com/cdn-cgi/trace"],
      (err, out) => res(err ? null : (String(out).match(/^ip=(.*)$/m) || [])[1]?.trim() || null)));
const nowIps = [...new Set((await Promise.all([traceIp("-4"), traceIp("-6")])).filter(Boolean))];

// And now the third version of this bug, which is the one that nearly set the
// launch baseline. Asking "what is my IP" answers for *this second*. IPv6
// privacy extensions rotate the interface identifier — the last 64 bits — every
// day or so, and Cloudflare recorded this morning's requests under an address
// this machine no longer has. On 2026-09-14 the report read 172 real browsers
// and 69 books made by strangers. Every one of those 69 was this machine,
// under the retired address 2600:1702:6328:b810:f21e:a44c:8a9c:3539.
//
// What does not rotate is the /64 network prefix. So: find every address that
// appeared in the window, keep the ones sharing my prefix, and treat the whole
// set as mine. One more query, and it survives the rotation.
const prefix64 = (ip) => (ip.includes(":") ? ip.split(":").slice(0, 4).join(":") + ":" : null);
const myPrefixes = [...new Set(nowIps.map(prefix64).filter(Boolean))];
let myIps = nowIps;
if (myPrefixes.length) {
  try {
    const seen = await graphql(`query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
      httpRequestsAdaptiveGroups(limit: 5000, filter: {datetime_geq: "${daySince}", clientRequestHTTPHost_like: "%puzzle%"}, orderBy: [count_DESC]) {
        count dimensions { clientIP }
      } } } }`);
    const kin = seen.viewer.zones[0].httpRequestsAdaptiveGroups
      .map((r) => r.dimensions.clientIP)
      .filter((ip) => myPrefixes.some((p) => ip.startsWith(p)));
    myIps = [...new Set([...nowIps, ...kin])];
  } catch { /* fall back to the addresses I hold right now */ }
}
const rotated = myIps.length - nowIps.length;
const myIp = nowIps.join(" and ") + (rotated > 0 ? ` (+${rotated} rotated address${rotated > 1 ? "es" : ""} on the same /64)` : "");

const pathCounts = async (extra = "") => {
  const zone = await graphql(`query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequestsAdaptiveGroups(limit: 200, filter: {datetime_geq: "${daySince}", clientRequestHTTPHost_like: "%puzzle%"${extra}}, orderBy: [count_DESC]) {
      count dimensions { clientRequestPath }
    } } } }`);
  const out = new Map();
  for (const r of zone.viewer.zones[0].httpRequestsAdaptiveGroups) out.set(r.dimensions.clientRequestPath, r.count);
  return out;
};

// Filtering the scanners out by PATH is not enough, and this took a trace
// through the raw rows to see. A scanner that probes /.env also fetches /,
// /js/main.js and the chunks — those paths are real, so they survive the
// `served` filter below and land in "...that ran the app" as a person.
// On 2026-09-14, four of the nine "real browsers" in the pre-launch baseline
// were one Azure host (57.154.3.151) that walked all 164 URLs of the site in
// three minutes and then asked for /.env, /.git/HEAD and /config.js.map. Two
// more were a Google Cloud address. The honest count was three.
//
// So judge the ADDRESS, not the request: anyone who asked for several things
// that do not exist is a scanner, and none of their requests count. Three,
// not one, because a real browser asks for /favicon.ico and gets a 404 — a
// WARP visitor tonight had exactly that one 404 and was a person.
//
// (The clean way to do this is by ASN — a datacenter is not a reader. The
// clientAsn dimension is real but gated behind a paid plan on this zone,
// checked, not assumed: "zone does not have access to the field 'clientasn'".)
const SCANNER_404S = 3;
// A browser asks for these on its own. Nobody typed them, and a 404 on one is
// a fact about this site, not a sign of a probe.
//
// 2026-09-21: 47.152.6.103 — a Verizon iPhone on iOS 26.6.2, 36 requests,
// landed and stayed, the most engaged visitor of the day who was not me — was
// being thrown out of the funnel as a SCANNER. Its three "probes" were
// /favicon.ico, /apple-touch-icon.png and /apple-touch-icon-precomposed.png:
// exactly what iOS Safari fetches by itself, and exactly three, which is the
// threshold. The rule was built to catch things hunting for leaked .env files
// and it was catching iPhones instead. It has almost certainly been doing that
// since the day it was written.
//
// The 404s were real, which is the other half of the story — the site shipped
// no touch icon at all, so anyone adding Puzzle Press to a home screen got a
// blank square. That is fixed in public/ now; this list is so the rule cannot
// make the same mistake about the next well-known path.
const BROWSER_ASKS_FOR = /^\/(favicon\.ico|apple-touch-icon.*\.png|browserconfig\.xml|site\.webmanifest|manifest\.json|sw\.js|\.well-known\/)/;
let scannerIps = [];
try {
  const probes = await graphql(`query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequestsAdaptiveGroups(limit: 5000, filter: {datetime_geq: "${daySince}", clientRequestHTTPHost_like: "%puzzle%", edgeResponseStatus: 404}, orderBy: [count_DESC]) {
      count dimensions { clientIP clientRequestPath }
    } } } }`);
  const probeCount = new Map();
  for (const r of probes.viewer.zones[0].httpRequestsAdaptiveGroups) {
    if (BROWSER_ASKS_FOR.test(r.dimensions.clientRequestPath)) continue;
    probeCount.set(r.dimensions.clientIP, (probeCount.get(r.dimensions.clientIP) ?? 0) + r.count);
  }
  scannerIps = [...probeCount]
    .filter(([, n]) => n >= SCANNER_404S)
    .map(([ip]) => ip)
    .filter((ip) => !myIps.includes(ip));
} catch { /* no scanner split rather than no dashboard */ }

// Who ran the app at all, by address. Needed because "Opened a sample PDF" was
// counting crawlers and I believed it for a day.
//
// 2026-09-21: the line read 4, then 6, while Download sat at 0, and I spent a
// morning on "why does somebody look at a finished book and not make one".
// who.mjs answered it: every one of those opens was Googlebot, YandexBot,
// Amazonbot or the Aceville crawler walking the links on the page. Not one
// person opened a sample. The mystery was the number.
//
// Same bug as "Used a calculator" counting HTML fetches and "made a book"
// counting chunk-*.js — a crawler-reachable URL is not an intention. Every
// other funnel stage is safe from it by construction: main.js, heavy-*,
// render-*, cover-* and the fonts are all fetched by script, and a crawler
// that fetches them has, by the only definition available here, run the app.
// The samples are plain <a href> PDFs, so they need the filter stated.
//
// "Ran the app" is not a bot filter either. Googlebot executes JavaScript: it
// fetched main.js twice tonight from two addresses and one of them opened the
// maze sample, so it scores on every stage a person does up to the Download
// click. The one thing these crawlers do reliably is say who they are, so take
// them at their word — a self-identified bot is the cheapest honest exclusion
// available on this plan, and the ones that lie (the Aceville fleet's fake
// "iPhone OS 13_2_3") are caught by the scanner rule or by who.mjs instead.
const BOT_UA = /bot|crawl|spider|slurp|Lightpanda|HeadlessChrome|python-requests|curl\//i;
let appIps = [];
let botAppIps = [];
// Every address that is not a self-identified bot, whether or not it ever ran
// the app. The word-list pages need this and appIps will not do: someone who
// lands on /word-lists/halloween from a pin and reads it without clicking
// through never fetches main.js, so filtering those pages by appIps would
// report zero for a page that is working. "Not a known crawler" is the weaker
// filter, and it is the right one for a stage keyed on an HTML page.
let humanIps = [];
// Addresses thrown out by the farm rule below, kept so the printer can say how
// many and not silently shrink a number I have been reading for two days.
let farmIps = [];

// A scraper farm does not say "bot" in its user-agent. It says Chrome 135 on
// Windows, then Chrome 132 on Android, then Safari 16.6 on a Mac, one agent per
// address, out of a block of addresses that all belong to the same datacentre.
//
// 2026-09-23: "Visited a word-list page 130" was the largest human number on
// this report, and I spent a minute believing the word-list pages were the
// biggest leak on the site — 130 readers, 0 of whom ran the app — before
// looking at who.mjs. Of the 288 addresses on that line, dozens were
// 47.79.13.x and 47.79.206.x: Alibaba Cloud, two /24s, a different consumer
// user-agent on every address, two or three word-list pages each, and not one
// request for a /px/ beacon or a byte of JavaScript. That is one crawler
// wearing a hundred hats. It is the sixth appearance of "a stage keyed on an
// HTML page counts robots", and the first that BOT_UA cannot see, because these
// ones are lying on purpose.
//
// The rule, deliberately strict, so that a real audience cannot trip it: a
// network (/24 for v4, /48 for v6) is a farm when at least five distinct
// addresses in it used at least three distinct user-agents and *not one* of
// them ever asked for a /px/ path. The last clause is what makes it safe. A
// carrier NAT or an office block is many addresses and many agents too — but
// real people load the page, the page fires a beacon, and the beacon is the
// thing a crawler skipping JavaScript cannot fake. Five silent addresses in one
// /24 with five different browsers is not a neighbourhood.
const net = (ip) => (ip.includes(":")
  ? ip.split(":").slice(0, 3).join(":") + "::/48"
  : ip.split(".").slice(0, 3).join(".") + ".0/24");
function farmsAmong(ips, uaByIp, pathsByIp) {
  const byNet = new Map();
  for (const ip of ips) {
    if (!byNet.has(net(ip))) byNet.set(net(ip), []);
    byNet.get(net(ip)).push(ip);
  }
  const out = [];
  for (const [, members] of byNet) {
    if (members.length < 5) continue;
    const uas = new Set(members.flatMap((ip) => [...(uaByIp.get(ip) || [])]));
    if (uas.size < 3) continue;
    const anyRanScript = members.some((ip) =>
      [...(pathsByIp.get(ip) || [])].some((p) => p.startsWith("/px/")));
    if (anyRanScript) continue;
    out.push(...members);
  }
  return out;
}
// Every stranger's address and the set of paths it asked for. This exists
// because on 2026-09-21 this script reported "...that ran the app 15" for a
// day in which who.mjs found five addresses fetching main.js — three of them
// not this machine, and two of those three Googlebot. One real person.
//
// The cause was not which path I keyed on. It was the unit. `hits()` sums
// `r.count`, so every funnel line below was a count of *requests* wearing a
// label that says people, and one visitor reloading four times reads exactly
// like four visitors. That is the fifth appearance of this family of bug and
// the first one that was not about crawler-reachable URLs at all — I had
// fixed the path four times and never once looked at what I was adding up.
//
// So: stages are counted in addresses, from this map, with the request count
// kept beside them. A person is an address, and a number with no denominator
// is not a number.
let pathsByIp = new Map();
try {
  const ran = await graphql(`query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequestsAdaptiveGroups(limit: 200, filter: {datetime_geq: "${daySince}", clientRequestHTTPHost_like: "%puzzle%", clientRequestPath: "/js/main.js"}, orderBy: [count_DESC]) {
      count dimensions { clientIP userAgent }
    } } } }`);
  // Judge the address across everything it asked for, not just this row.
  // Googlebot sends two different user-agents from one address — the honest
  // "compatible; Googlebot/2.1" string and a bare Chrome one — and 66.249.74.229
  // fetched main.js under the bare one, so a per-row test let it through as a
  // person. One agent saying "bot" anywhere condemns the whole address.
  const agents = await graphql(`query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequestsAdaptiveGroups(limit: 5000, filter: {datetime_geq: "${daySince}", clientRequestHTTPHost_like: "%puzzle%"}, orderBy: [count_DESC]) {
      count dimensions { clientIP userAgent }
    } } } }`);
  const botIps = new Set(agents.viewer.zones[0].httpRequestsAdaptiveGroups
    .filter((r) => BOT_UA.test(r.dimensions.userAgent))
    .map((r) => r.dimensions.clientIP));
  const seen = [...new Set(ran.viewer.zones[0].httpRequestsAdaptiveGroups.map((r) => r.dimensions.clientIP))]
    .filter((ip) => !myIps.includes(ip) && !scannerIps.includes(ip));
  botAppIps = seen.filter((ip) => botIps.has(ip));
  appIps = seen.filter((ip) => !botIps.has(ip));
  humanIps = [...new Set(agents.viewer.zones[0].httpRequestsAdaptiveGroups.map((r) => r.dimensions.clientIP))]
    .filter((ip) => !botIps.has(ip) && !myIps.includes(ip) && !scannerIps.includes(ip));

  // address -> paths it asked for, strangers only. Self-identified bots stay
  // out here, unlike humanIps: every stage below this point is keyed on a
  // script, and a crawler that runs the script has run the app — but it is
  // still not a person, and these lines are read as people.
  const perPath = await graphql(`query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequestsAdaptiveGroups(limit: 5000, filter: {datetime_geq: "${daySince}", clientRequestHTTPHost_like: "%puzzle%"}, orderBy: [count_DESC]) {
      count dimensions { clientIP clientRequestPath }
    } } } }`);
  for (const r of perPath.viewer.zones[0].httpRequestsAdaptiveGroups) {
    const ip = r.dimensions.clientIP;
    if (botIps.has(ip) || myIps.includes(ip) || scannerIps.includes(ip)) continue;
    if (!pathsByIp.has(ip)) pathsByIp.set(ip, new Set());
    pathsByIp.get(ip).add(r.dimensions.clientRequestPath);
  }

  // Now the farm rule, which needs both the agents and the paths. Farms come
  // out of humanIps entirely, not just out of the word-list line: an address
  // that is one hat on a crawler is not a person on the landing page either.
  const uaByIp = new Map();
  for (const r of agents.viewer.zones[0].httpRequestsAdaptiveGroups) {
    const ip = r.dimensions.clientIP;
    if (!uaByIp.has(ip)) uaByIp.set(ip, new Set());
    uaByIp.get(ip).add(r.dimensions.userAgent);
  }
  farmIps = farmsAmong(humanIps, uaByIp, pathsByIp);
  const farmSet = new Set(farmIps);
  humanIps = humanIps.filter((ip) => !farmSet.has(ip));
  for (const ip of farmIps) pathsByIp.delete(ip);
} catch { /* fall back to reporting the raw sample count, marked as unfiltered */ }

// How many *addresses* did a thing — the honest denominator for a funnel.
// Returns null when the address query failed, so the printer can say
// "unfiltered" rather than quietly print a zero it did not earn.
const people = (re) =>
  pathsByIp.size ? [...pathsByIp.values()].filter((paths) => [...paths].some((p) => re.test(p))).length : null;
// The same question, keeping the addresses instead of counting them — so two
// stages can be intersected. "How many people did A" and "how many people did
// A and then B" are different questions, and the second is the one that says
// whether a page is a front door or a dead end.
const whoDid = (re) =>
  [...pathsByIp].filter(([, paths]) => [...paths].some((p) => re.test(p))).map(([ip]) => ip);

try {
  const everyone = await pathCounts();
  const mine = myIps.length ? await pathCounts(`, clientIP_in: [${myIps.map((ip) => JSON.stringify(ip)).join(", ")}]`) : new Map();
  const scan = scannerIps.length ? await pathCounts(`, clientIP_in: [${scannerIps.map((ip) => JSON.stringify(ip)).join(", ")}]`) : new Map();
  const all = [...everyone].map(([path, count]) => ({
    count: count - (mine.get(path) ?? 0) - (scan.get(path) ?? 0),
    dimensions: { clientRequestPath: path },
  })).filter((r) => r.count > 0);
  const minePaths = [...mine.values()].reduce((a, c) => a + c, 0);
  const scanPaths = [...scan.values()].reduce((a, c) => a + c, 0);
  // Vulnerability scanners probe for leaked config files all day long and
  // every one of them 404s. They are not visitors, so keep them out of the
  // numbers — but say how many there were, so a jump is not mistaken for
  // interest.
  // 2026-09-19: this regex predates word-lists/, compare.html, the *-book-
  // generator pages, margin-calculator and how-to-make-a-puzzle-book — every
  // request to any of them was falling into "noise", mislabeled on the noise
  // line as "paths that do not exist" even though these are real, deployed,
  // sitemap-indexed pages. That made the 91 word-list pages currently being
  // pinned on Pinterest (marketing/pins.md) invisible to this script: no way
  // to tell whether that traffic is landing at all. Listing every real
  // top-level page explicitly, since KDP.
  // 2026-09-25: go\/ was missing, so every /go/ redirect fell into "noise"
  // and "Where they came from" below could never read anything but zero —
  // from the day it was added (09-21) until a 302 on /go/ytchan showed up in
  // a --trail and not here.
  const served = /^\/($|go\/|px\/|js\/|fonts\/|samples\/|gallery\/|pins\/|cards\/|video\/|word-lists\/|spine-calculator|royalty-calculator|margin-calculator|compare|how-to-make-a-puzzle-book|word-search-book-generator|sudoku-book-generator|maze-book-generator|criss-cross-book-generator|crossword-book-generator|large-print-word-search-generator|config\.js|api\/|demo\.gif|social-card|hero-book|robots|sitemap)/;
  const rows = all.filter((r) => served.test(r.dimensions.clientRequestPath));
  const noise = all.filter((r) => !served.test(r.dimensions.clientRequestPath)).reduce((a, r) => a + r.count, 0);
  const hits = (re) => rows.filter((r) => re.test(r.dimensions.clientRequestPath)).reduce((a, r) => a + r.count, 0);
  // What a browser really fetches, recorded from a live session rather than
  // assumed (test/funnel.mjs re-checks this and fails if a build moves it):
  //
  //   page load ............ main.js + several chunk-*.js
  //   stayed a moment ...... heavy-*.js and the big chunk, warmed at idle
  //   Download clicked ..... render-*.js and the fonts
  //   Cover made ........... cover-*.js
  //
  // The old version keyed "made a book" on any chunk-*.js, which every visitor
  // fetches just by landing. It reported people making books who had done
  // nothing but open the page.
  const requested = hits(/^\/$/);
  // Addresses, not requests — see the pathsByIp note above. `hits` is kept for
  // each stage so the request count can be printed beside the person count:
  // "1 person, 15 requests" is a true sentence and "15" was not.
  const ranTheApp = people(/^\/js\/main\.js$/);
  const ranReqs = hits(/^\/js\/main\.js$/);
  // Warming the PDF chunk happens on an idle callback after the first render,
  // so it is only reached by a browser that loaded the page and stayed put for
  // a moment. Next to "ran the app", the gap is the instant bounces.
  const stayed = people(/^\/js\/heavy-/);
  // Between "the page loaded" and "the button was pressed" there was nothing
  // at all — and on 2026-09-21 that gap was the whole question: 7 people
  // stayed and 0 downloaded, with no way to tell which step lost them. These
  // are the beacons src/ui/main.js fires, one empty 1x1 GIF per act, at most
  // once per page load. public/px/ is the entire vocabulary; they carry no id,
  // no session and nothing anybody typed.
  //
  // They only exist from the deploy that added them, so a window that reaches
  // back before it will show fewer of these than of the file-based stages.
  const sawTool = people(/^\/px\/tool\.gif$/);
  const touched = people(/^\/px\/touched\.gif$/);
  const browsed = people(/^\/px\/browsed\.gif$/);
  const pressed = people(/^\/px\/click\.gif$/);
  const pressedEmpty = people(/^\/px\/empty\.gif$/);
  const made = people(/^\/px\/made\.gif$/);
  const failed = people(/^\/px\/failed\.gif$/);
  // The money side, added 2026-09-23. Every stage above this line describes
  // somebody getting closer to the *free* book, which is the whole funnel this
  // dashboard has ever been able to draw. A Stripe session that is opened and
  // abandoned is invisible from this side — Stripe only tells me about the ones
  // that complete — so before these three, "nobody bought" and "nobody ever
  // opened the price" printed as the same silence.
  const openedPrice = people(/^\/px\/pay\.gif$/);
  // A free cover opens the price dialog by itself; that is `coverpay`, not
  // `pay`, since 2026-09-26. Before then this path counted as "opened the price".
  const shownPrice = people(/^\/px\/coverpay\.gif$/);
  const toCheckout = people(/^\/px\/checkout\.gif$/);
  const returning = people(/^\/px\/unlock\.gif$/);
  const pxTotal = hits(/^\/px\//);
  // The one number the current strategy stands or falls on. The calculators
  // are the only pages search has ever carried here, and the whole bet is that
  // a free utility is a front door. The handoff click cannot be read out of
  // the request log — it lands on /?trim=..&count=..#tool and Cloudflare logs
  // the path without the query — so it is its own beacon, and the pair with
  // "made" is the bet's actual scoreboard.
  const handoff = people(/^\/px\/handoff\.gif$/);
  const madeSet = new Set(whoDid(/^\/px\/made\.gif$/));
  const handoffToBook = whoDid(/^\/px\/handoff\.gif$/).filter((ip) => madeSet.has(ip)).length;
  // Which of the two buttons they used. The end-of-article CTA sits 4.4 screens
  // down a phone (5.4 on the margin page), so on 2026-09-21 a second one went
  // in beside the answer, where somebody who searched for a KDP calculator
  // actually is when they get their number. Both count as a handoff; only the
  // new one reports itself, so the placement can be judged rather than assumed.
  const handoffTop = people(/^\/px\/handofftop\.gif$/);
  // The same question for the two long article pages, added 2026-09-21 when the
  // calculators' fix prompted a sweep and found their only button 7.94 and
  // 13.05 screens down a phone. /how-to-make-a-puzzle-book is the highest
  // intent page on the site — the phrase is what a buyer types — so "read the
  // guide and came in" is worth its own line, separate from the raw page view
  // that a crawler can also produce.
  const guidePages = people(/^\/how-to-make-a-puzzle-book/);
  const comparePages = people(/^\/compare/);
  // As of 2026-09-23 "guide" and "compare" fire on load, not on the button —
  // "guideclick" and "compareclick" are the button. Same shape as list/listclick.
  const guideRan = people(/^\/px\/guide\.gif$/);
  const compareRan = people(/^\/px\/compare\.gif$/);
  const fromGuide = people(/^\/px\/guideclick\.gif$/);
  const fromCompare = people(/^\/px\/compareclick\.gif$/);
  // 2026-09-23. Both lines above are raw path counts, and neither page loads
  // main.js or fires a beacon on arrival — /px/guide and /px/compare fire only
  // on a button press. So a crawler that renders nothing and presses nothing is
  // indistinguishable from a reader who read the whole thing and left, and both
  // land in "Read the how-to guide". That is how 130 word-list readers turned
  // out to be one Alibaba scraper farm, and I do not want to learn it twice.
  //
  // realSet is the same union the REAL PEOPLE line is drawn on: fired any /px/
  // beacon, or fetched main.js. Intersecting with it answers the question the
  // raw count only looks like it answers — how many of today's actual people
  // opened this page.
  const realSet = new Set(whoDid(/^\/px\/|^\/js\/main\.js$/));
  const ofReal = (re) => (pathsByIp.size ? whoDid(re).filter((ip) => realSet.has(ip)).length : null);
  const guideReal = ofReal(/^\/how-to-make-a-puzzle-book/);
  const compareReal = ofReal(/^\/compare/);
  // The word-list pages, added 2026-09-21. The "Visited a word-list page"
  // number below is filtered only by "did not say bot in the user-agent", and
  // the note beside it already admits Amazonbot and Googlebot's bare Chrome
  // agent walk straight through that. So until now there was no way to tell
  // whether a single human being had ever opened one of these 91 pages. This
  // one needs a browser that runs JavaScript — the same line every other
  // funnel stage is drawn on.
  const listRan = people(/^\/px\/list\.gif$/);
  const listClicked = people(/^\/px\/listclick\.gif$/);
  // "Clicked Download", not "made a book" — and the difference cost me an hour.
  //
  // 2026-09-15 21:43 CT, the launch's only book: 3.82.141.143, one Amazon
  // us-east-1 address presenting three different operating systems across seven
  // requests (Chrome 124 on Linux, 125 on Mac, 126 on Windows). A person has one
  // OS. It loaded render-*.js AND cover-*.js and fetched no font at all.
  //
  // The click was real — these chunks are not preloaded, they are dynamic
  // import()s inside the download and cover handlers, so something invoked them.
  // What did not happen is the render: pdf-lib asks for the .ttf files at embed
  // time, so a book that actually came out always pulls fonts. **Loading the
  // module proves a click. Only the fonts prove a file.**
  //
  // Third time this exact shape: chunk-*.js counted landings as books, the
  // calculator HTML counted crawlers as users, and now the render module counts
  // clicks as books. Every time, the thing I keyed on sat one step upstream of
  // the act I was claiming.
  const clickedDownload = people(/^\/js\/render-/);
  // .ttf only: /fonts/ also holds LICENSE.txt now, and a crawler fetching a
  // licence file is not a person making a book.
  //
  // Undercounts by design: a second book in the same session re-uses cached
  // fonts. So fonts>0 proves a PDF was built, fonts==0 alongside a click proves
  // one was not, and the count itself is a floor rather than a tally of books.
  const fonts = people(/^\/fonts\/.*\.ttf$/);
  const covers = people(/^\/js\/cover-/);
  // Samples, counted only for addresses that ran the app — see the note above
  // the appIps query. The crawler total is kept and printed beside it, because
  // "0 people and 6 robots" is a different sentence from "0".
  const sampleTotal = hits(/^\/samples\//);
  const sampleByApp = appIps.length
    ? await pathCounts(`, clientIP_in: [${appIps.map((ip) => JSON.stringify(ip)).join(", ")}]`)
    : new Map();
  const sampleRows = [...sampleByApp]
    .filter(([path]) => /^\/samples\//.test(path))
    .sort((a, b) => b[1] - a[1]);
  const samples = sampleRows.reduce((a, [, c]) => a + c, 0);
  // A calculator is *used* when its script runs, not when its HTML is fetched.
  // Keyed on the script for the same reason "made a book" is keyed on the
  // render chunk rather than on a page view: the HTML is what a crawler takes,
  // the JS is what a person needs.
  //
  // 2026-09-15 18:15 CT, the first "Used a calculator page 1" of the launch:
  // three addresses in 43.x, one request each, all carrying the same spoofed
  // "iPhone OS 13_2_3" user-agent, one of them asking for /spine-calculator and
  // never for /spine.js. RDAP puts them in Aceville Pte Ltd — datacentre proxy
  // space, registered SG, announced from BR. A distributed crawler spreading
  // one request per address, and the dashboard called it a person using a tool.
  //
  // The old line was `hits(/calculator/)`, which also matched the HTML page,
  // so every crawler that fetched the page scored a use. Same error as
  // "ran the app" counting anything under /js/ — see the note above.
  //
  // 2026-09-23: keying on the bundle is better than keying on the HTML and
  // still not evidence of a person. A crawler that parses <script src> fetches
  // the bundle without running a line of it, which is exactly how the guide
  // reported six readers who were six crawlers. So each calculator now fires
  // its own load beacon from inside its module body — code that only runs in
  // something that executes JavaScript. The script-fetch number is kept beside
  // it, because the gap between the two IS the crawler count.
  const calcJs = people(/^\/(spine|royalty|margin)\.js$/);
  const calc = people(/^\/px\/(spine|royalty|margin)\.gif$/);
  const calcPages = people(/calculator/);
  // Which of the three search actually carries. The handoff cannot answer this
  // — it is one name from all three pages, on purpose, so the strategic number
  // stays one number.
  const calcEach = [
    ["spine", people(/^\/px\/spine\.gif$/)],
    ["royalty", people(/^\/px\/royalty\.gif$/)],
    ["margin", people(/^\/px\/margin\.gif$/)],
  ].filter(([, n]) => n);
  // What the Pinterest pins (marketing/pins.md) actually drive traffic to —
  // previously invisible entirely, see the `served` note above.
  //
  // 2026-09-21: this printed 197 on a day when 14 addresses ran the app and
  // nobody used a calculator, which reads as "the pins are working" and is the
  // third appearance of the same defect — a stage keyed on an HTML page counts
  // every crawler that walks the sitemap. There are 91 of these pages and one
  // sitemap pass over them is 91 "visits". Count only addresses that never
  // identified themselves as a bot, and print the crawler share beside it so
  // the raw number is still visible.
  const wordListTotal = hits(/^\/word-lists\//);
  const wordListByHuman = humanIps.length
    ? await pathCounts(`, clientIP_in: [${humanIps.slice(0, 250).map((ip) => JSON.stringify(ip)).join(", ")}]`)
    : new Map();
  const wordLists = [...wordListByHuman]
    .filter(([path]) => /^\/word-lists\//.test(path))
    .reduce((a, [, c]) => a + c, 0);
  // Even that is generous — "did not say bot" is the weakest filter here, and
  // on 2026-09-21 what survived it was Amazonbot (whose name sits past the
  // first 55 characters of its agent string), Googlebot's bare Chrome agent,
  // and a scatter of one-request Chrome hits. So print the number that cannot
  // be faked by a crawler alongside it: how many of these pages were read by
  // an address that went on to run the app. That is the only thing 91 word-list
  // pages were built to do, and it is the number to judge them by.
  const wordListToApp = [...(appIps.length ? sampleByApp : new Map())]
    .filter(([path]) => /^\/word-lists\//.test(path))
    .reduce((a, [, c]) => a + c, 0);
  const window = funnelHours >= 23.5 ? "Last 24h" : `Last ${hours}h`;
  console.log(`\n  ${window}, by what people did (a day is all the free plan keeps):`);
  // The number the business lives on, and until 2026-09-23 it was nowhere on
  // this report. Every other line here is a stage; this is the denominator.
  // An address that fetched a /px/ beacon ran JavaScript on a page of mine —
  // on the landing page, a word-list page, a calculator, anywhere. It is the
  // same crawler/person line every stage below is drawn on, and it is the only
  // honest answer to "how many people came today".
  //
  // It belongs at the top because of what the rest of the report looks like
  // without it: 362 requests, 130 word-list readers, 25 hits on robots.txt. I
  // read those numbers for two days as a business with a conversion problem.
  // They are a business with about seven people a day and a lot of robots.
  // Union, not just the beacons: an ad blocker eats /px/ but not main.js, and
  // a word-list reader fires /px/list without ever fetching main.js. Either one
  // alone undercounts, and the first draft of this line printed 6 above a "ran
  // the app 8" — a denominator smaller than one of its own stages.
  const realPeople = people(/^\/px\/|^\/js\/main\.js$/);
  if (realPeople !== null) {
    console.log(`    REAL PEOPLE (ran any page)  ${realPeople}   <-- everything else on this report is a stage of these ${realPeople}, or a robot`);
  }
  console.log(`    Requests for the page       ${requested}`);
  const nobody = ranTheApp === null;
  console.log(`    ...that ran the app         ${nobody ? `${ranReqs} requests (unfiltered — address lookup failed)` : `${ranTheApp} ${ranTheApp === 1 ? "person" : "people"}`}   <-- addresses, not requests; ${ranReqs} requests in total`);
  if (botAppIps.length) console.log(`      of which ${botAppIps.length} address${botAppIps.length > 1 ? "es" : ""} said "bot" in the user-agent — Googlebot runs JavaScript too`);
  console.log(`    ...and did not bounce       ${stayed}   <-- stayed long enough to idle-warm the PDF chunk`);
  if (pxTotal) {
    console.log(`    ...scrolled to the tool     ${sawTool}   <-- the generator came on screen (immediate on desktop)`);
    console.log(`    ...touched a control        ${touched}   <-- operated the form at all`);
    console.log(`    ...browsed the preview      ${browsed}   <-- pressed Previous or Next`);
    console.log(`    ...pressed Download         ${pressed}${pressedEmpty ? `   (${pressedEmpty} of them with every theme unticked — the button does nothing)` : ""}`);
    console.log(`    ...and the file came out    ${made}${failed ? `   (and it threw for ${failed})` : ""}`);
    // Not a continuation of the rungs above — the price can be opened without
    // ever making a book — so it is printed as its own short ladder rather than
    // indented under "the file came out".
    console.log(`    ...opened the price         ${openedPrice}   <-- pressed "$19 one-time" and read the dialog`);
    console.log(`    ...shown it after a cover   ${shownPrice}   <-- took a free cover; the dialog opened by itself`);
    console.log(`    ...went to Stripe           ${toCheckout}   <-- left this page for checkout; Stripe reports the ones that pay`);
    if (returning) console.log(`    ...already paid, locked out ${returning}   <-- a customer asking to be let back in. Read the mail.`);
  } else {
    console.log("    (no /px/ beacons in this window — either nobody ran the app, or they are newer than the window)");
  }
  if (ranTheApp === 0) console.log(`      nobody ran the app who was not a crawler or this machine — everything below is 0 by arithmetic, not by choice`);
  console.log(`    Opened a sample PDF         ${samples}${sampleTotal > samples ? `   (${sampleTotal - samples} more opens came from crawlers — not people)` : ""}`);
  for (const [path, count] of sampleRows) console.log(`      ${String(count).padStart(3)}  ${path.replace(/^\/samples\//, "")}`);
  console.log(`    Visited a word-list page    ${wordLists}   <-- what the Pinterest pins point at${wordListTotal > wordLists ? `   (${wordListTotal - wordLists} more were crawlers walking the sitemap)` : ""}`);
  if (farmIps.length) {
    const nets = [...new Set(farmIps.map(net))];
    console.log(`      (${farmIps.length} addresses in ${nets.length} datacentre block${nets.length > 1 ? "s" : ""} thrown out before this line: ${nets.slice(0, 6).join(", ")}${nets.length > 6 ? ", ..." : ""}`);
    console.log(`       — a different consumer user-agent on each, not one of them ran the page's script. One crawler, many hats.)`);
  }
  console.log(`      of those, ${wordListToApp} read by somebody who also ran the app — the only reason these pages exist`);
  if (pxTotal) console.log(`      ${listRan} ran JavaScript on one (the only real person/crawler line there is) and ${listClicked} pressed the button`);
  console.log(`    Used a calculator           ${calcPages} fetched the HTML${pxTotal ? `, ${calcJs} fetched its script, ${calc} ran it${calcEach.length ? `   (${calcEach.map(([n, c]) => `${n} ${c}`).join(", ")})` : ""}` : ""}`);
  if (pxTotal) console.log(`      of those, ${handoff} pressed "make a book"${handoff ? ` (${handoffTop} from the button beside the answer, the rest from the end of the article)` : ""} and ${handoffToBook} of those got a file   <-- whether the free utilities are a front door`);
  console.log(`    Read the how-to guide       ${guidePages} fetched the HTML${pxTotal ? `, ${guideRan} ran its script, ${fromGuide} pressed a button   <-- the highest-intent search phrase on the site` : ""}`);
  console.log(`    Read the comparison         ${comparePages} fetched the HTML${pxTotal ? `, ${compareRan} ran its script, ${fromCompare} pressed a button` : ""}`);
  if (guidePages && guideReal === 0 && compareReal === 0) {
    console.log(`      — and not one address that opened either page ran a line of JavaScript anywhere on this site today.`);
    console.log(`        Read both left-hand numbers as crawlers until the middle one moves.`);
  }
  console.log(`    Clicked Download            ${clickedDownload}${clickedDownload && !fonts ? "   (and no font was ever fetched — nothing rendered)" : ""}`);
  console.log(`    ...and a book came out      ${fonts ? `yes, ${fonts} ${fonts === 1 ? "person" : "people"} fetched fonts` : "no"}   <-- fonts embed at render time; the only proof a PDF exists`);
  console.log(`    Made a cover                ${covers}`);
  console.log(`    (scanner/bot noise ignored: ${noise} requests to paths that do not exist)`);
  if (scannerIps.length) console.log(`    (whole scanners ignored:    ${scannerIps.length} address${scannerIps.length > 1 ? "es" : ""}, ${scanPaths} requests — each asked for ${SCANNER_404S}+ things that do not exist, then read the site like a browser)`);
  if (minePaths) console.log(`    (my own machine ignored:    ${minePaths} requests from ${myIp})`);
  else if (!myIp) console.log("    (could not work out this machine's IP — my own test runs are IN these numbers)");
  if (requested && !ranTheApp) {
    console.log("\n  Every request for the page came from something that does not run JavaScript.");
  }

  // Which channel delivered anybody. Every link published off-site points at
  // /go/<channel>, which the worker 302s to the real page, so the channel is a
  // path and paths are the one thing this plan's log gives in full. See the
  // note at the bottom of this file for why referer is not an option.
  //
  // "arrivals" counts the redirect; the people line counts the ones that were
  // not crawlers. A crawler following a link out of a video description is a
  // normal thing and is not an arrival.
  const GO_LABEL = {
    yt: "YouTube, generator", ytcalc: "YouTube, royalty calc", ytspine: "YouTube, spine calc", ytchan: "YouTube, channel link",
    ytmargin: "YouTube, margin calc", ytguide: "YouTube, the guide",
    pin: "Pinterest pin", reddit: "Reddit post",
  };
  const goRows = Object.keys(GO_LABEL).map((slug) => {
    const re = new RegExp(`^/go/${slug}$`);
    return { slug, all: hits(re), real: people(re) };
  });
  const goAll = goRows.reduce((n, r) => n + r.all, 0);
  console.log("\n  Where they came from:");
  if (!goAll) {
    console.log("    nothing has arrived through a /go/ link yet — either the tagged links are not");
    console.log("    published anywhere people read, or nobody has followed one. Untagged arrivals");
    console.log("    (typed the domain, or an old link) are deliberately not attributed at all.");
  } else {
    for (const r of goRows.filter((r) => r.all)) {
      console.log(`    ${GO_LABEL[r.slug].padEnd(26)} ${String(r.real).padStart(3)}${r.all > r.real ? `   (${r.all - r.real} more were crawlers following the link)` : ""}`);
    }
  }

  console.log("\n  Top paths:");
  for (const r of rows.slice(0, 25)) console.log(`    ${String(r.count).padStart(5)}  ${r.dimensions.clientRequestPath}`);

  // The note that used to sit here said attribution was impossible on this plan.
  // It was half right and it cost a week.
  //
  // True part: the ZONE dataset's referer dimensions — clientRefererHost,
  // clientRequestReferer, clientRequestQuery — all exist in the schema and all
  // four fail with "zone ... does not have access to the field". Paid plans only.
  //
  // The part I never checked: since 2026-09-16 every page carries Cloudflare's
  // Web Analytics beacon, and its dataset is ACCOUNT-scoped, not zone-scoped.
  // `rumPageloadEventsAdaptiveGroups` carries refererHost, refererPath,
  // requestPath, countryName, deviceType and a bot flag, and this token reads it
  // fine. I had the answer to "where do my visitors come from" sitting in my own
  // account for a week while printing "deliberately not attributed at all"
  // underneath it.
  //
  // This does not touch the promise. The promise is about typed content —
  // nothing you enter leaves your browser — and it is still enforced by
  // test/privacy.mjs. My own /px/ beacons still carry a path and nothing else,
  // and still never read a referer. This is Cloudflare's cookieless beacon
  // reporting to Cloudflare, disclosed in the header of this file since the day
  // it went on.
} catch (e) {
  console.log("\n  (zone analytics unavailable: " + e.message.slice(0, 80) + ")");
}

// Where they actually came from, over a week rather than a day. A day is all the
// zone log keeps, but at seven or eight people a day a single day cannot tell a
// dead channel from a quiet one — and the whole question right now is which
// channel is worth another hour.
try {
  const rumSince = new Date(Date.now() - 7 * 86400e3).toISOString().replace(/\.\d+Z$/, "Z");
  const rum = await graphql(`query { viewer { accounts(filter: {accountTag: "${ACCOUNT}"}) {
    rumPageloadEventsAdaptiveGroups(limit: 500, filter: {datetime_geq: "${rumSince}", bot: 0}) {
      count dimensions { requestHost requestPath refererHost countryName deviceType }
    } } } }`);
  const mine = rum.viewer.accounts[0].rumPageloadEventsAdaptiveGroups
    .filter((r) => /puzzlepress/.test(r.dimensions.requestHost || ""));
  const total = mine.reduce((a, r) => a + r.count, 0);
  const tally = (pick) => {
    const m = new Map();
    for (const r of mine) {
      const v = pick(r.dimensions) || "(none)";
      m.set(v, (m.get(v) ?? 0) + r.count);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  console.log(`\n  Last 7 days by the page beacon — ${total} page loads, Cloudflare's own bot filter:`);
  console.log("    Referred by:");
  for (const [host, n] of tally((d) => d.refererHost).slice(0, 10)) {
    // An empty referer is not a mystery to solve: a typed address, a bookmark,
    // most links opened inside a phone app, and every https->http hop all look
    // identical here. It is the size of the "I cannot tell you" bucket.
    const label = host === "(none)" ? "(no referer — typed, bookmarked, or opened in an app)" : host;
    console.log(`      ${String(n).padStart(4)}  ${label}`);
  }
  console.log("    Landed on:");
  for (const [path, n] of tally((d) => d.requestPath).slice(0, 10)) console.log(`      ${String(n).padStart(4)}  ${path}`);
  const dev = tally((d) => d.deviceType);
  const country = tally((d) => d.countryName);
  console.log(`    Device:  ${dev.map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`    Country: ${country.slice(0, 6).map(([k, n]) => `${k} ${n}`).join(", ")}`);
} catch (e) {
  console.log("\n  (page-beacon analytics unavailable: " + e.message.slice(0, 80) + ")");
}
