// A graded book works up from easy to hard, with the level printed on each
// puzzle. Published puzzle books are usually built this way; a book that
// silently stays at one level is a different, lesser product.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const base = process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(base, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

for (const [kind, ready] of [["sudoku", ".sudoku div"], ["maze", ".maze svg line"], ["wordsearch", ".grid div"]]) {
  await p.selectOption("#kind", kind);
  await p.waitForSelector(ready, { state: "attached" });
  const options = await p.$$eval("#difficulty option", (o) => o.map((x) => x.value));
  if (!options.includes("graded")) throw new Error(`${kind} has no graded option`);

  await p.selectOption("#difficulty", "graded");
  await p.fill("#count", "20");
  await p.waitForTimeout(900);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 300000 }), p.click("#download")]);
  const f = new URL(`../samples/browser/graded-${kind}.pdf`, import.meta.url).pathname;
  await dl.saveAs(f);

  // Each puzzle page prints its level top right; read them in order.
  const pages = execFileSync("pdftotext", [f, "-"], { encoding: "latin1" }).split("\f");
  const levels = [];
  for (const page of pages) {
    // The level sits in the header line: "Puzzle 7  Medium" for sudoku and
    // mazes, "Puzzle 7  Animals · Hard" for word search. Look only at the
    // start of the page so grid contents cannot match by accident.
    const head = page.replace(/\s+/g, " ").trim().slice(0, 70);
    if (!/^Puzzle \d+\b/.test(head)) continue;
    const m = head.match(/\b(Easy|Medium|Hard|Expert)\b/);
    if (m) levels.push(m[1]);
  }
  const seen = levels.filter((v, i) => v !== levels[i - 1]);
  console.log(`${kind.padEnd(11)} ${levels.length} puzzle pages, bands in order: ${seen.join(" -> ")}`);
  if (seen.length < 3) throw new Error(`${kind} graded book only used ${seen.length} level(s)`);
  const order = ["Easy", "Medium", "Hard", "Expert"];
  for (let i = 1; i < seen.length; i++) {
    if (order.indexOf(seen[i]) <= order.indexOf(seen[i - 1])) {
      throw new Error(`${kind} levels are not in increasing order: ${seen.join(",")}`);
    }
  }
}

console.log("page errors:", errs.length ? errs : "none");
await b.close();
console.log("GRADED OK");
