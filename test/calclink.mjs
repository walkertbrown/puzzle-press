// The calculator → generator handoff, live. A visitor who has already typed
// their trim size and page count into a calculator must land in the tool with
// that book set up, not on an empty form. This walks all three calculators,
// reads the button's href, follows it, and checks the controls came across —
// and that the book the tool then plans is the size the calculator promised.
// Run: node test/calclink.mjs [baseUrl]
import { chromium } from "playwright";

const base = (process.argv[2] || "https://puzzlepress.bananafest-destiny.com").replace(/\/$/, "");
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// [page, what to set there, what the tool must show afterwards]
const cases = [
  {
    path: "/royalty-calculator",
    set: async () => {
      await page.selectOption("#trim", "8.5x11");
      await page.fill("#pages", "120");
      await page.fill("#list", "12.99");
      await page.selectOption("#ink", "black");
    },
    want: { "#trim": "8.5x11", "#list": "12.99", "#ink": "black" },
  },
  {
    path: "/spine-calculator",
    set: async () => {
      await page.selectOption("#trim", "6x9");
      await page.fill("#pages", "100");
      await page.selectOption("#paper", "white");
    },
    want: { "#trim": "6x9", "#paper": "white" },
  },
  {
    path: "/margin-calculator",
    set: async () => {
      await page.selectOption("#trim", "7x10");
      await page.fill("#pages", "60");
      if (!(await page.isChecked("#bleed"))) await page.click("#bleed");
    },
    want: { "#trim": "7x10" },
  },
];

for (const c of cases) {
  await page.goto(`${base}${c.path}`, { waitUntil: "networkidle" });
  await c.set();
  await page.waitForTimeout(50);

  const href = await page.$eval("#makeBtn", (a) => a.getAttribute("href"));
  check(/^\/\?.*#tool$/.test(href), `${c.path}: button href is a tool link, got ${href}`);
  const carry = await page.$eval("#carry", (el) => el.textContent.trim());
  check(carry.length > 0, `${c.path}: says what the button will do`);

  const q = new URLSearchParams(href.slice(2).split("#")[0]);
  const count = Number(q.get("count"));
  check(count >= 1 && count <= 200, `${c.path}: sends a puzzle count the tool accepts, got ${count}`);
  // Puzzle count, not page count: the visitor's number must have been
  // converted, or the tool builds a book twice the length they priced.
  const typed = Number(await page.$eval("#pages", (el) => el.value));
  check(count < typed, `${c.path}: ${count} puzzles is fewer than ${typed} pages — converted, not copied`);
  check(carry.includes(String(count)), `${c.path}: the note names the ${count} puzzles it will make`);

  await page.goto(`${base}${href}`, { waitUntil: "networkidle" });
  for (const [sel, value] of Object.entries(c.want)) {
    const got = await page.$eval(sel, (el) => el.value);
    check(got === value, `${c.path} → tool: ${sel} = ${got}, want ${value}`);
  }
  const landed = await page.$eval("#count", (el) => el.value);
  check(landed === String(count), `${c.path} → tool: #count = ${landed}, want ${count}`);
  if (c.path === "/margin-calculator") {
    check(await page.isChecked("#bleed"), "margin → tool: bleed came across");
  }
  // The page count the calculator promised is the page count the tool builds.
  await page.waitForTimeout(800);
  const promised = Number(carry.match(/(\d+) pages/)?.[1]);
  const meta = await page.$eval("#meta", (el) => el.textContent);
  const built = Number(meta.match(/(\d+) pages/)?.[1] ?? 0);
  check(built === promised, `${c.path}: tool builds ${built} pages, calculator promised ${promised} (${meta})`);
}

check(errors.length === 0, `page errors: ${errors.join("; ")}`);
await browser.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log(`calculator handoff OK — ${cases.length} pages carry the visitor's book into the tool`);
