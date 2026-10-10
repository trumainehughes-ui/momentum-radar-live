// Snapshot cache lifetime cannot exceed the original market quote's lifetime.
// ESPN-only analytics can still use bounded caching without paid provider calls.
import { currentBookOffer, MAX_BOOK_QUOTE_AGE_MS } from "./book-quote-freshness.js";

export const RESPONSE_TTL_MS = 15 * 60 * 1000;
export const ANALYTICS_EDGE_CACHE = "public, s-maxage=300, must-revalidate";
export const BOOK_EDGE_CACHE = "private, no-store";

export function marketCachePolicy({rows=[],now=Date.now(),ttlMs=RESPONSE_TTL_MS}={}) {
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs<=0)
    return {expiresAt:null, hasBookQuotes:false, edgeCache:BOOK_EDGE_CACHE};
  const expiries=[];
  for (const market of Array.isArray(rows)?rows:[]) {
    for (const book of ["DraftKings","FanDuel"]) {
      const quote=currentBookOffer(market,book,now);
      if (!quote) continue;
      const at=Date.parse(quote.lastUpdatedAt);
      expiries.push(at+MAX_BOOK_QUOTE_AGE_MS);
    }
  }
  const hasBookQuotes=expiries.length>0;
  return {
    expiresAt:Math.min(now+ttlMs,...expiries),
    hasBookQuotes,
    edgeCache:hasBookQuotes?BOOK_EDGE_CACHE:ANALYTICS_EDGE_CACHE
  };
}

export function cachedMarketResponseValid(snapshot,now=Date.now()) {
  const at=Number(snapshot?.at),expiresAt=Number(snapshot?.expiresAt);
  return !!snapshot && Number.isFinite(now) && Number.isFinite(at) &&
    Number.isFinite(expiresAt) && at>0 && expiresAt>at && now>=at &&
    now<expiresAt && now-at<RESPONSE_TTL_MS;
}
