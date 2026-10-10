import test from 'node:test';
import assert from 'node:assert/strict';
import {nflGameInjuryEvidence,nflInjuryStatus,nflInjuryBlocks} from '../lib/nfl-injury-evidence.js';
const competitors=[{team:{id:'16',abbreviation:'MIN'}},{team:{id:'18',abbreviation:'NO'}}];
const mk=(team,status,name,id)=>({team:{id:team==='MIN'?'16':team==='NO'?'18':'30',abbreviation:team},injuries:[{athlete:{id,name,displayName:name,position:{abbreviation:'RB'}},status}]});
test('reserve/IR, inactive, out, doubtful are blockers; questionable is review, not official out',()=>{
 for(const s of ['IR','Reserve/Injured','PUP','Inactive','OUT','Doubtful'])
  assert.equal(nflInjuryBlocks(nflInjuryStatus(s)),true,s);
 for(const s of ['Questionable','Probable','Active','Full participation',''])
  assert.equal(nflInjuryBlocks(nflInjuryStatus(s)),false,s);
 assert.equal(nflInjuryStatus('not active'),'INACTIVE');
 assert.equal(nflInjuryStatus('did not participate'),'REPORTED_OTHER');
});
test('only exact current-game teams appear; game injury report overrides duplicate league record',()=>{
 const summary={header:{competitions:[{competitors}]},injuries:[mk('MIN','OUT','Player One','11')]};
 const league={injuries:[mk('MIN','Questionable','Player One','11'),mk('NO','IR','Player Two','22'),mk('JAX','OUT','Other','33')]};
 const r=nflGameInjuryEvidence({summary,league,checkedAt:'2026-10-10T20:00:00Z'});
 assert.deepEqual(r.injuries.map(x=>x.name),['Player One','Player Two']);
 assert.equal(r.blockers.length,2);
 assert.equal(r.injuries[0].status,'OUT');
 assert.equal(r.officialInactivesVerified,false);
 assert.equal(r.sourceUpdatedAt,null);
 assert.equal(r.reportAvailable,true);
});
test('unavailable feeds are NOT shown as all-clear, a valid empty report is distinct',()=>{
 const unavailable=nflGameInjuryEvidence({summary:{header:{competitions:[{competitors}]}},league:null});
 assert.equal(unavailable.reportAvailable,false);
 assert.equal(unavailable.status,'REPORT_UNAVAILABLE');
 assert.equal(unavailable.injuries.length,0);
 const summaryOnly=nflGameInjuryEvidence({summary:{header:{competitions:[{competitors}]},injuries:[]}});
 assert.equal(summaryOnly.reportAvailable,false,'an empty game summary is not an independent injury report');
 const empty=nflGameInjuryEvidence({summary:{header:{competitions:[{competitors}]},injuries:[]},league:{injuries:[]}});
 assert.equal(empty.status,'NO_ITEMS_REPORTED');
});
