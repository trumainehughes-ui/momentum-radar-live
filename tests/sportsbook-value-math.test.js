import test from 'node:test';
import assert from 'node:assert/strict';
import {impliedProbability,decimalOdds,expectedValue,conservativeKelly,noVigTwoWay,assessSinglePropValue} from '../lib/sportsbook-value-math.js';
test('American odds math matches break-even and payout conventions',()=>{
 assert.equal(impliedProbability(100),0.5);
 assert.equal(impliedProbability(-100),0.5);
 assert.equal(decimalOdds(150),2.5);
 assert.equal(decimalOdds(-200),1.5);
 assert.equal(impliedProbability(0),null);
 assert.equal(impliedProbability(-99),null);
 assert.equal(impliedProbability(125.5),null);
});
test('EV and Kelly use model probability rather than implied probability as forecast',()=>{
 assert.ok(Math.abs(expectedValue({modelProbability:0.6,americanOdds:100})-0.2)<1e-12);
 assert.ok(Math.abs(conservativeKelly({modelProbability:0.6,americanOdds:100})-0.05)<1e-12);
 assert.equal(conservativeKelly({modelProbability:0.3,americanOdds:100}),0);
 assert.equal(expectedValue({modelProbability:1.2,americanOdds:100}),null);
});
test('two-way no-vig math removes overround',()=>{
 const r=noVigTwoWay(-110,-110);
 assert.ok(Math.abs(r.a-0.5)<1e-12);
 assert.ok(r.overround>0);
});
test('value assessment rejects stale or unidentified sportsbook selections',()=>{
 const now=Date.parse('2026-10-26T20:00:00Z');
 const p={modelProbability:0.6,americanOdds:100,book:'DraftKings',selectionId:'s',marketId:'m',eventId:'e',fetchedAt:new Date(now).toISOString(),now};
 assert.equal(assessSinglePropValue(p).isSGPQuote,false);
 assert.equal(assessSinglePropValue({...p,selectionId:''}),null);
 assert.equal(assessSinglePropValue({...p,now:now+20*60_000}),null);
 assert.equal(assessSinglePropValue({...p,book:'Unknown'}),null);
});
