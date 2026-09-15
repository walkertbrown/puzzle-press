// The Show HN thread, read directly, because Hacker News lets me.
//
// This is the opposite situation to Product Hunt, and the contrast is the whole
// reason this file exists. PH streams its comments in after hydration, so a
// curl gets the page and none of the words, and a headless browser gets
// Cloudflare's challenge; on 2026-09-15 that left me asking the boss to paste a
// thread I could not see. Hacker News has a public read-only API, no key, no
// challenge, and hands over the entire thread — every comment, nested, in one
// request. So on Wednesday nothing needs relaying.
//
// Two sources, both official and both plain JSON:
//   hn.algolia.com/api/v1/items/<id>     the whole thread, nested, one request
//   hacker-news.firebaseio.com/v0/...    topstories.json IS the front-page
//                                        ranking, in order. Index 0..29 is
//                                        page one. That is the number that
//                                        predicts the day.
// Both must be https — the http forms 301 and curl without -L returns nothing,
// which is how the first version of this file "found no comments".
//
// Usage:
//   node scripts/hnwatch.mjs <item-id | HN url>   watch that thread
//   node scripts/hnwatch.mjs                      find ours by URL, then watch
//
// Comments already seen are remembered in scripts/.hnseen.json so a re-run says
// what is NEW rather than reprinting forty comments. That file is local state,
// not history — delete it to see everything again.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SITE = "puzzlepress.bananafest-destiny.com";
const SEEN = new URL("./.hnseen.json", import.meta.url).pathname;

const arg = process.argv[2];
const id = arg?.match(/\d{4,}/)?.[0];

const get = async (url) => {
  const r = await fetch(url, { headers: { "user-agent": "puzzle-press-hnwatch" } });
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return r.json();
};

// If no id was given, find our own submission by the URL we submitted. Search
// by URL rather than by title: the title is a sentence somebody may edit, the
// URL is the thing HN dedupes on.
let itemId = id;
if (!itemId) {
  const found = await get(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(SITE)}&tags=story&hitsPerPage=5`);
  const ours = (found.hits || []).find((h) => (h.url || "").includes(SITE));
  if (!ours) {
    console.log(`\nNo Hacker News submission found for ${SITE}.`);
    console.log(`If it has just been posted, the search index lags by a few minutes —`);
    console.log(`pass the id directly: node scripts/hnwatch.mjs 45123456\n`);
    process.exit(0);
  }
  itemId = ours.objectID;
  console.log(`\nFound our submission by URL: ${itemId}`);
}

const item = await get(`https://hn.algolia.com/api/v1/items/${itemId}`);

// Front-page position. topstories.json is the ranking itself, so an index of 8
// means eighth on the front page, and "not in the list" means not ranked — not
// an error, and worth printing as the plain fact it is.
let rank = null;
try {
  const top = await get("https://hacker-news.firebaseio.com/v0/topstories.json");
  const i = top.indexOf(Number(itemId));
  rank = i === -1 ? null : i + 1;
} catch {
  rank = undefined; // the call failed; do not report a rank we did not get
}

const ago = (unixSeconds) => {
  const m = Math.round((Date.now() - unixSeconds * 1000) / 60000);
  if (m < 90) return `${m}m`;
  if (m < 60 * 36) return `${(m / 60).toFixed(1)}h`;
  return `${Math.round(m / 1440)}d`;
};
const age = ago(item.created_at_i);

console.log(`\nHacker News — ${item.title ?? "(no title)"}`);
console.log(`  https://news.ycombinator.com/item?id=${itemId}    ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`);
console.log(`\n  Posted          ${age} ago by ${item.author}`);
console.log(`  Points          ${item.points ?? 0}`);
console.log(
  `  Front page      ${
    rank === undefined ? "could not check" : rank ? `#${rank}${rank <= 30 ? "  <-- PAGE ONE" : " (page two or lower)"}` : "not ranked"
  }`,
);

// Flatten the nested thread. Depth matters when replying — a reply to a reply
// is a different conversation from a new top-level comment — so keep it.
const flat = [];
const walk = (node, depth) => {
  for (const c of node.children || []) {
    if (c.text) flat.push({ ...c, depth });
    walk(c, depth + 1);
  }
};
walk(item, 0);
flat.sort((a, b) => a.created_at_i - b.created_at_i);

// Seen-ids are keyed by thread, so testing this script against somebody else's
// Show HN cannot make our own thread look already-read.
const store = existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, "utf8")) : {};
const seen = new Set(store[itemId] || []);
const fresh = flat.filter((c) => !seen.has(c.id));

console.log(`  Comments        ${flat.length}   (${fresh.length} new since the last run of this script)\n`);

const strip = (html) =>
  html
    .replace(/<p>/g, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .trim();

if (!flat.length) {
  console.log("  No comments yet.\n");
} else {
  for (const c of flat) {
    const when = ago(c.created_at_i);
    const pad = "  ".repeat(Math.min(c.depth, 4));
    console.log(`${pad}  ${seen.has(c.id) ? " " : "*"} ${c.author}  ${when} ago  #${c.id}`);
    for (const line of strip(c.text).split("\n")) {
      if (line.trim()) console.log(`${pad}      ${line.trim()}`);
    }
    console.log("");
  }
  console.log(`  (* = new since the last run. Reply at https://news.ycombinator.com/item?id=${itemId})\n`);
}

store[itemId] = flat.map((c) => c.id);
writeFileSync(SEEN, JSON.stringify(store));
