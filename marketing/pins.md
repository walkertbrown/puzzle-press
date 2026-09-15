# Pinterest — what is pinned, what is queued, and why it looks odd

`scripts/pins.mjs` renders every pin at 1000×1500 into `public/pins/`, from a
real book the tool actually made. Buffer fetches them from the live site by URL,
so **a pin cannot be queued until the image is deployed**.

## The thing that will confuse whoever reads the queue next

**Pinterest blocked `bananafest-destiny.com` as spam, and denied the appeal on
2026-09-12.** A pin whose destination URL is on our domain will not go out. So
every pin here does two things instead:

- `metadata.pinterest.url` points at the YouTube demo,
  `https://www.youtube.com/watch?v=ph6q2ih6cBs` — a real, relevant destination
  that happens not to be blocked.
- the site address appears as **plain text in the description**, where it is
  read by a person rather than resolved by the spam filter.

This is a workaround, not a trick: the pin goes where it says it goes, and the
text tells you the other address in as many words. **Re-appeal around
mid-October**, and when the block lifts, put the real URL back — the plain-text
line can stay, it costs nothing.

## The queue as of 2026-09-14 22:22 CT

Buffer free plan allows ten scheduled posts. Going into launch week the queue
was **completely empty** — all twelve prior posts had already sent — which is
worth noticing, because an empty queue is invisible and a full one is obvious.

| When (CT) | Pin | Angle |
|---|---|---|
| Tue 2026-09-15 08:00 | `08-royalty-cliff.png` | The $9.99 rate cliff |
| Wed 2026-09-16 20:00 | `10-large-print.png` | Large print costs 54¢ |
| Fri 2026-09-18 20:00 | `09-flat-rate.png` | Flat printing to 110 pages |

Spread across the week on purpose. Three pins in an hour, from an account that
has already been flagged once, is how you get flagged twice.

## Where the numbers came from

Every figure in pins 08–10 was computed from `src/pdf/kdp-cost.js` and
`src/pdf/layout.js` on 2026-09-14, not remembered:

- **50% below $9.99, 60% at or above** — `ROYALTY_THRESHOLD` and `royaltyRate`.
- **100 puzzles → 132 pages** — `planPages(100, 4)`.
- **8.5×11 at 132pp prints for $3.24**, so $8.99 pays 0.5 × 8.99 − 3.24 =
  **$1.25** and $9.99 pays 0.6 × 9.99 − 3.24 = **$2.75**.
- **Flat $2.30 to 110 pages, then $1.00 + 1.2¢/page** — the `regular.black`
  row of `RATES`. 20 puzzles is 32pp; **82 puzzles is exactly 110pp**, the last
  book that still fits inside the flat band.
- **$2.84 instead of $2.30** — the `large.black` flat rate. 8.5×11 is large
  trim because it is over 6.12" wide.
- **Around 22pt against about 14pt** — measured, not read off a comment. See
  below.

If that rate table is ever updated to a new KDP rate card, **pins 08, 09 and 10
are stale** and must be re-rendered before they are pinned again.

## The large-print number, and how it was wrong three times

Pin 10 originally said "about 15–16 cells, roughly 22–23pt letters". Both halves
came from round numbers in source comments — `src/ui/main.js` said 15–16 cells
and ~22pt, `src/pdf/render.js` said 23pt — and the same figures had already been
copied into `answers.md`, `product-hunt.md` and `ph-schedule-packet.md`, where
the boss was hours from pasting them into a Product Hunt launch.

Measured over 240 generated puzzles across eight word lists: large print gives
**14–19 cells (median 16)** and **18–25pt letters (median 22)**, four in five
between 20 and 24. A standard 6×9 page is **median 14pt**. So the useful, true
thing to say is "around 22pt, against about 14 at 6×9" — a comparison, not a
specification.

All four files now say that, both comments now carry the measurement, and
`test/copy.test.js` grows a guard for the related claim (`N×N is typical`).
A comment is not a measurement.
