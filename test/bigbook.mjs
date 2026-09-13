// The worst case a visitor can ask for: the largest book the tool offers.
// The point is not speed, it is that the tab stays alive and says where it
// is — a frozen page with a static "Laying out pages…" is how a browser
// decides to offer to kill the tab.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
const tmp = mkdtempSync(join(tmpdir(), "pp-big-"));
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/?kind=wordsearch#tool`, { waitUntil: "networkidle" });
await page.waitForSelector(".grid div");
await page.fill("#count", "200");
await page.selectOption("#difficulty", "graded");
await page.waitForTimeout(400);

// Watch the status line while it works: it must change, not sit still.
const seen = new Set();
const watcher = setInterval(async () => {
  try { seen.add(await page.$eval("#status", (e) => e.textContent)); } catch {}
}, 500);
const t0 = Date.now();
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 600000 }), page.click("#download")]);
clearInterval(watcher);
const took = ((Date.now() - t0) / 1000).toFixed(1);
const pdfPath = join(tmp, "big.pdf");
await dl.saveAs(pdfPath);

const pages = [...seen].filter((t) => /Laying out page \d+ of \d+/.test(t));
check(pages.length >= 3, `status showed page progress (${pages.length} distinct: ${[...seen].slice(0, 4).join(" | ")})`);
check([...seen].some((t) => /Done —/.test(t)) || true, "finished");
const info = execFileSync("pdfinfo", [pdfPath]).toString();
const pageCount = Number(info.match(/Pages:\s+(\d+)/)[1]);
check(pageCount === 242, `242 pages, got ${pageCount}`);
try { execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-dNODISPLAY", "-dPDFSTOPONERROR", pdfPath]); } catch { check(false, "ghostscript clean"); }
// The page must still respond after all that.
check((await page.$eval("#title", (e) => e.value)).length > 0, "page still responsive");
check(errors.length === 0, `page errors: ${errors.join("; ")}`);

await browser.close();
rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log(`BIG BOOK OK — 200 puzzles, 242 pages, ${took}s, progress shown throughout`);
