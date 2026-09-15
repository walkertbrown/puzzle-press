# Launch day — what I do, hour by hour

Written on launch eve, because the hours after a launch are the wrong time to
be working out what to look at. Same principle as `support.md`.

## The clock

| When | What | Who |
|---|---|---|
| Mon 2026-09-14 | Schedule the Product Hunt launch from `product-hunt.md` | **boss** |
| Tue 2026-09-15, 12:01am PT = **2:01am CT** | Product Hunt goes live | automatic |
| Tue, first minutes | Post the first comment from `product-hunt.md` | **boss** |
| Tue, all day | Watch the funnel, answer everything | me |
| Tue 6:30pm CT | Reminder fires for Wednesday | my cron |
| Wed 2026-09-16, 7–9am CT | **Show HN** from `show-hn.md` | **boss** |

> **My reminders are not durable and the boss should not depend on them.**
> Scheduled jobs live in one Claude session and are gone the moment it ends.
> On 2026-09-14 I checked and found the launch reminders I had been promising
> in every update simply did not exist — a previous session had ended and taken
> them with it. I have recreated them (Monday 6:27pm: schedule PH; Tuesday
> 6:27pm: Show HN tomorrow; hourly funnel checks through Tuesday), and they
> will disappear again the same way. **This table is the durable copy.** If the
> reminder does not arrive, the table is still true.

## What I can see for myself

Checked 2026-09-14: `producthunt.com` and `news.ycombinator.com` both return
real content from this machine — product names, story titles, comment threads.
So I read both threads directly and do not need anything relayed. **Reddit is
still walled**: the homepage returns 200 but every rules and JSON endpoint 403s
and `old.reddit.com` redirects to a "Welcome to Reddit" page. Reddit stays
paste-mode.

**But I need the two URLs.** I can read the threads; I cannot find them. The
Product Hunt slug is created when the boss schedules the launch, and the HN
item id when they post. So:

- **The moment PH is scheduled, paste me the link.** Likely
  `producthunt.com/posts/puzzle-press`, but I am not going to guess and then
  watch the wrong page all day.
- **The moment Show HN is posted, paste me the `news.ycombinator.com/item?id=`
  link.**

Until a link arrives I am watching the funnel only, and the funnel cannot tell
me that somebody asked a question in public and got no answer for six hours.

Support email arrives at `support@bananafest-destiny.com`, which forwards to
the boss's inbox. I cannot read it. Anything that needs me has to be pasted in.

## The hourly loop

```
npm run traffic          # funnel + money, last 24h
npm run traffic 3        # tighter window when something is moving
```

Read it in this order, because each line only means something given the one
above it:

1. **Requests for the page** — did anyone arrive.
2. **...that ran the app** — a real browser. The gap between 1 and 2 is
   crawlers, and on a launch day it will be large and is not a problem.
3. **...and did not bounce** — stayed long enough to idle-warm the PDF chunk.
   Lines 2 and 3 being far apart means people are landing and leaving, which
   is a message problem, not a product problem.
4. **Made a book / made a cover** — the product actually being used.
5. **Checkouts started / paid** — the only line that is money.

The dashboard excludes this machine on both address families **and on every
rotated IPv6 address sharing its /64** — that last part was added at 19:10 on
launch eve, after the report claimed 69 strangers had made books and every one
of them turned out to be this machine under a privacy address it had rotated
away from that morning. Believe the numbers only from `scripts/traffic.mjs` at
or after that fix.

**DO NOT RUN THE BROWSER SUITES AGAINST PRODUCTION TOMORROW.** The exclusion
works, but the numbers are the product on launch day, and a dashboard I have to
mentally subtract from is a dashboard I will misread at 9am on four hours'
sleep. If something needs checking, check it against a local server. The suites
are for the freeze, not for the launch.

**Pre-launch baseline, read 2026-09-14 19:10 CT** — the real numbers, so that
on Tuesday I can tell a launch from a Tuesday:

```
Requests for the page        17      ...that ran the app     4
Did not bounce                2      Opened a sample         1
Made a book                   0      Made a cover            0
Checkouts started             0      Paid                    0      $0.00
Worker errors                 0
scanner/bot noise ignored    37      my own machine ignored  5551
```

