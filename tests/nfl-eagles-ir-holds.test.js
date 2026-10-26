import test from 'node:test';
import assert from 'node:assert/strict';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches}
 from '../lib/nfl-official-transaction-holds.js';

test('Eagles IR players are held out of Oct 26 Cowboys matchup',()=>{
 const holds=nflOfficialTransactionHolds({
  gameId:'401873009',date:'2026-10-26',home:'PHI',away:'DAL'});
 for(const [name,id] of [
  ['Jalen Hurts','4040715'],['Tank Bigsby',''],['Will Shipley','']]){
  const hold=holds.find(h=>h.name===name);
  assert.ok(hold,name+' must have an official IR hold');
  assert.equal(hold.status,'IR');
  assert.equal(nflOfficialHoldMatches({
   playerID:id,name,team:'PHI'},hold),true);
  assert.equal(nflOfficialHoldMatches({
   playerID:id,name,team:'DAL'},hold),false);
 }
});

test('Eagles holds do not leak to unrelated matchups',()=>{
 const holds=nflOfficialTransactionHolds({
  gameId:'401873009',date:'2026-10-26',home:'NYG',away:'DAL'});
 assert.equal(holds.some(h=>h.name==='Jalen Hurts'),false);
});
