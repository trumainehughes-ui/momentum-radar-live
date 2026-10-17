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
  {player:'Unavailable Player',team:'ATL',category:'rushing'}]},
 {risk:'Medium',legs:[{player:'Luther Burden III',team:'CHI',category:'receiving'},
  {player:'Bijan Robinson',team:'ATL',category:'td'}]},
 {risk:'Nuke',legs:[{player:'Bijan Robinson',team:'ATL',category:'rushing'},
  {player:'Rome Odunze',team:'CHI',category:'receiving'},
  {player:"D'Andre Swift",team:'CHI',category:'td'}]}
 ]}};
const cfg={market,gameId,date,home:'ATL',away:'CHI'};

test('public Small Medium Nuke display only name category projected yardage and brief why',()=>{
 const html=renderPublicCompactNflSgpCards(buildPublicCompactNflSgpCards(cfg));
 assert.match(html,/>Small<\/h3>/);
 assert.match(html,/>Medium<\/h3>/);
 assert.match(html,/>Nuke<\/h3>/);
 assert.match(html,/Rome Odunze/);
 assert.match(html,/Bijan Robinson/);
 assert.match(html,/Rushing yards<\/span><strong>90 yards/); // Small comparison target
 assert.match(html,/Rushing yards<\/span><strong>140 yards/); // Nuke comparison target
 assert.match(html,/Receiving yards<\/span><strong>45 yards/);
 assert.match(html,/Anytime TD<\/span><strong>70 rushing · 25 receiving yards/);
 assert.match(html,/<b>Why:<\/b>.*116 yards\/game over 5 games/);
 assert.match(html,/ranks #23 most rushing allowed to running backs/);
 assert.doesNotMatch(html,/AI forecast|suggested comparison target|Player yardage outlook|Starter unconfirmed|Matchup &amp; SGP risk audit/i);
 assert.doesNotMatch(html,/data-mr-direction|I favor higher|I favor lower|Exact sportsbook selection pending/);
 assert.doesNotMatch(html,/Unavailable Player/);
 assert.match(html,/Model targets, not confirmed sportsbook lines/);
});
test('TD reason uses grounded usage without inventing touchdown probability or quote',()=>{
 const html=renderPublicCompactNflSgpCards(buildPublicCompactNflSgpCards(cfg));
 assert.match(html,/D&#39;Andre Swift/);
 assert.match(html,/70.8 rushing yards\/game/);
 assert.doesNotMatch(html,/\+2000|guaranteed touchdown|verified combined odds/i);
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
  sgps:{Analytics:[{risk:'Small',legs:[{player:evil,team:'ATL',category:'rushing'}]}]}};
 const html=renderPublicCompactNflSgpCards(buildPublicCompactNflSgpCards({...cfg,market:m}));
 assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<svg onload/);
});
test('only public /picks uses compact render; internal homepage retains detailed model board',()=>{
 const pub=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const prod=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(pub.includes('nfl-public-compact-sgp-bootstrap.js'));
 assert.ok(pub.includes('window.momentumPublicCompactNflSgp'));
 assert.ok(pub.indexOf('if(publicCompact){')<pub.indexOf('return modelChoiceHtml+tierYardageHtml+intro+'));
 assert.ok(!prod.includes('nfl-public-compact-sgp-bootstrap.js'));
 assert.ok(prod.includes('modelChoiceHtml+sgpYardageHtml'));
});
test('saved model predictions have a short provenance note',()=>{
 const html=renderPublicCompactNflSgpCards(buildPublicCompactNflSgpCards({...cfg,saved:true}));
 assert.match(html,/Previously saved predictions/);
 assert.doesNotMatch(html,/Sportsbook-issued combined quotes below/);
});
