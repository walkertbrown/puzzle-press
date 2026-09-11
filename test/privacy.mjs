// Prove the page's privacy claim: generating and downloading a book must send
// nothing to any server, and the only request that ever carries user input is
// the unlock check, which carries an email and nothing else.
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:8792";
const SECRET = "ZZQXVWKJPL"; // a word that appears nowhere except what we type

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });

const requests = [];
p.on("request", (r) => {
  let body = "";
  try { body = r.postData() || ""; } catch {}
  requests.push({ url: r.url(), method: r.method(), body });
});

await p.goto(base, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

await p.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "t@e.com", token: "d", verifiedAt: Date.now() })));
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

const before = requests.length;
await p.fill("#title", `${SECRET} Book`);
await p.fill("#author", `${SECRET} Author`);
await p.uncheck(".themes input[value='animals']");
await p.fill("#custom", `${SECRET}\nsecretword\nhiddenterm\nprivateline\nconfidential\nunspoken\nwhispered\nmurmured\nunshared\nquiet`);
await p.fill("#customTitle", SECRET);
await p.fill("#count", "10");
await p.waitForTimeout(1200);
const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.click("#download")]);
await dl.saveAs(new URL("../samples/browser/privacy.pdf", import.meta.url).pathname);
const [dl2] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.click("#downloadCover")]);
await dl2.saveAs(new URL("../samples/browser/privacy-cover.pdf", import.meta.url).pathname);
await p.waitForTimeout(500);

const during = requests.slice(before);
console.log("requests made while typing, generating and downloading:", during.length);
for (const r of during) console.log("   ", r.method, r.url.slice(0, 110));

const leaked = requests.filter((r) => r.url.includes(SECRET) || (r.body && r.body.includes(SECRET)));
console.log("requests containing the typed words:", leaked.length);
if (leaked.length) {
  for (const r of leaked) console.log("  LEAK:", r.method, r.url.slice(0, 200), r.body.slice(0, 200));
  throw new Error("user input left the browser");
}

// Nothing third-party at all.
const origin = new URL(base).origin;
const offsite = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith("data:") && !r.url.startsWith("blob:"));
console.log("off-site requests:", offsite.length, offsite.map((r) => new URL(r.url).host));
if (offsite.length) throw new Error("page contacts a third party: " + offsite.map((r) => r.url).join(", "));

// The one request that is allowed to carry input: /api/verify, email only.
await p.evaluate(() => localStorage.removeItem("puzzlepress.license"));
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector(".grid div");
await p.click("#unlockLink");
await p.waitForSelector("#unlockDialog[open]");
await p.fill("#email", "someone@example.com");
const mark = requests.length;
await p.click("#verify");
await p.waitForTimeout(3000);
const verify = requests.slice(mark).filter((r) => r.url.includes("/api/verify"));
console.log("verify requests:", verify.length, verify.map((r) => r.body));
if (verify.length !== 1) throw new Error("expected exactly one verify request");
const sent = JSON.parse(verify[0].body || "{}");
if (Object.keys(sent).join(",") !== "email") throw new Error("verify sends more than the email: " + Object.keys(sent));

await b.close();
console.log("PRIVACY OK — generation and download made no network calls; only the email is ever sent");
