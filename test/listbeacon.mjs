// The 91 word-list pages must be able to report a human being.
//
// On 2026-09-23 the dashboard said 83 addresses visited a word-list page and
// *none of them ran JavaScript*. That is a decisive sentence — it means no
// person has opened one of these pages in 24 hours, and that the pages are a
// sitemap and nothing else — but it is only decisive if the beacon works. A
// silent instrument and an empty room produce the same zero, and I would have
// drawn the opposite conclusion from each.
//
// So: prove the instrument. This loads a real word-list page in a real browser
// and asserts that /px/list fires on load, that /px/listclick fires when the
// call-to-action is pressed, and that the button lands on the generator with
// the theme already chosen. If this suite is green and /px/list is still zero
// on the dashboard, the zero is the room, not the microphone.
//
// Usage: node test/listbeacon.mjs [chromium|webkit]
import * as playwright from "playwright";

const BASE = process.env.BASE || "https://puzzlepress.bananafest-destiny.com";
const ENGINE = process.argv[2] || "chromium";
const PAGE = "/word-lists/halloween";

let failed = 0;
const ok = (cond, what, got = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${what}${got ? `   (${got})` : ""}`);
  if (!cond) failed++;
};

const browser = await playwright[ENGINE].launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const px = [];
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith("/px/")) px.push(u.pathname.replace(/^\/px\/|\.gif$/g, ""));
});
// The analytics beacon is somebody else's script and not what is being tested.
await page.route("https://static.cloudflareinsights.com/**", (r) => r.abort());

await page.goto(BASE + PAGE, { waitUntil: "networkidle" });
ok(px.filter((n) => n === "list").length === 1, "/px/list fires once on load", px.join(" ") || "nothing");
ok(!px.includes("listclick"), "and listclick does not fire by itself", px.join(" ") || "nothing");

// The page's whole job: send somebody to the generator with the theme chosen.
const href = await page.getAttribute("a.btn", "href");
ok(/^\/\?.*theme=/.test(href || ""), "the call-to-action carries a theme into the generator", href || "no a.btn");

await page.click("a.btn");
await page.waitForTimeout(1500);
ok(px.filter((n) => n === "listclick").length === 1, "/px/listclick fires once when it is pressed", px.join(" "));
ok(/[?&]theme=/.test(page.url()), "and the generator opens on that theme", page.url());
ok(px.includes("tool"), "and /px/tool fires there, so the crossover is visible in the funnel", px.join(" "));

await browser.close();

if (failed) {
  console.log(`\nLIST BEACON FAILED — ${failed} check(s), ${ENGINE}.`);
  console.log("Until this is green, a zero on the word-list line means nothing at all.");
  process.exit(1);
}
console.log(`\nLIST BEACON OK — ${ENGINE}: these pages can report a human, so their silence is evidence`);
