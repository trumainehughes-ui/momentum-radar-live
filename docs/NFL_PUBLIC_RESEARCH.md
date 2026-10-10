# NFL official sportsbook page discovery (preview only)

## What this adds

Momentum Radar can optionally use Brave's documented Web Search API to **discover** indexed player-market pages on the official DraftKings and FanDuel sportsbook domains. The existing Groq-powered **Player & market research** tab provides the player identity, the exact requested stat market and a source-specific search plan. The user must explicitly press **Search official sportsbook pages**; no browser request fires automatically on game loading, refreshes, timers, or AI explanation runs.

The feature does **not** scrape bookmaker pages, extract prices from web snippets, confirm geolocation, authenticate to a sportsbook or obtain a book-issued combined same-game parlay quote. It cannot label web results as offered props. Actual bookmaker lines must still come through the existing independent, current, source-qualified provider and roster gates.

## Vercel preview environment

Both values are required **server-side**:

- `NFL_PUBLIC_WEB_SEARCH_ENABLED=true`
- `BRAVE_SEARCH_API_KEY=<your Brave Web Search API subscription token>`

Leave the flag off in Production until an authenticated, budgeted workflow has been reviewed. Never put the subscription token in `public-ai.js`, URLs, commits, logs, or response bodies. Set the key in Vercel's **Preview** environment for the target branch, then redeploy that preview after changing environment variables.

Obtain the key from the Brave Search API dashboard and ensure the Web Search product is active. Brave documents `GET https://api.search.brave.com/res/v1/web/search` and the `X-Subscription-Token` header:
https://api-dashboard.search.brave.com/app/documentation/web-search

When either flag or key is absent the search endpoint reports `search_disabled` or `search_not_configured`; the Groq research queue still works without any Brave API call. The read-only `GET /api/nfl-public-market-status` endpoint exposes only `DISABLED`, `MISSING_KEY`, or `READY_RESEARCH_ONLY` status, never credentials. The research panel disables its search button when disconnected.

## Budget and safety

- Each user click requests **one** player, one bookmaker and one prop market (not an entire slate).
- The endpoint allows at most 20 searches per hour **per warm server instance** and caches identical discovery results for ten minutes per instance. Simultaneous identical player/market/book lookups on the same warm instance share one upstream request; cached responses preserve the associated exact player, book, game and stat labels. Failed searches are not cached, and duplicate requests do not spend additional search credits on that instance. These are still **not a globally durable quota** across Vercel instances, and must NOT be treated as production-ready rate enforcement.
- Queries are server-built from bounded player/team/market values. No arbitrary URL is fetched.
- Only indexed links with **HTTPS and an exact** `sportsbook.draftkings.com` or `sportsbook.fanduel.com` hostname are returned; untrusted links and redirect hosts are rejected.
- The output has no verified line, sportsbook price, source-quote timestamp, or correlated SGP odds. Indexed snippets can be outdated, regionalized or unavailable when opened.
- The search results are never fed into the `/api/nfl-markets` selection path or the `releaseReadiness` gate.

## Verification

Run `npm test`, including `tests/ai-nfl-public-market-search.test.js`, `tests/ai-nfl-search-broker.test.js` and `tests/ai-nfl-public-market-status.test.js`, then test the preview with:

1. Select an NFL game, open AI Analysis and choose **Player & market research**.
2. Generate the research queue and choose a player and DraftKings or FanDuel.
3. Press **Search official sportsbook pages**, and check that official-site links appear with the not-live-odds disclosure.
4. Confirm a missing search configuration yields a clear message, not made-up odds.
5. Check independent injury/starter gates and Small/Medium/Nuke tier rules remain unchanged.

**Next release steps:** implement durable shared budgeting, capture approved live player quotes with original source timestamps and exact player/game/market IDs, and independently verify actual combined SGP odds. Groq summaries and Brave search snippets can flag leads and contradictions; neither can turn a missing sportsbook quote into an executable selection.
