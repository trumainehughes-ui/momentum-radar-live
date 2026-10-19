import test from 'node:test';
import assert from 'node:assert/strict';
import {pregameAiEvidence} from '../lib/pregame-ai-review.js';
const game={gameId:'nba-example',home:{abbr:'BOS'},away:{abbr:'NYK'}};
test('NBA pregame AI receives evidence-only position matchup and no sportsbook verification',()=>{
 const data=pregameAiEvidence('nba',game,{sgps:[],nbaPositionMatchups:[{
  player:{id:'123',position:'PG',perGame:{assists:8}},
  opponent:{teamId:'BOS',allowedByPosition:{PG:{games:10,assists:7.2}}},
  asOf:'2026-10-19T18:00:00Z'}]});
 assert.equal(data.nbaPositionMatchups.length,1);
 assert.equal(data.nbaPositionMatchups[0].metrics.assists.status,'CONTEXT_ONLY');
 assert.equal(data.nbaPositionMatchups[0].sportsbookVerified,false);
 assert.equal(data.model.validation.sportsbookVerificationAvailable,false);
});
test('NFL AI evidence remains without NBA matchup payload',()=>{
 const data=pregameAiEvidence('nfl',game,{sgps:[],nbaPositionMatchups:[{player:{position:'PG'}}]});
 assert.deepEqual(data.nbaPositionMatchups,[]);
});
