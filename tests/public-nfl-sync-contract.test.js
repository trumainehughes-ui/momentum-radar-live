import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nflSgpSnapshotVersionPrefix,nflSgpVersionedSnapshotPath,
 nflSgpFindLatestBlob} from '../lib/nfl-sgp-snapshot-status.js';
const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const route=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
const owner=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const start=script.indexOf('function sgpSelectionDisplay(l){');
const end=script.indexOf('function offerHtml(x){',start);
assert.ok(start>=0&&end>start);
function render(d){
 const context={
  state:{currentBookSgpModel:null,selected:'401873004',date:'2026-10-18',recheckLoading:false},
  window:{momentumPublicCompactNflSgp:{}},
  esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
  fmtStamp:()=> '10:00 AM',
  renderOdds:()=>'',renderPublicBookResearch:()=>'',
  renderLocalBookParity:()=>'',
  publicWhy:()=> 'Verified matchup research.',
  URL
 };
 vm.runInNewContext(script.slice(start,end)+';this.render=renderParlays;',context);
 return context.render(d);
}
function game(yards){
 return{ok:true,date:'2026-10-18',gameId:'401873004',
  home:'JAX',away:'HOU',status:'CURRENT',updatedDataCurrent:true,
  updatedAt:new Date().toISOString(),verifiedQuotes:[],modelResearchTiers:[
   {risk:'Nuke',mode:'MODEL_RESEARCH',requiredLegs:5,complete:false,legs:[
    {player:'Parker Washington',team:'JAX',category:'receiving',projection:yards},
    {player:'Parker Washington',team:'JAX',category:'td',modelChancePct:41}]}
  ]};
}
test('incomplete model snapshot updates do not display partial Nuke legs as a parlay',()=>{
 const oldHtml=render(game(90)),newHtml=render(game(60));
 for(const html of [oldHtml,newHtml]){
  assert.ok(html.includes('Nuke · NOT READY'));
  assert.ok(html.includes('2 eligible research selections'));
  assert.ok(!html.includes('90 projected yards'));
  assert.ok(!html.includes('60 projected yards'));
  assert.ok(!html.includes('Anytime touchdown</span>'));
  assert.ok(!html.includes('+10000 combined'));
 }
 assert.equal(oldHtml,newHtml);
});
test('public SGP uses the same published snapshot API and never calls owner refresh',()=>{
 assert.match(route,/nflSgpFindLatestBlob\(\{date,gameId\}\)/);
 assert.match(owner,/nflSgpVersionedSnapshotPath\(date,gameId,startedAt/);
 const loader=script.slice(script.indexOf('async function loadCurrentNflSgpResearch'),
  script.indexOf('function renderLocalBookParity'));
 assert.ok(!loader.includes("getJson('/api/nfl-markets?"));
 assert.match(script,/setInterval\(refreshReadOnlyPredictions,30\*1000\)/);
});
test('snapshots are versioned per game rather than overwritten',async()=>{
 const path=nflSgpVersionedSnapshotPath('2026-10-18','401873004',1790000000000,'test');
 assert.ok(path.startsWith(nflSgpSnapshotVersionPrefix('2026-10-18','401873004')));
 assert.ok(path.endsWith('.json'));
});

test('incomplete same-game model tier is always marked not ready',()=>{
 const html=render(game(60));
 assert.ok(html.includes('2 eligible research selections'));
 assert.ok(html.includes('Nuke · NOT READY'));
 assert.ok(!html.includes('combined verified quote'));
});