Seventeen page requests produced four real browsers, two of which stayed, one
of which opened a sample, and **nobody made a book.** That is the whole of a
normal day here. So **five real browsers is a change, and one stranger making a
book is the launch working.** Do not celebrate the invocation count — most of
it is crawlers hitting `/sitemap.xml` and script-kiddie probes for
`config.env`, and that number moves on its own.

## Thresholds — when a number means act

- **Anybody makes a book and nobody buys.** Expected. The free tier makes the
  whole book; that is the pitch. Do nothing about it on day one.
- **Checkout started, not paid** — the dashboard calls this out by name. One is
  noise. Three or more is the price or the checkout page, and I want to look at
  the Stripe session for where they stopped.
- **A sale.** `npm run unlock -- --recent` to see it, and then leave them alone
  unless they write.
- **Worker errors above zero.** Look immediately; the dashboard flags them.
- **`ran the app` high, `did not bounce` near zero** — the page is failing to
  render for real people. Check the browser suite against production.

## When something breaks

**Site down or wrong.** Roll back first, diagnose second.

```
npx wrangler deployments list       # newest is printed LAST
npx wrangler rollback <version-id>
```

Live as of launch eve: `ff0a350d-882d-4ef5-9d76-60209ed0f9fe` (tap targets for
the header and hero sample links, 2026-09-14, the last change before the
freeze). **Roll back to `cacf2b59-0587-4427-934b-ed30702c5561`** — the
`/compare` wording fix, the version that stood all evening and that every suite
in the repo ran green against. If that is somehow also bad, the one before it
is `1c249dd5-6c6a-434c-aa4c-94d0af52657e` (rate limit + support wording).

The tap-target change is CSS inside a `@media (pointer: coarse)` block, so it
cannot affect a desktop visitor at all — if something looks wrong on a laptop
tomorrow, it is not this. If I deploy anything on launch day I write the new id
here before I walk away from the terminal, because the id I need in an
emergency is the one I had *before* the change that broke it.

Rollback needs the deploy env loaded — same incantation as deploying:
`set -a && . <(grep -E '^[A-Z_]+=' ../.git-credentials) && set +a`.

**Somebody says they paid and cannot unlock.** This is the one that costs a
customer. Do not improvise:

```
npm run unlock -- their@email.com
npm run unlock -- cs_live_...        # better, if they forward the receipt
```

It prints the reply to send. The fix is always "here is the exact address
Stripe has, type that one" — there is no licence to issue. See `support.md`.

**Unlock broken for everyone.** `node test/unlock.mjs` runs the real Worker
against a fake Stripe with no network and no money; if that is green the Worker
logic is fine and the problem is Stripe or the key. Check
`https://status.stripe.com`.

**A flood of 429s from one address.** Working as intended — the limiter is
deliberately loose and only bites a script. If a real person hits it they are
told to wait a minute and that nothing is wrong with their payment.

**A bug in a generated file.** Ask for the PDF and the exact settings, then
`npm run test:pdfcheck`. A KDP rejection caused by our file is a bug, not a
ticket: refund without being asked and fix it.

## Answering on Product Hunt and Hacker News

The boss posts; I draft replies and they paste, unless they say otherwise.

- **Answer the question asked.** Not the question I wish they had asked.
- **Never oversell the competition down.** `/compare` says when the other four
  routes are the better choice, and the Show HN and PH copy were both corrected
  once already for a claim about free generators that was not true. The
  standing "do not say this" note is at the bottom of `product-hunt.md`.
- **"Is it AI?"** No. The puzzles are generated by ordinary code in the
  browser; nothing is sent anywhere. Say so plainly — it is a differentiator.
- **"Why not free?"** The free tier makes the entire book, watermarked. $19
  removes the mark. That is the whole model and it survives being said out loud.
- **A feature request** — thank them, promise nothing, and write it down. Two
  people asking for the same missing puzzle type is the best signal available
  about what to build next.
- **Someone is wrong about us** — correct it once, with a fact, and stop.

## End of day

Write `actual/2026-09-15.md` with the real numbers, not the hopeful ones,
including the ones that are zero.
