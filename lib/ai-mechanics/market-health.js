import { isCurrentBookOffer } from './book-quote-freshness.js';

// Pure, read-only evidence state for NFL market displays.
// A provider-observed player prop is NOT an executable combined SGP quote.
export function summarizeMarketEvidence({ rows = [], oddsDebug = {}, stale = false, now = Date.now() } = {}) {
  const allowed = new Set(["DraftKings", "FanDuel"]);
  const observedBookLines = Array.isArray(rows)
    ? rows.reduce((n, row) => n + (Array.isArray(row?.books)
      ? row.books.filter(b =>
          allowed.has(b?.book) && isCurrentBookOffer(b,{now}) &&
          (b.line === null || (b.line !== '' && Number.isFinite(Number(b.line))))).length : 0), 0)
    : 0;
  if (stale) return {
    state:"STALE_SNAPSHOT", message:"Cached sportsbook markets may be outdated. Model projections are available; refresh verification before relying on prices.",
    observedBookLines, combinedSgpQuoteVerified:false, advisoryOnly:true
  };
  if (observedBookLines > 0) return {
    state:"BOOK_LINES_OBSERVED_UNQUOTED", message:"Player-prop lines are present. A sportsbook-issued combined same-game parlay price has not been verified.",
    observedBookLines, combinedSgpQuoteVerified:false, advisoryOnly:true
  };
  const detail=String(oddsDebug?.sgoError || "")+" "+String(oddsDebug?.error || "");
  if (/OUT_OF_USAGE_CREDITS|quota[_ -]?(exhausted|blocked|cooldown)|remaining=0/i.test(detail))
    return {state:"PROVIDER_QUOTA_EXHAUSTED",
      message:"Sportsbook provider quota is exhausted. NFL model projections remain available without verified book prices.",
      observedBookLines:0,combinedSgpQuoteVerified:false,advisoryOnly:true};
  if (/rate[_ -]?limit|upstream_429|HTTP 429/i.test(detail))
    return {state:"PROVIDER_RATE_LIMITED",
      message:"Sportsbook feed is rate-limited. NFL model projections remain available; book prices are unverified.",
      observedBookLines:0,combinedSgpQuoteVerified:false,advisoryOnly:true};
  return {state:"ANALYTICS_ONLY",
    message:"NFL matchup and player projections are available. No current DraftKings or FanDuel market lines are verified.",
    observedBookLines:0,combinedSgpQuoteVerified:false,advisoryOnly:true};
}
