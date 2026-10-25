import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ownerNflPublishedParity} from '../lib/nfl-owner-public-parity.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const beginning=html.indexOf('async function loadNFLMulti(){');
const ending=html.indexOf('async function loadNFLHistory(){',beginning);
assert.ok(beginning>0&&ending>beginning);
const multi=html.slice(beginning,ending);
const start=html.indexOf('async function nflOpen(id,forceMarkets=false){');
const close=html.indexOf('function nflClose(){',start);
assert.ok(start>0&&close>start);
const open=html.slice(start,close);
test('Best of Slate uses ONLY the shared published, injury-screened data, never raw unscreened market models',()=>{
 assert.match(multi,/fetch\('\/api\/public-nfl-game\?'/);
 assert.match(multi,/ownerNflPublishedParity\(null,saved/);
 assert.match(multi,/safe\.publicResearchTiers\.find\(t=>t\.risk==='Small'/);
 assert.match(multi,/selected\.projection/);
 assert.match(multi,/modelValue/);
 assert.doesNotMatch(multi,/!selected\.target/);
 assert.match(multi,/\.selected\.projectionNote/);
 assert.match(multi,/\{cache:'no-store'\}/);
 assert.match(multi,/Math\.min|i\+=4/);
 assert.doesNotMatch(multi,/getNFLMarkets\(|\/api\/nfl-markets|\/api\/nfl-game\?|\.momentumScore|nflModelLine\(/);
 assert.doesNotMatch(multi,/sportsbook price estimate|multiplying.*odds|payoutTargetVerified/);
});
test('multi-game research cannot be described as a verified sportsbook ticket',()=>{
 assert.match(multi,/Best of Slate|BEST OF SLATE/);
 assert.match(multi,/AI RESEARCH ONLY/);
 assert.match(multi,/This is NOT a sportsbook parlay/);
 assert.match(multi,/Exact sportsbook listing NOT verified/);
 assert.match(multi,/not.*verified|NOT verified/);
});
test('owner game always requests published research and preserves it when owner raw market diagnostics fail',()=>{
 assert.match(open,/getNFLMarkets\(id,forceMarkets\)\.catch\(\(\)=>\(\{/);
 assert.match(open,/RAW_MARKET_DIAGNOSTICS_UNAVAILABLE/);
 assert.match(open,/fetch\('\/api\/public-nfl-game\?'/);
 assert.match(open,/ownerNflPublishedParity\(raw,publishedGame/);
 assert.match(open,/Analytics:\[\],DraftKings:\[\],FanDuel:\[\]/);
 assert.doesNotMatch(open,/fetch\('\/api\/nfl-game\?'/);
 assert.doesNotMatch(open,/independentPropsHtml\s*=\s*[^'"]/);
});
test('public model research holds out previously excluded players and ignores stale raw market details',()=>{
 const ts=new Date().toISOString(),date='2026-10-18',gameId='401872999';
 const published={ok:true,date,gameId,home:'ATL',away:'CHI',status:'CURRENT',
  updatedAt:ts,updatedDataCurrent:true,categories:{
   td:[],passing:[{name:'Eligible QB',team:'ATL',projection:220}],
   rushing:[{name:'Runner',team:'CHI',projection:70}],receiving:[],receptions:[]},
  modelResearchTiers:[],verifiedBookParlays:[]};
 const owner={ok:false,date,gameId,categories:{passing:[
  {name:'Injured QB',team:'ATL',projection:350,bestBook:{book:'DraftKings',odds:200}}]}};
 const result=ownerNflPublishedParity(owner,published,{date,gameId});
 assert.equal(result.ok,true);
 assert.deepEqual(result.categories.passing.map(x=>x.name),['Eligible QB']);
 assert.equal(result.categories.passing[0].projection,220);
 assert.equal(result.categories.passing[0].bestBook,null);
 assert.equal(result.bookParlays.length,0);
});
