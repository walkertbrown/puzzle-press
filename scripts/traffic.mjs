// Launch-day dashboard, built from data Cloudflare and Stripe already hold.
// Nothing is added to the page: no analytics script, no cookie, no beacon.
// The site's promise that nothing you type leaves your browser stays true.
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
const isSelfTest = (s) => s.created < TAGGED_SINCE || String(s.client_reference_id ?? "").startsWith("selftest-");
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
      httpRequestsAdaptiveGroups(limit: 500, filter: {datetime_geq: "${daySince}", clientRequestHTTPHost_like: "%puzzle%"}, orderBy: [count_DESC]) {
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

try {
  const everyone = await pathCounts();
  const mine = myIps.length ? await pathCounts(`, clientIP_in: [${myIps.map((ip) => JSON.stringify(ip)).join(", ")}]`) : new Map();
  const all = [...everyone].map(([path, count]) => ({
    count: count - (mine.get(path) ?? 0),
    dimensions: { clientRequestPath: path },
  })).filter((r) => r.count > 0);
  const minePaths = [...mine.values()].reduce((a, c) => a + c, 0);
  // Vulnerability scanners probe for leaked config files all day long and
  // every one of them 404s. They are not visitors, so keep them out of the
  // numbers — but say how many there were, so a jump is not mistaken for
  // interest.
  const served = /^\/($|js\/|fonts\/|samples\/|gallery\/|spine-calculator|royalty-calculator|config\.js|api\/|demo\.gif|social-card|hero-book|robots|sitemap)/;
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
  const ranTheApp = hits(/^\/js\/main\.js$/);
  // Warming the PDF chunk happens on an idle callback after the first render,
  // so it is only reached by a browser that loaded the page and stayed put for
  // a moment. Next to "ran the app", the gap is the instant bounces.
  const stayed = hits(/^\/js\/heavy-/);
  const madeBook = hits(/^\/js\/render-/);
  const fonts = hits(/^\/fonts\//);
  const covers = hits(/^\/js\/cover-/);
  const samples = hits(/^\/samples\//);
  const calc = hits(/calculator/);
  const window = funnelHours >= 23.5 ? "Last 24h" : `Last ${hours}h`;
  console.log(`\n  ${window}, by what people did (a day is all the free plan keeps):`);
  console.log(`    Requests for the page       ${requested}`);
  console.log(`    ...that ran the app         ${ranTheApp}   <-- a real browser; the rest are crawlers`);
  console.log(`    ...and did not bounce       ${stayed}   <-- stayed long enough to idle-warm the PDF chunk`);
  console.log(`    Opened a sample PDF         ${samples}`);
  console.log(`    Used a calculator page      ${calc}`);
  console.log(`    Made a book                 ${madeBook}   <-- clicked Download and it rendered`);
  console.log(`    Made a cover                ${covers}`);
  console.log(`    Font fetches                ${fonts}   (should track "made a book")`);
  console.log(`    (scanner/bot noise ignored: ${noise} requests to paths that do not exist)`);
  if (minePaths) console.log(`    (my own machine ignored:    ${minePaths} requests from ${myIp})`);
  else if (!myIp) console.log("    (could not work out this machine's IP — my own test runs are IN these numbers)");
  if (requested && !ranTheApp) {
    console.log("\n  Every request for the page came from something that does not run JavaScript.");
  }
  console.log("\n  Top paths:");
  for (const r of rows.slice(0, 12)) console.log(`    ${String(r.count).padStart(5)}  ${r.dimensions.clientRequestPath}`);
} catch (e) {
  console.log("\n  (zone analytics unavailable: " + e.message.slice(0, 80) + ")");
}
