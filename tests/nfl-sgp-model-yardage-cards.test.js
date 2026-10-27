import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNflProjectedSgpTierDetails,renderNflProjectedSgpTierDetails}
 from '../lib/nfl-sgp-model-yardage-cards.js';
const date='2026-10-18',gameId='401872999';
const pl=(name,team,category,projection,position='RB')=>({name,team,position,projection,gamesPlayed:5});
const market={ok:true,scope:'game',gameId,date,
 validation:{injuryEvidence:[
  {name:'Held Player',team:'ATL',status:'OUT'},
  {name:'IR Player',team:'CHI',status:'IR'}]},
 categories:{
  rushing:[pl('Bijan Robinson','ATL','rushing',115),pl("D'Andre Swift",'CHI','rushing',70),
   pl('Brian Robinson Jr.','ATL','rushing',40),pl('Held Player','ATL','rushing',100)],
  receiving:[pl('Rome Odunze','CHI','receiving',55,'WR'),
   pl('Luther Burden III','CHI','receiving',55,'WR'),
   pl('Kalif Raymond','CHI','receiving',45,'WR'),
   pl('Bijan Robinson','ATL','receiving',30),
   pl("D'Andre Swift",'CHI','receiving',25),
   pl('IR Player','CHI','receiving',55,'WR')],
  receptions:[pl('Rome Odunze','CHI','receptions',3.6,'WR'),pl('Bijan Robinson','ATL','receptions',3.5)],
  passing:[pl('Unconfirmed QB','ATL','passing',240,'QB')]
 },
 sgps:{Analytics:[
  {risk:'Small',legs:[{player:'Rome Odunze',team:'CHI',category:'receiving'},
   {player:'Bijan Robinson',team:'ATL',category:'rushing'},
   {player:"D'Andre Swift",team:'CHI',category:'td'}]},
  {risk:'Medium',legs:[{player:'Luther Burden III',team:'CHI',category:'receiving'},
   {player:'Brian Robinson Jr.',team:'ATL',category:'rushing'},
   {player:'Kalif Raymond',team:'CHI',category:'receiving'},
   {player:'Bijan Robinson',team:'ATL',category:'td'}]},
  {risk:'Nuke',legs:[{player:'Kalif Raymond',team:'CHI',category:'receiving'},
   {player:'Bijan Robinson',team:'ATL',category:'rushing'},
   {player:'Rome Odunze',team:'CHI',category:'receiving'},
   {player:"D'Andre Swift",team:'CHI',category:'td'}]}
 ]}};
