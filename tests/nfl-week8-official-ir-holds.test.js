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

test('Washington Oct 19 and Oct 28 official IR transactions block Week 8 SGPs',()=>{
 const holds=nflOfficialTransactionHolds({date:'2026-11-01',
  gameId:'401873035',home:'WSH',away:'PHI'});
 const rb=holds.find(x=>x.name==='Jacory Croskey-Merritt');
 const wr=holds.find(x=>x.name==='Terry McLaurin');
 assert.equal(rb?.playerId,'4575131');
 assert.equal(wr?.playerId,'3121422');
 assert.equal(rb?.status,'IR');
 assert.equal(wr?.status,'IR');
 assert.equal(nflOfficialHoldMatches({team:'WSH',name:'Jacory Croskey-Merritt'},rb),true);
 assert.equal(nflOfficialHoldMatches({team:'WSH',name:'Terry McLaurin'},wr),true);
 assert.equal(nflOfficialHoldMatches({team:'PHI',name:'Terry McLaurin'},wr),false);
 const prior=nflOfficialTransactionHolds({date:'2026-10-18',
  gameId:'401873035',home:'WSH',away:'PHI'});
 assert.equal(prior.some(x=>x.name==='Jacory Croskey-Merritt'),false);
 assert.equal(prior.some(x=>x.name==='Terry McLaurin'),false);
});
