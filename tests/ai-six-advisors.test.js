import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ADVISORY_MODES,generateAdvisory} from '../lib/ai-mechanics/ai-advisors.js';
import handler from '../api/ai-analysis.js';
const client={
 gameId:'401872981',game:{homeAbbr:'JAX',awayAbbr:'PHI'},
 sources:{model:'available'},
 model:{fetchedAt:'2026-10-10T18:55:00Z',stale:false,degraded:false,
  validation:{injuryEligibilityChecked:true,sportsbookVerificationAvailable:false}},
 categories:{
  passing:[{name:'Pass QB',team:'PHI',position:'QB',projection:275,modelScore:87,book:'DraftKings',marketLine:255.5,bookOdds:-115}],
  rushing:[{name:'Rush RB',team:'JAX',position:'RB',projection:75,modelScore:84}],
  receiving:[{name:'Catch WR',team:'PHI',position:'WR',projection:60,modelScore:85}],
  td:[],receptions:[]
 },
 playerAvailability:{playerChecks:[
  {name:'Pass QB',rosterTeam:'PHI',status:'ROLE_EVIDENCE_REPORTED'},
  {name:'Rush RB',rosterTeam:'JAX',status:'ROLE_EVIDENCE_REPORTED'},
  {name:'Catch WR',rosterTeam:'PHI',status:'ROLE_EVIDENCE_REPORTED'}
 ],skillPositionAlerts:[]},
 sgps:[{source:'Analytics',risk:'Nuke',legs:[
  {name:'Pass QB',team:'PHI',category:'passing',projection:275,modelThreshold:315,eventID:'401872981'},
  {name:'Rush RB',team:'JAX',category:'rushing',projection:75,modelThreshold:90,eventID:'401872981'},
  {name:'Catch WR',team:'PHI',category:'receiving',projection:60,modelThreshold:75,eventID:'401872981'},
  {name:'Other Catch WR',team:'JAX',category:'receiving',projection:40,modelThreshold:50,eventID:'401872981'},
  {name:'Other Rush RB',team:'PHI',category:'rushing',projection:55,modelThreshold:65,eventID:'401872981'}
 ]}],
 matchup:{sides:[{offense:'PHI',opponentDefense:'JAX',offenseSampleGames:4,defenseSampleGames:4,
  positions:[{position:'QB',metrics:[{metric:'passYards',defenseAllowedPerGame:255}]}]}]}
};
test('all six advisors are selectable, read-only, and use the same existing Groq endpoint',()=>{
 assert.deepEqual(ADVISORY_MODES.slice(0,6),['guardian','nuke','opportunity','value','simulation','learning']);
 assert.ok(ADVISORY_MODES.includes('sharp'),'Sport-neutral sharp audit appended without changing existing advisors');
 const ui=readFileSync(new URL('../public-ai.js',import.meta.url),'utf8');
 const api=readFileSync(new URL('../api/ai-analysis.js',import.meta.url),'utf8');
 for(const mode of ADVISORY_MODES){
  assert.ok(ui.includes('<option value="'+mode+'">'),mode);
  assert.ok(api.includes("  "+mode+":'"),mode);
  const advice=generateAdvisory(mode,client,{now:Date.parse('2026-10-10T19:00:00Z')});
  assert.equal(advice.mode,mode);
  assert.equal(advice.canChangePicks,false);
  assert.equal(advice.canSetOdds,false);
  assert.equal(advice.canModifyModel,false);
 }
 assert.ok(ui.includes("mode==='learning'?await getJson('/api/nfl-game?mode=history-grade"));
 assert.ok(api.includes("NET profit on $10"));
 assert.ok(!api.includes('Small $200–$300 total return'));
});
test('guardian blocks bad team and roster conflict instead of silently blessing a Nuke',()=>{
 const data=structuredClone(client);
 data.categories.rushing.push({name:'Other-team runner',team:'LAR',projection:78,position:'RB'});
 data.playerAvailability.playerChecks.push({name:'Rush RB',rosterTeam:'PHI',status:'TEAM_MISMATCH'});
 const a=generateAdvisory('guardian',data);
 assert.equal(a.status,'REVIEW_REQUIRED');
 assert.ok(a.flags.some(x=>x.code==='NON_GAME_PLAYER'));
 assert.ok(a.flags.some(x=>x.code==='ROSTER_CONFLICT'));
 assert.ok(a.flags.some(x=>x.code==='PARLAY_IDENTITY'));
});
test('Nuke architect rejects normal/invalid threshold, duplicates, all TD and cross-team picks',()=>{
 const a=generateAdvisory('nuke',client);
 assert.equal(a.items[0].reviewStatus,'MODEL_COMPOSITION_ONLY');
 assert.equal(a.items[0].sportsbookPriceVerified,false);
 const bad=structuredClone(client);
 bad.sgps[0].legs[0].modelThreshold=275; // not elevated
 bad.sgps[0].legs[1].team='WAS';
 const b=generateAdvisory('nuke',bad);
 assert.equal(b.status,'REVIEW_REQUIRED');
 assert.match(b.flags[0].detail,/above-projection|roster/);
 const onlyTD=structuredClone(client);
 onlyTD.sgps[0].legs=Array.from({length:5},(_,i)=>({
  name:'TD player '+i,team:'PHI',category:'td',projection:1,modelThreshold:'Anytime TD'
 }));
 assert.equal(generateAdvisory('nuke',onlyTD).items[0].reviewStatus,'HOLD');
});
test('injury radar reports only supplied same-team alternatives; does not shift numbers',()=>{
 const d=structuredClone(client);
 d.playerAvailability.skillPositionAlerts=[{name:'Unavailable RB',team:'JAX',status:'OUT',source:'ESPN reported'}];
 const a=generateAdvisory('opportunity',d);
 assert.equal(a.items.length,1);
 assert.equal(a.items[0].possibleAlternates[0].name,'Rush RB');
 assert.ok(a.items[0].possibleAlternates.every(x=>x.name!=='Pass QB'));
 assert.equal(a.canChangePicks,false);
});
test('value detector never manufactures markets when sports API exhausted or quote stale',()=>{
 const none=generateAdvisory('value',client,{now:Date.parse('2026-10-10T19:00:00Z')});
 assert.equal(none.items.length,0);
 assert.ok(none.flags.some(x=>x.code==='MARKETS_UNVERIFIED'));
 const d=structuredClone(client);d.model.validation.sportsbookVerificationAvailable=true;
 const fresh=generateAdvisory('value',d,{now:Date.parse('2026-10-10T19:00:00Z')});
 assert.equal(fresh.items.length,1);
 assert.equal(fresh.items[0].difference,19.5);
 const stale=generateAdvisory('value',d,{now:Date.parse('2026-10-10T19:40:00Z')});
 assert.equal(stale.items.length,0);
 assert.ok(stale.flags.some(x=>x.code==='MARKETS_NOT_FRESH'));
});
test('script simulator labels low-sample scenarios; no numeric predictions',()=>{
 const a=generateAdvisory('simulation',client);
 assert.equal(a.items.length,1);
 assert.equal(a.items[0].offense,'PHI');
 assert.ok(a.flags.some(x=>x.code==='SMALL_SAMPLE'));
 assert.ok(!('winProbability' in a.items[0]));
});
test('postgame lab requires locked final; compares signed model errors only',()=>{
 const notReady=generateAdvisory('learning',client);
 assert.ok(notReady.flags.some(x=>x.code==='NO_FINAL_LOCKED_RESULTS'));
 const d=structuredClone(client);
 d.results={final:true,lockedAt:'2026-10-10T16:00:00Z',picks:[
  {name:'Pass QB',category:'passing',grade:{status:'MISS',actual:250,projectionAtLock:275}},
  {name:'Rush RB',category:'rushing',grade:{status:'HIT',actual:80,projectionAtLock:75}},
  {name:'No sample',category:'receiving',grade:{status:'UNGRADABLE',actual:null,projectionAtLock:null}}
 ]};
 const a=generateAdvisory('learning',d);
 assert.deepEqual(a.items.map(x=>x.signedError),[-25,5]);
 assert.equal(a.canModifyModel,false);
});
test('Groq unavailable still returns auditable deterministic report to the six new modes',async()=>{
 const prior=process.env.GROQ_API_KEY;
 delete process.env.GROQ_API_KEY;
 const req={method:'POST',body:{mode:'guardian',data:client},headers:{}},
 res={statusCode:200,setHeader(){return this},status(n){this.statusCode=n;return this},json(x){this.body=x;return this}};
 try{await handler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.aiAvailable,false);
  assert.equal(res.body.mechanics.mode,'guardian');
  assert.equal(res.body.mechanics.canChangePicks,false);
 }finally{if(prior!==undefined)process.env.GROQ_API_KEY=prior}
});
