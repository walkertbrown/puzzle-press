// Can a crawler that starts at the front door actually walk to every page?
//
// 2026-09-23. `test/links.mjs` has been green at 405/0 for weeks. It checks
// that no link is broken. It says nothing about whether the pages reach each
// other, and those are completely different questions — a site where every
// page links only to the home page has zero broken links and is uncrawlable
// past depth 1.
//
// That gap cost me the word lists. Ninety pages, each hanging off one index
// and linking to nothing else, and Googlebot had fetched five of them in a
// week while I theorised about thin content. The fix was a link mesh; this
// file is so that the next instance of the same defect is a red test instead
// of a fortnight of wrong hypotheses.
//
// What it does: builds the link graph out of the SHIPPED HTML (never out of
// the generator that wrote it), walks breadth-first from "/", and reports
// anything in the sitemap it cannot reach. Depth is reported too, because
// crawl frequency falls off with distance from the home page — a page is not
// really "found" at depth 6.
//
// Usage: node test/graph.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const SITE = "https://puzzlepress.bananafest-destiny.com";

// Every URL we have promised a search engine exists.
const sitemap = fs.readFileSync(path.join(PUBLIC, "sitemap.xml"), "utf8");
const declared = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

// URL -> file on disk. Anything that is not HTML is a leaf: it can be linked
// to but cannot link onward, which is exactly why a PDF needs inbound links.
const fileFor = (p) => {
  const rel = p === "/" ? "index.html" : p.replace(/^\//, "").replace(/\/$/, "/index.html");
  for (const c of [rel, `${rel}.html`]) {
    const abs = path.join(PUBLIC, c);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
};

const outLinks = (file) => {
  if (!file || !file.endsWith(".html")) return [];
  const html = fs.readFileSync(file, "utf8");
  return [...html.matchAll(/href="([^"#?]+)[^"]*"/g)]
    .map((m) => m[1])
    .filter((h) => !/^(https?:|mailto:|tel:|data:|javascript:)/i.test(h) || h.startsWith(SITE))
    .map((h) => (h.startsWith(SITE) ? h.slice(SITE.length) || "/" : h))
    .filter((h) => h.startsWith("/"))
    .map((h) => (h.length > 1 && h.endsWith("/") && h !== "/word-lists/" ? h.slice(0, -1) : h));
};

// Walk from the front door. A crawler with no sitemap sees exactly this.
const depth = new Map([["/", 0]]);
const queue = ["/"];
while (queue.length) {
  const cur = queue.shift();
  for (const next of outLinks(fileFor(cur))) {
    if (depth.has(next)) continue;
    depth.set(next, depth.get(cur) + 1);
    queue.push(next);
  }
}

let failed = 0;
const ok = (cond, what, got = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${what}${got ? `   (${got})` : ""}`);
  if (!cond) failed++;
};

// Group the sitemap so the report says which *kind* of page is stranded,
// rather than printing ninety lines that all mean one thing.
const GROUPS = [
  ["the landing page", (p) => p === "/"],
  ["the 6 type pages", (p) => /-generator$/.test(p)],
  ["the 3 calculators", (p) => /-calculator$/.test(p)],
  ["the 2 articles", (p) => p === "/how-to-make-a-puzzle-book" || p === "/compare"],
  ["the word lists", (p) => p.startsWith("/word-lists/")],
  ["the sample PDFs", (p) => p.startsWith("/samples/")],
  ["llms.txt", (p) => p === "/llms.txt"],
];

// The one documented exception, and it is narrow on purpose. /llms.txt is not
// addressed by following links — it is a convention, fetched at a fixed path by
// agents that already read /robots.txt, where it is announced, and it is in the
// sitemap besides. test/discoverable.mjs enforces both of those. Putting an
// "llms.txt" link in the footer of a hundred pages sold to KDP sellers would be
// developer noise aimed at people who are not developers.
//
// It stays listed rather than filtered out, because the honest report is "this
// file is unreachable by link, on purpose" and not silence. If anything else
// ever wants to join it here, that is a conversation, not an edit.
const LINK_EXEMPT = new Set(["/llms.txt"]);

console.log(`Walking ${declared.length} sitemap URLs from "/" through the shipped HTML.\n`);
for (const [name, match] of GROUPS) {
  const urls = declared.filter(match);
  if (!urls.length) continue;
  const lost = urls.filter((u) => !depth.has(u) && !LINK_EXEMPT.has(u));
  const depths = urls.filter((u) => depth.has(u)).map((u) => depth.get(u));
  const exempt = urls.filter((u) => LINK_EXEMPT.has(u) && !depth.has(u));
  const span = depths.length ? `depth ${Math.min(...depths)}–${Math.max(...depths)}` : "";
  ok(lost.length === 0, `${name}: all ${urls.length} reachable from the home page`,
    lost.length
      ? `stranded: ${lost.slice(0, 6).join(" ")}${lost.length > 6 ? ` +${lost.length - 6}` : ""}`
      : exempt.length ? `${exempt.join(" ")} — unreachable by link on purpose, announced in robots.txt` : span);
}

// Depth is the second half of the finding. Reachable at depth 7 is not the
// same as found, so name the deep pages even when nothing is stranded.
const deep = declared.filter((u) => depth.has(u) && depth.get(u) > 4);
ok(deep.length === 0, "nothing sits deeper than 4 clicks from the home page",
  deep.length ? `${deep.length} deeper: ${deep.slice(0, 5).map((u) => `${u}=${depth.get(u)}`).join(" ")}` : "deepest is 4 or less");

// The inverse question, and the one that caught the word lists: a page that
// links out but that nothing links back to is invisible to a crawler that did
// not start there.
const inbound = new Map(declared.map((u) => [u, new Set()]));
for (const u of declared) for (const t of outLinks(fileFor(u))) if (inbound.has(t) && t !== u) inbound.get(t).add(u);
const noInbound = declared.filter((u) => u !== "/" && !inbound.get(u).size && !LINK_EXEMPT.has(u));
ok(noInbound.length === 0, "every page has at least one page linking to it",
  noInbound.length ? `${noInbound.length} with none: ${noInbound.slice(0, 6).join(" ")}` : `all linked (${[...LINK_EXEMPT].join(" ")} exempt, see the note in this file)`);

// And the check that would actually have caught the word lists, which the two
// above would not have. Those 90 pages were reachable the whole time — depth 2,
// one inbound link each, every one of them from the same index. A star. Every
// check so far passes on a star, and a star is what Googlebot walked five of.
//
// So: in any group bigger than ten, a page must be linked from more than one
// place. That is the difference between an estate a crawler can wander and a
// list it samples. Ten is the threshold because a handful of pages hanging off
// the home page is a normal site; ninety hanging off one index is a pile.
//
// The rule is about pages that can pass a crawler onward, so it applies to HTML
// only. The first run of this check failed the twelve sample PDFs — eight of
// them linked only from their own type page — and that failure was wrong. The
// reason a star starves a crawler is that the points of the star lead nowhere
// else; a PDF leads nowhere else no matter how many pages link to it, because
// it has no links in it. Its one inbound link is from the most relevant page on
// the site, which is what a sample wants. Linking each type page to the other
// five types' PDFs would have turned this check green by adding link clutter
// for a machine, which is the failure mode the check exists to catch.
//
// Leaves are not unchecked: "every page has at least one page linking to it"
// above covers them, and all twelve pass it.
const isHtml = (u) => (fileFor(u) || "").endsWith(".html");
for (const [name, match] of GROUPS) {
  const urls = declared.filter((u) => match(u) && !LINK_EXEMPT.has(u) && isHtml(u));
  if (urls.length <= 10) continue;
  const lonely = urls.filter((u) => inbound.get(u).size < 2);
  const hubs = new Set(urls.flatMap((u) => [...inbound.get(u)]));
  const counts = urls.map((u) => inbound.get(u).size);
  ok(lonely.length === 0,
    `${name}: no page depends on a single hub for all its inbound links`,
    lonely.length
      ? `${lonely.length} of ${urls.length} have one inbound link only — a star, not a mesh`
      : `${hubs.size} distinct pages link into them, ${Math.min(...counts)}–${Math.max(...counts)} inbound each`);
}

// The small-group rule, and the one that caught the bug that sent me looking.
// The mesh check above only fires on groups bigger than ten, so it had nothing
// to say about the six type pages — and five of them had ninety-nine inbound
// links while /large-print-word-search-generator had two. Not stranded, not
// broken, and invisible: it was missing from the site footer, so every one of
// the ninety-nine pages carrying that footer linked to its five siblings and
// not to it. The page's own copy says large print ranks above every other KDP
// puzzle niche, and it was the one page search had the least chance of finding.
//
// A small group of peers is a nav. A nav is either complete or it is a bug, and
// the failure is silent because the page that is missing cannot report it. So:
// every page in a group of 2..10 links to every other page in that group.
for (const [name, match] of GROUPS) {
  const urls = declared.filter((u) => match(u) && !LINK_EXEMPT.has(u) && isHtml(u));
  if (urls.length < 2 || urls.length > 10) continue;
  const missing = [];
  for (const u of urls) {
    const out = new Set(outLinks(fileFor(u)));
    for (const v of urls) if (v !== u && !out.has(v)) missing.push(`${u} -/-> ${v}`);
  }
  ok(missing.length === 0, `${name}: every page links to all ${urls.length - 1} of its siblings`,
    missing.length
      ? `${missing.length} missing: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? ` +${missing.length - 4}` : ""}`
      : "the nav is complete in both directions");
}

if (failed) {
  console.log(`\nGRAPH FAILED — ${failed} check(s).`);
  console.log("A page in the sitemap that the site itself does not link to is a promise to a crawler that the site does not keep.");
  process.exit(1);
}
console.log("\nGRAPH OK — every sitemap URL is reachable by following links from the home page");
