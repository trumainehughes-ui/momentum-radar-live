import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflModelSgpRevisionAudit,nflSafeSgpRevisionAudit}
 from '../lib/nfl-model-sgp-revision-audit.js';
import {collectorAuditReport} from '../lib/pregame-collector-shards.js';
import {pregameAiEvidence} from '../lib/pregame-ai-review.js';
const gameId='401872994';
const leg=(id,cat,threshold,team='BUF')=>({
 playerID:String(id),name:'Player '+id,team,eventID:gameId,
 category:cat,threshold,projectionAtLock:threshold+10
});
const make=(tier,legs)=>({source:'DATA_MODEL',risk:tier,legs});
const snapshot=(small,medium,nuke,extra={})=>({
 sgps:[make('Small',small),make('Medium',medium),make('Nuke',nuke)],
 ...extra
});
const first=snapshot(
 [leg('1','passing',220),leg('2','rushing',65),leg('3','receiving',60),leg('4','receptions',4)],
 [leg('1','passing',250),leg('2','rushing',75),leg('3','receiving',75),leg('4','receptions',5),leg('5','receiving',60)],
 [leg('1','passing',300),leg('2','rushing',100),leg('3','receiving',100),leg('4','receptions',7),leg('5','receiving',90)]
);
test('a fresh game snapshot is marked as an initial build, not an automatic correction',()=>{
 const d=nflModelSgpRevisionAudit(null,first,{changedFields:['FIRST_SNAPSHOT']});
 assert.equal(d.status,'INITIAL_BUILD');
 assert.deepEqual(d.tiers.map(x=>x.added),[4,5,5]);
 assert.deepEqual(d.tiers.map(x=>x.retargeted),[0,0,0]);
 assert.deepEqual(d.changedEvidence,['FIRST_SNAPSHOT']);
 assert.equal(d.sportsbookQuoted,false);
});
test('a repeated identical model revision does not claim changed leg picks',()=>{
 const d=nflModelSgpRevisionAudit(first,structuredClone(first),
  {changedFields:['PLAYER_PROPS']});
 assert.equal(d.status,'NO_MODEL_LEG_CHANGE');
 assert.ok(d.tiers.every(x=>x.status==='UNCHANGED'&&x.added===0&&
  x.removed===0&&x.retargeted===0));
 assert.deepEqual(d.changedEvidence,['PLAYER_PROPS']);
 assert.match(d.evidenceCausality,/not proven reasons/);
});
test('recalculate counts independently by tier, identity and numeric threshold',()=>{
 const now=structuredClone(first);
 now.sgps[0].legs[1].threshold=70;
 now.sgps[0].legs[2]=leg('8','receiving',65,'LAR');
 now.sgps[1].legs[4].threshold=70;
 now.sgps[2].legs.splice(3,1);
 const d=nflModelSgpRevisionAudit(first,now,{changedFields:[
  'MATCHUP','INJURIES','SGP_TIERS','PRIVATE_RAW_TOKEN']});
 assert.equal(d.status,'SGP_MODEL_REVISED');
 assert.deepEqual(d.tiers.map(x=>({added:x.added,removed:x.removed,
  retargeted:x.retargeted,legs:x.currentLegs})),[
  {added:1,removed:1,retargeted:1,legs:4},
  {added:0,removed:0,retargeted:1,legs:5},
  {added:0,removed:1,retargeted:0,legs:4}
 ]);
 assert.deepEqual(d.changedEvidence,['MATCHUP','INJURIES','SGP_TIERS']);
 assert.ok(!JSON.stringify(nflSafeSgpRevisionAudit(d)).includes('PRIVATE'));
 assert.ok(!JSON.stringify(nflSafeSgpRevisionAudit(d)).includes('Player'));
});
test('threshold absent is not magically converted to a valid line',()=>{
 const incomplete=structuredClone(first);
 incomplete.sgps[0].legs[0].threshold=null;
 const d=nflModelSgpRevisionAudit(first,incomplete);
 assert.equal(d.tiers[0].status,'TARGETS_UNVERIFIED');
 assert.equal(d.tiers[0].retargeted,0);
 assert.equal(d.status,'COMPARISON_INCOMPLETE');
});
test('a newly added player with missing yardage does NOT count as a verified added leg',()=>{
 const next=structuredClone(first);
 next.sgps[0].legs.push(leg('22','rushing',null));
 const d=nflModelSgpRevisionAudit(first,next,{changedFields:['INJURIES']});
 assert.equal(d.status,'COMPARISON_INCOMPLETE');
 assert.equal(d.tiers[0].status,'TARGETS_UNVERIFIED');
 assert.equal(d.tiers[0].added,0);
 assert.equal(d.tiers[0].removed,0);
 assert.equal(d.tiers[0].retargeted,0);
 assert.deepEqual(d.changedEvidence,['INJURIES']);
 assert.equal(nflSafeSgpRevisionAudit(d).sportsbookQuoted,false);
});
test('unknown old targets block an otherwise valid player replacement claim',()=>{
 const old=structuredClone(first),next=structuredClone(first);
 old.sgps[0].legs[0].threshold=null;
 next.sgps[0].legs[0]=leg('42','passing',250);
 const d=nflModelSgpRevisionAudit(old,next);
 assert.equal(d.status,'COMPARISON_INCOMPLETE');
 assert.equal(d.tiers[0].status,'TARGETS_UNVERIFIED');
 assert.equal(d.tiers[0].added,0);
 assert.equal(d.tiers[0].removed,0);
});
test('five-yard model increments and integer count markets fail closed if malformed',()=>{
 for(const [cat,bad] of [['passing',221],['rushing',67.5],
  ['receiving',86],['receptions',3.5],['td',2]]){
  const next=structuredClone(first);
  next.sgps[0].legs.push(leg('99',cat,bad));
  const d=nflModelSgpRevisionAudit(first,next);
  assert.equal(d.tiers[0].status,'TARGETS_UNVERIFIED',cat);
  assert.equal(d.tiers[0].added,0,cat);
  assert.equal(d.status,'COMPARISON_INCOMPLETE',cat);
 }
 const invalidFirst=structuredClone(first);
 invalidFirst.sgps[1].legs[2].threshold=78;
 const d=nflModelSgpRevisionAudit(null,invalidFirst);
 assert.equal(d.status,'COMPARISON_INCOMPLETE');
 assert.equal(d.tiers[1].status,'TARGETS_UNVERIFIED');
 assert.equal(d.tiers[1].added,0);
});
test('unmatched id, duplicate or missing identity fail closed',()=>{
 const broken=structuredClone(first);
 broken.sgps[0].legs[0].playerID='';
 assert.equal(nflModelSgpRevisionAudit(first,broken).tiers[0].status,'UNCOMPARABLE');
 const duplicate=structuredClone(first);
 duplicate.sgps[1].legs.push({...duplicate.sgps[1].legs[0]});
 assert.equal(nflModelSgpRevisionAudit(first,duplicate).tiers[1].status,'UNCOMPARABLE');
});
test('missing or removed tier shows that a candidate disappeared',()=>{
 const next=structuredClone(first);
 next.sgps=next.sgps.filter(x=>x.risk!=='Nuke');
 const d=nflModelSgpRevisionAudit(first,next);
 assert.equal(d.status,'SGP_MODEL_REVISED');
 assert.equal(d.tiers[2].currentLegs,0);
 assert.equal(d.tiers[2].removed,5);
 assert.equal(d.tiers[2].added,0);
});
test('collector audit reports only bounded numeric revision counts with source-safe evidence names',()=>{
 const raw=nflSafeSgpRevisionAudit(nflModelSgpRevisionAudit(
  first,snapshot(first.sgps[0].legs.map(l=>({...l})),first.sgps[1].legs,
   first.sgps[2].legs),{changedFields:['MATCHUP','INJURIES']}));
 const c=collectorAuditReport('nfl',0,[{gameId,status:'updated',
  modelTierReadiness:{Small:{status:'MODEL_CANDIDATE'},
   Medium:{status:'MODEL_CANDIDATE'},Nuke:{status:'MODEL_CANDIDATE'}},
  sgpRevisionAudit:{...raw,secret:'never_visible',changedEvidence:[
   'MATCHUP','INJURIES','RAW_AUTHORIZATION_SECRET']}
 }],{due:1});
 assert.equal(c.successful,1);
 assert.equal(c.results[0].sgpRevisionAudit.status,'NO_MODEL_LEG_CHANGE');
 assert.deepEqual(c.results[0].sgpRevisionAudit.changedEvidence,['MATCHUP','INJURIES']);
 assert.equal(c.results[0].sgpRevisionAudit.tiers.length,3);
 assert.equal(c.results[0].sgpRevisionAudit.sportsbookQuoted,false);
 assert.ok(!JSON.stringify(c).includes('never_visible'));
 assert.ok(!JSON.stringify(c).includes('RAW_AUTHORIZATION_SECRET'));
});
test('final AI audit gets read-only revision evidence but cannot alter the tiers',()=>{
 const review=nflSafeSgpRevisionAudit(nflModelSgpRevisionAudit(first,
  snapshot(first.sgps[0].legs,first.sgps[1].legs,[])));
 const game={gameId,home:{abbr:'LAR'},away:{abbr:'BUF'}};
 const input=pregameAiEvidence('nfl',game,{sgpRevisionAudit:review,
  sgps:[make('Small',[leg('1','passing',220)])]});
 assert.equal(input.sgpRevisionAudit.status,'SGP_MODEL_REVISED');
 assert.equal(input.sgpRevisionAudit.tiers[2].removed,5);
 assert.equal(input.model.validation.sportsbookVerificationAvailable,false);
 assert.equal(input.sgps[0].combinedBookQuoteVerified,false);
 const code=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 assert.ok(code.includes('snap.sgpRevisionAudit=nflSafeSgpRevisionAudit('));
 assert.ok(code.includes('sgpRevisionAudit:snap.sgpRevisionAudit'));
});
