import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflScheduledGameDvpIdentity} from '../lib/nfl-game-dvp-week-identity.js';

const gameId='401872994',date='2026-10-12';
const payload={ok:true,date,games:[
 {gameId:'401872993',date,week:6,season:2026,kickoff:'2026-10-12T17:00:00Z'},
 {gameId,week:5,season:2026,kickoff:'2026-10-13T00:15:00Z',
  status:'SCHEDULED'}
]};
test('week is sourced from exact scheduled ESPN game, not odds events, default week one, or unrelated game',()=>{
 const found=nflScheduledGameDvpIdentity(payload,{date,gameId});
 assert.deepEqual(found,{gameId,week:5,season:2026});
 assert.equal(nflScheduledGameDvpIdentity(payload,{date,gameId:'401872998'}),null);
 assert.equal(nflScheduledGameDvpIdentity(payload,{date:'2026-10-05',gameId}),null);
 assert.equal(nflScheduledGameDvpIdentity({ok:false,games:payload.games},{date,gameId}),null);
});
test('malformed/out of season week cannot create misleading defense-v-position statistics',()=>{
 for(const bad of [
  {week:null},{week:0},{week:19},{week:'N/A'},
  {season:2010,kickoff:'2034-11-01T00:00:00Z'},
  {gameId:'401872999'},
  {kickoff:'not a date'},
  {kickoff:'2026-11-03T00:15:00Z'}]){
  const list={...payload,games:[{...payload.games[1],...bad}]};
  assert.equal(nflScheduledGameDvpIdentity(list,{gameId,date}),null,JSON.stringify(bad));
 }
});
test('night games can cross midnight UTC while retaining local game calendar week',()=>{
 const r=nflScheduledGameDvpIdentity(payload,{gameId,date});
 assert.equal(r.week,5);
});
test('NFL game market fails closed when exact week or matched DVP is unavailable',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(api.includes('nflScheduledGameDvpIdentity(schedule,{gameId,date})'));
 assert.ok(api.includes("oddsDebug.dvpStage='CURRENT_GAME_WEEK_UNVERIFIED'"));
 assert.ok(api.includes("oddsDebug.dvpStage='WEEK_MATCHED_DVP_UNAVAILABLE'"));
 assert.ok(api.includes("oddsDebug.dvpStage='ESPN_SCHEDULE_WEEK_VERIFIED'"));
 assert.ok(api.includes('Number(dvpData.week)===gameWeek.week'));
 assert.ok(api.includes('Number(dvpData.season)===gameWeek.season'));
 assert.ok(!api.includes('week=Number(chosen?.[0]?.week)||1'));
 assert.ok(!api.includes("const season=Number(chosen?.[0]?.season)||new Date().getUTCFullYear(),week=Number(chosen?.[0]?.week)||1"));
});
