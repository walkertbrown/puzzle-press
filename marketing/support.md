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
> 1. Go to puzzlepress.bananafest-destiny.com and click "Remove both — $19 one-time" (or the Buy button), which opens the unlock box.
> 2. Enter the email exactly as it appears on your receipt.
> 3. Press Unlock.
>
> If it says no payment was found, tell me the email on the receipt and I will check it against our records and unlock it by hand. Your payment is safe either way.

Behind it: `/api/verify` matches case-insensitively and pages back through
thousands of payments, so a genuine mismatch is rare. If they are in a
private window the bar will say "This tab only" — see the next one.

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
| Fewer than 24 pages | The book is too short. The tool warns about this before download; more puzzles fixes it. |
| Fonts not embedded | Not our interior — ours embeds and subsets Liberation Sans. If they rebuilt the PDF elsewhere, that is where it happened. |
| Cover size is wrong | Spine width. Check it against /spine-calculator. Many calculators add 0.06" that Amazon's documentation does not. |

If it is genuinely our file: ask for the PDF, refund without being asked,
and tell me — a rejection is a bug, not a support ticket.

### "Can I get an invoice / receipt?"

> Stripe emails a receipt automatically when you pay — check spam for one from Stripe. If you need a proper invoice with a business name and address on it, reply with those details and I will send one.

Stripe Dashboard → the payment → "Create invoice" or resend the receipt.

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
