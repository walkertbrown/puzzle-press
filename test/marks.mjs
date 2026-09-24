// The word "watermark" must not describe this product's free tier.
//
// Third sweep for this word. 2026-09-22 took it off the hero and the thumb bar
// and stopped there, because I only looked at the landing page. 2026-09-23 it
// turned up on the purchase dialog, at the exact moment of the sale. Later the
// same night it turned up on all six type pages, all ninety-one word-list
// pages, the three calculators, the guide, the comparison page, llms.txt and
// four video end cards — every acquisition page on the site.
//
// Why it matters more than a word usually does. What the free tier does:
//
//   * a 7pt grey line, centred in the page footer: "Made with Puzzle Press,
//     free preview — puzzlepress.bananafest-destiny.com" (src/pdf/render.js, WATERMARK / footer())
//   * PREVIEW across the cover
//
// What a KDP publisher pictures when they read "watermarked" is a diagonal
// stamp across the artwork — a book they could not show anyone, let alone
// proof. That is a materially worse offer than the real one, and I was
// publishing it in my own words on the pages built to acquire people, while
// the beacons said nobody was pressing Download.
//
// So: no page may use the word about *us*. It stays legal about somebody
// else's product, where it is a true statement of fact — the good free
// generators genuinely add no mark — so the allowlist is by exact line, and
// adding to it should feel deliberate.
//
// Usage: node test/marks.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

// Sentences about competitors' products, which do not carry a mark. Matched as
// substrings of the offending line.
const ABOUT_SOMEBODY_ELSE = [
  "bulk-make fifty puzzles with answer keys, no account and no watermark",
  "bulk-generate a whole set with answer keys, free, with no watermark and no account",
  // Engineering prose in the README about a test that used to be unfalsifiable.
  // It names the suite, it does not describe the product to a buyer.
  "The watermark test used to grep the PDF bytes for the words",
  // PuzzleBindery's free tier, described in its own terms on /compare. This is
  // the rule working: the sentence is about somebody else's product and had to
  // be declared to survive.
  "free to build with a watermarked proof and a one-time payment to remove it",
];

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    // public/js is an esbuild bundle of src/, which has its own comments and is
    // not read by anybody. Source comments are fine; published prose is not.
    if (e.isDirectory()) { if (e.name !== "js") walk(f); continue; }
    if (/\.(html|txt|json|xml|webmanifest)$/.test(e.name)) files.push(f);
  }
})(PUBLIC);

// 2026-09-23: README.md is a published surface and this suite did not scan it.
// A search for this product's own name returns the GitHub mirror *first* — above
// the site — so its README is, in practice, the landing page for anybody who
// looks the product up by name. It still said the free book was "watermarked"
// three weeks after that word was swept out of every page under public/. The
// lesson from the first sweep was "grep the whole repo, not the page you noticed
// it on"; the repo includes the file that ranks highest.
files.push(path.join(PUBLIC, "..", "README.md"));

const bad = [];
for (const f of files) {
  // Blank the inside of HTML comments, keeping the newlines so line numbers
  // still point at the file. A note explaining why this rule exists is not a
  // claim about the product, and these notes are multi-line, so a per-line
  // "starts with <!--" test would only catch their first line.
  const text = fs.readFileSync(f, "utf8").replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (!/watermark/i.test(line)) return;
    if (ABOUT_SOMEBODY_ELSE.some((ok) => line.includes(ok))) return;
    bad.push(`${path.relative(PUBLIC, f)}:${i + 1}  ${line.trim().slice(0, 120)}`);
  });
}

console.log(`scanned ${files.length} published files — everything under public/, plus README.md`);
if (bad.length) {
  console.log(`\n${bad.length} line(s) call this product's free tier watermarked:\n`);
  for (const b of bad) console.log("  " + b);
  console.log("\nIt is a line in the page footer and PREVIEW on the cover. Say that.");
  process.exit(1);
}
console.log('MARKS OK — no published page describes the free tier as "watermarked"');
