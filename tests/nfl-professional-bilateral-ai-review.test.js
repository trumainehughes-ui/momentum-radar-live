import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflProfessionalBilateralReview}
 from '../lib/nfl-professional-bilateral-review.js';
import {pregameAiEvidence,pregameAiAudit}
 from '../lib/pregame-ai-review.js';
import {pregameEvidenceAudit} from '../lib/pregame-revalidation.js';
import {historySnap} from '../api/nfl-health.js';
const gameId='401872994';
const data={
 ok:true,completedGames:63,season:2026,week:6,
 offense:{BUF:{games:5},LAR:{games:5}},
 defense:{BUF:{games:5},LAR:{games:5}},
 offenseRanks:{QB:{BUF:{passYards:{rankMost:8,value:232},
  rushYards:{rankMost:12,value:25}},LAR:{passYards:{rankMost:6,value:247}}},
 RB:{BUF:{rushYards:{rankMost:7,value:122}},
     LAR:{rushYards:{rankMost:29,value:69}}},
 WR:{BUF:{recYards:{rankMost:11,value:155}},LAR:{recYards:{rankMost:15,value:140}}},
 TE:{}},
 defenseRanks:{QB:{BUF:{passYards:{rankMost:27,value:167}},
   LAR:{passYards:{rankMost:10,value:239}}},
 RB:{BUF:{rushYards:{rankMost:8,value:121}},
  LAR:{rushYards:{rankMost:5,value:136}}},
 WR:{BUF:{recYards:{rankMost:26,value:99}},
   LAR:{recYards:{rankMost:6,value:172}}},TE:{}}
};
const cards=[
 {risk:'Small',requiredLegs:4,candidateComplete:true,
  tierAssessment:{compositionOk:true},
  legs:[{eventID:gameId,team:'BUF'},{eventID:gameId,team:'LAR'},
        {eventID:gameId,team:'BUF'},{eventID:gameId,team:'LAR'}]},
 {risk:'Medium',requiredLegs:5,candidateComplete:true,
  tierAssessment:{compositionOk:true},
  legs:Array.from({length:5},(_,i)=>({eventID:gameId,team:i%2?'LAR':'BUF'}))}
];
const run=(opts={})=>nflProfessionalBilateralReview({
 gameId,home:'LA',away:'BUF',dvp:data,modelCards:cards,
 injuryChecked:true,blockedPlayerCount:2,...opts
});
test('audit both directional offenses vs the exact opposing defense and actual metric',()=>{
 const a=run();
 assert.equal(a.status,'BILATERAL_EVIDENCE');
 assert.deepEqual(a.sides.map(x=>[x.offenseTeam,x.defenseTeam]),[
  ['LAR','BUF'],['BUF','LAR']]);
 const lPassing=a.sides[0].positions.find(x=>x.position==='QB').metrics
  .find(x=>x.metric==='passYards');
 assert.deepEqual({
  offenseRank:lPassing.offenseRankMost,
  offenseValue:lPassing.offenseProducedPerGame,
  defenseRank:lPassing.defenseRankMost,
  defenseValue:lPassing.defenseAllowedPerGame},
  {offenseRank:6,offenseValue:247,defenseRank:27,defenseValue:167});
 assert.equal(lPassing.signal,'MIXED_MATCHUP');
 const bRushing=a.sides[1].positions.find(x=>x.position==='RB').metrics
  .find(x=>x.metric==='rushYards');
 assert.deepEqual([bRushing.offenseRankMost,bRushing.defenseRankMost],
  [7,5]);
 assert.equal(bRushing.signal,'FAVORABLE_MATCHUP');
 assert.equal(a.risks[0].status,'MODEL_REVIEW_READY');
 assert.equal(a.risks[1].status,'MODEL_REVIEW_READY');
 assert.equal(a.risks[0].bookmakerPriceVerified,false);
 assert.match(a.rankMeaning,/most/);
 assert.equal(a.injuryEligibilityChecked,true);
 assert.equal(a.blockedPlayerCount,2);
});
test('few completed-game samples never become confident matchup or win probabilities',()=>{
 const weak=structuredClone(data);
 weak.defense.LAR.games=3;
 const a=run({dvp:weak});
 assert.equal(a.sides[1].evidenceQuality,'LIMITED');
 assert.equal(a.risks[0].status,'REVIEW_OR_PASS');
 assert.ok(a.risks[0].holdReasons.includes('LIMITED_COMPLETED_GAME_SAMPLE'));
 const bRushing=a.sides[1].positions.find(x=>x.position==='RB').metrics
  .find(x=>x.metric==='rushYards');
 assert.equal(bRushing.signal,'LIMITED_SAMPLE');
 assert.equal(bRushing.sampleReliable,false);
 assert.equal(a.sides[0].evidenceQuality,'COMPLETED_GAME_SAMPLE');
});
test('an unavailable DVP source, injuries, bad game roster or incomplete Nuke cause HOLD',()=>{
 const badCards=[{risk:'Nuke',requiredLegs:7,candidateComplete:false,
  tierAssessment:{compositionOk:false},legs:cards[0].legs.map(x=>({...x}))}];
 const x=run({dvp:null,injuryChecked:false,modelCards:badCards});
 assert.equal(x.status,'MATCHUP_EVIDENCE_MISSING');
 assert.equal(x.sides.length,0);
 assert.deepEqual(x.risks[0].holdReasons,[
  'INCOMPLETE_MODEL_COMPOSITION',
  'INJURY_ELIGIBILITY_UNVERIFIED',
  'OFFENSE_DEFENSE_EVIDENCE_MISSING'
 ]);
 const cross=run({modelCards:[{...cards[0],legs:[
  ...cards[0].legs.slice(0,3),{eventID:'401872999',team:'NYG'}]}]});
 assert.equal(cross.risks[0].status,'REVIEW_OR_PASS');
 assert.ok(cross.risks[0].holdReasons.includes('GAME_IDENTITY_UNVERIFIED'));
});
test('team names are source-normalized before DVP lookup',()=>{
 const x=nflProfessionalBilateralReview({gameId,home:'WAS',away:'JAC',
  dvp:{ok:true,completedGames:20},modelCards:[]});
 assert.deepEqual(x.sides.map(s=>s.offenseTeam),['WSH','JAX']);
 assert.equal(x.sides[0].evidenceQuality,'MISSING');
 assert.equal(x.risks.length,0);
});
test('history snapshot retains evidence for model revalidation and the AI review',()=>{
 const g={gameId,kickoff:new Date(Date.now()+3600000).toISOString(),
  home:{abbr:'LA'},away:{abbr:'BUF'}};
 const evidence=run();
 const market={gameId,date:'2026-10-12',categories:{
  td:[],passing:[],rushing:[],receiving:[],receptions:[]},
  matchupEvidence:evidence,sgps:{Analytics:[]},
  validation:{injuryEligibilityChecked:true,blockedPlayerCount:2}};
 const history=historySnap(g,market);
 assert.equal(history.matchupEvidence.status,'BILATERAL_EVIDENCE');
 assert.equal(history.offenseDefense.sides[1].defenseTeam,'LAR');
 const input=pregameAiEvidence('nfl',g,{...history,sgps:[{
  source:'DATA_MODEL',risk:'Small',legs:cards[0].legs.map((l,i)=>({
   ...l,name:'Athlete '+i,cat:i===0?'passing':'rushing',position:i===0?'QB':'RB',
   projection:100,analyticsThreshold:95
  }))}]});
 assert.equal(input.matchup.sides.length,2);
 assert.equal(input.model.validation.injuryEligibilityChecked,true);
 assert.equal(input.playerAvailability.officialInactivesVerified,false);
 assert.equal(input.model.validation.sportsbookVerificationAvailable,false);
 assert.equal(input.sgps.length,1);
 const a=pregameEvidenceAudit(null,history,{league:'nfl'});
 const old={...history,evidenceDigests:a.evidenceDigests};
 assert.deepEqual(pregameEvidenceAudit(old,history,{league:'nfl'}).changedFields,[]);
 const update={...history,matchupEvidence:{
  ...evidence,sides:evidence.sides.map((x,i)=>i===0?{
   ...x,offenseSampleGames:6
  }:x)}};
 assert.ok(pregameEvidenceAudit(old,update,{league:'nfl'}).changedFields.includes('MATCHUP'));
});
test('final NFL AI reviewer gets bookmaker-safe matchup and risk evidence, never makes changes',async()=>{
 const g={gameId,home:{abbr:'LA'},away:{abbr:'BUF'}};
 const snapshot={checkedAt:'2026-10-12T14:00:00Z',
  matchupEvidence:run(),injuryChecks:{rosterAndInjuryEligibilityChecked:true},
  sgps:[{risk:'Small',source:'DATA_MODEL',legs:[{
   name:'Bills Quarterback',team:'BUF',eventID:gameId,cat:'passing',
   analyticsThreshold:240,projection:260}]}]};
 let received;
 const reviewed=await pregameAiAudit('nfl',g,snapshot,{
  base:'https://momentum-radar-live.vercel.app',
  fetcher:async(url,opts)=>{
   received=JSON.parse(opts.body);
   assert.equal(url,'https://momentum-radar-live.vercel.app/api/ai-analysis');
   return{ok:true,json:async()=>({ok:true,provider:'test',
     analysis:'Both directional DVP samples checked. Wait for book quote.'})};
  }});
 assert.equal(received.mode,'parlay');
 assert.equal(received.data.matchup.sides.length,2);
 assert.equal(received.data.model.validation.injuryEligibilityChecked,true);
 assert.equal(reviewed.status,'REVIEWED');
 assert.equal(reviewed.canAlterPicks,false);
 assert.equal(reviewed.advisoryOnly,true);
});
test('source wiring has no new sportsbook calls, invented prices or uncapped AI decisions',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const health=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 const ai=readFileSync(new URL('../api/ai-analysis.js',import.meta.url),'utf8');
 assert.ok(api.includes('nflProfessionalBilateralReview({'));
 assert.ok(api.includes('matchupEvidence:professionalReview'));
 assert.ok(health.includes('matchupEvidence:m.matchupEvidence||m.outcomePrediction||null'));
 assert.ok(ai.includes('Act as a disciplined, evidence-bound professional sports betting analyst'));
 assert.ok(ai.includes('recommend PASS or WAIT'));
 assert.ok(ai.includes('Do not invent numerical odds'));
 assert.ok(health.includes('pregameNeedsAiReview({stage:snap.lockStage'));
});
