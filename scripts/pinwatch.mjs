// Which pins Pinterest actually kept.
//
// Buffer's "sent" means Buffer handed the pin to Pinterest without an error.
// It does not mean the pin exists. On 2026-09-15 Buffer reported eight pins
// sent and zero errors, and the account's public feed carried three.
//
// The five that are missing split like this:
//
//   in the feed      crossword, criss-cross, first pin   — no domain in the text
//   not in the feed  mazes, sudoku, word search, spine   — DOMAIN IN THE TEXT
//   not in the feed  the real-time video pin             — the only video pin
//
// puzzlepress.bananafest-destiny.com was blocked by Pinterest as spam and the
// appeal was denied on 2026-09-12. The working theory this file exists to test
// is that Pinterest silently drops a pin whose *text* names the blocked domain,
// while the same domain in the image URL and in the board is fine — every
// surviving pin serves its image from it. The three pins queued for this week
// all named the domain in their text; they were rewritten on launch morning to
// say "linked from the video description" instead, which is what the surviving
// pins say. The 08:00 CT pin on 2026-09-15 is the first test of that.
//
// It is a theory. The video pin does not fit it, and one media type is a
// confound. Do not write it down as fact until several rewritten pins land.
//
// 2026-09-15 08:41 CT — first rewritten pin tested. The 08:00 royalty pin fired
// at 08:01:36 and IS in the feed; the feed went 3 -> 4. One point for the
// theory, not proof: three unrewritten pins survived too, so survival alone is
// weak evidence. Wednesday and Friday go out unchanged from the rewrite.
//
// Note the asymmetry that makes this worth a script: the feed proves a pin IS
// there. It cannot prove one is not — a feed can truncate, lag, or exclude a
// media type. So this prints what it found and what it did not find, and calls
// the second one "not in the feed", never "rejected".
//
// Usage: node scripts/pinwatch.mjs
const USER = "bananafestdestiny";
const url = `https://www.pinterest.com/${USER}/feed.rss`;

// The board page and the profile page are both client-hydrated and carry no pin
// text at all (1 MB of HTML, zero mentions of our own words). This feed is the
// only server-rendered view of the account I have found.
const res = await fetch(url, {
  headers: {
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  },
});
if (!res.ok) {
  console.log(`Pinterest returned ${res.status} for ${url}`);
  process.exit(1);
}
const xml = await res.text();

const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
  const f = (tag) => (m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] ?? "";
  return { title: f("title"), link: f("link"), date: f("pubDate") };
});

console.log(`\nPinterest — ${USER}   ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`);
console.log(`  ${url}\n`);
console.log(`  Pins visible in the feed: ${items.length}\n`);
for (const it of items) {
  console.log(`  ${it.date}`);
  console.log(`    ${it.title.replace(/\s+/g, " ").slice(0, 72)}`);
  console.log(`    ${it.link}`);
}

// The blocked domain should not appear in any pin text. If it does, either the
// theory is wrong or a pin went out with the old copy.
const leaked = items.filter((i) => /bananafest-destiny/.test(i.title));
console.log(
  leaked.length
    ? `\n  ${leaked.length} pin(s) in the feed name the blocked domain — the theory is wrong, or was never right.`
    : `\n  No pin in the feed names the blocked domain.`,
);
console.log("");
