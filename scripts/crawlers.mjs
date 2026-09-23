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

// Coverage: how much of what we published has each engine actually looked at.
//
// 2026-09-23. The tally above says Googlebot made 112 requests in a week, which
// reads like attention. It touched 26 distinct paths. The sitemap offers 115.
// Those are very different facts and only one of them is about the estate.
//
// It matters because almost everything built for search is a page nobody has
// confirmed an engine has ever fetched: 91 word-list pages, 6 type pages, 3
// calculators, 2 articles. "The word lists are not working" and "the word lists
// have not been crawled" are the same zero on a dashboard and opposite
// instructions about what to do next — the same confusion as a silent beacon,
// one layer further out. Grouped, because 91 individual lines is not a finding.
const sitemapPaths = [...readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8")
  .matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
const GROUPS = [
  ["the landing page", (p) => p === "/"],
  ["the 3 calculators", (p) => /-calculator$/.test(p)],
  ["the 2 articles", (p) => p === "/how-to-make-a-puzzle-book" || p === "/compare"],
  ["the 6 type pages", (p) => /-generator$/.test(p)],
  ["the 91 word lists", (p) => p.startsWith("/word-lists/")],
  ["the 12 sample PDFs", (p) => p.startsWith("/samples/")],
];
console.log("  How much of the sitemap each one has actually fetched:\n");
console.log(`  ${"".padEnd(22)}${WANTED.filter((w) => tally.has(w)).map((w) => w.slice(0, 9).padStart(10)).join("")}`);
const live = WANTED.filter((w) => tally.has(w));
for (const [label, test] of GROUPS) {
  const want = sitemapPaths.filter(test);
  if (!want.length) continue;
  const cells = live.map((w) => {
    const seen = want.filter((p) => tally.get(w).paths.has(p)).length;
    return `${seen}/${want.length}`.padStart(10);
  });
  console.log(`  ${label.padEnd(22)}${cells.join("")}`);
}
const unseen = sitemapPaths.filter((p) => !live.some((w) => tally.get(w).paths.has(p)));
console.log(`\n  ${sitemapPaths.length - unseen.length} of ${sitemapPaths.length} published URLs have been fetched by at least one search engine in ${hours}h.`);
if (unseen.length) console.log(`  ${unseen.length} have not been looked at by any of them. A page no engine has fetched cannot be failing at search yet.`);

// A crawl is not an index entry, and this script deliberately does not pretend
// otherwise. Confirming a page is *in* Bing needs Bing Webmaster Tools, which
// is the boss's account to open. What this can say without anyone's password is
// whether the invitation was ever accepted.
console.log("\n  A crawl is not an index entry. Zero crawls is proof of no index entry;");
console.log("  a crawl is only proof the engine looked. Bing Webmaster Tools is the");
console.log("  only thing that settles the rest, and it needs the boss's account.\n");
