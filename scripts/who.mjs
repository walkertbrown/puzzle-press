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

const rows = (
  await graphql(`query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequestsAdaptiveGroups(limit: 500, filter: {datetime_geq: "${since}", clientRequestHTTPHost_like: "%puzzle%"}, orderBy: [count_DESC]) {
      count dimensions { clientIP clientRequestPath edgeResponseStatus userAgent }
    } } } }`)
).viewer.zones[0].httpRequestsAdaptiveGroups;

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
  if (status === 404) e.s404 += r.count;
}

// The same four fingerprints traffic.mjs keys the funnel on, so this file and
// the dashboard can never disagree about what a visitor did.
const did = (paths) => ({
  ranApp: [...paths.keys()].some((p) => p === "/js/main.js"),
  stayed: [...paths.keys()].some((p) => p.startsWith("/js/heavy-")),
  madeBook: [...paths.keys()].some((p) => p.startsWith("/js/render-")),
  madeCover: [...paths.keys()].some((p) => p.startsWith("/js/cover-")),
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
  const stage = d.madeBook ? "MADE A BOOK" : d.stayed ? "landed and stayed" : "landed and left";
  // A scanner that also runs JavaScript still counts its 404s, and that is the
  // only thing separating it from a reader. Say so on the row: traffic.mjs
  // drops these from the funnel, so a row here that is not marked is a row the
  // headline number believed.
  const scanner = !mine && e.s404 >= 3;
  console.log(`  ${ip}${mine ? "   <-- THIS MACHINE, not a visitor" : scanner ? `   <-- SCANNER (${e.s404} 404s), excluded from the funnel` : ""}`);
  if (!mine) console.log(`    owner       ${org ?? "unknown (RDAP had no answer — do not assume person)"}`);
  for (const ua of e.uas) console.log(`    agent       ${ua.slice(0, 100)}`);
  console.log(`    did         ${stage}${d.madeCover ? " + made a cover" : ""}   (${e.n} requests${e.s404 ? `, ${e.s404} were 404s` : ""})`);
  console.log("");
}

// The scanners are not interesting individually, but their size is: it is the
// reason the headline number needs defending at all.
const scanners = visitors.filter(([, e]) => e.s404 >= 3);
if (scanners.length) {
  const total = scanners.reduce((a, [, e]) => a + e.n, 0);
  console.log(`  Ignored: ${scanners.length} scanner${scanners.length > 1 ? "s" : ""}, ${total} requests, all probing for files that do not exist.\n`);
}

console.log(`  A cloud host is not proof of a crawler — a developer on a VPS is a person, and
  the most encouraging visit of launch week came from a Cloudflare WARP address.
  Read the owner and the agent together: Chrome 101 from Google LLC is a robot,
  and Firefox 135 from a consumer ISP is somebody's afternoon.\n`);
