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
 return{home:'JAX',away:'HOU',status:'CURRENT',updatedDataCurrent:true,
  updatedAt:'2026-10-18T14:00:00Z',verifiedQuotes:[],modelResearchTiers:[
   {risk:'Nuke',mode:'MODEL_RESEARCH',requiredLegs:5,complete:false,legs:[
    {player:'Parker Washington',team:'JAX',category:'receiving',projection:yards},
    {player:'Parker Washington',team:'JAX',category:'td',modelChancePct:41}]}
  ]};
}
test('new public snapshot replaces 90 with 60; no independently rebuilt tiers',()=>{
 const oldHtml=render(game(90)),newHtml=render(game(60));
 assert.ok(oldHtml.includes('90 projected yards'));
 assert.ok(newHtml.includes('60 projected yards'));
 assert.ok(!newHtml.includes('90 projected yards'));
 assert.ok(newHtml.includes('Anytime touchdown'));
 assert.ok(newHtml.includes('Model-only research'));
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
 assert.ok(html.includes('2 / 5 researched legs'));
 assert.ok(html.includes('Not ready'));
 assert.ok(!html.includes('combined verified quote'));
});
