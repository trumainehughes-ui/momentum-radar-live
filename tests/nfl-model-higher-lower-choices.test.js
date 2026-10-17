import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNflModelChoiceBoard,renderNflModelChoiceBoard,installNflModelChoiceInteractions}
 from '../lib/nfl-model-choice-board.js';

const gameId='401872999',date='2026-10-18';
const player=(name,team,category,projection,extras={})=>({
 name,team,position:category==='rushing'?'RB':'WR',projection,
 perGame:category==='rushing'?116:51,gamesPlayed:5,
 recentForm:{last5:[83,72,194,145,86],label:'STEADY'},
 reason:'Model projection based on opponent defense and usage.',...extras
});
const source={
 ok:true,scope:'game',gameId,date,fetchedAt:'2026-10-17T20:30:00Z',
 validation:{injuryEligibilityChecked:true,injuryEvidence:[
  {name:'Player Out',team:'CHI',status:'OUT'},
  {name:'Questionable Player',team:'CHI',status:'QUESTIONABLE'},
  {name:'Player IR',team:'ATL',status:'IR'}
 ]},
 categories:{
  rushing:[player('Bijan Robinson','ATL','rushing',115),
   player('Player Out','CHI','rushing',90),
   player('Player IR','ATL','rushing',80),
   player('Questionable Player','CHI','rushing',80)],
  receiving:[player('Rome Odunze','CHI','receiving',55),
   player('Off Game Player','NYG','receiving',100)],
  passing:[player('Unconfirmed QB','ATL','passing',220,{position:'QB'}),
   player('Confirmed QB','CHI','passing',235,{position:'QB',starterVerified:true})],
  receptions:[player('Luther Burden III','CHI','receptions',4.9)]
 },
 sgps:{Analytics:[
  {risk:'Small',legs:[
   {player:'Bijan Robinson',team:'ATL',category:'rushing'},
   {player:'Rome Odunze',team:'CHI',category:'receiving'},
   {player:'Player Out',team:'CHI',category:'rushing'},
   {player:'Player IR',team:'ATL',category:'rushing'}]},
  {risk:'Medium',legs:[
   {player:'Questionable Player',team:'CHI',category:'rushing'},
   {player:'Off Game Player',team:'NYG',category:'receiving'},
   {player:'Luther Burden III',team:'CHI',category:'receptions'},
   {player:'Unconfirmed QB',team:'ATL',category:'passing'},
   {player:'Confirmed QB',team:'CHI',category:'passing'}]}
 ]}
};
const opts={market:source,gameId,date,home:'ATL',away:'CHI'};
test('project model yardage choices even when no sportsbook market exists',()=>{
 const report=buildNflModelChoiceBoard(opts);
 assert.equal(report.status,'MODEL_PREDICTIONS_AVAILABLE');
 assert.deepEqual(report.rows.map(x=>x.name).sort(),
  ['Bijan Robinson','Rome Odunze','Luther Burden III','Confirmed QB'].sort());
 const bijan=report.rows.find(x=>x.name==='Bijan Robinson');
 assert.equal(bijan.projection,115);
 assert.equal(bijan.target,115);
 assert.equal(bijan.step,5);
 assert.equal(bijan.starterStatus,'ROLE_PROJECTION_NOT_CONFIRMED');
 assert.equal(report.combinedSgpQuoteVerified,false);
 assert.equal(report.sportsbookOddsVerified,false);
});
test('exclude officially OUT, IR, questionable, cross-game, and unconfirmed quarterback',()=>{
 const rows=buildNflModelChoiceBoard(opts).rows;
 for(const invalid of ['Player Out','Player IR','Questionable Player','Off Game Player','Unconfirmed QB'])
  assert.equal(rows.some(x=>x.name===invalid),false,invalid);
 assert.equal(rows.find(x=>x.name==='Confirmed QB').starterStatus,'CONFIRMED_STARTER');
});
test('stale model/game identity cannot be used to claim another matchup',()=>{
 for(const update of [
  {gameId:'401872998'},{date:'2026-10-20'},
  {home:'DEN'},{away:'ATL'},
  {market:{...source,scope:'slate'}},{market:{...source,ok:false}}
 ]){
  const result=buildNflModelChoiceBoard({...opts,...update});
  if(update.home||update.away)assert.equal(
   result.rows.some(x=>x.team==='CHI'&&update.away==='ATL'||
    x.team==='ATL'&&update.home==='DEN'),false);
  else assert.equal(result.rows.length,0);
 }
});
test('render forecast and user controls, never made-up odds/lines',()=>{
 const result=buildNflModelChoiceBoard(opts),html=renderNflModelChoiceBoard(result);
 assert.match(html,/AI forecast: 115 yards/);
 assert.match(html,/AI forecast: 55 yards/);
 assert.match(html,/official starter not confirmed/i);
 assert.match(html,/I favor higher/);
 assert.match(html,/I favor lower/);
 assert.match(html,/data-mr-adjust="-1"/);
 assert.match(html,/data-mr-adjust="1"/);
 assert.match(html,/comparison target is NOT a sportsbook-offered line/);
 assert.doesNotMatch(html,/(?:\+10000|\+2000|verified sportsbook quote)/i);
});
test('unsafe player supplied names are escaped and no fabricated predictions from bad values',()=>{
 const invalid={...source,categories:{...source.categories,
  rushing:[player('<img src=x onerror=alert(1)>','ATL','rushing',115),
   player('NaN Dude','ATL','rushing',null),
   player('Infinity Dude','ATL','rushing',Infinity),
   player('Safe Player','ATL','rushing',63)]},
  sgps:{Analytics:[{risk:'Small',legs:[
   {player:'<img src=x onerror=alert(1)>',team:'ATL',category:'rushing'},
   {player:'NaN Dude',team:'ATL',category:'rushing'},
   {player:'Infinity Dude',team:'ATL',category:'rushing'},
   {player:'Safe Player',team:'ATL',category:'rushing'}]}]}};
 const rows=buildNflModelChoiceBoard({...opts,market:invalid}).rows;
 assert.equal(rows.some(x=>x.name==='NaN Dude'),false);
 assert.equal(rows.some(x=>x.name==='Infinity Dude'),false);
 assert.equal(rows.find(x=>x.name==='Safe Player').target,65);
 const html=renderNflModelChoiceBoard({status:'MODEL_PREDICTIONS_AVAILABLE',rows,starterConfirmed:0});
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img src=x/);
});
test('both views show model predictions BEFORE empty sportsbook cards and allow local comparison',()=>{
 const prod=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const pub=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const boot=readFileSync(new URL('../nfl-model-choice-bootstrap.js',import.meta.url),'utf8');
 assert.ok(prod.includes('src="/nfl-model-choice-bootstrap.js"'));
 assert.ok(pub.includes('src="/nfl-model-choice-bootstrap.js"'));
 assert.ok(prod.includes('modelChoiceHtml+sgpYardageHtml+autoDkHtml+bookCaptureHtml'));
 assert.ok(prod.includes("$('#nflSGP').innerHTML=modelChoiceHtml+"));
 assert.ok(pub.includes('return modelChoiceHtml+tierYardageHtml+intro+staleNote+slips+verification'));
 assert.ok(boot.includes('installNflModelChoiceInteractions(document)'));
 assert.ok(boot.includes('buildNflModelChoiceBoard'));
});

