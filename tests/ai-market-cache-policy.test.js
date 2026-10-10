import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  marketCachePolicy,cachedMarketResponseValid,
  ANALYTICS_EDGE_CACHE,BOOK_EDGE_CACHE,RESPONSE_TTL_MS
} from "../lib/ai-mechanics/market-cache-policy.js";

const now=10000000;
const book=(ms)=>({book:"FanDuel",odds:-110,line:85.5,available:true,
  lastUpdatedAt:new Date(ms).toISOString()});
test("bookmaker quote deadline shortens response cache TTL",()=>{
  const policy=marketCachePolicy({rows:[{books:[book(now-14*60*1000)]}],now});
  assert.equal(policy.hasBookQuotes,true);
  assert.equal(policy.expiresAt,now+60*1000);
  assert.equal(policy.edgeCache,BOOK_EDGE_CACHE);
});
test("two bookmaker quotes expire at earliest original provider deadline",()=>{
  const rows=[{books:[book(now-60*1000),{...book(now-14*60*1000),book:"DraftKings"}]}];
  assert.equal(marketCachePolicy({rows,now}).expiresAt,now+60*1000);
});
test("pure ESPN model state uses bounded public caching without stale-while-revalidate",()=>{
  const policy=marketCachePolicy({rows:[],now});
  assert.equal(policy.hasBookQuotes,false);
  assert.equal(policy.expiresAt,now+RESPONSE_TTL_MS);
  assert.equal(policy.edgeCache,ANALYTICS_EDGE_CACHE);
  assert.doesNotMatch(ANALYTICS_EDGE_CACHE,/stale-while-revalidate/);
});
test("saved book snapshot stops being reusable at original quote expiration",()=>{
  const expiry=marketCachePolicy({rows:[{books:[book(now-14*60*1000)]}],now}).expiresAt;
  const snap={at:now,expiresAt:expiry,body:{marketEvidence:{observedBookLines:1}}};
  assert.equal(cachedMarketResponseValid(snap,now+59999),true);
  assert.equal(cachedMarketResponseValid(snap,now+60000),false);
});
test("unversioned old snapshots cannot bypass quote freshness checks",()=>{
  assert.equal(cachedMarketResponseValid({at:now,body:{marketRows:5}},now+1),false);
  assert.equal(cachedMarketResponseValid({at:now,expiresAt:null},now+1),false);
  assert.equal(cachedMarketResponseValid({at:now,expiresAt:now+RESPONSE_TTL_MS},now-1),false);
});
test("stale quote is not eligible to extend server cache",()=>{
  const policy=marketCachePolicy({rows:[{books:[book(now-60*60*1000)]}],now});
  assert.equal(policy.hasBookQuotes,false);
  assert.equal(policy.edgeCache,ANALYTICS_EDGE_CACHE);
});
test("actual NFL endpoint uses a new cache schema and no-store for sportsbook prices",()=>{
  const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
  assert.match(src,/v75-source-quote-expiry/);
  assert.match(src,/cachedMarketResponseValid\(saved,Date\.now\(\)\)/);
  assert.match(src,/writeResponseSnapshot\(responseKey,body,responseCache\.expiresAt\)/);
  assert.match(src,/responseCache\.hasBookQuotes/);
  assert.match(src,/Vercel-CDN-Cache-Control',bookCacheHeader/);
});
