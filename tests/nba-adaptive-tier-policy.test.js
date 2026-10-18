import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NBA_TIERS,validateNbaSgp} from '../lib/nba-data-model.js';
test('NBA tier counts are adaptive and retain market diversity',()=>{
 assert.deepEqual([NBA_TIERS.Small.min,NBA_TIERS.Small.max],[4,4]);
 assert.deepEqual([NBA_TIERS.Medium.min,NBA_TIERS.Medium.max],[5,5]);
 assert.deepEqual([NBA_TIERS.Nuke.min,NBA_TIERS.Nuke.max],[5,7]);
 for(const cfg of Object.values(NBA_TIERS))assert.equal(cfg.categories,3);
});
test('NBA pregame builder stops at shortest category-complete candidate',()=>{
 const source=readFileSync(new URL('../lib/nba-pregame-model.js',import.meta.url),'utf8');
 assert.match(source,/picks.length>=cfg.min&&categories.size>=cfg.categories/);
 assert.match(source,/selectionObjective:'SHORTEST_EVIDENCE_SUPPORTED_RESEARCH_CANDIDATE'/);
});

test('NBA Small/Medium/Nuke incomplete cards do not satisfy the tier rule',()=>{
 for(const [risk,count] of [['Small',2],['Medium',4],['Nuke',2]]){
  const result=validateNbaSgp(risk,Array.from({length:count},(_,i)=>({
   playerId:String(i+1),name:'Candidate '+i,team:'BOS',category:['points','rebounds','assists'][i%3],
   gameId:'401810002',projection:20,threshold:25,verifiedMarket:false
  })),{gameId:'401810002',home:'DET',away:'BOS'});
  assert.equal(result.publishable,false);
  assert.ok(result.reasons.includes('invalid_leg_count'));
 }
});
test('NBA same athlete may be analyzed across distinct stat markets, but never duplicate one market',()=>{
 const common={playerId:'19',team:'BOS',gameId:'401810002',projection:20,threshold:25,verifiedMarket:false};
 const good=validateNbaSgp('Small',[
 {...common,category:'points'},{...common,category:'rebounds'},
 {...common,category:'assists'}, {...common,playerId:'20',category:'points'}
 ],{gameId:'401810002',home:'DET',away:'BOS'});
 assert.ok(!good.reasons.includes('duplicated_player_market'));
 const bad=validateNbaSgp('Small',[
 {...common,category:'points'},{...common,category:'points'},
 {...common,category:'assists'}, {...common,playerId:'20',category:'rebounds'}
 ],{gameId:'401810002',home:'DET',away:'BOS'});
 assert.ok(bad.reasons.includes('duplicated_player_market'));
});
