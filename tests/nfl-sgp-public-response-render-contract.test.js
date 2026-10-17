import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNflProjectedSgpTierDetails,renderNflProjectedSgpTierDetails}
 from '../lib/nfl-sgp-model-yardage-cards.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const gameId='401872999',date='2026-10-18';
const leg=(player,team,category)=>({player,team,category,gameId,
  target:category==='td'?'Anytime TD':135});
const market={
 ok:true,scope:'game',gameId,date,
 validation:{injuryEvidence:[]},
 categories:{
  rushing:[{name:'Bijan Robinson',team:'ATL',position:'RB',projection:115}],
  receiving:[{name:'Rome Odunze',team:'CHI',position:'WR',projection:55},
   {name:'Drake London',team:'ATL',position:'WR',projection:55}],
  receptions:[{name:'Kyle Pitts',team:'ATL',position:'TE',projection:5}],
 },
 sgps:{Analytics:[
  {risk:'Small',legs:[leg('Rome Odunze','CHI','receiving'),
   leg('Bijan Robinson','ATL','rushing')]},
  {risk:'Medium',legs:[leg('Rome Odunze','CHI','receiving'),
   leg('Bijan Robinson','ATL','rushing'),leg('Drake London','ATL','receiving')]},
  {risk:'Nuke',legs:[leg('Rome Odunze','CHI','receiving'),
   leg('Bijan Robinson','ATL','rushing'),leg('Kyle Pitts','ATL','receptions')]}
 ]}
};
const context={market,gameId,date,home:'ATL',away:'CHI'};
test('Small/Medium/Nuke actual public model response now yields visible numeric player forecasts',()=>{
 const out=buildNflProjectedSgpTierDetails(context),page=renderNflProjectedSgpTierDetails(out);
 assert.equal(out.tiers.length,3);
 for(const x of ['Small','Medium','Nuke'])assert.ok(page.includes(x+' • AI yardage projection candidates'));
 for(const x of ['Rome Odunze','Bijan Robinson','Drake London','Kyle Pitts'])assert.ok(page.includes(x));
 assert.ok(page.includes('AI Receiving forecast: 55 yards'));
 assert.ok(page.includes('AI Rushing forecast: 115 yards'));
 assert.ok(page.includes('suggested comparison target'));
 assert.ok(!page.includes('Exact sportsbook selection pending'));
 assert.ok(page.includes('NOT a listed betting line'));
 assert.ok(!page.includes('Actual combined odds'));
});
test('cross-game and other teams never leak into displayed tier card',()=>{
 const m={...market,sgps:{Analytics:[{risk:'Small',legs:[
  leg('Rome Odunze','CHI','receiving'),
  {...leg('Bijan Robinson','ATL','rushing'),gameId:'401000000'},
  leg('Not on matchup','NYG','rushing')
 ]}]}};
 const out=buildNflProjectedSgpTierDetails({...context,market:m});
 assert.deepEqual(out.tiers[0].legs.map(x=>x.name),['Rome Odunze']);
});
test('a historic synthetic 135 target cannot be presented as a sportsbook offer',()=>{
 const out=buildNflProjectedSgpTierDetails(context);
 const page=renderNflProjectedSgpTierDetails(out);
 assert.ok(!page.includes('135+'));
 assert.ok(!page.includes('135 yards'));
 assert.ok(!page.includes('bookmaker-issued quote verified'));
 assert.equal(out.bookmakerSgpQuoteVerified,false);
 assert.ok(html.includes('const tiersHtml=sgpYardageHtml'));
});
test('official sportsbook selection path remains separately exact offer gated',()=>{
 assert.ok(html.includes('leg.name||leg.player'));
 assert.ok(html.includes('leg.cat||leg.category'));
 assert.ok(html.includes('const forecast=Number(profile.edgeAnalytics?.modelProjection??profile.projection)'));
 assert.ok(html.includes('The SGP response is deliberately stripped of speculative targets.'));
 assert.ok(html.includes('No combined bookmaker quote has been obtained'));
});
