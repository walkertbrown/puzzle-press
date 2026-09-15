// What Product Hunt will tell an anonymous request, and — more usefully — what
// it will not.
//
// Tested on launch eve, 2026-09-15 01:0x CT, against a stranger's live launch
// thread that has 23 comments on it, because testing this on our own thread was
// going to mean testing it at 7am with a question sitting unanswered:
//
//   curl of the launch page            200, 563 KB, and NO comment text in it.
//   curl of the thread page            200, 369 KB, and NO comment text either.
//                                      PH streams the thread in after hydration
//                                      (`id="B:0"` suspense boundaries are in
//                                      the HTML; the comments are not). On that
//                                      23-comment thread, "thanks", "great" and
//                                      "congrat" each appear zero times.
//   headless Chromium on the same URL  Cloudflare's "Performing security
//                                      verification" interstitial, still there
//                                      after 60 seconds, with or without a real
//                                      user-agent string.
//   the same check on Hacker News      every comment, in plain server HTML,
//                                      from one curl. <div class="commtext">.
//
// So: **I cannot read Product Hunt comments.** The runbook said I could read
// both threads directly. That was true of the page and false of the thread, and
// the distinction only shows up if you go looking for the words people wrote.
// Hacker News on Wednesday is fine and needs nothing relayed.
//
// What is left is still worth having once an hour: whether the launch is live,
// its score, and how many comments exist. A count going up while I have read
// nothing new is the signal to ask the boss to paste the thread — and to say
// the number, so the ask is specific.
//
// Usage: node scripts/phwatch.mjs [product-slug]
const slug = process.argv[2] || "puzzle-press";
const url = `https://www.producthunt.com/products/${slug}?launch=${slug}`;

const res = await fetch(url, {
  headers: {
    // A plain fetch with no headers gets challenged; this is the same request a
    // browser address bar makes, and it is one request an hour, not a loop.
    // On 2026-09-14 a cache-busting loop put 401 requests through here and got
    // this machine bot-challenged for most of a day, the day before launch.
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
  },
});
const html = await res.text();
if (!res.ok) {
  console.log(`Product Hunt returned ${res.status} for ${url}`);
  if (/security verification|just a moment/i.test(html)) {
    console.log("Bot-challenged. Stop for an hour; do not retry in a loop.");
  }
  process.exit(1);
}

const one = (re) => (html.match(re) || [])[1] ?? null;
const live = !/"latestLaunch":null/.test(html);
const posts = one(/"postsCount":(\d+)/);

console.log(`\nProduct Hunt — ${slug}   ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`);
console.log(`  ${url}`);
console.log(`\n  Live            ${live ? "YES" : "not yet"}   (latestLaunch ${live ? "set" : "null"}, postsCount ${posts})`);

if (live) {
  const launchSlug = one(/"latestLaunch":\{[^}]*?"slug":"([a-z0-9-]+)"/);
  const name = one(/"latestLaunch":[\s\S]{0,1500}?"name":"([^"]+)"/);
  // `featuredAt` unscoped is the same bug as the counts, and it bit on launch
  // morning: the first one on our own page reads 2026-02-11, which belongs to
  // some other launch entirely. Scoped below, with the counts.
  // The counts must be tied to OUR launch, and that is the whole reason this
  // is a file and not a grep. A product page carries every launch the product
  // has ever had, each with its own numbers: customer-io's page carries six,
  // with commentsCount 3, 6, 15, 23, 2 and 13. The first draft of this script
  // took the largest of them and would have told me 23 comments on a thread
  // that has 3 — the same "wrong number on my own dashboard" that the traffic
  // dashboard produced twice this week.
  //
  // The page's real shape: each launch is a self-contained JSON node, and the
  // counts come AFTER the slug, not before —
  //   {"__typename":"Post","id":"1204978",…,"slug":"customer-io-summer-release",
  //    …,"latestScore":141,"launchDayScore":140,"commentsCount":3,…}
  // So: find the node that carries our slug, stop at the next node's boundary,
  // and read only inside it. If the page's shape changes and nothing is found,
  // print that, rather than the nearest number lying around.
  const inLaunchNode = (key, pattern = "(\\d+)") => {
    for (const m of html.matchAll(new RegExp(`"slug":"${launchSlug}"`, "g"))) {
      let node = html.slice(m.index, m.index + 4000);
      const next = node.indexOf('"__typename":"Post', 10); // where the next launch begins
      if (next > 0) node = node.slice(0, next);
      const hit = node.match(new RegExp(`"${key}":${pattern}`));
      if (hit) return pattern === "(\\d+)" ? Number(hit[1]) : hit[1];
    }
    return null;
  };
  const featured = inLaunchNode("featuredAt", '"([^"]+)"');
  const say = (v) => (v === null ? "not on the page — do not guess, open the thread" : v);
  console.log(`  Launch          ${name ?? "?"}  (${launchSlug ?? "?"})`);
  if (featured) console.log(`  Featured at     ${featured}`);
  // `latestScore` is the field Product Hunt ranks by. It is probably the number
  // in the upvote button, but the button's number is not in the server HTML, so
  // I have not seen the two agree and will not call this "upvotes". Watch it
  // move; do not quote it as a vote count.
  console.log(`  Score           ${say(inLaunchNode("latestScore"))}   (PH's own score field — watch it move, don't call it votes)`);
  console.log(`  Launch-day      ${say(inLaunchNode("launchDayScore"))}`);
  console.log(`  Comments        ${say(inLaunchNode("commentsCount"))}   <-- a count only; see below`);
  if (launchSlug) console.log(`\n  Thread          https://www.producthunt.com/products/${slug}/launches/${launchSlug}`);
  console.log(`
  I cannot read the comments themselves — they are streamed in after the page
  loads and a headless browser gets Cloudflare's challenge. If this count is
  above what the boss has pasted, ask them to paste the new ones. Say the
  number, so the ask is specific.`);
} else {
  console.log(`
  Nothing has gone live. Before 02:01 CT on launch day this is correct.`);
}
console.log("");
