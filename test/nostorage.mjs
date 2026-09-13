// A buyer whose browser refuses site storage — a private window, or cookies
// turned off. They must still get what they paid for in this tab, and must be
// told it will not survive a reload, rather than silently losing it.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
const tmp = mkdtempSync(join(tmpdir(), "pp-nostore-"));
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
// Make every localStorage call throw, the way a locked-down browser does.
await ctx.addInitScript(() => {
  const boom = () => { throw new DOMException("The operation is insecure.", "SecurityError"); };
  Object.defineProperty(window, "localStorage", { configurable: true, get: boom });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${base}/#tool`, { waitUntil: "networkidle" });
await page.waitForSelector(".grid div", { timeout: 30000 });
check(errors.length === 0, `page still loads with storage blocked: ${errors.join("; ")}`);
check((await page.$$eval(".grid div", (d) => d.length)) > 0, "preview renders");

// The free tier still works: a real book downloads.
await page.fill("#count", "14");
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
const pdfPath = join(tmp, "free.pdf");
await dl.saveAs(pdfPath);
try { execFileSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-dNODISPLAY", "-dPDFSTOPONERROR", pdfPath]); } catch { check(false, "free book valid"); }

// Now unlock with a stubbed /api/verify — this is about storage, not Stripe.
await page.route("**/api/verify", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, email: "buyer@example.com", token: "stripe:cs_test" }) }));
await page.click("#buyNow").catch(() => {});
await page.waitForSelector("#email", { state: "visible", timeout: 10000 });
await page.fill("#email", "buyer@example.com");
await page.click("#verify");
await page.waitForFunction(() => /Unlocked/.test(document.getElementById("tier").textContent), { timeout: 15000 });
const tier = await page.$eval("#tier", (e) => e.textContent);
check(/Unlocked/.test(tier), "tab is unlocked");
check(/This tab only/i.test(tier), `told it will not survive a reload: "${tier.slice(0, 120)}"`);
check(/blocking site storage/i.test(tier), "told why");

// And the unlock actually applies: the cover comes without the PREVIEW mark.
const [cd] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#downloadCover")]);
await cd.saveAs(join(tmp, "cover.pdf"));
const status = await page.$eval("#status", (e) => e.textContent);
check(/Cover ready/.test(status) && !/Preview cover/.test(status), `paid cover, not preview: "${status}"`);
check(errors.length === 0, `no page errors: ${errors.join("; ")}`);

await browser.close();
rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("NO STORAGE OK — page works, free book downloads, unlock applies for the tab and says it will not persist");