const ctx={market,gameId,date,home:'ATL',away:'CHI'};
test('all pictured SGP players receive current-game numeric AI yardage forecasts',()=>{
 const r=buildNflProjectedSgpTierDetails(ctx);
 assert.equal(r.status,'MODEL_PROJECTED_TIERS');
 assert.deepEqual(r.tiers.map(t=>t.legs.length),[3,4,4]);
 const small=r.tiers[0];
 assert.equal(small.legs.find(l=>l.name==='Rome Odunze').mainProjection,55);
 assert.equal(small.legs.find(l=>l.name==='Bijan Robinson').mainProjection,115);
 const swift=small.legs.find(l=>l.name==="D'Andre Swift");
 assert.equal(swift.tdModelCandidate,true);
 assert.deepEqual(swift.projections.map(x=>[x.category,x.projection]),
  [['rushing',70],['receiving',25]]);
 const med=r.tiers[1];
 assert.equal(med.legs.find(x=>x.name==='Luther Burden III').mainProjection,55);
 assert.equal(med.legs.find(x=>x.name==='Brian Robinson Jr.').mainProjection,40);
 assert.equal(med.legs.find(x=>x.name==='Kalif Raymond').mainProjection,45);
 const bijan=med.legs.find(x=>x.name==='Bijan Robinson');
 assert.equal(bijan.tdModelCandidate,true);
 assert.deepEqual(bijan.projections.filter(x=>x.category!=='receptions').map(x=>[x.category,x.projection]),
  [['rushing',115],['receiving',30]]);
});
test('small/medium/nuke comparison targets change with risk, never claim real sportsbook quotes',()=>{
 const r=buildNflProjectedSgpTierDetails(ctx);
 const p=r.tiers.map(t=>t.legs.find(l=>l.name==='Bijan Robinson'));
 assert.equal(p[0].mainTarget,90);
 assert.equal(p[1].mainTarget,null); // TD candidate; yardage still shown in outlook
 assert.equal(p[2].mainTarget,140);
 assert.equal(r.bookmakerSgpQuoteVerified,false);
 assert.ok(r.tiers.every(t=>t.bookmakerSgpQuoteVerified===false));
 const html=renderNflProjectedSgpTierDetails(r);
 assert.match(html,/Small • NOT READY/);
 assert.match(html,/Medium • NOT READY/);
 assert.match(html,/Nuke • NOT READY/);
 assert.doesNotMatch(html,/AI Rushing forecast: 115 yards/);
 assert.doesNotMatch(html,/Small suggested comparison target/);
 assert.doesNotMatch(html,/Nuke suggested comparison target/);
 assert.doesNotMatch(html,/Anytime touchdown • model candidate only/);
 assert.doesNotMatch(html,/Actual combined odds/);
 assert.equal(r.tiers.every(t=>t.compositionComplete===false),true);
});
test('wrong game, wrong team, injury-held, unconfirmed QB excluded without invented numbers',()=>{
 for(const v of [{gameId:'401872998'},{date:'2026-10-20'},{home:'NYG'}])
  assert.equal(buildNflProjectedSgpTierDetails({...ctx,...v}).tiers.length,
   v.home?3:0);
 const bad={...market,sgps:{Analytics:[{risk:'Small',legs:[
  {player:'Held Player',team:'ATL',category:'rushing'},
  {player:'IR Player',team:'CHI',category:'receiving'},
  {player:'Unconfirmed QB',team:'ATL',category:'passing'},
  {player:'Off Game',team:'NYG',category:'rushing'},
  {player:'Rome Odunze',team:'CHI',category:'receiving'}
 ]}]}};
 const tier=buildNflProjectedSgpTierDetails({...ctx,market:bad}).tiers[0];
 assert.deepEqual(tier.legs.map(x=>x.name),['Rome Odunze']);
 assert.equal(tier.held.length,3);
});
test('missing valid projection does not show 0 or invent a bettable alternative',()=>{
 const m={...market,categories:{...market.categories,
  receiving:[{name:'Rome Odunze',team:'CHI',projection:null,position:'WR'}]}};
 const r=buildNflProjectedSgpTierDetails({...ctx,market:m});
 assert.equal(r.tiers[0].legs.some(x=>x.name==='Rome Odunze'),false);
 const html=renderNflProjectedSgpTierDetails(r);
 assert.doesNotMatch(html,/Rome Odunze.*AI Receiving forecast: 0 yards/);
});
test('unsafe names are HTML escaped',()=>{
 const evil='<img src=x onerror=alert(1)>';
 const m={...market,categories:{...market.categories,
  rushing:[pl(evil,'ATL','rushing',55)]},
 sgps:{Analytics:[{risk:'Small',legs:[{player:evil,team:'ATL',category:'rushing'}]}]}};
 const html=renderNflProjectedSgpTierDetails(buildNflProjectedSgpTierDetails({...ctx,market:m}));
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/Small • NOT READY/);
 assert.doesNotMatch(html,/&lt;img src=x/);
});
test('both owner and public matchup views now show tier yardage, not empty exact-line pending cards',()=>{
 const main=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const publicHtml=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(main.includes('nfl-sgp-model-yardage-bootstrap.js'));
 assert.ok(publicHtml.includes('nfl-sgp-model-yardage-bootstrap.js'));
 assert.ok(main.includes('const tiersHtml=sgpYardageHtml'));
 assert.ok(main.includes('modelChoiceHtml+sgpYardageHtml+autoDkHtml'));
 assert.ok(publicHtml.includes('modelChoiceHtml+tierYardageHtml+intro'));
 assert.ok(!main.includes('Exact sportsbook selection pending'));
});

