import test from 'node:test';
import assert from 'node:assert/strict';
import {nbaRosterChangeImpact} from '../lib/nba-roster-change-impact.js';
const asOf='2026-10-19T18:00:00Z';
test('verified injury marks affected teammates for review, not invented minutes or starters',()=>{
 const x=nbaRosterChangeImpact({asOf,events:[{playerId:'1',teamId:'BOS',status:'OUT',
  reportedAt:'2026-10-19T17:00:00Z',sourceUrl:'https://www.espn.com/nba/'}],
  players:[{id:'1',teamId:'BOS'},{id:'2',teamId:'BOS'},{id:'3',teamId:'NYK'}]});
 assert.equal(x.status,'REVIEW_REQUIRED');assert.equal(x.impacts[0].affected.length,2);
 assert.equal(x.impacts[0].minutesDelta,null);assert.equal(x.impacts[0].starterChangeVerified,false);
 assert.equal(x.canAutoPublish,false);
});
test('unverified and future-dated reports are not treated as confirmed changes',()=>{
 const x=nbaRosterChangeImpact({asOf,events:[
  {playerId:'1',teamId:'BOS',status:'OUT',reportedAt:'2026-10-19T17:00:00Z'},
  {playerId:'2',teamId:'BOS',status:'TRADED',reportedAt:'2026-10-20T17:00:00Z',sourceUrl:'https://www.nba.com/'}]});
 assert.equal(x.status,'NO_VERIFIED_EVENTS');assert.equal(x.verifiedEventCount,0);
});
test('missing evaluation time fails closed',()=>{
 assert.equal(nbaRosterChangeImpact({events:[]}).status,'NOT_READY');
});
