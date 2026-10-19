import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPublicCompactNflSgpCards,renderPublicCompactNflSgpCards}
 from '../lib/nfl-public-compact-sgp-cards.js';
const gameId='401872999',date='2026-10-18';
const p=(name,team,projection,perGame,cat,extra={})=>({
 name,team,position:cat==='rushing'?'RB':'WR',
 projection,perGame,gamesPlayed:5,opponent:team==='ATL'?'CHI':'ATL',
 matchupRankMost:cat==='rushing'?23:14,
 recentForm:{last5:cat==='rushing'?[83,72,194,145,86]:[44,55,78,34,65]},
 ...extra
});
const market={ok:true,scope:'game',gameId,date,validation:{injuryEvidence:[
 {name:'Unavailable Player',team:'ATL',status:'OUT'}]},
 categories:{
 rushing:[p('Bijan Robinson','ATL',115,116,'rushing'),
  p("D'Andre Swift",'CHI',70,70.8,'rushing'),
  p('Unavailable Player','ATL',130,110,'rushing')],
 receiving:[p('Rome Odunze','CHI',55,55,'receiving'),
  p('Luther Burden III','CHI',55,53,'receiving'),
  p('Kalif Raymond','CHI',45,45,'receiving'),
  p('Bijan Robinson','ATL',30,30.4,'receiving'),
  p("D'Andre Swift",'CHI',25,22.8,'receiving')],
 receptions:[p('Rome Odunze','CHI',3.6,3.6,'receptions')]
 },sgps:{Analytics:[
 {risk:'Small',legs:[{player:'Rome Odunze',team:'CHI',category:'receiving'},
  {player:'Bijan Robinson',team:'ATL',category:'rushing'},
  {player:"D'Andre Swift",team:'CHI',category:'td'},
  {player:'Luther Burden III',team:'CHI',category:'receiving'}]},
 {risk:'Medium',legs:[{player:'Luther Burden III',team:'CHI',category:'receiving'},
  {player:'Bijan Robinson',team:'ATL',category:'td'},
  {player:'Rome Odunze',team:'CHI',category:'receiving'},
  {player:"D'Andre Swift",team:'CHI',category:'rushing'},
  {player:'Kalif Raymond',team:'CHI',category:'receiving'}]},
 {risk:'Nuke',legs:[{player:'Bijan Robinson',team:'ATL',category:'rushing'},
  {player:'Rome Odunze',team:'CHI',category:'receiving'},
  {player:"D'Andre Swift",team:'CHI',category:'td'},
  {player:'Luther Burden III',team:'CHI',category:'receiving'},
  {player:'Kalif Raymond',team:'CHI',category:'receiving'}]}
 ]}};
const cfg={market,gameId,date,home:'ATL',away:'CHI'};

test('public compact view labels model tiers research-only without pretending to quote sportsbooks',()=>{
 const html=renderPublicCompactNflSgpCards(buildPublicCompactNflSgpCards(cfg));
 for(const tier of ['Small','Medium','Nuke'])assert.ok(html.includes(tier+' • RESEARCH ONLY'));
 assert.match(html,/NO VERIFIED COMBINED QUOTE/);
 assert.match(html,/model projections, not confirmed sportsbook lines/i);
 assert.doesNotMatch(html,/AI forecast|suggested comparison target|Exact sportsbook selection pending/i);
 assert.doesNotMatch(html,/Unavailable Player/);
});
test('TD research remains clearly unquoted and avoids invented touchdown probabilities',()=>{
 const html=renderPublicCompactNflSgpCards(buildPublicCompactNflSgpCards(cfg));
 assert.match(html,/D&#39;Andre Swift/);
 assert.match(html,/70.8 rushing yards\/game/);
 assert.match(html,/NO VERIFIED COMBINED QUOTE/);
 assert.doesNotMatch(html,/guaranteed touchdown|verified combined odds/i);
});
test('no numeric projections or cross-game selections can be invented',()=>{
 const m={...market,categories:{...market.categories,
  receiving:[{name:'Rome Odunze',team:'CHI',projection:null}]},
  sgps:{Analytics:[{risk:'Small',legs:[
   {player:'Rome Odunze',team:'CHI',category:'receiving'},
   {player:'Fake Player',team:'NYG',category:'rushing'}
  ]}]}};
 const result=buildPublicCompactNflSgpCards({...cfg,market:m});
 assert.equal(result.model.tiers[0].legs.length,0);
 assert.doesNotMatch(renderPublicCompactNflSgpCards(result),/Rome Odunze|Fake Player|0 receiving yards/);
 assert.match(renderPublicCompactNflSgpCards(
  buildPublicCompactNflSgpCards({...cfg,gameId:'401872998'})),/predictions will appear/);
});
test('escapes user-visible names and uses only actual production model data',()=>{
 const evil='<svg onload=alert(1)>';
 const m={...market,categories:{...market.categories,rushing:[p(evil,'ATL',75,71,'rushing')]},
  sgps:{Analytics:[{risk:'Small',legs:[
   {player:evil,team:'ATL',category:'rushing'},
   {player:'Rome Odunze',team:'CHI',category:'receiving'},
   {player:"D'Andre Swift",team:'CHI',category:'td'},
   {player:'Luther Burden III',team:'CHI',category:'receiving'}
  ]}]}};
 const html=renderPublicCompactNflSgpCards(buildPublicCompactNflSgpCards({...cfg,market:m}));
 assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<svg onload/);
});
test('only public /picks uses compact render; internal homepage retains detailed model board',()=>{
 const pub=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const prod=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(pub.includes('nfl-public-compact-sgp-bootstrap.js'));
 // The new customer presentation reads published signed game snapshots;
 // the compact helper is dormant and may not bypass that contract.
 assert.ok(pub.includes('modelResearchTiers'));
 assert.ok(pub.includes('verifiedBookParlays'));
 assert.ok(pub.includes('nflPublicTierMarketMixReady'));
 assert.ok(!pub.includes('if(publicCompact){'));
 assert.ok(!prod.includes('nfl-public-compact-sgp-bootstrap.js'));
 assert.ok(prod.includes('modelChoiceHtml+sgpYardageHtml'));
});
test('saved model predictions have a short provenance note',()=>{
 const html=renderPublicCompactNflSgpCards(buildPublicCompactNflSgpCards({...cfg,saved:true}));
 assert.match(html,/Previously saved predictions/);
 assert.doesNotMatch(html,/Sportsbook-issued combined quotes below/);
});

test('legacy compact renderer never displays partial tier names or unsupported numeric props',()=>{
 const incomplete={...market,sgps:{Analytics:[{
  risk:'Nuke',legs:[{player:'Bijan Robinson',team:'ATL',category:'rushing'},
   {player:'Rome Odunze',team:'CHI',category:'receiving'}]
 }]}};
 const out=renderPublicCompactNflSgpCards(buildPublicCompactNflSgpCards({...cfg,market:incomplete}));
 assert.match(out,/Nuke • NOT READY/);
 assert.doesNotMatch(out,/140 yards|Bijan Robinson|Rome Odunze/);
});
