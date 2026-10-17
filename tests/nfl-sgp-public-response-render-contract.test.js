import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf(" const catNames={td:'Anytime TD candidate',passing:'Passing yards'");
const end=html.indexOf(" $('#nflSGP').innerHTML=",start);
assert.ok(start>0&&end>start,'must find current production zero-market render');

function render(analytics,game={gameId:'401872999',
 home:{abbr:'ATL'},away:{abbr:'CHI'}}){
 const snippet=html.slice(start,end);
 const d={sgps:{Analytics:analytics}};
 const context={d,g:game,nflEscape:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
 return vm.runInNewContext('(function(){'+snippet+'return tiersHtml})()',context);
}
const small=[
 {player:'Rome Odunze',team:'CHI',category:'receiving',target:35,gameId:'401872999'},
 {player:'Bijan Robinson',team:'ATL',category:'rushing',target:70,gameId:'401872999'},
 {player:"D'Andre Swift",team:'CHI',category:'td',target:'Anytime TD',gameId:'401872999'}
];
const sample=[
 {risk:'Small',mode:'MODEL_ONLY',legs:small},
 {risk:'Medium',mode:'MODEL_ONLY',legs:[...small,{player:'Drake London',team:'ATL',category:'receiving',target:55,gameId:'401872999'}]},
 {risk:'Nuke',mode:'MODEL_ONLY',legs:[...small,{player:'Kyle Pitts',team:'ATL',category:'receptions',target:5,gameId:'401872999'}]}
];
test('the exact live public NFL market-response schema renders Small Medium and Nuke instead of 0',()=>{
 const page=render(sample);
 for(const name of ['Rome Odunze','Bijan Robinson','D&#39;Andre Swift','Drake London','Kyle Pitts'])
  assert.ok(page.includes(name),name);
 for(const tier of ['Small','Medium','Nuke'])assert.ok(page.includes(tier+' • Projection candidates'));
 assert.ok(page.includes('3 player projections'));
 assert.ok(page.includes('4 player projections'));
 assert.ok(!page.includes('0 player projections'));
 assert.ok(!page.includes('70+ rushing yards'));
 assert.ok(!page.includes('35+ receiving yards'));
 assert.ok(page.includes('Exact sportsbook selection pending'));
 assert.ok(page.includes('Anytime TD candidate'));
 assert.ok(!page.includes('135+'));
 assert.ok(!page.includes('Actual combined')&&!page.includes('bookmaker-priced'));
});
test('game and team filters block stale or cross-matchup legs',()=>{
 const cards=[{risk:'Small',legs:[...small,
  {player:'Wrong game',team:'ATL',category:'rushing',target:65,gameId:'401000000'},
  {player:'Other roster',team:'DEN',category:'receiving',target:45,gameId:'401872999'},
  {player:'Fake category',team:'CHI',category:'invalid',target:90,gameId:'401872999'}]}];
 const page=render(cards);
 assert.ok(page.includes('3 player projections'));
 for(const name of ['Wrong game','Other roster','Fake category'])assert.ok(!page.includes(name));
});
test('missing tiers do not claim a confirmed sportsbook price',()=>{
 const page=render([{risk:'Small',legs:[]},{risk:'Medium',legs:[]},{risk:'Nuke',legs:[]}]);
 assert.ok(page.includes('Research not ready'));
 assert.ok(!page.includes('bookmaker-issued quote verified'));
});
test('browser-observed exact-line matcher respects public API field names and does not re-juice model targets',()=>{
 assert.ok(html.includes('leg.name||leg.player'));
 assert.ok(html.includes('leg.cat||leg.category'));
 assert.ok(html.includes("leg.target==='Anytime TD'?null:Number(leg.target??leg.analyticsThreshold??leg.projection)"));
 assert.ok(html.includes('Target was already adjusted for the tier'));
 assert.ok(html.includes('No combined bookmaker quote has been obtained'));
});

test('135+ rushing yard projections cannot appear in Small Medium or Nuke without real sportsbook evidence',()=>{
 const feed=[{risk:'Nuke',mode:'MODEL_ONLY',legs:[
  {player:'Bijan Robinson',team:'ATL',category:'rushing',target:135,gameId:'401872999'},
  {player:'Rome Odunze',team:'CHI',category:'receiving',target:65,gameId:'401872999'},
  {player:'Kalif Raymond',team:'CHI',category:'receiving',target:60,gameId:'401872999'},
  {player:"D'Andre Swift",team:'CHI',category:'td',target:'Anytime TD',gameId:'401872999'}]}];
 const result=render(feed);
 assert.ok(result.includes('Bijan Robinson'));
 assert.ok(result.includes('4 player projections'));
 assert.ok(!result.includes('135'));
 assert.ok(!result.includes('65+'));
 assert.ok(!result.includes('60+'));
 assert.ok(result.includes('Exact sportsbook selection pending'));
});
