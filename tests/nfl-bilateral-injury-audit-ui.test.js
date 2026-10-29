import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflSgpSnapshotReadiness} from '../lib/nfl-sgp-snapshot-status.js';
import {pregameAiEvidence} from '../lib/pregame-ai-review.js';
import {pregameEvidenceAudit} from '../lib/pregame-revalidation.js';
import {historySnap} from '../api/nfl-health.js';

const now=Date.parse('2026-10-12T15:00:00Z'),gameId='401872994';
const risk=(name,length)=>({risk:name,candidateComplete:true,requiredLegs:length,
 tierAssessment:{compositionOk:true},legs:Array.from({length},(_,i)=>({
  playerID:String(500+i),name:'Player '+i,team:i%2?'BUF':'LAR',
  eventID:gameId,cat:i%2?'rushing':'receiving',analyticsThreshold:50,projection:70}))});
const matchup={status:'BILATERAL_EVIDENCE',
 source:'ESPN_COMPLETED_NFL_BOX_SCORES',
 sides:[
  {offenseTeam:'LAR',defenseTeam:'BUF',offenseSampleGames:4,defenseSampleGames:4,evidenceQuality:'LIMITED'},
  {offenseTeam:'BUF',defenseTeam:'LAR',offenseSampleGames:4,defenseSampleGames:4,evidenceQuality:'LIMITED'}],
 risks:['Small','Medium','Nuke'].map(r=>({
  risk:r,status:'REVIEW_OR_PASS',holdReasons:['LIMITED_COMPLETED_GAME_SAMPLE'],
  bookmakerPriceVerified:false}))};
const injuries=[
 {playerId:'abc',name:'Player Listed Out',team:'BUF',status:'OUT',
  source:'NFL.com league injury report',evidenceTier:'WEEKLY_OFFICIAL',
  section:'WEEKLY',gameDesignationVerified:true},
 {playerId:'def',name:'Player Questionable',team:'LAR',status:'QUESTIONABLE',
  source:'ESPN injury report',evidenceTier:'ESPN_REPORTED',
  section:'WEEKLY',gameDesignationVerified:false},
 {playerId:'ghi',name:'Healthy Player',team:'BUF',status:'ACTIVE',
  source:'ESPN roster',evidenceTier:'ROSTER',section:'UNKNOWN',
  gameDesignationVerified:false}
];
const market={
 ok:true,date:'2026-10-12',gameId,home:'LAR',away:'BUF',
 categories:{passing:[],rushing:[],receiving:[],receptions:[],td:[]},
 sgps:{Analytics:[risk('Small',4),risk('Medium',5),risk('Nuke',7)],
  DraftKings:[],FanDuel:[],combinedBookQuoteVerified:false},
 matchupEvidence:matchup,analyticsAvailable:true,
 validation:{injuryEligibilityChecked:true,blockedPlayerCount:2,
  injuryEvidence:injuries,injuryEvidenceSource:'ESPN AND NFL.com',
  officialInactivesVerified:false}
};
const game={gameId,kickoff:new Date(now+3*3600000).toISOString(),
 home:{abbr:'LAR'},away:{abbr:'BUF'}};
