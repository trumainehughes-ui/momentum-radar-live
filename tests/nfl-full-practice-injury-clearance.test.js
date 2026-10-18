import test from 'node:test';
import assert from 'node:assert/strict';
import {nflInjuryRecommendationHold,nflGameInjuryEvidence}
 from '../lib/nfl-injury-evidence.js';

const healthy=(name,team)=>({team,name,status:'UNKNOWN',rawStatus:null,
 injury:null,practiceStatus:'Full Participation in Practice',
 source:'NFL.com weekly practice report',evidenceTier:'WEEKLY_PRACTICE',
 section:'PRACTICE',gameDesignationVerified:false});
const active=['Jonathan Taylor','Tony Pollard','Daniel Jones'];
test('healthy, full-practice-only NFL entries do not count as injury holds',()=>{
 for(const [i,name] of active.entries()){
  assert.equal(nflInjuryRecommendationHold(healthy(name,i===1?'TEN':'IND')),false,name);
 }
});
test('an official/questionable/doubtful/out designation overrides full practice',()=>{
 for(const status of ['OUT','IR','QUESTIONABLE','DOUBTFUL','INACTIVE']){
  const candidate={...healthy('Running Back','IND'),status,rawStatus:status,
   evidenceTier:'WEEKLY_OFFICIAL',section:'WEEKLY',gameDesignationVerified:true};
  assert.equal(nflInjuryRecommendationHold(candidate),true,status);
 }
 for(const record of [
  {...healthy('Unknown Injury','IND'),injury:'Knee'},
  {...healthy('Partial Practice','IND'),practiceStatus:'Limited Participation in Practice'},
  {...healthy('Did not practice','IND'),practiceStatus:'Did Not Participate'},
  {...healthy('Inactive Reserve','IND'),section:'RESERVE'},
  {...healthy('Tracker reported','IND'),evidenceTier:'ESPN_LEAGUE',section:'TRACKER'},
  {...healthy('Official not cleared','IND'),gameDesignationVerified:true}
 ])assert.equal(nflInjuryRecommendationHold(record),true,record.name);
});
test('weekly official injury status retains precedence over a later practice row',()=>{
 const summary={header:{competitions:[{competitors:[
  {team:{id:'11',abbreviation:'IND'}},
  {team:{id:'10',abbreviation:'TEN'}}
 ]}]}};
 const weekly={available:true,teamSectionsPresent:2,source:'NFL.com injury report',
  url:'https://www.nfl.com/injuries/league/2026/reg6',
  teams:['IND','TEN'],entries:[{name:'Taylor Example',team:'IND',status:'QUESTIONABLE'}],
  practiceEntries:[{name:'Taylor Example',team:'IND',practiceStatus:'Full Participation in Practice'},
    {name:'Jonathan Taylor',team:'IND',practiceStatus:'Full Participation in Practice'}]};
 const result=nflGameInjuryEvidence({summary,weekly,competitors:summary.header.competitions[0].competitors});
 const designated=result.injuries.find(x=>x.name==='Taylor Example');
 const healthy= result.injuries.find(x=>x.name==='Jonathan Taylor');
 assert.equal(designated.status,'QUESTIONABLE');
 assert.equal(nflInjuryRecommendationHold(designated),true);
 assert.equal(healthy.evidenceTier,'WEEKLY_PRACTICE');
 assert.equal(nflInjuryRecommendationHold(healthy),false);
});
