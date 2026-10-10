import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCurrentBookOffer, currentBookOffer, validAmericanOdds,
  MAX_BOOK_QUOTE_AGE_MS
} from "../lib/ai-mechanics/book-quote-freshness.js";

const now = 10000000;
const good = {book:"DraftKings",available:true,odds:-110,line:84.5,
  lastUpdatedAt:new Date(now-60000).toISOString()};

test("provider-stamped DraftKings prop is current for at most fifteen minutes",()=>{
  assert.equal(isCurrentBookOffer(good,{now}),true);
  assert.equal(isCurrentBookOffer({...good,lastUpdatedAt:new Date(now-MAX_BOOK_QUOTE_AGE_MS).toISOString()},{now}),true);
  assert.equal(isCurrentBookOffer({...good,lastUpdatedAt:new Date(now-MAX_BOOK_QUOTE_AGE_MS-1).toISOString()},{now}),false);
});
test("page refresh cannot make historical bookmaker timestamp fresh",()=>{
  assert.equal(isCurrentBookOffer({...good,lastUpdatedAt:new Date(now-3600000).toISOString()},{now}),false);
});
test("future or absent source timestamps fail closed",()=>{
  for(const lastUpdatedAt of [null,undefined,"",new Date(now+1000).toISOString(),"yesterday"]){
    assert.equal(isCurrentBookOffer({...good,lastUpdatedAt},{now}),false,String(lastUpdatedAt));
  }
});
test("invalid American prices cannot be displayed as a book offer",()=>{
  for(const odds of [null,undefined,"",0,50,99,-99,10.5,NaN,Infinity,true]){
    assert.equal(validAmericanOdds(odds),false,String(odds));
    assert.equal(isCurrentBookOffer({...good,odds},{now}),false,String(odds));
  }
  assert.equal(validAmericanOdds(-110),true);
  assert.equal(validAmericanOdds("+250"),true);
});
test("wrong or unavailable sportsbook cannot substantiate FanDuel quote",()=>{
  const market={books:[good,{...good,book:"FanDuel",available:false}]};
  assert.equal(currentBookOffer(market,"FanDuel",now),null);
  assert.equal(currentBookOffer(market,"DraftKings",now)?.line,84.5);
  assert.equal(isCurrentBookOffer({...good,book:"Other"},{now}),false);
});
test("real provider quote updates are retained in sportsbook normalizers",()=>{
  const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
  assert.match(src,/lastUpdatedAt:v\.lastUpdatedAt\?\?null/);
  assert.match(src,/lastUpdatedAt:mk\.last_update\|\|b\.last_update\|\|null/);
  assert.match(src,/function bookFor\(m,name\)\{return currentBookOffer\(m,name\)\}/);
  assert.match(src,/hasBook=Boolean\(bookFor\(x,'DraftKings'\)\|\|bookFor\(x,'FanDuel'\)\)/);
});
test("invalid under-side props cannot be used as OVER candidates",()=>{
  const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
  assert.match(src,/m\.betTypeID==='ou'&&m\.sideID==='over'/);
});
