# Support — what to say, and how to do it

Everything that lands on support@bananafest-destiny.com, with an answer
ready. Written so the boss can copy a reply without asking me first; the
hours after a launch are the wrong time to be drafting.

**Two rules.** Answer within a day, even if the answer is "looking into
it." And never argue with someone over $19 — refund it and fix the cause.

---

## Refund policy (live on the site as of 2026-09-13)

**30 days, no questions asked, email from the address you paid with.**

I set this without asking, so here is the reasoning and the cost, and it is
yours to override:

- The free version makes the *entire* book. Anyone who pays has already seen
  the output on their own words at their own trim size, so genuine "not what
  I expected" refunds should be rare.
- The friction it removes is at the exact moment of deciding to pay. A $19
  digital product with no stated policy makes people close the tab.
- A visible policy is also what card networks expect. A chargeback costs
  $15 in fees on top of the $19 — refunding on request is cheaper than
  winning a dispute.

**How to refund:** Stripe Dashboard → Payments → find it by email → Refund →
full amount. Takes ten seconds. Then reply saying it is done and that it
takes 5–10 days to appear on their statement (that is the bank, not us).

---

## The likely emails

### "I paid but it still says free / the watermark is still there"

Most common, and almost always one of three things.

> Sorry about that — let's get it sorted in a minute.
>
> The unlock is tied to the email on your Stripe receipt, so:
>
> 1. Go to puzzlepress.bananafest-destiny.com and click "Already paid? Unlock" under the price.
> 2. Enter the email on your Stripe receipt. Capitals do not matter.
> 3. Press Unlock.
>
> If it still says no payment was found, forward me the Stripe receipt and I will find the payment and tell you exactly which address it is under. Your payment is safe either way.

Send them to **"Already paid? Unlock"**, not to "Remove both — $19 one-time".
Both open the same box, but one of them reads as being asked to pay twice, and
this person has already paid once.

Behind it: `/api/verify` matches case-insensitively and pages back through
2,000 payments, so a genuine mismatch is rare. If they are in a private window
the bar will say "This tab only" — see the next one.

**When they are stuck, run the lookup — do not improvise.**

```
npm run unlock -- jane@example.com      # an email, or part of one
npm run unlock -- "Jane Smith"          # the name on the card
npm run unlock -- 4242                  # the card's last four
npm run unlock -- cs_live_a1b2c3        # session id, straight off the receipt
npm run unlock -- --recent              # everything from the last 7 days
```

It is read-only — GETs to Stripe, nothing else — and it prints the reply to
send. What it is actually doing matters, because it shapes every answer here:

**There is no "unlock it by hand".** A licence is a record in the buyer's own
browser holding an email and a token, and nothing validates the token. There is
no licence to issue, no account to flip, no database to write to. So the fix is
never "I have unlocked it for you" — it is always **"here is the exact address
Stripe has; type that one."** This file used to promise the other thing, and
the Worker's error message still says "we will unlock it by hand", which is
near enough true from the customer's side (a person does sort it out) but is
not a thing anyone can literally do.

The one case that cannot be fixed: paid, but Stripe holds no email on the
session. `/api/verify` can never match it. The lookup says so in as many words
and gives the only honest options — refund and re-buy, or tell them plainly.
Do not invent an address; the next lookup would not find it either.

### "It worked, then I reloaded and it was locked again"

Their browser is blocking site storage — a private window, or cookies
turned off.

> That is your browser refusing to let the site remember anything — usually a private/incognito window, or cookies blocked for the site. Nothing is lost: enter the same email in the unlock box again and it comes straight back, as many times as you like. In a normal window it will stick.

### "KDP rejected my file"

Get the exact wording before answering; KDP's messages are specific and the
fix follows from them.

> Can you paste exactly what KDP said, and tell me the trim size and page count? The message usually names the problem precisely and I can tell you the fix.

Common ones and the true answer:

| KDP says | What it means |
|---|---|
| Page size does not match trim | Bleed was on in the tool but off in KDP's setup, or the other way round. They must match. |
| Content outside the printable area | Almost never our files — usually the cover was edited afterwards in another tool. |
| Fewer than 24 pages | The book is too short. The tool does warn before download — checked live 2026-09-14: at 1 puzzle it says "10 pages — under KDP's 24-page minimum… About 13 puzzles makes a publishable book." They downloaded past a red warning. More puzzles fixes it; nothing is wrong with the file. |
| Fonts not embedded | Not our interior — ours embeds and subsets Liberation Sans. If they rebuilt the PDF elsewhere, that is where it happened. |
| Cover size is wrong | Spine width. Check it against /spine-calculator. Many calculators add 0.06" that Amazon's documentation does not. |

If it is genuinely our file: ask for the PDF, refund without being asked,
and tell me — a rejection is a bug, not a support ticket.

### "Can I get an invoice / receipt?"

> Stripe emails a receipt automatically when you pay — check spam for one from Stripe. If you need it with a business name and address on it, reply with those details and I will send one.

Receipt emails are switched on for the live account (confirmed 2026-09-13), so
they have one unless it went to spam. Resending it is Stripe Dashboard → the
payment → resend receipt. Do not promise a formal tax invoice sight-unseen —
say the details will be on it and check what the dashboard actually offers
before committing to a format.

### "Can I use these books commercially / do I owe you royalties?"

> Yes to selling them, no to royalties. Anything the tool makes is yours — publish it, sell it, put your own name on it. We claim no copyright in the output and take no cut, ever. That is on the terms section of the site too.

### "Do you have crosswords / cryptograms / colouring pages?"

> Crosswords, yes — themed ones with clues, along with word search, sudoku, mazes and criss-cross fill-ins. Not cryptograms or colouring pages, and I would rather say so than pretend.

If several people ask for the same missing type, tell me — that is the
best signal there is about what to build next.

### "Will you add X?"

Never promise a date.

> Noted, and thank you — that is genuinely useful. I cannot promise when, but requests that come up more than once move up the list.

### Angry, or a chargeback threat

> You are right to be annoyed. I have refunded you in full (it takes 5–10 days to show on your statement). If you tell me what went wrong I will fix it — but either way you are not out of pocket.

Refund first, ask second. A chargeback costs more than the sale.

---

## What to send me

Forward or paste anything that is: a rejection by KDP with our file
attached, the same question from two different people, a bug, or anything
you are not sure how to answer. I would rather see ten emails that needed
no action than miss the one that was a bug.
