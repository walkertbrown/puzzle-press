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

// Money. The only source of truth for a sale.
const res = await fetch("https://api.stripe.com/v1/checkout/sessions?limit=100", {
  headers: { authorization: `Bearer ${STRIPE}` },
});
const sessions = (await res.json()).data ?? [];
const cutoff = Date.now() / 1000 - hours * 3600;
const recent = sessions.filter((s) => s.created >= cutoff);
const paid = recent.filter((s) => s.payment_status === "paid");
const money = paid.reduce((a, s) => a + (s.amount_total ?? 0), 0) / 100;

console.log(`\n  Checkouts started           ${recent.length}`);
console.log(`  Checkouts paid              ${paid.length}`);
console.log(`  Revenue                     $${money.toFixed(2)}`);
if (paid.length) {
  console.log("\n  Sales:");
  for (const s of paid) {
    const when = new Date(s.created * 1000).toISOString().slice(0, 16).replace("T", " ");
    console.log(`    ${when}  $${((s.amount_total ?? 0) / 100).toFixed(2)}  ${(s.customer_details || {}).email ?? "?"}`);
  }
}
if (recent.length && !paid.length) {
  console.log("\n  Someone opened checkout and did not pay. Worth knowing why.");
}
// Per-path funnel. The free plan keeps zone analytics for 24 hours, so this
// is always "the last day" regardless of what was asked for above.
const ZONE = "4169ea6b92a0920d72f9ebc5f7653e9d";
const daySince = new Date(Date.now() - 23.5 * 3600e3).toISOString().replace(/\.\d+Z$/, "Z");
try {
  const zone = await graphql(`query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequestsAdaptiveGroups(limit: 40, filter: {datetime_geq: "${daySince}", clientRequestHTTPHost_like: "%puzzle%"}, orderBy: [count_DESC]) {
      count dimensions { clientRequestPath }
    } } } }`);
  const all = zone.viewer.zones[0].httpRequestsAdaptiveGroups;
  // Vulnerability scanners probe for leaked config files all day long and
  // every one of them 404s. They are not visitors, so keep them out of the
  // numbers — but say how many there were, so a jump is not mistaken for
  // interest. Only the workers.dev host escapes this zone, which is where my
  // own tests run, so the funnel below is real people on the real domain.
  const served = /^\/($|js\/|fonts\/|samples\/|gallery\/|spine-calculator|royalty-calculator|config\.js|api\/|demo\.gif|social-card|hero-book|robots|sitemap)/;
  const rows = all.filter((r) => served.test(r.dimensions.clientRequestPath));
  const noise = all.filter((r) => !served.test(r.dimensions.clientRequestPath)).reduce((a, r) => a + r.count, 0);
  const hits = (re) => rows.filter((r) => re.test(r.dimensions.clientRequestPath)).reduce((a, r) => a + r.count, 0);
  const landed = hits(/^\/$/);
  const pdfEngine = hits(/^\/js\/chunk-/);        // fetched only on the first Download click
  const fonts = hits(/^\/fonts\//);                 // ditto
  const covers = hits(/^\/js\/cover-/);
  const samples = hits(/^\/samples\//);
  const calc = hits(/calculator/);
  console.log("\n  Last 24h, by what people did (free plan keeps one day):");
  console.log(`    Landed on the page          ${landed}`);
  console.log(`    Opened a sample PDF         ${samples}`);
  console.log(`    Used a calculator page      ${calc}`);
  console.log(`    Clicked Download (engine)   ${pdfEngine}   <-- people who made a book`);
  console.log(`    Made a cover                ${covers}`);
  console.log(`    Font fetches                ${fonts}`);
  console.log(`    (scanner/bot noise ignored: ${noise} requests to paths that do not exist)`);
  console.log("\n  Top paths:");
  for (const r of rows.slice(0, 12)) console.log(`    ${String(r.count).padStart(5)}  ${r.dimensions.clientRequestPath}`);
} catch (e) {
  console.log("\n  (zone analytics unavailable: " + e.message.slice(0, 80) + ")");
}
