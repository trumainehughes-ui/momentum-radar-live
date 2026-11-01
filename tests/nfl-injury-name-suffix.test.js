import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflInjuryNameKey,nflGameInjuryEvidence,nflInjuryRecommendationHold} from '../lib/nfl-injury-evidence.js';
import {nflOfficialHoldMatches} from '../lib/nfl-official-transaction-holds.js';
import {guardFinalNflSgpCards} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
import {nflPublicInjuryReadiness} from '../lib/nfl-public-injury-release-guard.js';

test('weekly injury identity merges roster Jr suffix and official name without suffix',()=>{
 assert.equal(nflInjuryNameKey('Brian Robinson Jr.'),nflInjuryNameKey('Brian Robinson'));
 assert.equal(nflInjuryNameKey('John Smith III'),nflInjuryNameKey('John Smith'));
 assert.notEqual(nflInjuryNameKey('Brian Robinson'),nflInjuryNameKey('Bijan Robinson'));
 const competitors=[{team:{id:'1',abbreviation:'ATL'}},{team:{id:'2',abbreviation:'TB'}}];
 const summary={header:{competitions:[{competitors}]},injuries:[{
  team:{id:'1',abbreviation:'ATL'},injuries:[{
   athlete:{id:'123',displayName:'Brian Robinson Jr.',position:{abbreviation:'RB'}},
   status:'Questionable'}]}]};
 const weekly={teams:['ATL','TB'],source:'NFL.com Week 8 official',entries:[
  {team:'ATL',name:'Brian Robinson',status:'OUT',position:'RB'}]};
 const report=nflGameInjuryEvidence({summary,weekly,competitors});
 const names=report.injuries.filter(x=>nflInjuryNameKey(x.name)==='BRIANROBINSON');
 assert.equal(names.length,1,'official and ESPN rows must not diverge by suffix');
 assert.equal(names[0].status,'OUT');
 assert.equal(names[0].evidenceTier,'WEEKLY_OFFICIAL');
});
test('public and final SGP injury guards reject suffix-variant out players',()=>{
 assert.equal(nflOfficialHoldMatches({team:'ATL',name:'Brian Robinson Jr.'},
  {team:'ATL',name:'Brian Robinson',status:'OUT'}),true);
 const sgps=guardFinalNflSgpCards({Analytics:[{
  risk:'Small',requiredLegs:1,legs:[{name:'Brian Robinson Jr.',
   playerID:'123',team:'ATL',cat:'rushing',eventID:'401873025'}]
 }]},{blockedNames:new Set(['BRIANROBINSON']),blockedIds:new Set(),
 gameId:'401873025',home:'TB',away:'ATL',rosterChecked:false});
 assert.equal(sgps.Analytics[0].eligibilityPruned,true);
 assert.deepEqual(sgps.Analytics[0].legs,[]);
 const now=Date.parse('2026-11-01T15:30:00Z');
 const report={ok:true,gameId:'401873025',reportAvailable:true,weeklyCoverage:true,
  reportCompleteness:'NFL_PUBLISHED_WEEKLY_CROSS_CHECK',teams:[{abbr:'ATL'},{abbr:'TB'}],
  checkedAt:new Date(now).toISOString(),officialSourceCheckedAt:new Date(now).toISOString(),
  officialSourceWeek:8,officialSourceYear:2026,
  weeklySourceUrl:'https://www.nfl.com/injuries/league/2026/reg8',
  injuries:[{team:'ATL',name:'Brian Robinson',status:'OUT',
   evidenceTier:'WEEKLY_OFFICIAL',section:'WEEKLY',gameDesignationVerified:true}]};
 const published={status:'CURRENT',injuryCheckedAt:new Date(now).toISOString(),
  categories:{rushing:[{team:'ATL',name:'Brian Robinson Jr.',starterVerified:false}]}};
 const audit=nflPublicInjuryReadiness({date:'2026-11-01',week:8,
  gameId:'401873025',teams:['ATL','TB'],kickoff:'2026-11-01T18:00:00Z'},
  published,report,{now});
 assert.ok(audit.blockers.includes('INJURED_PLAYER_PRESENT_IN_PUBLIC_PROJECTIONS'));
 assert.equal(audit.publishedHeldPlayers[0].name,'Brian Robinson');
});

test('NFL publication rejects imported legs missing from the injury-screened category pool',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(src,/categories\[String\(l\.cat\|\|l\.category\|\|''\)\.toLowerCase\(\)\]/);
 assert.match(src,/nflInjuryNameKey\(l\.name\)/);
 assert.match(src,/row\.cat==='td'.*tdModelStatus==='ESPN_MATCHUP_MODEL'/);
 assert.match(src,/const target=cat==='td'\?'Anytime TD'/);
});

test('public injury snapshot retains full-practice clearance rather than hiding a healthy model leg',()=>{
 const practice={team:'MIN',name:'Aaron Jones',status:'UNKNOWN',
  evidenceTier:'WEEKLY_PRACTICE',section:'PRACTICE',
  practiceStatus:'Full Participation in Practice',injury:null,rawStatus:null,
  gameDesignationVerified:false};
 assert.equal(nflInjuryRecommendationHold(practice),false);
 assert.equal(nflInjuryRecommendationHold({...practice,practiceStatus:'Did Not Participate in Practice'}),true);
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(src,/practiceStatus:String\(x\.practiceStatus\|\|''\)\.slice\(0,90\)/);
 assert.match(src,/injury:x\.injury==null\?null:String\(x\.injury\)/);
 assert.match(src,/rawStatus:x\.rawStatus==null\?null:String\(x\.rawStatus\)/);
});
