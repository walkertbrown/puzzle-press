// Support lookup: find a buyer's payment and say what to tell them.
//
// Two places promise a customer that a person will sort it out — the Worker,
// when the scan gives up, and the reply template in marketing/support.md. Until
// this script there was nothing behind that promise except me improvising
// against the Stripe API at whatever hour the email arrived.
//
// The thing to understand before reading the output: a licence is a record in
// localStorage holding an email and a token, and nothing validates the token.
// There is no licence to issue and no database to write to. So the fix for a
// stuck buyer is never "unlock their account" — it is always "find the exact
// address Stripe has on the payment and tell them to type that one." The whole
// job is a lookup, which is why this is read-only and always will be.
//
//   node scripts/unlock.mjs jane@example.com     an email, or part of one
//   node scripts/unlock.mjs "Jane Smith"         the name on the card
//   node scripts/unlock.mjs 4242                 the card's last four
//   node scripts/unlock.mjs cs_live_a1b2c3       a session id from the receipt
//   node scripts/unlock.mjs --recent             everything from the last 7 days
//
// Read-only: it sends GET requests to Stripe and nothing else.
import { readFileSync } from "node:fs";

const creds = readFileSync(new URL("../../.git-credentials", import.meta.url), "utf8");
const STRIPE = (creds.match(/^STRIPE_KEY=(.*)$/m) || [])[1]?.trim();
if (!STRIPE) {
  console.error("No STRIPE_KEY in .git-credentials — cannot look anything up.");
  process.exit(2);
}

const args = process.argv.slice(2);
const recent = args.includes("--recent");
const needle = args.filter((a) => !a.startsWith("--")).join(" ").trim().toLowerCase();
if (!needle && !recent) {
  console.error("Usage: node scripts/unlock.mjs <email | name | last4 | session id> [--recent]");
  process.exit(2);
}

// Seven days back by default. Someone emailing support paid recently; a wider
// window mostly adds my own test sessions to the noise.
const DAYS = Number((args.find((a) => a.startsWith("--days=")) || "").slice(7)) || 7;
const since = Math.floor(Date.now() / 1000 - DAYS * 86400);

// Same override as the Worker's, and for the same reason: the branch that
// matters here is the one that prints the reply, and there is no paid session
// in the live account to make it run. Shipping a support tool whose only
// important branch has never executed is the exact mistake phase 19 was about.
const API = process.env.STRIPE_API || "https://api.stripe.com";

