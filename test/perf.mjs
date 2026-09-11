import { chromium } from "playwright";
const base = process.argv[2];
const b = await chromium.launch();
// Mid-range phone on 4G — what most Product Hunt traffic actually is.
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const client = await ctx.newCDPSession(p);
await client.send("Network.enable");
await client.send("Network.emulateNetworkConditions", {
  offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8,
});
await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const bytes = {};
p.on("response", async (r) => {
  try {
    const len = Number((await r.allHeaders())["content-length"] || 0);
    const u = new URL(r.url()).pathname;
    if (len) bytes[u] = len;
  } catch {}
});

const t0 = Date.now();
await p.goto(base, { waitUntil: "domcontentloaded" });
const domReady = Date.now() - t0;
await p.waitForSelector(".grid div", { timeout: 120000 });
const interactive = Date.now() - t0;
await p.waitForLoadState("networkidle");
const settled = Date.now() - t0;

void bytes;
const res = await p.evaluate(() =>
  performance.getEntriesByType("resource").map((r) => ({
    url: new URL(r.name).pathname,
    transfer: r.transferSize,
    decoded: r.decodedBodySize,
    dur: Math.round(r.duration),
  })),
);
const total = res.reduce((a, r) => a + r.transfer, 0);
console.log(`DOM ready:      ${domReady} ms`);
console.log(`First puzzle:   ${interactive} ms   <-- when the page becomes useful`);
console.log(`Network idle:   ${settled} ms`);
console.log(`Transferred:    ${(total / 1024).toFixed(0)} KB`);
for (const r of res.sort((a, b2) => b2.transfer - a.transfer).slice(0, 8)) {
  console.log(`   ${(r.transfer / 1024).toFixed(0).padStart(5)} KB over the wire (${(r.decoded / 1024).toFixed(0)} KB unpacked, ${r.dur} ms)  ${r.url}`);
}
await b.close();
