import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {nflScoringSpotlights,safeNflSpotlightForAi} from '../lib/nfl-game-spotlight.js';
import {pregameAiEvidence} from '../lib/pregame-ai-review.js';

const sunday='2026-10-18T17:00:00Z';
const g=(gameId,gameTotal,over={})=>({
 gameId:String(gameId),gameTotal,kickoff:sunday,status:'SCHEDULED',
 home:{abbr:'ATL',name:'Atlanta Falcons'},
 away:{abbr:'CHI',name:'Chicago Bears'},week:6,...over
});
const slate=[
 g(401872996,42.5),g(401872999,51.5),g(401872997,39.5),
 g(401873003,44.5),g(401873001,43.5),g(401873000,46.5),
 g(401872998,39.5),g(401873002,38.5),g(401873004,51.5),
 g(401873006,41.5),g(401873005,53.5),g(401873007,53.5)
];
test('top four real ESPN-listed Sunday game totals receive stars, including tied top two',()=>{
 const data=nflScoringSpotlights(slate,{observedAt:'2026-10-16T23:00:00Z'});
 assert.deepEqual(Object.keys(data).sort(),
  ['401872999','401873004','401873005','401873007'].sort());
 assert.equal(data['401873005'].totalPoints,53.5);
 assert.equal(data['401873007'].totalPoints,53.5);
 assert.equal(data['401873005'].tiedForHighest,true);
 assert.equal(data['401872999'].rank,3);
 assert.equal(data['401872996'],undefined);
 assert.equal(data['401873005'].source,'ESPN_SCOREBOARD_MARKET_TOTAL');
 assert.ok(data['401873005'].note.includes('not a guaranteed score'));
 assert.ok(data['401873005'].note.includes('popularity metric'));
});
test('no misleading popularity or scoring star without reasonable multi-game source evidence',()=>{
 assert.deepEqual(nflScoringSpotlights([]),{});
 assert.deepEqual(nflScoringSpotlights([g(401872996,54)]),{});
 assert.deepEqual(nflScoringSpotlights([g(401872996,44),g(401872999,43)]),{});
 const result=nflScoringSpotlights([
  g(401872996,null),g(401872999,'53.5'),g(401873001,52,{status:'FINAL'}),
  g(401873002,55,{kickoff:'2026-10-19T00:00:00Z'})]);
 assert.deepEqual(result,{});
});
test('AI receives only game-bound, numeric scoring-total context and never a claimed player prop edge',()=>{
 const s=nflScoringSpotlights(slate,{observedAt:'2026-10-16T23:00:00Z'});
 const target={...slate[10],spotlight:s['401873005']};
 const report=pregameAiEvidence('nfl',target,{
  picks:[],sgps:[],injuryEvidence:[],injuryChecks:{
   rosterAndInjuryEligibilityChecked:false}});
 assert.equal(report.slateSpotlight.listedCombinedPointsTotal,53.5);
 assert.equal(report.slateSpotlight.sundaySlateRank,1);
 assert.ok(report.slateSpotlight.interpretation.includes('game-script context only'));
 assert.ok(report.slateSpotlight.interpretation.includes('does not establish popularity'));
 assert.equal(safeNflSpotlightForAi({
  kind:'HIGH_TOTAL',source:'MODEL_GUESS',totalPoints:70,rank:1},target.gameId),null);
 assert.equal(safeNflSpotlightForAi({
  kind:'HIGH_TOTAL',source:'ESPN_SCOREBOARD_MARKET_TOTAL',totalPoints:150,rank:1},target.gameId),null);
});
const ui=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const script=ui.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
test('public NFL matchup list shows readable highlighted game card and never labels star as popularity',()=>{
 const a=script.indexOf('function validGameSpotlight(g){');
 const b=script.indexOf('// Public NFL modules mirror production',a);
 assert.ok(a>0&&b>a);
 const box={innerHTML:''};
 const panel={hidden:false,remove(){}};
 const state={league:'nfl',games:slate.map(x=>({...x,spotlight:
  nflScoringSpotlights(slate)[x.gameId]||null})),selected:''};
 const context={state,esc:x=>String(x??''),noData:()=>'',fmtTime:()=> 'Sun 11:00 AM',
  teamLine:x=>'<div>'+x.abbr+'</div>',statusLabel:()=> 'Pregame',
  $:key=>key==='#games'?box:key==='#game-section'?panel:
  key==='#game-panel-home'?{appendChild(){}}:null};
 vm.runInNewContext(script.slice(a,b),context);
 assert.equal((box.innerHTML.match(/class="game-spotlight"/g)||[]).length,4);
 assert.equal((box.innerHTML.match(/game-spotlight-star/g)||[]).length,4);
 assert.ok(box.innerHTML.includes('⭐ High-scoring watch'));
 assert.ok(box.innerHTML.includes('ESPN game O/U 53.5 points'));
 assert.ok(!box.innerHTML.includes('Most popular'));
 assert.ok(!box.innerHTML.includes('Guaranteed'));
 assert.ok(box.innerHTML.includes('Houston Texans')===false); // fixture uses ATL/CHI abbreviations
 assert.doesNotThrow(()=>new vm.Script(script));
});
test('not-yet-source-backed NBA matchups never inherit NFL scoring stars',()=>{
 const state={league:'nba',games:[g(401872999,53.5,{spotlight:
  nflScoringSpotlights(slate)['401872999']})],selected:''};
 const a=script.indexOf('function validGameSpotlight(g){'),b=script.indexOf('// Public NFL modules mirror production',a);
 const box={innerHTML:''},panel={hidden:false,remove(){}};
 const context={state,esc:x=>String(x??''),fmtTime:()=> 'Tue 5:30 PM',
  teamLine:x=>'<div>'+x.abbr+'</div>',statusLabel:()=> 'Pregame',
  $:key=>key==='#games'?box:key==='#game-section'?panel:key==='#game-panel-home'?{appendChild(){}}:null};
 vm.runInNewContext(script.slice(a,b),context);
 assert.ok(!box.innerHTML.includes('High-scoring watch'));
});
test('source labeling reaches schedule API, AI policy and AI matchup analysis',()=>{
 const schedule=readFileSync(new URL('../api/nfl-schedule.js',import.meta.url),'utf8');
 const policy=readFileSync(new URL('../api/ai-analysis.js',import.meta.url),'utf8');
 assert.ok(schedule.includes('nflScoringSpotlights(sch.games'));
 assert.ok(schedule.includes('spotlight:highTotal[String(g.gameId)]||null'));
 assert.ok(policy.includes('If slateSpotlight contains a source-backed ESPN-listed game total'));
 assert.ok(ui.includes('return intro+scoringContext+modelBrief+review+insight'));
 assert.ok(ui.includes('return gameSpotlightHtml(game,true)+scoreHtml'));
});
