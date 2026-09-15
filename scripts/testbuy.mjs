// One command to prove the money path, the moment a test-mode key exists.
//
// Why this file: `test/purchase.mjs` has been able to prove the whole path —
// click Buy, pay with 4242, come back, unlock, download a full book, check the
// watermark is gone — since 2026-09-10. It has not been run since, because
// running it needs a Stripe **test** link and a **test** key, and the only
// credentials on this machine are live ones. Meanwhile the verify function has
// been rewritten twice, and the live account holds 16 Checkout Sessions of
// which **zero** have ever been paid. So the single most important thing about
// this product is also the only thing never tested end to end.
//
// The gap between "the key arrived" and "the test ran" should be one command
// and not twenty minutes of working out how to point a local Worker at test
// credentials, especially if the key lands at 7am on Show HN morning. This is
// that command.
//
// What it does:
//   1. reads STRIPE_TEST_KEY and PAY_URL_TEST from ../.git-credentials
//   2. refuses to go on unless both are unmistakably test-mode
//   3. writes .dev.vars (gitignored) so `wrangler dev` has them
//   4. starts a LOCAL worker — no deploy, production untouched, $0
//   5. runs test/purchase.mjs against it
//   6. stops the worker and deletes .dev.vars
//
// Nothing here can touch live mode: the guards below reject anything that is
// not `rk_test_`/`sk_test_` and a `/test_` payment link, and `purchase.mjs`
// independently refuses to run if the PAY_URL it finds on the page is not a
// test link. Two locks, because the failure mode is charging a real card.
//
// Usage: node scripts/testbuy.mjs      (npm run test:buy)
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const root = new URL("../", import.meta.url).pathname;
// CREDS_FILE exists so the refusals below can be tested with fixtures instead
// of being assumed correct — the guards are the only thing standing between
// this script and a real card, and an untested guard is a hope. It cannot
// weaken anything: whatever file it points at, a key that is not rk_test_ and
// a link that is not /test_ are still rejected.
const creds = readFileSync(process.env.CREDS_FILE || `${root}../.git-credentials`, "utf8");
const get = (k) => (creds.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();

const KEY = get("STRIPE_TEST_KEY");
const LINK = get("PAY_URL_TEST");
const PORT = 8791;

// Say exactly what is missing and exactly what to add, because the person
// reading this message is the one who has to go and make it.
if (!KEY || !LINK) {
  console.log(`
  Not set up yet. This needs two things in .git-credentials, both test-mode:

    STRIPE_TEST_KEY=rk_test_...      a restricted key with READ access to
                                     Checkout Sessions (that is all /api/verify
                                     ever does — it reads, never writes)
    PAY_URL_TEST=https://buy.stripe.com/test_...

  Both come from the same Stripe dashboard with the "Test mode" switch on:
  Developers -> API keys -> restricted key, and a payment link on the test
  product. Neither can move real money; a test key literally cannot see a live
  charge.

  Missing right now: ${[!KEY && "STRIPE_TEST_KEY", !LINK && "PAY_URL_TEST"].filter(Boolean).join(" and ")}
`);
  process.exit(1);
}

// The guards. A live key in this file would run a real card through a real
// checkout, so these are not politeness.
if (!/^(rk|sk)_test_/.test(KEY)) {
  console.log(`\n  REFUSING: STRIPE_TEST_KEY does not start with rk_test_ or sk_test_ (it starts "${KEY.slice(0, 8)}").\n`);
  process.exit(1);
}
if (!LINK.includes("/test_")) {
  console.log(`\n  REFUSING: PAY_URL_TEST is not a test payment link — a test link contains "/test_".\n`);
  process.exit(1);
}

const devVars = `${root}.dev.vars`;
if (existsSync(devVars)) {
  console.log(`\n  REFUSING: ${devVars} already exists. Look at it, then move it out of the way.\n`);
  process.exit(1);
}
// Key prefix only, never the key. The rule for every secret on this machine.
console.log(`\n  key    ${KEY.slice(0, 8)}…  (test mode)`);
console.log(`  link   ${LINK}`);
console.log(`  local  http://127.0.0.1:${PORT}   — nothing is deployed\n`);

writeFileSync(devVars, `STRIPE_KEY = "${KEY}"\nPAY_URL = "${LINK}"\n`);

let worker;
const cleanup = () => {
  try { worker?.kill("SIGTERM"); } catch {}
  // Kill by the pid I hold, never by `pkill -f <pattern>` — a pattern that
  // matches "wrangler dev" also matches the shell running the pkill, and that
  // has killed this session three times.
  try { rmSync(devVars); } catch {}
};
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

worker = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--local"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

const ready = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), 60000);
  const look = (buf) => {
    if (/Ready on http/i.test(String(buf))) { clearTimeout(timer); resolve(true); }
  };
  worker.stdout.on("data", look);
  worker.stderr.on("data", look);
});

if (!ready) {
  console.log("  The local worker never came up in 60s. Nothing was tested.\n");
  process.exit(1);
}

// Confirm the local worker is really serving the TEST link before Playwright
// is allowed anywhere near a Buy button.
const config = await (await fetch(`http://127.0.0.1:${PORT}/config.js`)).text();
if (!config.includes("/test_")) {
  console.log(`  REFUSING: the local worker is not serving a test link.\n  /config.js says: ${config.trim()}\n`);
  process.exit(1);
}
console.log("  local /config.js is serving the test link — running the purchase test\n");

const test = spawn("node", ["test/purchase.mjs", `http://127.0.0.1:${PORT}`], { cwd: root, stdio: "inherit" });
const code = await new Promise((r) => test.on("exit", r));

console.log(
  code === 0
    ? "\n  PASS — a real Stripe payment unlocked a real unwatermarked book, in test mode.\n"
    : `\n  FAIL (exit ${code}) — and this is the path a paying stranger walks. Fix before anything else.\n`,
);
process.exit(code ?? 1);
