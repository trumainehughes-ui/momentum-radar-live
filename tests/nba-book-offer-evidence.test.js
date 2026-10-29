import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNbaBookOffer,auditNbaBookOffers} from '../lib/nba-book-offer-evidence.js';
const now=Date.parse('2026-10-29T12:00:00Z');
const offer={gameId:'401',playerId:'23',player:'Example Player',market:'points',exactLine:24.5,
 americanOdds:-110,selectionId:'dk-23-points-245',book:'DraftKings',
 sourceUrl:'https://sportsbook.draftkings.com/leagues/basketball/nba',
 observedAt:'2026-10-29T11:55:00Z'};
test('accepts complete recent official NBA offer',()=>{
 const result=validateNbaBookOffer(offer,{gameId:'401',now});
 assert.equal(result.ok,true);
 assert.equal(result.offer.exactLine,24.5);
});
test('rejects third-party and spoofed sportsbook URLs',()=>{
 for(const sourceUrl of ['https://draftkings.com.evil.test/nba','https://other.example/nba'])
  assert.equal(validateNbaBookOffer({...offer,sourceUrl},{now}).ok,false);
});
test('rejects stale quotes, mismatched games, missing selection IDs and model-only lines',()=>{
 assert.equal(validateNbaBookOffer(offer,{now:now+3600000}).ok,false);
 assert.equal(validateNbaBookOffer(offer,{gameId:'999',now}).ok,false);
 assert.equal(validateNbaBookOffer({...offer,selectionId:''},{now}).ok,false);
 assert.equal(validateNbaBookOffer({...offer,americanOdds:undefined},{now}).ok,false);
 assert.equal(validateNbaBookOffer({...offer,exactLine:'24.5'},{now}).ok,false);
});
test('audit keeps only verifiable official observations',()=>{
 const result=auditNbaBookOffers([offer,{...offer,book:'Unknown'}],{now});
 assert.equal(result.verifiedCount,1);assert.equal(result.rejected.length,1);
});
