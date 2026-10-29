import test from 'node:test';
import assert from 'node:assert/strict';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches} from '../lib/nfl-official-transaction-holds.js';

test('Oct 29 Panthers-Packers excludes officially reserved skill players',()=>{
 const holds=nflOfficialTransactionHolds({date:'2026-10-29',gameId:'401873023',home:'GB',away:'CAR'});
 const reed=holds.find(x=>x.name==='Jayden Reed');
 const brooks=holds.find(x=>x.name==='Jonathon Brooks');
 assert.equal(reed?.status,'IR');
 assert.equal(brooks?.status,'IR');
 assert.equal(nflOfficialHoldMatches({team:'GB',name:'Jayden Reed'},reed),true);
 assert.equal(nflOfficialHoldMatches({team:'CAR',name:'Jonathon Brooks'},brooks),true);
 assert.equal(nflOfficialHoldMatches({team:'CAR',name:'Jayden Reed'},reed),false);
});
test('Week 8 Brooks hold does not silently assert an indefinite postgame injury',()=>{
 const holds=nflOfficialTransactionHolds({date:'2026-11-08',gameId:'401873023',home:'GB',away:'CAR'});
 assert.ok(!holds.some(x=>x.name==='Jonathon Brooks'));
 assert.ok(holds.some(x=>x.name==='Jayden Reed'));
});
