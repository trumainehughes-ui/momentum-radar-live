import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSgpHistory } from '../lib/sgp-history-audit.js';
const leg=(stat,actual,target=50)=>({playerId:'p1',stat,actual,target,direction:'over',finalVerified:true});
const ticket=(id,legs,tier='Nuke')=>({id,eventId:'game1',tier,lockedAt:100,kickoffAt:200,legs});
test('grades a win and a one-leg-away loss',()=>{
 const out=auditSgpHistory([ticket('a',[leg('yards',70),leg('td',0,1)]),ticket('b',[leg('yards',80)])]);
 assert.equal(out.tiers.Nuke.tickets,2);
 assert.equal(out.tiers.Nuke.wins,1);
 assert.equal(out.tiers.Nuke.losses,1);
 assert.equal(out.tiers.Nuke.oneLegAway,1);
 assert.equal(out.stats.td.losses,1);
});
test('excludes incomplete, postgame, duplicate tickets and duplicate legs',()=>{
 const a=ticket('a',[leg('yards',70)]);
 const bad=ticket('b',[{...leg('yards',70),finalVerified:false}]);
 const late={...ticket('c',[leg('yards',70)]),lockedAt:201};
 const duplicate=ticket('d',[leg('yards',70),leg('yards',80)]);
 const out=auditSgpHistory([a,a,bad,late,duplicate]);
 assert.equal(out.tiers.Nuke.tickets,1);
 assert.deepEqual(out.exclusions,{duplicate_ticket:1,incomplete_settlement:1,not_verified_pregame:1,duplicate_leg:1});
});
test('push and void do not become misses or settled ticket wins',()=>{
 const out=auditSgpHistory([
  ticket('a',[leg('yards',50)]),
  ticket('b',[{...leg('yards',0),settlement:'void'}])
 ]);
 assert.equal(out.tiers.Nuke.unresolved,2);
 assert.equal(out.tiers.Nuke.losses,0);
 assert.equal(out.tiers.Nuke.wins,0);
 assert.equal(out.stats.yards.pushes,1);
 assert.equal(out.stats.yards.voids,1);
 assert.equal(out.stats.yards.hitRate,null);
 assert.equal(out.tiers.Nuke.ticketHitRate,null);
});
test('under target and exact target are graded correctly',()=>{
 const out=auditSgpHistory([ticket('a',[
  {...leg('yards',30,40),direction:'under'},
  {...leg('td',1,1),playerId:'p2'}
 ])]);
 assert.equal(out.stats.yards.wins,1);
 assert.equal(out.stats.td.pushes,1);
});
test('invalid settlement status never becomes a loss',()=>{
 const out=auditSgpHistory([ticket('a',[{...leg('yards',30),settlement:'pending'}])]);
 assert.equal(out.exclusions.incomplete_settlement,1);
});

test('settlement-only losses do not distort measured miss distance',()=>{
 const out=auditSgpHistory([
  ticket('a',[{...leg('yards',null,50),settlement:'loss'}]),
  ticket('b',[{...leg('yards',40,50),settlement:'loss'}])
 ]);
 assert.equal(out.stats.yards.losses,2);
 assert.equal(out.stats.yards.measuredMisses,1);
 assert.equal(out.stats.yards.meanMissDistance,10);
});

test('unmeasured losses report null rather than zero miss distance',()=>{
 const out=auditSgpHistory([ticket('unmeasured',[
  {...leg('yards',null,50),settlement:'loss'}
 ])]);
 assert.equal(out.stats.yards.losses,1);
 assert.equal(out.stats.yards.measuredMisses,0);
 assert.equal(out.stats.yards.meanMissDistance,null);
});

test('verified sportsbook ticket settlement overrides push or void ambiguity',()=>{
 const out=auditSgpHistory([
  {...ticket('settled-win',[leg('yards',60),{...leg('td',0,1),settlement:'void'}]),settlement:'win'},
  {...ticket('settled-loss',[leg('yards',30),{...leg('td',0,1),settlement:'push'}]),settlement:'loss'},
  {...ticket('unsettled',[leg('yards',60),{...leg('td',0,1),settlement:'void'}]),settlement:'pending'}
 ]);
 assert.equal(out.tiers.Nuke.wins,1);
 assert.equal(out.tiers.Nuke.losses,1);
 assert.equal(out.tiers.Nuke.unresolved,1);
 assert.equal(out.tiers.Nuke.oneLegAway,0);
 assert.equal(out.tiers.Nuke.ticketHitRate,0.5);
});
