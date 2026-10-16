import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pregameAiAudit,pregameAiEvidence} from '../lib/pregame-ai-review.js';

const g={gameId:'401872999',kickoff:'2026-10-18T17:00:00Z',
 home:{abbr:'ATL'},away:{abbr:'CHI'},status:'SCHEDULED'};
const td={playerID:'10001',name:'Sample Running Back',eventID:g.gameId,
 team:'ATL',position:'RB',category:'td',tdModelStatus:'ESPN_MATCHUP_MODEL',
 modelTdPercent:56,evidence:{games:6,opportunitiesPerGame:13,
 touchdowns:5,defenseRank:9},modelOnly:true};
const snap={picks:[td],sgps:[],checkedAt:'2026-10-17T18:00:00Z',
 injuryEvidence:[],injuryChecks:{rosterAndInjuryEligibilityChecked:true}};

test('scheduled AI audit includes scoring candidate evidence even without any SGP',async()=>{
 const evidence=pregameAiEvidence('nfl',g,snap);
 assert.equal(evidence.anytimeTdModel.length,1);
 assert.equal(evidence.anytimeTdModel[0].modelEstimatedPercent,56);
 let count=0;
 const out=await pregameAiAudit('nfl',g,snap,{
  base:'https://momentum-radar-live.vercel.app',
  fetcher:async(_url,opts)=>{
   count++;
   let body=JSON.parse(opts.body);
   assert.equal(body.mode,'tdReview');
   assert.equal(body.data.anytimeTdModel[0].name,'Sample Running Back');
   assert.equal(body.data.anytimeTdModel[0].sportsbookPriceVerified,false);
   return{ok:true,json:async()=>({ok:true,analysis:'Historical usage and matchup evidence reviewed.',provider:'groq'})};
  }
 });
 assert.equal(count,1);
 assert.equal(out.status,'REVIEWED');
 assert.equal(out.canAlterPicks,false);
 assert.equal(out.advisoryOnly,true);
});
test('AI cannot create candidates when screened TD and SGP evidence are absent',async()=>{
 let count=0;
 const out=await pregameAiAudit('nfl',g,{...snap,picks:[]},{
  fetcher:async()=>{count++;throw Error('unexpected')}});
 assert.equal(out.status,'SKIPPED');
 assert.equal(count,0);
});
test('TD-only AI changes are advisory; scheduled injury gate still runs first',()=>{
 const health=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 const ai=readFileSync(new URL('../api/ai-analysis.js',import.meta.url),'utf8');
 assert.ok(health.includes('checkNflScheduledInjuryChanges(g,'));
 assert.ok(health.includes("!snap.sgps.length&&!snap.picks.some(p=>p.category==='td'"));
 assert.ok(ai.includes("'tdReview'"));
 assert.ok(ai.includes("Do not invent athletes, assign new percentages"));
});
