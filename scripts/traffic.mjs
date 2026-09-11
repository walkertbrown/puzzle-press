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
console.log(`  Requests to the site        ${w.requests}`);
console.log(`  Errors                      ${w.errors}${w.errors ? "   <-- look at these" : ""}`);
console.log(`  Stripe verify calls         ${w.subrequests}   (every /api/verify makes one)`);

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
console.log(
  "\n  Note: per-path numbers (how many reached the calculators, how many\n" +
    "  loaded the PDF engine) need zone analytics read, which this token\n" +
    "  lacks. Add 'Zone Analytics: Read' to it and this script can show the\n" +
    "  whole funnel.\n",
);
