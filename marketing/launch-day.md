# Launch day — what I do, hour by hour

Written on launch eve, because the hours after a launch are the wrong time to
be working out what to look at. Same principle as `support.md`.

## The clock

| When | What | Who |
|---|---|---|
| Mon 2026-09-14 | Schedule the Product Hunt launch from `ph-schedule-packet.md` | **boss — DONE**, post 1250478 |
| Tue 2026-09-15, 12:01am PT = **2:01am CT** | Product Hunt goes live | automatic |
| Tue, first minutes | Post the first comment (§8 of `ph-schedule-packet.md`) | **boss** |
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

**Product Hunt — have it.** The boss pasted it on launch eve:

```
https://www.producthunt.com/products/puzzle-press?launch=puzzle-press
```

Note the shape. `producthunt.com/posts/puzzle-press` — the URL I had guessed
here — **404s**; PH launches now live on the product page behind a `?launch=`
parameter. Good thing I asked rather than watched.

How to tell whether it has actually gone live, without logging in and without
hammering them: fetch that URL and look at the embedded JSON. Before launch it
reads `"latestLaunch":null` and `"postsCount":0`. After 2:01am CT `latestLaunch`
goes non-null and `postsCount` becomes 1. One request answers it.

```
curl -s 'https://www.producthunt.com/products/puzzle-press?launch=puzzle-press' | grep -o '"latestLaunch":[^,]*'
```

**Once an hour, not once a minute.** On 2026-09-14 I put a cache-busting loop on
this page and made 401 requests, which tripped their bot challenge on this
machine for most of a day — the night before launching on them. The block has
since expired. Do not earn a second one.

**Still need the HN URL.** The moment Show HN is posted on Wednesday, paste me
the `news.ycombinator.com/item?id=` link.

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

**Pre-launch baseline — corrected 2026-09-14 23:5x CT.** Read this version, not
the earlier ones, and here is why there were earlier ones.

The 19:10, 19:55 and 22:31 readings said 17/29/26 page requests and 4/8/9 real
browsers. Those numbers were too high, because filtering scanners *by path* does
not work: an address that probes `/.env` also fetches `/` and `/js/main.js`, and
those are real paths, so the scanner walks straight into "...that ran the app".
`scripts/traffic.mjs` now judges the address instead — ask for three or more
things that do not exist and none of your requests count. The same 24 hours,
read honestly:

```
Requests for the page        13      ...that ran the app     5
Did not bounce                2      Opened a sample         1
Made a book                   1      Made a cover            0
Checkouts started             0      Paid                    0      $0.00
Worker errors                 0
whole scanners ignored     2 addresses, 183 requests
my own machine ignored     2762 requests
```

Two addresses accounted for 183 requests and four of the nine "real browsers":
one Azure host that walked all 164 URLs of the site in three minutes, and one
returning cloud crawler. A further 2 of the remaining 5 are a Google Cloud
address that runs JavaScript and never 404s, so it cannot be caught this way —
assume **the true number of humans on a normal day here is about three.**

So: **five real browsers is not a change. Fifteen is.** And one stranger making
a book is the launch working. Do not celebrate the Worker invocation count —
it moves on its own.

**One book was made tonight at 21:12 CT, and it was not this machine.** Traced
to a Cloudflare WARP address on Edge (`2a09:bac5:d442:e6::17:331`): landed,
loaded the app, and one minute later pulled `/js/render-*.js` and both fonts,
which is the Download path and nothing else. WARP is a consumer VPN, not a data
centre, and no crawler here has ever fetched the render chunk. It is one event
and one event is inside the noise — but it is the best evidence so far that the
thing works for somebody who is not me.

**Never open the Buy link directly — run `node test/livecheckout.mjs`.** Loading
the payment link creates a real Checkout Session in the live account, and an
untagged one is indistinguishable from a customer who reached the card form and
walked away. I did this at 22:28 tonight, verifying the link really showed $19 in
live mode, and four minutes later the dashboard told me someone had opened
checkout and not paid. It was me. The two sessions are now named in
`scripts/traffic.mjs`, which is the only way to label a session after the fact —
the tag rides in on the URL and can only be set at creation. The test script
tags itself and answers the same question.

**The dashboard cannot tell you where anyone came from.** Cloudflare has referer
and query-string dimensions, but they are gated behind a paid plan on this zone
— checked properly on launch eve, not guessed. So the `?ref=producthunt` that
Product Hunt appends to the outbound link is invisible here. Attribution is by
clock: the launch fires at a known minute, the baseline is tens of requests a
day, and a jump into the hundreds inside that hour is Product Hunt. Do not go
adding a beacon to the page to do better — the page promises nothing leaves your
browser, and that promise is worth more than the attribution.

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

Live as of launch eve: `eaeedff1-63c6-4542-9fcb-352d7fe14b65` (three new pin
images under `/pins/` and one parenthetical on the word-search page, 2026-09-14
22:4x CT — wrangler reported "Uploaded 4 files, 139 already uploaded", and the
JS bundle was deliberately *not* rebuilt so `public/js` went up byte-identical).
**Roll back to `b8068dc0-2e93-4809-aa0b-641736ff99bf`** — the font-licence
deploy, which the whole suite ran green against. Before that:
`d53de0d4-d3a0-4179-9f88-f054b2bad50a` (the FAQ wording fix), then
`ff0a350d-882d-4ef5-9d76-60209ed0f9fe`, then
`cacf2b59-0587-4427-934b-ed30702c5561`.

Every one of tonight's changes is as low-risk as a deploy gets: CSS inside a
`@media (pointer: coarse)` block that a desktop visitor cannot reach, eight words
of prose in a collapsed FAQ entry, a text file nothing links to, three PNGs
nothing on the site links to, and four words in one parenthetical. If something
looks wrong on a laptop tomorrow, it is none of them. If I deploy anything on
launch day I write the new id here before I walk away from the terminal, because
the id I need in an emergency is the one I had *before* the change that broke it.

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

**The answers are already written.** `answers.md` holds drafts for the fifteen
questions that actually get asked — is it AI, why $19, can I sell the books, what
about the font licence, how is this different from Book Bolt, isn't KDP already
flooded — with every number in them checked against the code tonight rather than
remembered tomorrow. Read the question that was actually asked, take the
paragraph that fits, cut it down. A reply that reads as a prepared block is worse
than two honest sentences.

The principles below still govern. If `answers.md` and this section ever
disagree, this section wins.

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
