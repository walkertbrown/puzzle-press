// Every /go/ arrival since 2026-09-25, from the worker's KV log (90-day expiry).
//
// The zone log behind `npm run traffic` keeps 24 hours, so it can say whether
// someone came through a channel link *today*. This says whether anyone did
// all week. Each arrival carries the network's owner, country and whether the
// user-agent called itself a bot — no address.
//
// Read it with the owner column in view. Whenever a link is added or changed,
// the platform's link checkers arrive within minutes from datacenter or
// business networks (09-25 14:07 UTC: YouTube, LLC and Verizon Business, in
// ordinary browser user-agents — the boss confirmed it was not them). A
// consumer ISP or mobile carrier hours later is what a person looks like.
//
// Usage: node scripts/golog.mjs [slug]
import { readFileSync } from "node:fs";

const creds = readFileSync(new URL("../../.git-credentials", import.meta.url), "utf8");
const cred = (k) => (creds.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1];
const token = process.env.CLOUDFLARE_API_TOKEN || cred("CLOUDFLARE_API_TOKEN");
const account = process.env.CLOUDFLARE_ACCOUNT_ID || cred("CLOUDFLARE_ACCOUNT_ID");
const ns = (readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").match(/"binding":\s*"GO_LOG",\s*"id":\s*"([0-9a-f]+)"/) || [])[1];
if (!token || !account || !ns) { console.error("need CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and the GO_LOG id in wrangler.jsonc"); process.exit(2); }

const prefix = process.argv[2] ? `${process.argv[2]}:` : "";
const keys = [];
let cursor = "";
do {
  const q = new URLSearchParams({ limit: "1000", ...(prefix && { prefix }), ...(cursor && { cursor }) });
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${ns}/keys?${q}`, { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!body.success) { console.error(JSON.stringify(body.errors)); process.exit(2); }
  keys.push(...body.result);
  cursor = body.result_info?.cursor || "";
} while (cursor);

const rows = keys.map((k) => {
  const [slug, ts] = k.name.split(/:(?=\d{4}-)/);
  return { slug, ts: ts.replace(/:[a-z0-9]+$/, ""), ...(k.metadata || {}) };
}).sort((a, b) => a.ts.localeCompare(b.ts));

console.log(`/go/ arrivals logged: ${rows.length}${prefix ? ` (${prefix.slice(0, -1)} only)` : ""}\n`);
const bySlug = {};
for (const r of rows) (bySlug[r.slug] ||= []).push(r);
for (const [slug, rs] of Object.entries(bySlug)) {
  const bots = rs.filter((r) => r.bot).length;
  console.log(`/go/${slug.padEnd(9)} ${String(rs.length).padStart(4)}   ${bots} said they were bots`);
}
if (rows.length) console.log("");
for (const r of rows) console.log(`  ${r.ts.slice(0, 16).replace("T", " ")}Z  /go/${r.slug.padEnd(9)} ${(r.cc || "--").padEnd(3)} ${r.bot ? "bot " : "    "} ${r.org} (AS${r.asn})`);
