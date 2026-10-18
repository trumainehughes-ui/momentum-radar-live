import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyNflCheckpointMarket,sanitizeNflCheckpointOutcome} from '../lib/nfl-checkpoint-outcome.js';

test('checkpoint audit retains only sanitized per-book quote status',()=>{
 const market={ok:true,oddsDebug:{
  providerNativeRows:8,authorizedQuoteCandidates:2,
  fanduel_SmallQuoteStatus:'quote_provider_rejected',
  draftkings_NukeQuoteStatus:'selection_not_accepted',
  secret:'must-not-appear',
  fanduel_SmallQuoteStatusReason:'sensitive upstream response'
 },sgps:{DraftKings:[],FanDuel:[],combinedBookQuoteVerified:false}};
 const classified=classifyNflCheckpointMarket(market);
 assert.equal(classified.status,'PROVIDER_SELECTIONS_UNQUOTED');
 assert.deepEqual(classified.quoteRejections,[
  {tier:'fanduel_Small',status:'quote_provider_rejected'},
  {tier:'draftkings_Nuke',status:'selection_not_accepted'}
 ]);
 const saved=sanitizeNflCheckpointOutcome({gameId:'401772345',stage:'DAY_AHEAD',...classified});
 assert.deepEqual(saved.quoteRejections,classified.quoteRejections);
 assert.equal(JSON.stringify(saved).includes('must-not-appear'),false);
 assert.equal(JSON.stringify(saved).includes('sensitive upstream response'),false);
});

test('checkpoint audit rejects arbitrary tier names and invalid state',()=>{
 const input={gameId:'401772345',stage:'FINAL_T_MINUS_30',status:'PROVIDER_SELECTIONS_UNQUOTED',
  quoteRejections:[{tier:'fanduel_Small',status:'rejected'},{tier:'otherbook_Small',status:'bad'},
   {tier:'draftkings_Nuke',status:'x'.repeat(120)}]};
 const result=sanitizeNflCheckpointOutcome(input);
 assert.equal(result.quoteRejections.length,2);
 assert.equal(result.quoteRejections[1].status.length,70);
 assert.equal(sanitizeNflCheckpointOutcome({...input,status:'UNKNOWN'}),null);
});

test('a +5000 DraftKings quote cannot qualify as a verified Nuke',()=>{
 const quote={risk:'Nuke',actualSgpOdds:5000,combinedBookQuoteVerified:true,publishable:true};
 const market={ok:true,oddsDebug:{providerNativeRows:5,authorizedQuoteCandidates:1},
  sgps:{DraftKings:[quote],FanDuel:[],combinedBookQuoteVerified:true}};
 const result=classifyNflCheckpointMarket(market);
 assert.equal(result.verifiedBookTiers,0);
 assert.equal(result.status,'PROVIDER_SELECTIONS_UNQUOTED');
});

test('only in-band published combined quotes count as verified',()=>{
 const market={ok:true,oddsDebug:{providerNativeRows:5,authorizedQuoteCandidates:2},
  sgps:{DraftKings:[
   {risk:'Nuke',actualSgpOdds:10000,combinedBookQuoteVerified:true,publishable:true},
   {risk:'Medium',actualSgpOdds:5000,combinedBookQuoteVerified:true,publishable:false}],
   FanDuel:[{risk:'Small',actualSgpOdds:2500,combinedBookQuoteVerified:true,publishable:true}],
   combinedBookQuoteVerified:true}};
 const result=classifyNflCheckpointMarket(market);
 assert.equal(result.verifiedBookTiers,2);
 assert.equal(result.status,'VERIFIED_BOOK_QUOTE');
});
