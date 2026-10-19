import test from 'node:test';
import assert from 'node:assert/strict';
import {pregameAiEvidence} from '../lib/pregame-ai-review.js';
test('NBA AI review carries verified roster-change impact without authorizing publish',()=>{
 const data=pregameAiEvidence('nba',{gameId:'401000001',home:{abbr:'BOS'},away:{abbr:'NYK'}},{
  sgps:[],checkedAt:'2026-10-19T18:00:00Z',
  nbaRosterEvents:[{playerId:'1',teamId:'BOS',status:'OUT',
   reportedAt:'2026-10-19T17:00:00Z',sourceUrl:'https://www.espn.com/nba/'}],
  nbaRosterPlayers:[{id:'2',teamId:'BOS'}]});
 assert.equal(data.nbaRosterChangeImpact.status,'REVIEW_REQUIRED');
 assert.equal(data.nbaRosterChangeImpact.canAutoPublish,false);
 assert.equal(data.nbaRosterChangeImpact.impacts[0].affected[0].playerId,'2');
});
test('NFL AI review is unchanged by NBA roster event fields',()=>{
 const data=pregameAiEvidence('nfl',{gameId:'401000001',home:{abbr:'BOS'},away:{abbr:'NYK'}},{
  sgps:[],nbaRosterEvents:[{status:'OUT'}]});
 assert.equal(data.nbaRosterChangeImpact,null);
});
