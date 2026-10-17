import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler from '../api/prop-line-sgp-quote.js';

const apiSource=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
const quoteSource=readFileSync(new URL('../api/prop-line-sgp-quote.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const baseLegs=n=>Array.from({length:n},(_,i)=>({market:'player_rush_yds',
  book_outcome_id:'dk-'+String(1000+i)}));
const buildReq=(risk,count)=>({method:'POST',headers:{
  authorization:'Bearer quote-regression-only',
  'x-momentum-change-token':'a'.repeat(64)},body:{
   league:'nfl',gameId:'401872990',eventId:'872990',
   bookmaker:'draftkings',risk,legs:baseLegs(count)}
});
const response=()=>({code:200,data:null,setHeader(){return this;},
  status(code){this.code=code;return this;},json(value){this.data=value;return this;}});
test('bad or undersized tier requests are rejected before any paid provider or token lookup',async()=>{
 const prev=process.env.CRON_SECRET;
 process.env.CRON_SECRET='quote-regression-only';
 try{
  for(const [risk,n] of [
   ['Small',3],['Small',5],['Medium',4],['Medium',6],
   ['Nuke',4],['Nuke',8],['',5],['unknown',5]
  ]){
   const res=response();
   await handler(buildReq(risk,n),res);
   assert.equal(res.code,400,risk+' '+n);
   assert.equal(res.data.error,'invalid_nfl_sgp_tier_or_leg_count');
  }
 }finally{
  if(prev===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=prev;
 }
});
test('one signed roster-change may price each tier once for each bookmaker, never more than six',()=>{
 assert.ok(apiSource.includes("for(const risk of ['Small','Medium','Nuke'])"));
 assert.ok(apiSource.includes('quoteCandidates.map(async'));
 assert.ok(apiSource.includes('candidates.slice(0,6)'));
 assert.ok(apiSource.includes('chooseNflCheckpointQuotes(candidates,'));
 assert.ok(apiSource.includes('await Promise.all('));
 assert.ok(apiSource.includes('if(authorizedChange&&gameId&&!DIRECT_PUBLIC_ODDS_ONLY)'));
 assert.ok(apiSource.includes('evaluateNflBookQuoteReadiness(s,{book,gameId,now})'));
 assert.ok(apiSource.includes('quoteRequest:safeQuote'));
 const gate=readFileSync(new URL('../lib/nfl-book-quote-readiness.js',import.meta.url),'utf8');
 assert.ok(gate.includes('bookmaker,risk,legs:selections'));
 assert.ok(gate.includes("offer.sourceProvider!=='PropLine'"));
 assert.ok(quoteSource.includes("const claimPath='momentum-propline-sgp-claims/v1/'+token+'/'+bookmaker+(league==='nfl'?'/'+risk:'')+'.json'"));
 assert.ok(quoteSource.includes('allowOverwrite:false'));
 assert.ok(quoteSource.includes('const NFL_TIER_LEGS={Small:[4,4],Medium:[5,5],Nuke:[5,7]}'));
 assert.ok(!apiSource.includes('Quote at most one complete candidate per bookmaker'));
});
test('every tier independently requires an authenticated, fresh correctly priced book quote',()=>{
 assert.ok(apiSource.includes("quote?.status==='PROVIDER_BOOK_COMBINED_QUOTE'"));
 assert.ok(apiSource.includes('Number(quote?.legsAccepted)===candidate.quoteRequest.legs.length'));
 assert.ok(apiSource.includes('sgpOddsInBand(risk,quote.americanOdds)'));
 assert.ok(apiSource.includes('candidate.combinedBookQuoteVerified=true'));
 assert.ok(apiSource.includes("candidate.publishable=true"));
 assert.ok(quoteSource.includes('verifyPropLineSgpResponse({league,gameId,eventId,bookmaker,legs},data)'));
});
test('frontend shows actual combined positive odds only when verified; model tiers stay visible when partial',()=>{
 assert.ok(html.includes('bookQuoteVerified=s=>'));
 assert.ok(html.includes('Actual combined ${book} odds: +${Number(s.actualSgpOdds)}'));
 assert.ok(html.includes('(Number(s.actualSgpOdds)/10).toFixed(2)'));
 assert.ok(html.includes('ALL THREE MOMENTUM RADAR MODEL TIERS'));
 assert.ok(html.includes('a bookmaker-issued correlated combined SGP quote is required'));
 assert.ok(!html.includes('Combined bookmaker price is automatically estimated'));
});
