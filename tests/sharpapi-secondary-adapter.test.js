import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSharpApiOdds,sharpApiResearchMatch} from '../lib/sharpapi-secondary-adapter.js';
const now=Date.parse('2026-10-26T20:05:00Z');
const sample={sportsbook:'draftkings',event_id:'game1',market_type:'player_receiving_yards',
 selection:'Example Receiver',selection_type:'over',line:74.5,odds_american:-110,
 timestamp:'2026-10-26T20:00:00Z'};
test('secondary market keeps exact fractional line but cannot become a bettable quote',()=>{
 const [p]=normalizeSharpApiOdds([sample],{now});
 assert.equal(p.line,74.5);
 assert.equal(p.americanOdds,-110);
 assert.equal(p.provider,'SharpAPI');
 assert.equal(p.firstPartyVerified,false);
 assert.equal(p.verifiedSGPQuote,false);
 assert.equal(p.eligibleForPublicBettableSlip,false);
});
test('rejects stale, future, malformed and unrecognized sportsbook records',()=>{
 assert.deepEqual(normalizeSharpApiOdds([sample],{now:now+20*60_000}),[]);
 assert.deepEqual(normalizeSharpApiOdds([sample],{now:Date.parse(sample.timestamp)-1}),[]);
 assert.deepEqual(normalizeSharpApiOdds([{...sample,sportsbook:'unknown'}],{now}),[]);
 assert.deepEqual(normalizeSharpApiOdds([{...sample,odds_american:null}],{now}),[]);
 assert.deepEqual(normalizeSharpApiOdds([{...sample,line:null}],{now}),[]);
 assert.deepEqual(normalizeSharpApiOdds([{...sample,selection_type:'outright'}],{now}),[]);
});
test('research comparison requires an independently verified first-party record',()=>{
 const [p]=normalizeSharpApiOdds([sample],{now});
 const offer={...p,firstPartyVerified:true};
 assert.equal(sharpApiResearchMatch(p,offer),true);
 assert.equal(sharpApiResearchMatch(p,{...offer,firstPartyVerified:false}),false);
 assert.equal(sharpApiResearchMatch(p,{...offer,line:75}),false);
 assert.equal(sharpApiResearchMatch(p,{...offer,book:'fanduel'}),false);
});
