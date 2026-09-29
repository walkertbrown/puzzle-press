// The spine-width table on /spine-calculator, at common page counts.
//
// The calculator answers one book at a time and only once its script runs.
// Somebody searching "kdp spine width 120 pages" wants the figure at a glance,
// and a crawler that doesn't run the script sees no figures at all. So the page
// also carries a plain table, written here from the same spineWidthInches and
// coverGeometry the calculator and the PDFs use, and rounded the same way
// (src/ui/spine.js), so it can't disagree with the calculator above it.
//
// Run: node scripts/spine-table.mjs          rewrites the table in place
//      node scripts/spine-table.mjs --check  exits 1 if the page is stale
import { readFileSync, writeFileSync } from "node:fs";
import { spineWidthInches, coverGeometry } from "../src/pdf/cover-geometry.js";
import { PT } from "../src/pdf/kdp.js";

export const PAGE_COUNTS = [24, 50, 75, 100, 120, 150, 200, 250, 300, 400, 500];
const PAPERS = ["white", "cream", "groundwood"];
const inch = (n) => `${n.toFixed(3)}"`;
const mm = (n) => `${(n * 25.4).toFixed(1)} mm`;

export function tableHtml() {
  const rows = PAGE_COUNTS.map((pages) => {
    const cells = PAPERS.map((p) => {
      const s = spineWidthInches(pages, p);
      return `<td>${inch(s)} <span class="dim">(${mm(s)})</span></td>`;
    });
    const g = coverGeometry({ trim: "6x9", pageCount: pages, paper: "cream" });
    cells.push(`<td>${inch(g.width / PT)} × ${inch(g.height / PT)}</td>`);
    return `      <tr><td>${pages}</td>${cells.join("")}</tr>`;
  });
  return [
    `    <div class="scroll"><table>`,
    `      <tr><th>Pages</th><th>White</th><th>Cream</th><th>Groundwood</th><th>Full 6 × 9 cover, cream</th></tr>`,
    ...rows,
    `    </table></div>`,
  ].join("\n");
}

const START = "<!-- spine-table:start -->";
const END = "<!-- spine-table:end -->";
export const PAGE = new URL("../public/spine-calculator.html", import.meta.url);

export function current(html) {
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error("spine-calculator.html has no spine-table markers");
  return html.slice(a + START.length, b).replace(/^\n|\n\s*$/g, "");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = readFileSync(PAGE, "utf8");
  const want = tableHtml();
  if (process.argv.includes("--check")) {
    if (current(html) !== want) { console.error("spine table is stale: run node scripts/spine-table.mjs"); process.exit(1); }
    console.log("spine table matches the formula");
  } else {
    const a = html.indexOf(START), b = html.indexOf(END);
    writeFileSync(PAGE, html.slice(0, a + START.length) + "\n" + want + "\n    " + html.slice(b));
    console.log(`wrote ${PAGE_COUNTS.length} rows`);
  }
}
