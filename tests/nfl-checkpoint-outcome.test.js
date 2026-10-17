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
