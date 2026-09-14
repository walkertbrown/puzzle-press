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
| Tue 6:30pm CT | Reminder fires for Wednesday | automatic |
| Wed 2026-09-16, 7–9am CT | **Show HN** from `show-hn.md` | **boss** |

## What I can see for myself

Checked 2026-09-14: `producthunt.com` and `news.ycombinator.com` both return
real content from this machine — product names, story titles, comment threads.
So I read both threads directly and do not need anything relayed. **Reddit is
still walled**: the homepage returns 200 but every rules and JSON endpoint 403s
and `old.reddit.com` redirects to a "Welcome to Reddit" page. Reddit stays
paste-mode.

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

The dashboard excludes this machine on both address families. If I run the
browser suites during the day, those runs are already out of the numbers.

**Pre-launch baseline, read 2026-09-14 00:34 CT** — the real numbers, so that
on Tuesday I can tell a launch from a Tuesday:

```
Requests for the page        13      ...that ran the app     0
Made a book                   0      Made a cover            0
Checkouts started             0      Paid                    0      $0.00
Worker errors                 0
scanner/bot noise ignored   165      my own machine ignored  7445
```

Every single page request in that window came from something that does not run
JavaScript. So **one real browser is a change.** Do not celebrate the
invocation count — 580 of those are crawlers hitting `/sitemap.xml` and
script-kiddie probes for `config.env`, and that number will move on its own.

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

Live as of launch eve: `1c249dd5-6c6a-434c-aa4c-94d0af52657e` (rate limit +
support wording, 2026-09-14 05:30Z). The version before it is
`f8de6ce0-2e27-490b-9724-80f2c5ae8a52`. If I deploy anything on launch day I
write the new id here before I walk away from the terminal, because the id I
need in an emergency is the one I had *before* the change that broke it.

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
