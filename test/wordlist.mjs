// The path a real KDP seller takes: paste a niche list, maybe tick Large
// print, reshuffle a few times, download. Everything they typed must survive,
// and nothing they typed may vanish from the book without being told.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
const base = process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(base, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

await p.fill("#title", "Texas Word Search");
await p.fill("#subtitle", "Forty puzzles from the Lone Star State");
await p.uncheck(".themes input[value='animals']");
await p.fill("#custom", "Austin, Houston, Dallas, Chicken Fried Steak, Fort Worth, El Paso, Arlington, Plano, Lubbock, Laredo, Galveston, Amarillo, Brownsville, Bluebonnet, Longhorn, Armadillo, Rodeo, Barbecue, Alamo, Friday Night Lights, Big Bend, Hill Country, Panhandle, Nacogdoches, Waco, Tyler, Abilene, Odessa, Midland, Beaumont");
await p.fill("#customTitle", "Texas");
await p.fill("#count", "40");

// 1. Reshuffle must not touch what was typed.
for (let i = 0; i < 3; i++) { await p.click("#reshuffle"); await p.waitForTimeout(400); }
const title = await p.inputValue("#title");
console.log("title after 3 reshuffles:", JSON.stringify(title));
if (title !== "Texas Word Search") throw new Error("Reshuffle changed the typed title");
if ((await p.inputValue("#customTitle")) !== "Texas") throw new Error("Reshuffle changed the list name");

// 2. Large print with a 17-letter word: the book must still contain it, or say it does not.
await p.check("#largePrint");
await p.waitForTimeout(900);
const warn = (await p.textContent("#warnings")).trim();
console.log("warnings with Large print:", warn || "(none)");
const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 300000 }), p.click("#download")]);
const f = new URL("../samples/browser/texas.pdf", import.meta.url).pathname;
await dl.saveAs(f);
const text = execFileSync("pdftotext", [f, "-"], { encoding: "latin1" });
const has = text.includes("CHICKENFRIEDSTEAK");
console.log("CHICKENFRIEDSTEAK in the book:", has, "| grid auto-sized:", (await p.inputValue("#size")) === "");
if (!has && !/longer than/.test(warn)) throw new Error("a pasted word vanished with no warning");
console.log("title on the PDF:", text.split("\f")[0].replace(/\s+/g, " ").trim().slice(0, 40));
if (!text.includes("Texas Word Search")) throw new Error("typed title did not reach the PDF");

// 3. A fixed grid too small for a word must say so, by name.
await p.fill("#size", "12");
await p.waitForTimeout(900);
const w2 = (await p.textContent("#warnings")).trim();
console.log("warning at 12x12:", w2.slice(0, 110));
if (!/CHICKENFRIEDSTEAK/.test(w2)) throw new Error("the dropped word is not named in the warning");

console.log("page errors:", errs.length ? errs : "none");
await b.close();
console.log("WORDLIST OK");
