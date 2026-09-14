// What a first-time visitor gets by pressing Download without changing
// anything. The count field once said 50 while the download delivered 5, and
// the result was 12 pages KDP would reject. The free tier now shortens
// nothing — it watermarks — so the default must be a full book.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const base = process.argv[2] || "https://puzzlepress.bananafest-destiny.com";
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

// The untouched subtitle states a puzzle count, and it is printed on the title
// page of a book somebody is about to sell. It used to be the fixed string
// "50 relaxing puzzles with solutions" whatever the count field said, so
// moving the most obvious knob on the page produced a book whose first page
// claimed a number it did not contain. It has to follow the count, and it has
// to stop following the moment the person types their own.
const subtitleFor = async (count) => {
  await p.fill("#count", String(count));
  await p.dispatchEvent("#count", "input");
  await p.waitForTimeout(120);
  return p.inputValue("#subtitle");
};
const tracked = [];
for (const [count, want] of [[12, "12 relaxing puzzles with solutions"], [1, "1 relaxing puzzle with solutions"], [200, "200 relaxing puzzles with solutions"]]) {
  const got = await subtitleFor(count);
  console.log(`subtitle at ${String(count).padStart(3)}   : ${got}`);
  if (got !== want) tracked.push(`count ${count}: subtitle is "${got}", should be "${want}"`);
}
await p.fill("#subtitle", "My own subtitle");
const afterEdit = await subtitleFor(37);
if (afterEdit !== "My own subtitle") tracked.push(`a typed subtitle was overwritten with "${afterEdit}"`);
// And a short book still has to warn, since the count is now easy to move.
await p.fill("#count", "12");
await p.dispatchEvent("#count", "input");
await p.waitForTimeout(2500);
const shortWarn = (await p.isHidden("#lengthWarn")) ? "" : await p.textContent("#lengthWarn");
console.log("12-puzzle warning :", shortWarn || "(none)");
await b.close();
if (tracked.length) throw new Error(`the default subtitle does not follow the count:\n  ${tracked.join("\n  ")}`);
if (!/under KDP's \d+-page minimum/.test(shortWarn)) throw new Error(`a 12-puzzle book is under KDP's minimum and said: ${shortWarn || "nothing"}`);

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
if (pages.length < 50) throw new Error(`default book is only ${pages.length} pages — the free tier should make a full book`);
if ((tally["Notes (blank)"] || 0) > 4) throw new Error(`${tally["Notes (blank)"]} blank pages in the default book`);
if (lengthWarnVisible) throw new Error("the default book warns that it is too short for KDP");
// The title page says how many puzzles the book has. It must be the truth.
const front = pages.slice(0, 2).join(" ").replace(/\s+/g, " ");
if (!front.includes(`${delivered} relaxing puzzles with solutions`)) {
  throw new Error(`the title page of a ${delivered}-puzzle book reads: ${front.trim()}`);
}
console.log("page errors:", errs.length ? errs : "none");
console.log("DEFAULTS OK");
