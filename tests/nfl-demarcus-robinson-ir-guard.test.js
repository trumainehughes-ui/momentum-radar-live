import test from 'node:test';
import assert from 'node:assert/strict';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches}
 from '../lib/nfl-official-transaction-holds.js';
import {publicNflGameView} from '../lib/public-nfl-view.js';

const date='2026-10-19',gameId='401873011',
 now=Date.parse('2026-10-19T22:00:00Z');
const wr={name:'Demarcus Robinson',playerID:'3043116',team:'SF',
 eventID:gameId,category:'receiving',position:'WR',
 starterVerified:true,gamesPlayed:2,perGame:42,
 projection:45,range:{floor:34,ceiling:50}};
const sample={
 at:now-60000,
 body:{ok:true,date,gameId,home:'SF',away:'WAS',
  validation:{injuryEligibilityChecked:true,injuryEvidence:[]},
  categories:{td:[],passing:[],rushing:[],receiving:[wr],receptions:[]},
  sgps:{Analytics:[{risk:'Small',requiredLegs:4,
   tierAssessment:{compositionOk:true},
   legs:[{...wr,cat:'receiving',analyticsThreshold:45},
    {name:'Verified QB',team:'WAS',playerID:'9001',eventID:gameId,cat:'passing',analyticsThreshold:225},
    {name:'Verified RB',team:'SF',playerID:'9002',eventID:gameId,cat:'rushing',analyticsThreshold:70},
    {name:'Verified WR',team:'WAS',playerID:'9003',eventID:gameId,cat:'receiving',analyticsThreshold:60}]}],
   DraftKings:[],FanDuel:[]}}
};
test('September 26 San Francisco transaction holds Demarcus Robinson through October 19',()=>{
 const holds=nflOfficialTransactionHolds({gameId,date,home:'SF',away:'WAS'});
 const hold=holds.find(x=>x.name==='Demarcus Robinson');
 assert.ok(hold);
 assert.equal(hold.status,'IR');
 assert.equal(hold.playerId,'3043116');
 assert.match(hold.sourceUrl,/49ers\.com\/team\/transactions/);
 assert.equal(nflOfficialHoldMatches(wr,hold),true);
 assert.equal(nflOfficialHoldMatches({...wr,playerID:'other-id'},hold),true);
 for(const day of ['2026-09-26','2026-10-05','2026-10-19','2026-10-22'])
  assert.ok(nflOfficialTransactionHolds({gameId,date:day,home:'SF',away:'WAS'})
   .some(x=>x.name==='Demarcus Robinson'));
 assert.ok(!nflOfficialTransactionHolds({gameId,date:'2026-09-25',home:'SF',away:'WAS'})
  .some(x=>x.name==='Demarcus Robinson'));
 assert.ok(!nflOfficialTransactionHolds({gameId,date,home:'DEN',away:'WAS'})
  .some(x=>x.name==='Demarcus Robinson'));
});
test('IR wide receiver is removed from saved customer projections and invalidates full Small SGP',()=>{
 const output=publicNflGameView(sample,{date,gameId,now});
 assert.equal(output.status,'CURRENT');
 assert.equal(output.categories.receiving.some(x=>x.name==='Demarcus Robinson'),false);
 assert.ok(output.injuries.some(x=>x.name==='Demarcus Robinson'&&x.status==='IR'));
 assert.equal(output.parlays.some(x=>x.risk==='Small'),false);
 assert.ok(!JSON.stringify(output.modelResearchTiers).includes('Demarcus Robinson'));
 assert.ok(!JSON.stringify(output.verifiedBookParlays).includes('Demarcus Robinson'));
 const stale=publicNflGameView(sample,{date,gameId,now:now+20*60000,includeLastSaved:true});
 assert.equal(stale.status,'LAST_SAVED');
 assert.equal(stale.categories.receiving.some(x=>x.name==='Demarcus Robinson'),false);
});
