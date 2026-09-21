// Which search engines have actually found the site.
//
// Why this is a first-party question. IndexNow (scripts/indexnow.mjs) has been
// pinging Bing since launch week and I had never once verified that anything
// came of it. The obvious check is to scrape a `site:` query, and on 2026-09-21
// I tried three ways to do that — Bing's search page, Bing's RSS endpoint, and
// DuckDuckGo's HTML endpoint. All three lie to a robot. The RSS endpoint failed
// its own control: `site:anthropic.com` came back with six Seattle Seahawks
// links. Had I skipped the control I would have written down "Bing has indexed
// nothing", which happens to be the right answer from entirely fake evidence.
//
// The zone logs cannot lie about this. A search engine that is going to index a
// page has to fetch it first, from an address it owns, under a user-agent it
// publishes. So count the crawlers instead of asking the search box. It does
// not prove a page is *in* the index, but zero crawl requests proves it is not,
// and the shape of the crawl is the earliest signal either way.
//
// Usage: node scripts/crawlers.mjs [hoursBack]     (npm run crawlers)
import { readFileSync } from "node:fs";

const hours = Number(process.argv[2] || 24);
const creds = readFileSync(new URL("../../.git-credentials", import.meta.url), "utf8");
const CF = (creds.match(/^CLOUDFLARE_API_TOKEN=(.*)$/m) || [])[1]?.trim();
const ZONE = "4169ea6b92a0920d72f9ebc5f7653e9d";
const since = new Date(Date.now() - hours * 3600e3).toISOString().replace(/\.\d+Z$/, "Z");

// The engines whose absence is a finding, in the order I care about them.
// Bing first because it is the one IndexNow is supposed to be feeding, and
// because DuckDuckGo and a good deal of ChatGPT search sit on Bing's index —
// no bingbot is three absences, not one.
const WANTED = ["bingbot", "BingPreview", "Googlebot", "DuckDuckBot", "Applebot", "YandexBot", "PetalBot"];
const OTHERS = ["Amazonbot", "SemrushBot", "AhrefsBot", "facebookexternalhit", "Pinterest", "Bytespider",
  "GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot", "SofyaBot", "Lightpanda", "DataForSeoBot"];
const NAMED = new RegExp(`(${[...WANTED, ...OTHERS].join("|")})`, "i");

const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { authorization: `Bearer ${CF}`, "content-type": "application/json" },
  body: JSON.stringify({
    query: `query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
      httpRequestsAdaptiveGroups(limit: 2000, filter: {datetime_geq: "${since}", clientRequestHTTPHost_like: "%puzzle%"}, orderBy: [count_DESC]) {
        count dimensions { userAgent clientRequestPath }
      } } } }`,
  }),
});
const d = await r.json();
if (d.errors) { console.error(d.errors.map((e) => e.message).join("; ")); process.exit(1); }

const tally = new Map();
for (const row of d.data.viewer.zones[0].httpRequestsAdaptiveGroups) {
  const m = row.dimensions.userAgent.match(NAMED);
  if (!m) continue;
  const key = WANTED.concat(OTHERS).find((w) => w.toLowerCase() === m[1].toLowerCase());
  if (!tally.has(key)) tally.set(key, { n: 0, paths: new Map() });
  const e = tally.get(key);
  e.n += row.count;
  e.paths.set(row.dimensions.clientRequestPath, (e.paths.get(row.dimensions.clientRequestPath) ?? 0) + row.count);
}

console.log(`\nSearch engines on puzzlepress — last ${hours}h\n`);
const line = (name) => {
  const e = tally.get(name);
  if (!e) return console.log(`  ${"0".padStart(6)}  ${name.padEnd(20)}  never came`);
  const top = [...e.paths].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p).join("  ");
  console.log(`  ${String(e.n).padStart(6)}  ${name.padEnd(20)}  ${e.paths.size} paths   ${top}`);
};
for (const w of WANTED) line(w);

const rest = OTHERS.filter((o) => tally.has(o));
if (rest.length) {
  console.log("\n  Everything else that identified itself:");
  for (const o of rest.sort((a, b) => tally.get(b).n - tally.get(a).n)) {
    console.log(`  ${String(tally.get(o).n).padStart(6)}  ${o.padEnd(20)}  ${tally.get(o).paths.size} paths`);
  }
}

// A crawl is not an index entry, and this script deliberately does not pretend
// otherwise. Confirming a page is *in* Bing needs Bing Webmaster Tools, which
// is the boss's account to open. What this can say without anyone's password is
// whether the invitation was ever accepted.
console.log("\n  A crawl is not an index entry. Zero crawls is proof of no index entry;");
console.log("  a crawl is only proof the engine looked. Bing Webmaster Tools is the");
console.log("  only thing that settles the rest, and it needs the boss's account.\n");