test('active market response wiring includes source-labeled injury rows, not just a count',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const cut=src.slice(src.indexOf('const response={ok:true,gameId,date,scope:'));
 assert.ok(cut.includes('injuryEvidence:eligibility.checked===true?'));
 assert.ok(cut.includes('injuryReportCheckedAt:eligibility.checked===true?'));
 assert.ok(cut.includes('officialInactivesVerified:eligibility.officialInactivesVerified===true'));
 assert.ok(src.includes('gameDesignationVerified:x.gameDesignationVerified===true'));
 assert.ok(src.includes("source:String(x.source||injury.source||"));
});
test('signed market snapshot history retains specific injury source and both matchup directions',()=>{
 const old=historySnap(game,market);
 assert.equal(old.injuryEvidence.length,3);
 assert.equal(old.injuryEvidence[0].source,'NFL.com league injury report');
 assert.equal(old.injuryEvidence[1].status,'QUESTIONABLE');
 assert.equal(old.injuryChecks.officialInactivesVerified,false);
 const evidence=pregameAiEvidence('nfl',game,old);
 assert.deepEqual(evidence.matchup.sides.map(x=>[x.offenseTeam,x.defenseTeam]),
  [['LAR','BUF'],['BUF','LAR']]);
 assert.equal(evidence.playerAvailability.skillPositionAlerts[0].status,'OUT');
 assert.equal(evidence.playerAvailability.skillPositionAlerts[0].source,
  'NFL.com league injury report');
 assert.equal(evidence.playerAvailability.skillPositionAlerts[1].status,'QUESTIONABLE');
 assert.equal(evidence.model.validation.injuryEligibilityChecked,true);
 assert.equal(evidence.model.validation.sportsbookVerificationAvailable,false);
});
test('real injury change invalidates the stored AI reviewer and SGP revisions',()=>{
 const old=historySnap(game,market);
 const dig=pregameEvidenceAudit(null,old,{league:'nfl'}).evidenceDigests;
 const previous={...old,evidenceDigests:dig};
 const same=pregameEvidenceAudit(previous,old,{league:'nfl'});
 assert.deepEqual(same.changedFields,[]);
 const revisedMarket={...market,validation:{
  ...market.validation,injuryEvidence:injuries.map((x,i)=>i===1?
   {...x,status:'OUT'}:x)}};
 const revised=historySnap(game,revisedMarket);
 const diff=pregameEvidenceAudit(previous,revised,{league:'nfl'});
 assert.ok(diff.changedFields.includes('INJURIES'));
 assert.equal(diff.changedFromPrior,true);
});
test('read-only public SGP status shows two-direction risk and injury counts, no invented market prices',()=>{
 const actual=nflSgpSnapshotReadiness({at:now-60000,body:market},{now,gameId});
 assert.equal(actual.status,'MODEL_ONLY');
 assert.equal(actual.matchupAudit.status,'BILATERAL_EVIDENCE');
 assert.deepEqual(actual.matchupAudit.sides.map(x=>[x.offense,x.opponentDefense]),
  [['LAR','BUF'],['BUF','LAR']]);
 assert.equal(actual.matchupAudit.tiers[0].status,'REVIEW_OR_PASS');
 assert.deepEqual(actual.matchupAudit.tiers.find(x=>x.risk==='Nuke').holdReasons,['LIMITED_COMPLETED_GAME_SAMPLE']);
 assert.equal(actual.matchupAudit.tiers[1].bookmakerPriceVerified,false);
 assert.deepEqual(actual.injuryReportObservations,{OUT:1,QUESTIONABLE:1});
 assert.equal(actual.sportsbookCombinedOddsVerified,false);
 assert.ok(!JSON.stringify(actual).includes('Player Listed Out'));
 assert.ok(!JSON.stringify(actual).includes('abc'));
 const expired=nflSgpSnapshotReadiness({at:now-16*60000,body:market},{now,gameId});
 assert.equal(expired.matchupAudit.status,'STALE');
 assert.deepEqual(expired.injuryReportObservations,{});
});
test('matchup game page visibly displays two-way source, model hold status and separately labeled injury report',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(html.includes('Matchup &amp; SGP Risk Audit'));
 assert.ok(html.includes('vs '+ "'+nflEscape(x.defenseTeam)+'"+ ' defense'));
 assert.ok(html.includes('reviewTiers.map(x=>'));
 assert.ok(html.includes("nflEscape(x.status||'PENDING')"));
 assert.ok(html.includes('ESPN/official report status is not proof of confirmed inactive'));
 assert.ok(html.includes('Momentum scores do not guarantee positive expected value'));
 assert.ok(html.includes('sourceChecks+sourceHelp+sportsbookFeedNote+'));
 assert.ok(html.includes("'<details class=\"card\" style=\"grid-column:1/-1\"><summary"));
 assert.ok(html.includes('nflRefreshInjuryPanel(g.gameId)'));
 assert.ok(html.includes("['DraftKings','FanDuel'].map(book=>"));
 assert.ok(html.includes('modelChoiceHtml+sgpYardageHtml+autoDkHtml+bookCaptureHtml+capturedDraftHtml+reviewHtml+'));
});