const get = async (path, params = {}) => {
  const q = new URLSearchParams(params);
  const res = await fetch(`${API}/v1/${path}?${q}`, {
    headers: { authorization: `Bearer ${STRIPE}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${body.error?.message || "unknown"}`);
  return body;
};

// A session id straight off a receipt is an exact lookup, not a search.
let sessions = [];
if (/^cs_(live|test)_/.test(needle)) {
  try {
    sessions = [await get(`checkout/sessions/${args[0]}`)];
  } catch (e) {
    console.log(`\nNo session with that id: ${e.message}\n`);
    process.exit(1);
  }
} else {
  // Everything in the window, then filter here. Stripe's own email filter is
  // exact and case-sensitive, which is exactly the situation that sends people
  // to support, so filtering server-side would hide the buyer I am looking for.
  for (let page = 0, after = null; page < 20; page++) {
    const params = { limit: "100", "created[gte]": String(since) };
    if (after) params.starting_after = after;
    const body = await get("checkout/sessions", params);
    const data = body.data || [];
    sessions.push(...data);
    if (!body.has_more || !data.length) break;
    after = data[data.length - 1].id;
  }
}

const fields = (s) => {
  const cd = s.customer_details || {};
  return [cd.email, cd.name, cd.phone, s.id, s.client_reference_id, s.customer_email]
    .filter(Boolean).map(String);
};
// last4 needs the PaymentIntent's charge, which is a second call per session —
// only worth making when the needle actually looks like four digits.
const isLast4 = /^\d{4}$/.test(needle);

let matches = recent && !needle
  ? sessions
  : sessions.filter((s) => fields(s).some((f) => f.toLowerCase().includes(needle)));

if (isLast4 && !matches.length) {
  process.stdout.write(`  (no name/email match; checking card numbers on ${sessions.length} sessions`);
  for (const s of sessions) {
    if (!s.payment_intent) continue;
    try {
      const pi = await get(`payment_intents/${s.payment_intent}`, { "expand[]": "latest_charge" });
      const card = pi.latest_charge?.payment_method_details?.card;
      if (card?.last4 === needle) matches.push(s);
    } catch {}
  }
  console.log(")");
}

const money = (s) => `$${((s.amount_total ?? 0) / 100).toFixed(2)} ${String(s.currency || "").toUpperCase()}`;
const when = (s) => new Date(s.created * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
// scripts/traffic.mjs tags its own checkout runs so the dashboard can ignore
// them. Say so here too, or I will spend launch night reading my own tests.
const isSelfTest = (s) => String(s.client_reference_id ?? "").startsWith("selftest-");

console.log(`\nSearched ${sessions.length} checkout session(s) from the last ${DAYS} days`
  + `${needle ? ` for ${JSON.stringify(needle)}` : ""}.\n`);

if (!matches.length) {
  console.log("  Nothing matched.\n");
  console.log("  What that means, and what to say:");
  console.log("   - If they have a Stripe receipt, ask them to forward it. The receipt");
  console.log("     carries the session id (cs_live_…); look that up directly, it is exact.");
  console.log("   - Widen the window: --days=60. Seven days is the default because");
  console.log("     somebody emailing support usually paid this week, not in the spring.");
  console.log("   - If there is genuinely no payment, they are not a customer yet. That");
  console.log("     happens: a card declined and they think it went through. Check their");
  console.log("     bank statement wording with them before telling them anything.");
  console.log("   - Do NOT hand out a licence to make the email stop. There is no refund");
  console.log("     to claw back and no way to tell later that it was a gift.\n");
  process.exit(1);
}

for (const s of matches) {
  const cd = s.customer_details || {};
  const email = cd.email || null;
  const paid = s.payment_status === "paid";
  const complete = s.status === "complete";
  const findable = paid && complete && Boolean(email);
  console.log(`  ${s.id}${isSelfTest(s) ? "   <-- one of my own test runs, not a customer" : ""}`);
  console.log(`    when            ${when(s)}`);
  console.log(`    amount          ${money(s)}`);
  console.log(`    status          ${s.status} / ${s.payment_status}${paid && complete ? "" : "   <-- not a completed payment"}`);
  console.log(`    name on card    ${cd.name || "(none)"}`);
  console.log(`    email on file   ${email ?? "(none — Stripe has no address for this payment)"}`);
  console.log(`    livemode        ${s.livemode}`);
  console.log(`    /api/verify     ${findable ? "WILL find this" : "will NOT find this"}`);
  console.log("");

  if (findable) {
    // The one thing support actually needs. The lowercase note matters: the
    // Worker's exact filter misses a case difference and falls back to a scan,
    // which finds them either way — so the address is what to send, and the
    // capitals do not have to be copied exactly.
    console.log("    Reply with this:");
    console.log("");
    console.log(`      Found it — the payment is on ${email} (${money(s)}, ${when(s).slice(0, 10)}).`);
    console.log(`      Go to puzzlepress.bananafest-destiny.com, click "Already paid? Unlock",`);
    console.log(`      and enter exactly:  ${email}`);
    console.log("      Capitals do not matter. That unlocks it on that device straight away.");
    console.log("");
  } else if (paid && complete && !email) {
    console.log("    They paid and Stripe has NO email on the session, so /api/verify");
    console.log("    cannot ever match them. This is the one case the site cannot fix");
    console.log("    itself. Refund them and ask them to buy again with an email, or");
    console.log("    tell them plainly that the unlock is keyed to the receipt address");
    console.log("    and theirs is blank. Do not invent one — the next lookup would");
    console.log("    not find it either.");
    console.log("");
  } else if (!paid) {
    console.log("    They started checkout and did not complete a payment. Nothing was");
    console.log("    charged. Say so gently and send them the Buy link — people do");
    console.log("    genuinely believe a declined card went through.");
    console.log("");
  }
}

const usable = matches.filter((s) => s.payment_status === "paid" && s.status === "complete");
console.log(`  ${matches.length} match(es), ${usable.length} of them a real completed payment.\n`);
