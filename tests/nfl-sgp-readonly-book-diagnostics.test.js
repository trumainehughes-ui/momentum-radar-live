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
  providerNativeRows:12,authorizedQuoteCandidates:2,authorizedQuoteAttempts:2},
  validation:{sgpEligibleMarketRows:10},sgps:{DraftKings:[],FanDuel:[]}};
 const d=nflSavedBookQuoteDiagnostics(raw,{fresh:true});
 assert.equal(d.status,'BOOK_QUOTE_ATTEMPTED_UNVERIFIED');
 assert.equal(d.quoteAttempts,2);
 assert.equal(d.books[0].risks[2].quoted,false);
});
test('signed checkpoint reports three actual attempts, not six eligible quotes',()=>{
 const raw={ok:true,gameId,oddsDebug:{
  propLineChangeType:'scheduled_checkpoint',providerNativeRows:24,
  authorizedQuoteCandidates:6,authorizedQuoteAttempts:3,
  draftkings_SmallQuoteStatus:'quote_provider_rejected',
  fanduel_MediumQuoteStatus:'BOOK_QUOTE_NOT_VERIFIED',
  draftkings_NukeQuoteStatus:'RAW SECRET: never publish',
  rawMessage:'PRIVATE_API_TOKEN'},validation:{sgpEligibleMarketRows:18},
  sgps:{DraftKings:[{risk:'Small',legs:[{bookOutcomeId:'SECRET-ID'}],
   quoteEligibility:'READY_FOR_AUTHORIZED_QUOTE'}],FanDuel:[]}};
 const d=nflSavedBookQuoteDiagnostics(raw,{fresh:true});
 assert.equal(d.eligibleQuoteCandidates,6);
 assert.equal(d.quoteAttempts,3);
 assert.equal(d.status,'BOOK_QUOTE_ATTEMPTED_UNVERIFIED');
 assert.equal(d.books[0].risks[0].quoteAttemptOutcome,'quote_provider_rejected');
 assert.equal(d.books[1].risks[1].quoteAttemptOutcome,'BOOK_QUOTE_NOT_VERIFIED');
 assert.equal(d.books[0].risks[2].quoteAttemptOutcome,null);
 for(const secret of ['SECRET-ID','PRIVATE_API_TOKEN','RAW SECRET'])
  assert.ok(!JSON.stringify(d).includes(secret));
});
test('no attempt count evidence is unknown; eligible cards alone never certify a quote attempt',()=>{
 const raw={ok:true,gameId,oddsDebug:{
  propLineChangeType:'player_inactive',providerNativeRows:10,
  authorizedQuoteCandidates:4},sgps:{DraftKings:[],FanDuel:[]}};
 let d=nflSavedBookQuoteDiagnostics(raw,{fresh:true});
 assert.equal(d.status,'QUOTE_ATTEMPT_EVIDENCE_UNAVAILABLE');
 assert.equal(d.quoteAttempts,null);
 assert.equal(d.eligibleQuoteCandidates,4);
 raw.oddsDebug.authorizedQuoteAttempts=0;
 d=nflSavedBookQuoteDiagnostics(raw,{fresh:true});
 assert.equal(d.status,'QUOTE_NOT_ATTEMPTED');
 assert.equal(d.quoteAttempts,0);
 const code=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(code.includes('oddsDebug.authorizedQuoteCandidates=candidates.length'));
 assert.ok(code.includes('oddsDebug.authorizedQuoteAttempts=quoteCandidates.length'));
 assert.ok(code.indexOf('oddsDebug.authorizedQuoteAttempts=quoteCandidates.length')<
  code.indexOf('await Promise.all(quoteCandidates.map'));
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

test('direct DraftKings/FanDuel website research never suggests an unavailable authenticated SGP quote will automatically refresh',()=>{
 const input={ok:true,gameId,oddsDebug:{
  oddsApisDisabled:true,directPublicResearchStatus:'PUBLIC_OFFERS_MATCHED',
  providerNativeRows:0,propLineChangeType:null,authorizedQuoteCandidates:0,
  rawError:'DO NOT EXPOSE THIS TOKEN'},validation:{sgpEligibleMarketRows:0},
  sgps:{Analytics:[{risk:'Nuke',legs:[{name:'private person'}]}],
   DraftKings:[],FanDuel:[]}};
 const x=nflSavedBookQuoteDiagnostics(input,{fresh:true});
 assert.equal(x.status,'FIRST_PARTY_PUBLIC_RESEARCH_NO_AUTHENTICATED_SGP_QUOTE');
 assert.equal(x.eligibleMarketRows,0);
 assert.equal(x.authorizedRefreshObserved,false);
 assert.ok(x.books.every(b=>b.risks.every(r=>r.quoted===false)));
 assert.ok(!JSON.stringify(x).includes('DO NOT EXPOSE THIS TOKEN'));
 assert.ok(!JSON.stringify(x).includes('private person'));
 const quoted=nflSavedBookQuoteDiagnostics(input,{fresh:true,
  verifiedQuotes:[{book:'DraftKings',risk:'Small'}]});
 assert.equal(quoted.status,'VERIFIED_BOOK_QUOTES_PRESENT',
  'genuine validated bookmaker quotes take precedence over no-quote source status');
});
