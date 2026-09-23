// Every file published for a machine to read must be reachable by that machine.
//
// 2026-09-23. `public/llms.txt` has existed since launch week — a careful,
// accurate summary of the whole site written for the assistants that are
// becoming a real way people find a tool like this. In seven days it was
// fetched twice, both times by `curl/8.5.0`, which was me. Not one crawler has
// ever opened it.
//
// The reason is dull: it was an orphan. Not in robots.txt, not in the sitemap,
// not linked from a single page, and `llms.txt` is a proposed convention that
// nothing goes looking for on its own. Meanwhile ClaudeBot fetched
// /sitemap.xml 64 times that week and GPTBot 7 — the door was being knocked on
// constantly and the file was not behind it.
//
// This is the same mistake as the stale <lastmod> in a different costume:
// publishing a thing and never checking that the audience it was written for
// can get to it. So: a machine-readable file has to be announced somewhere a
// machine already looks, or it does not count as published.
//
// Usage: node test/discoverable.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const read = (f) => fs.readFileSync(path.join(PUBLIC, f), "utf8");

// Files written for machines, and the places a machine is entitled to look.
// Add a file here when you publish one, or it will quietly go unread.
const FOR_MACHINES = ["llms.txt", "sitemap.xml", "robots.txt"];

const robots = read("robots.txt");
const sitemap = read("sitemap.xml");
const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => new URL(m[1]).pathname);

let failed = 0;
const ok = (cond, what, got = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${what}${got ? `   (${got})` : ""}`);
  if (!cond) failed++;
};

for (const f of FOR_MACHINES) {
  ok(fs.existsSync(path.join(PUBLIC, f)), `${f} exists`);
}

// robots.txt is the one file every crawler fetches first, and the sitemap is
// the one list they walk. Being in either is enough; being in neither is what
// happened to llms.txt.
const announced = (f) => robots.includes(f) || locs.includes(`/${f}`);
ok(announced("llms.txt"), "llms.txt is announced in robots.txt or the sitemap",
  `${robots.includes("llms.txt") ? "robots " : ""}${locs.includes("/llms.txt") ? "sitemap" : ""}`.trim() || "neither");
ok(robots.includes("Sitemap:"), "robots.txt points at the sitemap");
ok(/^\s*User-agent:\s*\*/m.test(robots) && /^\s*Allow:\s*\//m.test(robots), "robots.txt allows everything");
ok(!/^\s*Disallow:\s*\/\s*$/m.test(robots), "and does not disallow the whole site");
ok(!/crawl-delay/i.test(robots), "and sets no crawl-delay");

// An llms.txt whose links have rotted is worse than none: it is a confident,
// machine-readable list of 404s. Check every one against what is on disk.
const llms = read("llms.txt");
const links = [...llms.matchAll(/\]\((https:\/\/puzzlepress[^)]+)\)/g)].map((m) => new URL(m[1]).pathname);
const missing = links.filter((p) => {
  const rel = p === "/" ? "index.html" : p.replace(/^\//, "").replace(/\/$/, "/index.html");
  return !fs.existsSync(path.join(PUBLIC, rel)) && !fs.existsSync(path.join(PUBLIC, `${rel}.html`));
});
ok(links.length > 0, "llms.txt links to the site at all", `${links.length} links`);
ok(missing.length === 0, "and every one of those pages exists", missing.join(" ") || "all present");

// The file is the product description an assistant will read out loud. The
// same rule as test/marks.mjs applies to it, and more sharply.
ok(!/watermark/i.test(llms), "llms.txt does not call the free tier watermarked");

if (failed) {
  console.log(`\nDISCOVERABLE FAILED — ${failed} check(s).`);
  console.log("A file written for machines that no machine is told about has not been published, only saved.");
  process.exit(1);
}
console.log("\nDISCOVERABLE OK — the machine-readable files exist, are announced, and their links resolve");
