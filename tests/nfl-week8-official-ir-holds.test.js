import test from 'node:test';
import assert from 'node:assert/strict';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches} from '../lib/nfl-official-transaction-holds.js';

test('Oct 29 Panthers-Packers excludes officially reserved skill players',()=>{
 const holds=nflOfficialTransactionHolds({date:'2026-10-29',gameId:'401873023',home:'GB',away:'CAR'});
 const reed=holds.find(x=>x.name==='Jayden Reed');
 const brooks=holds.find(x=>x.name==='Jonathon Brooks');
 assert.equal(reed?.status,'IR');
 assert.equal(brooks?.status,'IR');
 assert.equal(nflOfficialHoldMatches({team:'GB',name:'Jayden Reed'},reed),true);
 assert.equal(nflOfficialHoldMatches({team:'CAR',name:'Jonathon Brooks'},brooks),true);
 assert.equal(nflOfficialHoldMatches({team:'CAR',name:'Jayden Reed'},reed),false);
});
test('Week 8 Brooks hold does not silently assert an indefinite postgame injury',()=>{
 const holds=nflOfficialTransactionHolds({date:'2026-11-08',gameId:'401873023',home:'GB',away:'CAR'});
 assert.ok(!holds.some(x=>x.name==='Jonathon Brooks'));
 assert.ok(holds.some(x=>x.name==='Jayden Reed'));
});

test('Washington Oct 19 and Oct 28 official IR transactions block Week 8 SGPs',()=>{
 const holds=nflOfficialTransactionHolds({date:'2026-11-01',
  gameId:'401873035',home:'WSH',away:'PHI'});
 const rb=holds.find(x=>x.name==='Jacory Croskey-Merritt');
 const wr=holds.find(x=>x.name==='Terry McLaurin');
 assert.equal(rb?.playerId,'4575131');
 assert.equal(wr?.playerId,'3121422');
 assert.equal(rb?.status,'IR');
 assert.equal(wr?.status,'IR');
 assert.equal(nflOfficialHoldMatches({team:'WSH',name:'Jacory Croskey-Merritt'},rb),true);
 assert.equal(nflOfficialHoldMatches({team:'WSH',name:'Terry McLaurin'},wr),true);
 assert.equal(nflOfficialHoldMatches({team:'PHI',name:'Terry McLaurin'},wr),false);
 const prior=nflOfficialTransactionHolds({date:'2026-10-18',
  gameId:'401873035',home:'WSH',away:'PHI'});
 assert.equal(prior.some(x=>x.name==='Jacory Croskey-Merritt'),false);
 assert.equal(prior.some(x=>x.name==='Terry McLaurin'),false);
});

// Regression: Saturday team downgrades must override stale Friday questionable
// entries, and IR receivers cannot leak back through historical production.
test('Nov 1 Patriots official IR and OUT holds block stale Miami game candidates',()=>{
 const holds=nflOfficialTransactionHolds({date:'2026-11-01',gameId:'401873034',home:'MIA',away:'NE'});
 for(const [name,status] of [['Mack Hollins','IR'],['Romeo Doubs','IR'],
   ['A.J. Brown','OUT'],['TreVeyon Henderson','OUT'],['Marcus Bryant','OUT']]){
  const hold=holds.find(x=>x.name===name);
  assert.equal(hold?.status,status,name+' must retain the official designation');
  assert.equal(nflOfficialHoldMatches({team:'NE',name},hold),true);
  assert.equal(nflOfficialHoldMatches({team:'MIA',name},hold),false);
 }
 const prior=nflOfficialTransactionHolds({date:'2026-10-30',gameId:'401873034',home:'MIA',away:'NE'});
 assert.equal(prior.some(x=>x.name==='A.J. Brown'),false);
 const later=nflOfficialTransactionHolds({date:'2026-11-08',gameId:'401873034',home:'MIA',away:'NE'});
 assert.equal(later.some(x=>x.name==='Mack Hollins'),false);
});
test('Nov 1 public snapshot suppresses stale Patriots IR receivers and keeps OUT not IR',async()=>{
 const {publicNflGameView}=await import('../lib/public-nfl-view.js');
 const date='2026-11-01',gameId='401873034',now=Date.parse('2026-11-01T16:15:00Z');
 const row=(name,id,category,projection)=>({name,playerID:id,team:'NE',eventID:gameId,
  position:category==='rushing'?'RB':'WR',gamesPlayed:6,perGame:projection,projection});
 const snap={at:now-60000,body:{ok:true,date,gameId,home:'MIA',away:'NE',
  categories:{td:[],passing:[],rushing:[row('TreVeyon Henderson','111','rushing',50),
   row('Rhamondre Stevenson','222','rushing',65)],
   receiving:[row('Mack Hollins','333','receiving',45),
    row('Romeo Doubs','444','receiving',55),row('A.J. Brown','555','receiving',80)],
   receptions:[]},sgps:{Analytics:[],DraftKings:[],FanDuel:[]},
  validation:{injuryEligibilityChecked:true,injuryEvidence:[
   {team:'NE',name:'Marcus Bryant',status:'IR'}]}}};
 const view=publicNflGameView(snap,{date,gameId,now});
 assert.deepEqual(view.categories.receiving,[]);
 assert.deepEqual(view.categories.rushing.map(x=>x.name),['Rhamondre Stevenson']);
 for(const [name,status] of [['Mack Hollins','IR'],['Romeo Doubs','IR'],
  ['A.J. Brown','OUT'],['TreVeyon Henderson','OUT']])
  assert.equal(view.injuries.find(x=>x.name===name)?.status,status);
 assert.equal(view.injuries.find(x=>x.name==='Marcus Bryant')?.status,'OUT');
});