test('screenshot case: two receiving projections never render as a completed Nuke',()=>{
 const m={...market,categories:{...market.categories,receiving:[
  pl('Parker Washington','CHI','receiving',75,'WR'),
  pl('Brenton Strange','CHI','receiving',45,'TE')]},
  sgps:{Analytics:[{risk:'Nuke',legs:[
   {player:'Parker Washington',team:'CHI',category:'receiving'},
   {player:'Brenton Strange',team:'CHI',category:'receiving'}]
  }]}};
 const details=buildNflProjectedSgpTierDetails({...ctx,market:m});
 const nuke=details.tiers.find(t=>t.risk==='Nuke');
 assert.equal(nuke.legs.length,2);
 assert.equal(nuke.compositionComplete,false);
 const html=renderNflProjectedSgpTierDetails(details);
 assert.match(html,/Nuke • NOT READY/);
 assert.match(html,/2 eligible model selections/);
 assert.match(html,/Nuke requires 5–7/);
 assert.doesNotMatch(html,/Nuke • AI yardage projection candidates/);
 assert.doesNotMatch(html,/Parker Washington/);
 assert.doesNotMatch(html,/Brenton Strange/);
 assert.doesNotMatch(html,/\+10000 combined/);
});
test('Nuke model rendering requires 5–7 valid diversified markets, not just five players',()=>{
 const m={...market,sgps:{Analytics:[{risk:'Nuke',legs:[
   {player:'Rome Odunze',team:'CHI',category:'receiving'},
   {player:'Luther Burden III',team:'CHI',category:'receiving'},
   {player:'Kalif Raymond',team:'CHI',category:'receiving'},
   {player:'IR Player',team:'CHI',category:'receiving'},
   {player:'Bijan Robinson',team:'ATL',category:'receiving'}
 ]}]}};
 const details=buildNflProjectedSgpTierDetails({...ctx,market:m});
 assert.equal(details.tiers[0].compositionComplete,false);
 assert.match(renderNflProjectedSgpTierDetails(details),/Nuke • NOT READY/);
});

test('overlapping Small and Medium AI forecasts are withheld rather than presented as differentiated tiers',()=>{
 const m={...market,sgps:{Analytics:[
 {risk:'Small',legs:[
  {player:'Rome Odunze',team:'CHI',category:'receiving'},
  {player:'Bijan Robinson',team:'ATL',category:'rushing'},
  {player:'Rome Odunze',team:'CHI',category:'receptions'},
  {player:"D'Andre Swift",team:'CHI',category:'td'}]},
 {risk:'Medium',legs:[
  {player:'Rome Odunze',team:'CHI',category:'receiving'},
  {player:'Bijan Robinson',team:'ATL',category:'rushing'},
  {player:'Luther Burden III',team:'CHI',category:'receiving'},
  {player:'Rome Odunze',team:'CHI',category:'receptions'},
  {player:"D'Andre Swift",team:'CHI',category:'td'}]}
 ]}};
 const result=buildNflProjectedSgpTierDetails({...ctx,market:m});
 assert.deepEqual(result.tiers.map(x=>x.compositionComplete),[false,false]);
 assert.equal(result.tiers[1].differentiated,false);
 const html=renderNflProjectedSgpTierDetails(result);
 assert.match(html,/Small • NOT READY/);
 assert.match(html,/Medium • NOT READY/);
 assert.doesNotMatch(html,/Small • AI yardage projection candidates/);
 assert.doesNotMatch(html,/Medium • AI yardage projection candidates/);
 assert.doesNotMatch(html,/Actual combined odds/);
});