test('higher/lower controls adjust the comparison without introducing a sportsbook bet',()=>{
 const handlers={};
 const root={addEventListener(type,fn){handlers[type]=fn}};
 installNflModelChoiceInteractions(root);
 const targetText={textContent:'115'},outcome={textContent:''};
 const yes={dataset:{mrDirection:'higher'},attributes:{},setAttribute(k,v){this.attributes[k]=v}};
 const no={dataset:{mrDirection:'lower'},attributes:{},setAttribute(k,v){this.attributes[k]=v}};
 const card={dataset:{mrStep:'5',mrProjection:'115',mrTarget:'115',mrUnit:'yards'},
  querySelector(q){return q==='[data-mr-target-label]'?targetText:outcome},
  querySelectorAll(){return [yes,no]}};
 const plus={dataset:{mrAdjust:'1'},closest(q){return q==='.mr-projection-choice'?card:q.startsWith('button[')?this:{}},
  hasAttribute(k){return k==='data-mr-adjust'}};
 const higher={dataset:{mrDirection:'higher'},closest(q){return q==='.mr-projection-choice'?card:q.startsWith('button[')?this:{}},
  hasAttribute(){return false}};
 handlers.click({target:plus});
 assert.equal(targetText.textContent,'120');
 assert.equal(card.dataset.mrTarget,'120');
 handlers.click({target:higher});
 assert.equal(yes.attributes['aria-pressed'],'true');
 assert.equal(no.attributes['aria-pressed'],'false');
 assert.match(outcome.textContent,/HIGHER than 120 yards/);
 assert.match(outcome.textContent,/5 yards above the AI forecast/);
 assert.match(outcome.textContent,/Personal comparison only/);
});
