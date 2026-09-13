# The AI crawlers Cloudflare blocks for us — and why I left it alone

Found 2026-09-13, while running the SEO suite against the real domain rather
than workers.dev for the first time in days.

Cloudflare injects a **managed robots.txt block** ahead of our own file on
`bananafest-destiny.com`. Our file says `Allow: /` and nothing else; the live
one, on the custom domain only, also carries a Content Signals preamble and
nine `Disallow: /` groups:

    amazonbot, applebot-extended, bytespider, ccbot, claudebot,
    cloudflarebrowserrenderingcrawler, google-extended, gptbot,
    meta-externalagent

My first reaction was that this is a door closed on a product that has no
distribution, and that it should come off. It should not. The list is better
targeted than it looks, and the distinction it draws is the one that matters.

## Training crawlers vs retrieval agents

**Training crawlers** collect pages into a corpus that trains a future model.
Everything on that list is one of these. Whatever they take pays back, if at
all, in a model that ships a year or more from now — long after this product
has either found buyers or not.

**Retrieval agents** are what an assistant uses *while answering a question*.
Someone types "easiest way to make a KDP word search book" into ChatGPT or
Claude or Perplexity, and it goes and reads pages before it replies. That is a
live channel pointed directly at our buyer, on the exact question the product
answers.

They are different user agents, and **none of the retrieval ones are blocked**:

| Allowed (live retrieval) | Belongs to |
|---|---|
| `OAI-SearchBot` | ChatGPT search results |
| `ChatGPT-User` | ChatGPT fetching a page for a user right now |
| `PerplexityBot` | Perplexity |
| `Claude-User`, `Claude-SearchBot` | Claude |

`GPTBot` and `ClaudeBot`, the two blocked names that look alarming, are the
*training* crawlers of those same companies. Blocking them does not remove us
from an answer.

The one that gave me pause is `Google-Extended`, which governs Gemini
grounding. AI Overviews inside Google Search are crawled by ordinary
Googlebot, which is fully allowed, so our exposure on the search surface that
actually matters is unchanged.

## The call

Leave it on. It costs a training corpus that pays back in years, and it keeps
Cloudflare's Content Signals reservation of rights, which is free to hold. It
costs nothing on any channel that could send a buyer this month.

**But it has to be watched**, because it is a managed list on someone else's
schedule. If Cloudflare adds `OAI-SearchBot` or `PerplexityBot` to it in some
future update, a real channel closes silently and nothing on our side changes.
So `test/seo.mjs` now asserts each retrieval agent can reach the site, and
prints the blocked list on every run so a list that grows is visible.

## The test bug this started as

The suite had been checking robots.txt by grepping for `Disallow: /` anywhere
in the file. On workers.dev, where nothing is injected, it passed. On the real
domain it failed and said **"robots.txt does not disallow the whole site"** —
while the site was perfectly crawlable.

A false alarm, and the expensive kind: it would have fired at 6am on launch
morning and read as "Google cannot see us." It now parses robots.txt into
groups the way a crawler does and asks the only question worth asking — can
the agents that send buyers reach every page.

Worth remembering separately: **I had been running the SEO suite against
workers.dev.** The managed block exists only on the custom domain, so the
difference between the two hosts was invisible for as long as I only looked at
one of them. Live suites run against the domain the buyer uses.
