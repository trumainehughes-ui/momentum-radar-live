import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSgpHistory } from '../lib/sgp-history-audit.js';
const leg=(stat,actual,target=50)=>({playerId:'p1',stat,actual,target,direction:'over',finalVerified:true});
const ticket=(id,legs,tier='Nuke')=>({id,eventId:'game1',tier,lockedAt:100,kickoffAt:200,legs});
test('grades full ticket and one-leg-away correctly',()=>{
 const out=auditSgpHistory([ticket('a',[leg('yards',70),leg('td',0,0)]),ticket('b',[leg('yards',80)])]);
 assert.equal(out.tiers.Nuke.tickets,2);
 assert.equal(out.tiers.Nuke.wins,1);
 assert.equal(out.tiers.Nuke.oneLegAway,1);
 assert.equal(out.stats.td.misses,1);
});
test('excludes missing final verification, postgame and duplicates',()=>{
 const a=ticket('a',[leg('yards',70)]);
 const bad=ticket('b',[{...leg('yards',70),finalVerified:false}]);
 const late={...ticket('c',[leg('yards',70)]),lockedAt:201};
 const out=auditSgpHistory([a,a,bad,late]);
 assert.equal(out.tiers.Nuke.tickets,1);
 assert.deepEqual(out.exclusions,{duplicate_ticket:1,incomplete_settlement:1,not_verified_pregame:1});
});
test('pushes do not grade, exact target is not an over or under hit',()=>{
 const out=auditSgpHistory([ticket('a',[leg('yards',50)])]);
 assert.equal(out.stats.yards.hits,0);
});
