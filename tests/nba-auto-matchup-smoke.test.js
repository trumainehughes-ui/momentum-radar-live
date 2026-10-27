import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNbaGame} from '../lib/nba-data-model.js';

test('NBA summary parser exposes real athlete IDs and box score only for completed games',()=>{
 const summary={header:{id:'401809238',competitions:[{id:'401809238',status:{type:{state:'post'}},
  competitors:[{homeAway:'home',team:{abbreviation:'NY'}},{homeAway:'away',team:{abbreviation:'CLE'}}]}]},
  boxscore:{players:[{team:{abbreviation:'CLE'},statistics:[{names:['MIN','PTS','REB','AST','3PM'],athletes:[{
   athlete:{id:'3912848',displayName:'Dean Wade',position:{abbreviation:'F'}},
   stats:['29','6','4','2','1']
  }]}]}]}};
 const result=parseNbaGame(summary,'401809238');
 assert.equal(result.ok,true);
 assert.equal(result.matchup.away.abbr,'CLE');
 assert.ok(result.players.some(p=>p.playerId==='3912848'));
});

test('NBA auto-matchup research excludes selected game and requires an actual opponent ID',()=>{
 const source=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.match(source,/opponentId:String\(opponent\.id\)/);
 assert.match(source,/day\.setUTCDate\(day\.getUTCDate\(\)-\(i\+1\)\*7\)/);
 assert.match(source,/Promise\.allSettled\(candidatePlayers/);
 assert.match(source,/request!==token\|\|selected!==id/);
 const research=readFileSync(new URL('../api/matchup-research.js',import.meta.url),'utf8');
 assert.match(research,/playerGameIds\.has\(String\(g\.event\.id\)\)/);
});
