import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCombinedSGPQuote} from '../lib/sgp-quote-validation.js';
const now=Date.parse('2026-10-26T20:01:00Z');
const args={tier:'nuke',book:'DraftKings',eventId:'game-1',selectionIds:['a','b'],now};
const quote={book:'DraftKings',eventId:'game-1',selectionIds:['a','b'],status:'ACCEPTED',
 quoteId:'quote-1',combinedAmericanOdds:10500,issuedAt:'2026-10-26T20:00:30Z',
 sourceUrl:'https://sportsbook.draftkings.com/'};
test('accepts exact fresh sportsbook-issued nuke quote',()=>{
 assert.deepEqual(validateCombinedSGPQuote(quote,args),{valid:true,combinedAmericanOdds:10500,quoteId:'quote-1'});
});
test('rejects wrong event, book, selection, duplicate and missing quote',()=>{
 for (const changed of [
  {...quote,eventId:'game-2'},
  {...quote,book:'FanDuel'},
  {...quote,selectionIds:['a','c']},
  {...quote,selectionIds:['a','a']},
  {...quote,status:'ESTIMATED'},
  {...quote,quoteId:''}
 ]) assert.equal(validateCombinedSGPQuote(changed,args).valid,false);
 assert.equal(validateCombinedSGPQuote(null,args).valid,false);
});
test('rejects stale, future, wrong tier and untrusted source',()=>{
 for(const changed of [
  {...quote,issuedAt:'2026-10-26T19:00:00Z'},
  {...quote,issuedAt:'2026-10-26T20:02:00Z'},
  {...quote,combinedAmericanOdds:9000},
  {...quote,sourceUrl:'https://draftkings.com.evil.example/'}
 ]) assert.equal(validateCombinedSGPQuote(changed,args).valid,false);
});
test('validates small and medium payouts separately',()=>{
 assert.equal(validateCombinedSGPQuote({...quote,combinedAmericanOdds:2500},{...args,tier:'small'}).valid,true);
 assert.equal(validateCombinedSGPQuote({...quote,combinedAmericanOdds:6000},{...args,tier:'medium'}).valid,true);
 assert.equal(validateCombinedSGPQuote({...quote,combinedAmericanOdds:2500},{...args,tier:'nuke'}).valid,false);
});
