import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyEspnNflGameSummary} from '../lib/nfl-weather-espn-game.js';
import {fetchVerifiedEspnNflGame} from '../lib/nfl-weather-espn-fetch.js';
const id='401234567';
const summary={header:{id,competitions:[{id,date:'2026-10-18T20:00:00Z',competitors:[{team:{abbreviation:'DEN'}},{team:{abbreviation:'KC'}}]}]}};
test('ESPN NFL summary verifies game identity, teams and kickoff',()=>{
 const r=verifyEspnNflGameSummary({gameId:id,summary});
 assert.equal(r.gameId,id);assert.deepEqual(r.teams,['DEN','KC']);assert.equal(r.kickoffAt,'2026-10-18T20:00:00.000Z');
});
test('ESPN summary rejects mismatched games and invalid opponents',()=>{
 assert.throws(()=>verifyEspnNflGameSummary({gameId:'401234568',summary}),/schedule_game_id_mismatch/);
 const bad=structuredClone(summary);bad.header.competitions[0].competitors[1].team.abbreviation='DEN';
 assert.throws(()=>verifyEspnNflGameSummary({gameId:id,summary:bad}),/schedule_teams_invalid/);
});
test('server fetch targets ESPN summary for the exact game ID',async()=>{
 let requested='';
 const r=await fetchVerifiedEspnNflGame({gameId:id,fetcher:async url=>{requested=url;return {ok:true,json:async()=>summary}}});
 assert.match(requested,/site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/summary\?event=401234567$/);
 assert.equal(r.gameId,id);
});
test('server fetch fails closed when upstream game identity is wrong',async()=>{
 await assert.rejects(()=>fetchVerifiedEspnNflGame({gameId:'401234568',fetcher:async()=>({ok:true,json:async()=>summary})}),/schedule_game_id_mismatch/);
});

test('ESPN header and competition may not disagree even if one ID matches',()=>{
 const wrongCompetition=structuredClone(summary);wrongCompetition.header.competitions[0].id='401234568';
 assert.throws(()=>verifyEspnNflGameSummary({gameId:id,summary:wrongCompetition}),/schedule_game_id_mismatch/);
 const wrongHeader=structuredClone(summary);wrongHeader.header.id='401234568';
 assert.throws(()=>verifyEspnNflGameSummary({gameId:id,summary:wrongHeader}),/schedule_game_id_mismatch/);
});
