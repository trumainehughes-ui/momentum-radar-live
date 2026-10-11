import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflSavedBookQuoteDiagnostics}
 from '../lib/nfl-book-quote-diagnostics.js';
import {nflSgpSnapshotReadiness}
 from '../lib/nfl-sgp-snapshot-status.js';
const now=Date.parse('2026-10-11T18:00:00Z'),gameId='401872992';
const snap=(body,at=now-60_000)=>({at,body:{ok:true,gameId,
 analyticsAvailable:true,
 sgps:{Analytics:[],DraftKings:[],FanDuel:[]},...body}});
test('routine read-only saved model identifies missing verified change trigger',()=>{
 const body={ok:true,gameId,oddsDebug:{
  propLineCreditPolicy:'verified_change_only',providerNativeRows:0
 },validation:{sgpEligibleMarketRows:0},sgps:{DraftKings:[],FanDuel:[]}};
 const x=nflSavedBookQuoteDiagnostics(body,{fresh:true});
 assert.equal(x.status,'AWAITING_VERIFIED_CHANGE_EVENT');
 assert.equal(x.authorizedRefreshObserved,false);
 assert.equal(x.nativeOfferRows,0);
 assert.equal(x.books.length,2);
 assert.equal(x.books[0].risks.length,3);
 assert.equal(x.books[0].risks[0].selectionReadiness,'NO_BOOK_CANDIDATE');
});
test('authorized market fetch without native rows distinguishes provider issue from no trigger',()=>{
 const raw={ok:true,gameId,
  oddsDebug:{propLineChangeType:'player_inactive',providerNativeRows:0,
    propLineStage:'provider_unavailable',error:'SECRET-API-KEY'},
  validation:{sgpEligibleMarketRows:0},sgps:{DraftKings:[],FanDuel:[]}};
 const d=nflSavedBookQuoteDiagnostics(raw,{fresh:true});
 assert.equal(d.status,'AUTHORIZED_PROVIDER_OFFERS_UNAVAILABLE');
 assert.equal(d.authorizedRefreshObserved,true);
 assert.ok(!JSON.stringify(d).includes('SECRET-API-KEY'));
});
test('signed rows but incomplete native tiers do not claim verified prices',()=>{
 const raw={ok:true,gameId,oddsDebug:{
  propLineChangeType:'player_injury',providerNativeRows:8,
  authorizedQuoteCandidates:0},
  validation:{sgpEligibleMarketRows:8},
  sgps:{DraftKings:[{risk:'Small',quoteEligibility:'MISSING_VERIFIED_BOOK_SELECTIONS',
   legs:[{name:'secret-athlete',bookOutcomeId:'secret-book-id'}]}],FanDuel:[]}};
 const d=nflSavedBookQuoteDiagnostics(raw,{fresh:true});
 assert.equal(d.status,'NO_COMPLETE_PROVIDER_BOOK_TIER');
 assert.equal(d.nativeOfferRows,8);
 assert.equal(d.books[0].risks[0].candidatePresent,true);
 assert.equal(d.books[0].risks[0].selectionReadiness,'MISSING_VERIFIED_BOOK_SELECTIONS');
 assert.ok(!JSON.stringify(d).includes('secret-athlete'));
 assert.ok(!JSON.stringify(d).includes('secret-book-id'));
});
test('quote candidate attempts with no provider-verified response are unquoted',()=>{
 const raw={ok:true,oddsDebug:{propLineChangeType:'player_inactive',
  providerNativeRows:12,authorizedQuoteCandidates:2},
  validation:{sgpEligibleMarketRows:10},sgps:{DraftKings:[],FanDuel:[]}};
 const d=nflSavedBookQuoteDiagnostics(raw,{fresh:true});
 assert.equal(d.status,'BOOK_QUOTE_ATTEMPTED_UNVERIFIED');
 assert.equal(d.quoteAttempts,2);
 assert.equal(d.books[0].risks[2].quoted,false);
});
test('reported bookmaker success is accepted only from the strict snapshot quote verifier',()=>{
 const raw={ok:true,gameId,oddsDebug:{
  propLineChangeType:'player_injury',providerNativeRows:12,authorizedQuoteCandidates:1},
  sgps:{DraftKings:[],FanDuel:[]}};
 const d=nflSavedBookQuoteDiagnostics(raw,{fresh:true,
  verifiedQuotes:[{book:'DraftKings',risk:'Small'}]});
 assert.equal(d.status,'VERIFIED_BOOK_QUOTES_PRESENT');
 assert.equal(d.books[0].risks[0].quoted,true);
 assert.equal(d.books[1].risks[0].quoted,false);
});
test('stale snapshots do not disclose stale odds or private provider evidence',()=>{
 const raw={ok:true,gameId,oddsDebug:{propLineChangeType:'player_injury',
  providerNativeRows:5000,rawMessage:'APIKEY-secret'},sgps:{}};
 const d=nflSavedBookQuoteDiagnostics(raw,{fresh:false});
 assert.deepEqual(d,{status:'STALE_OR_UNVERIFIED_MODEL',nativeOfferRows:0,
  eligibleMarketRows:0,authorizedRefreshObserved:false,quoteAttempts:0,books:[]});
 const status=nflSgpSnapshotReadiness(snap(raw,now-20*60_000),{now,gameId});
 assert.equal(status.bookPricing.status,'STALE_OR_UNVERIFIED_MODEL');
 assert.ok(!JSON.stringify(status).includes('APIKEY-secret'));
});
test('live SGP status includes sanitized quote readiness without new paid source calls',()=>{
 const raw=snap({oddsDebug:{propLineCreditPolicy:'verified_change_only'},
  validation:{sgpEligibleMarketRows:0}});
 const result=nflSgpSnapshotReadiness(raw,{now,gameId});
 assert.equal(result.bookPricing.status,'AWAITING_VERIFIED_CHANGE_EVENT');
 assert.equal(result.sportsbookCombinedOddsVerified,false);
 const src=readFileSync(new URL('../lib/nfl-sgp-snapshot-status.js',import.meta.url),'utf8');
 assert.ok(src.includes('nflSavedBookQuoteDiagnostics(raw,{fresh,verifiedQuotes:bookQuotes})'));
 assert.ok(!src.includes('PLAYER_PROPS_API_KEY'));
});
