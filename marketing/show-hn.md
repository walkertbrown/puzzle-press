# Show HN — Puzzle Press

Post **Wednesday 2026-09-16, between 7 and 9am Central** (HN's US-morning
window; one day after Product Hunt so each gets its own day). Any account
works; new accounts can post Show HN. Go to https://news.ycombinator.com/submit

Do not ask anyone to upvote. Do not post it twice. Reply to every comment
in the first two hours — replies keep it on the front page more than the
post does.

## Title (paste exactly; 80-char limit)

Show HN: Puzzle Press – print-ready KDP puzzle books, generated in the browser

## URL

https://puzzlepress.bananafest-destiny.com

## Text (goes in the "text" box — HN shows it under the link)

I built a browser-side generator for Amazon KDP puzzle books: word search, sudoku, mazes and criss-cross fill-ins. It lays out the whole paperback interior — puzzles, solutions, page numbers, the four ruled pages at the back — to KDP's actual rules (gutter that grows with page count and swaps sides, 0.125" bleed, embedded subset fonts, even page count, 24–828 pages), then generates the full-wrap cover with the spine width computed from the page count of the book it just made.

Everything runs client-side with pdf-lib; nothing you type leaves the browser. The Worker only serves static files and checks Stripe for an unlock.

Things I cared about that most generators skip:

- Every word search word appears exactly once, checked in all 8 directions after fill; nested words (CAT/CATALOG) never share a grid; filler letters are screened against a blocklist.
- Every sudoku has exactly one solution — clues are removed in symmetric pairs and a removal is rejected if a counting solver finds a second solution.
- Mazes are spanning trees, so exactly one route, no unreachable pockets.
- Criss-cross (fill-in) grids are solved by a backtracking solver before they are kept; a second fill means a starter word is printed in, or the grid is discarded.
- Books can be graded easy→expert with the level printed on each puzzle.

Free to use with a watermark; $19 once removes it. No account.

Also: three free calculators (spine width, margins, royalty) on the same code path as the PDF engine, because several top-ranked KDP spine calculators add 0.06" that Amazon's documentation doesn't — that's a hardcover rule and it gets paperback covers rejected.

Disclosure: the whole thing — idea, code, deploy, copy — was built by an AI agent working as an employee, with me supplying accounts and answering factual questions. The build log with every plan and what actually happened is public: https://github.com/walkertbrown/vibe-cider. Happy to talk about that too.

## If you'd rather leave the AI disclosure out

Delete the last paragraph. But HN in particular will ask, and finding out later reads worse than saying it up front. Recommendation: keep it.

## Replies you will need (paste and adapt)

**"Why not just use Book Bolt / Canva / a free generator?"**
> Fair question; there's a comparison on the site that says when those are the better choice: https://puzzlepress.bananafest-destiny.com/compare. Short version: suites bill monthly and hand you puzzle pages to assemble; free generators make one puzzle. This makes the whole file, checks the puzzles, and is $19 once.

**"How do you guarantee one solution / one route / no duplicate words?"**
> Sudoku: dig clues out in symmetric pairs; before each removal, run a solver that counts solutions with a cap of 2; if it finds 2, keep the pair. Mazes: iterative DFS carve = spanning tree, so the path between any two cells is unique by construction. Word search: after placing words and filling, scan all 8 directions for every word and require exactly one occurrence (two for palindromes); nested words are removed from the list before placement. The generators and tests are in the repo.

**"Client-side PDF generation — how big is the bundle?"**
> pdf-lib + fontkit load lazily on first download; the page itself is ~40 KB of JS, ~250 KB total with the hero image, ~0.95 s to first puzzle on a throttled phone. Fonts are Liberation Sans, subset per book.

**"Crosswords?"**
> With clues, not yet — that needs a clue database and a much harder fill. There is a criss-cross / fill-in type (the crossword shape with the word list given instead of clues), which is its own KDP category, and every one is verified to have a unique fill. Clued crosswords are the next build if people want them.

**"The 0.06" spine thing — source?"**
> Amazon's own "Create a Paperback Cover" help page gives spine width as page count × paper thickness (0.0025" cream, 0.002252" white) with nothing added. The 0.06" appears in KDP's hardcover guidance. Several popular calculators apply it to paperbacks. The calculator on the site shows the arithmetic: https://puzzlepress.bananafest-destiny.com/spine-calculator

**"Built by an AI — so what did you do?"**
> Created accounts, answered questions with factual answers (what exists, what I'll pay for), reviewed what it shipped, and caught one real bug (a free book that was mostly blank Notes pages — it's in the log). Everything else, including this text, is the agent's. The log is honest about the mistakes.

**"Does it upload my word lists?"**
> No — generation and PDF rendering happen in the browser. There's a test in the repo that watches the network during a download and fails if anything but the unlock email leaves the page.

**"Price?"**
> Free with a footer line and a PREVIEW cover; $19 once removes both. No subscription, no account — the unlock is tied to the Stripe email.
