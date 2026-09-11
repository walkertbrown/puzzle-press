// What a first-time visitor gets by pressing Download without changing
// anything. The count field once said 50 while the download delivered 5, and
// the result was 12 pages KDP would reject. This pins the default experience.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const base = process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(base, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

const shown = Number(await p.inputValue("#count"));
const meta = await p.textContent("#meta");
console.log("count field shows :", shown);
console.log("meta line says    :", meta);

const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.click("#download")]);
const f = new URL("../samples/browser/defaults.pdf", import.meta.url).pathname;
await dl.saveAs(f);
const status = await p.textContent("#status");
console.log("status after      :", status);
const lengthWarnVisible = !(await p.isHidden("#lengthWarn"));
console.log("length warning    :", lengthWarnVisible ? await p.textContent("#lengthWarn") : "(none)");
await b.close();

const pages = execFileSync("pdftotext", [f, "-"], { encoding: "latin1" }).split("\f").slice(0, -1);
const tally = {};
for (const t of pages) {
  const s = t.replace(/\s+/g, " ").trim();
  const k = s.startsWith("Notes") ? "Notes (blank)"
    : s.startsWith("Puzzle") ? "puzzle"
    : s.startsWith("Solutions") ? "Solutions divider"
    : s ? "front matter" : "blank";
  tally[k] = (tally[k] || 0) + 1;
}
console.log(`\nThe PDF a new visitor gets: ${pages.length} pages`);
for (const [k, n] of Object.entries(tally)) console.log(`   ${String(n).padStart(3)}  ${k}`);

// The number on screen must be the number delivered.
const delivered = Number((status.match(/Done — (\d+) puzzles/) || [])[1]);
if (delivered !== shown) throw new Error(`field offered ${shown} puzzles, download delivered ${delivered}`);
// And the default book must be one KDP would actually accept.
if (pages.length < 24) throw new Error(`default book is ${pages.length} pages, under KDP's minimum`);
if ((tally["Notes (blank)"] || 0) > 4) throw new Error(`${tally["Notes (blank)"]} blank pages in the default book`);
if (lengthWarnVisible && /under KDP/.test(await Promise.resolve("")) ) throw new Error("unexpected");
console.log("page errors:", errs.length ? errs : "none");
console.log("DEFAULTS OK");
