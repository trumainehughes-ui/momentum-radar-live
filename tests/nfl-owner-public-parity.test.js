import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ownerNflPublishedParity} from '../lib/nfl-owner-public-parity.js';
const date='2026-10-18',gameId='401872999',now=Date.parse('2026-10-18T18:30:00Z');
const stamp=new Date(now-30_000).toISOString();
const row=(name,category,projection,team='ATL')=>({name,category,team,playerID:name.replaceAll(' ',''),eventID:gameId,
 projection,modelTdPercent:category==='td'?42:undefined,analyticsOnly:true,
 bestBook:{book:'DraftKings',odds:100},edgeAnalytics:{modelProjection:projection,sportsbookLine:135,marketVerified:false}});
const winner=row('Eligible Receiver','receiving',65);
const runner=row('Eligible Runner','rushing',110);
const caller=row('Cleared Quarterback','passing',235,'CHI');
const held=row('Practice Hold Quarterback','passing',275,'ATL');
const scorer=row('Eligible Scorer','td','Anytime TD','CHI');
const catcher=row('Eligible Catcher','receptions',4.9);
const all=[winner,runner,caller,scorer,catcher];
const rawLegs=[winner,runner,scorer,catcher];
const original=()=>({ok:true,date,gameId,home:'ATL',away:'CHI',fetchedAt:stamp,
 categories:{passing:[held,caller],rushing:[runner],receiving:[winner],
 td:[scorer],receptions:[catcher]},
 sgps:{Analytics:[{risk:'Small',tierAssessment:{compositionOk:true},
  legs:rawLegs.map(x=>({name:x.name,player:x.name,team:x.team,cat:x.category,
   analyticsThreshold:135,projection:x.projection}))}],DraftKings:[],FanDuel:[]}});
const safeRow=x=>({name:x.name,team:x.team,category:x.category,
 projection:typeof x.projection==='number'?x.projection:undefined,
 modelChancePct:x.category==='td'?42:undefined,
 projectionNote:'Current saved ESPN matchup projection',bookOffer:null});
const published=()=>({ok:true,date,gameId,home:'ATL',away:'CHI',updatedAt:stamp,
 status:'CURRENT',updatedDataCurrent:true,
 categories:{passing:[{...safeRow(caller),projection:230}],
 rushing:[{...safeRow(runner),projection:105}],receiving:[{...safeRow(winner),projection:60}],
 td:[safeRow(scorer)],receptions:[safeRow(catcher)]},
 modelResearchTiers:[{risk:'Small',complete:true,requiredLegs:4,
  legs:rawLegs.map(safeRow)}],verifiedBookParlays:[]});
test('owner shows exactly published screened players, not raw unscreened practice-hold entries',()=>{
 const v=ownerNflPublishedParity(original(),published(),{date,gameId,now});
 assert.equal(v.ok,true);
 assert.deepEqual(v.categories.passing.map(x=>x.name),['Cleared Quarterback']);
 assert.equal(v.categories.passing[0].projection,230);
 assert.equal(v.categories.rushing[0].projection,105);
 assert.equal(v.categories.receiving[0].projection,60);
 assert.equal(v.categories.td[0].modelTdPercent,42);
 assert.equal(v.categories.passing[0].bestBook,null);
 assert.equal(v.categories.passing[0].edgeAnalytics.sportsbookLine,null);
 assert.equal(v.tiers.length,1);
 assert.deepEqual(v.tiers[0].legs.map(x=>x.player),rawLegs.map(x=>x.name));
 assert.equal(v.tiers[0].publishable,false);
 assert.equal(v.tiers[0].combinedBookQuoteVerified,false);
 assert.equal(v.tiers[0].actualSgpOdds,null);
});
test('immutable source object and raw diagnostics are never mutated by public display projection',()=>{
 const owner=original(),v=ownerNflPublishedParity(owner,published(),{date,gameId,now});
 assert.equal(v.ok,true);
 assert.equal(owner.categories.passing.length,2);
 assert.equal(owner.categories.passing[1].projection,235);
 assert.equal(owner.categories.passing[1].bestBook.odds,100);
 assert.equal(owner.sgps.Analytics[0].legs[0].analyticsThreshold,135);
});
test('unmatched game, date, team, statuses, timestamps and injury evidence fail closed',()=>{
 const source=original(),view=published();
 const invalid=[
  {o:{...source,gameId:'401872998'},p:view},
  {o:source,p:{...view,gameId:'401872998'}},
  {o:source,p:{...view,home:'CHI'}},
  {o:source,p:{...view,status:'LAST_SAVED'}},
  {o:source,p:{...view,updatedDataCurrent:false}},
  {o:source,p:{...view,updatedAt:new Date(now-16*60000).toISOString()}},
  {o:source,p:{...view,updatedAt:new Date(now-4000).toISOString()}},
  {o:source,p:{...view,categories:{...view.categories,passing:[safeRow(held)]}}},
  {o:source,p:null}
 ];
 for(const {o,p} of invalid){
  const result=ownerNflPublishedParity(o,p,{date,gameId,now});
  assert.equal(result.ok,false,JSON.stringify(result));
  assert.deepEqual(result.categories.passing,[]);
  assert.deepEqual(result.tiers,[]);
  assert.deepEqual(result.bookParlays,[]);
 }
});
test('owner and public show no completed SGP if any leg is withheld or incomplete',()=>{
 const p=published();
 p.modelResearchTiers[0].complete=false;
 let v=ownerNflPublishedParity(original(),p,{date,gameId,now});
 assert.equal(v.ok,true);assert.equal(v.tiers.length,0);
 const p2=published();p2.modelResearchTiers[0].legs[0].player='Blocked athlete';
 v=ownerNflPublishedParity(original(),p2,{date,gameId,now});
 assert.equal(v.tiers.length,0);
});
test('owner matchup consumes same /api/public-nfl-game as customer while keeping raw market diagnostics separate',()=>{
 const ownerHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const publicHtml=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.match(ownerHtml,/fetch\('\/api\/public-nfl-game\?'/);
 assert.match(publicHtml,/getJson\('\/api\/public-nfl-game\?'/);
 assert.match(ownerHtml,/ownerNflPublishedParity\(raw,publishedGame/);
 assert.match(ownerHtml,/Analytics:\[\],DraftKings:/);
 assert.match(ownerHtml,/nflPublishedSgpParityHtml\(d\.publicParity\)/);
 assert.match(ownerHtml,/const d=\{\.\.\.raw,categories:parity\.categories/);
 assert.match(ownerHtml,/getNFLMarkets\(id,forceMarkets\)/);
});
