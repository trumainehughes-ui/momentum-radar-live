import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBookOffer,validateSgpQuote} from '../lib/sportsbook-market-verification.js';
const now=Date.parse('2026-10-10T20:00:00Z');
const offer=(id,book='FanDuel')=>({book,sport:'NFL',gameId:'game-1',playerId:id,offerId:id,market:'rushing',line:'60+',americanOdds:'-125',checkedAt:new Date(now).toISOString(),sourceUrl:'https://sportsbook.example/market',available:true});
test('accepts current sourced individual market',()=>assert.equal(validateBookOffer(offer('a'),now).ok,true));
test('rejects missing odds',()=>assert.equal(validateBookOffer({...offer('a'),americanOdds:''},now).ok,false));
test('rejects stale market',()=>assert.equal(validateBookOffer({...offer('a'),checkedAt:new Date(now-3600000).toISOString()},now).ok,false));
test('rejects unavailable market',()=>assert.equal(validateBookOffer({...offer('a'),available:false},now).ok,false));
test('rejects missing source',()=>assert.equal(validateBookOffer({...offer('a'),sourceUrl:''},now).ok,false));
test('rejects mixed books for SGP',()=>assert.equal(validateSgpQuote(null,[offer('a'),offer('b','DraftKings')],now).ok,false));
test('requires sportsbook-issued combined quote',()=>assert.equal(validateSgpQuote(null,[offer('a'),offer('b')],now).ok,false));
test('accepts matching combined quote',()=>{const q={...offer('quote'),playerId:'SGP',market:'SGP',line:'combined',legIds:['a','b']};assert.equal(validateSgpQuote(q,[offer('a'),offer('b')],now).ok,true)});

test('rejects absent offer IDs in a combined quote',()=>{const legs=[{...offer('a'),offerId:undefined},{...offer('b'),offerId:undefined}];const q={...offer('quote'),legIds:[undefined,undefined]};assert.equal(validateSgpQuote(q,legs,now).ok,false)});
test('rejects duplicate offer IDs',()=>{const q={...offer('quote'),legIds:['a','a']};assert.equal(validateSgpQuote(q,[offer('a'),offer('a')],now).ok,false)});
