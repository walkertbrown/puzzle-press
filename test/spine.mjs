// The calculator must agree with the PDF the generator actually produces,
// or it is worse than not existing.
import { chromium } from "playwright";
const base = process.argv[2] || "https://puzzlepress.bananafest-destiny.com";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
await p.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(`${base}/spine-calculator`, { waitUntil: "networkidle" });
await p.waitForFunction(() => document.getElementById("spine").textContent !== "—");

const cases = [
  { trim: "6x9", pages: "120", paper: "cream", spine: '0.300"', cover: '12.550" × 9.250"' },
  { trim: "6x9", pages: "100", paper: "white", spine: '0.225"', cover: '12.475" × 9.250"' },
  // 0.125 + 8.5 + 0.5 + 8.5 + 0.125 = 17.75, not 17.5 — my first go at this
  // expectation was wrong and the calculator was right.
  { trim: "8.5x11", pages: "200", paper: "cream", spine: '0.500"', cover: '17.750" × 11.250"' },
];
for (const c of cases) {
  await p.selectOption("#trim", c.trim);
  await p.selectOption("#paper", c.paper);
  await p.fill("#pages", c.pages);
  await p.waitForTimeout(200);
  const spine = (await p.textContent("#spine")).trim();
  const cover = (await p.textContent("#cover")).trim();
  console.log(`${c.trim} ${c.pages}p ${c.paper}: spine ${spine}, cover ${cover}`);
  if (spine !== c.spine) throw new Error(`spine ${spine} != ${c.spine}`);
  if (cover !== c.cover) throw new Error(`cover ${cover} != ${c.cover}`);
}

await p.fill("#pages", "60");
await p.waitForTimeout(200);
console.log("spine text at 60p:", (await p.textContent("#spineText")).slice(0, 60));
if (!(await p.textContent("#spineText")).includes("Not allowed")) throw new Error("should forbid spine text under 79 pages");
// Allowed from 79 pages, but KDP's spine safe area (spine less 0.0625" at each
// fold) has no room for readable type until about 88 pages of cream, and
// Puzzle Press keeps its own spine text a further 1/64" in: 100 pages.
await p.selectOption("#paper", "cream");
await p.fill("#pages", "80");
await p.waitForTimeout(200);
const at80 = await p.textContent("#spineText");
console.log("spine text at 80p cream:", at80);
if (!at80.startsWith("Allowed, but there is no room") || !at80.includes('0.075"')) throw new Error("80 pages of cream: allowed, 0.075\" safe strip, no room");
await p.fill("#pages", "88");
await p.waitForTimeout(200);
const at88 = await p.textContent("#spineText");
console.log("spine text at 88p cream:", at88);
if (!at88.includes("about 6pt") || !at88.includes("leaves a spine this narrow blank")) throw new Error("88 pages of cream: 6pt fits KDP's safe area, but Puzzle Press leaves it blank");
await p.fill("#pages", "100");
await p.waitForTimeout(200);
const at100 = await p.textContent("#spineText");
console.log("spine text at 100p cream:", at100);
if (!at100.includes("fits type up to about")) throw new Error("100 pages of cream: Puzzle Press prints spine text");

await p.setViewportSize({ width: 400, height: 900 });
await p.waitForTimeout(300);
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
console.log("overflow at 400px:", overflow);
if (overflow) throw new Error("overflow");
console.log("page errors:", errs.length ? errs : "none");
await b.close();
console.log("SPINE CALCULATOR OK");
