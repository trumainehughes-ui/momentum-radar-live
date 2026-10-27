import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// The customer SGP view now uses game-scoped public modelResearchTiers and
// server-verified verifiedBookParlays. Legacy client-built/parlay fields are
// deliberately ignored. These tests assert the currently shipped contract.
const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const start=script.indexOf('function nflPublicTierCountReady(risk,legs){');
const end=script.indexOf('function offerHtml(x){',start);
assert.ok(start>0&&end>start,'current scoped SGP renderer is available');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const players=[
 ['Trevor Lawrence','JAX','passing',225],
 ['Bhayshul Tuten','JAX','rushing',75],
 ['Parker Washington','JAX','receiving',65],
 ['Brenton Strange','JAX','receptions',4],
 ['Woody Marks','HOU','td','Anytime TD'],
 ['C.J. Stroud','HOU','passing',255],
 ['Xavier Hutchinson','HOU','receiving',55]
];
const leg=i=>({player:players[i][0],team:players[i][1],
 category:players[i][2],target:players[i][3],
 projection:players[i][2]==='td'?null:players[i][3],
 projectionNote:'Based on usage, injury screening, and opponent matchup.'});
const tier=(risk,n)=>({risk,mode:'MODEL_RESEARCH',complete:true,requiredLegs:n,
 legs:Array.from({length:n},(_,i)=>leg(i))});
function base(extra={}){
 return {ok:true,date:'2026-10-18',gameId:'401872996',home:'JAX',away:'HOU',
  status:'CURRENT',updatedDataCurrent:true,updatedAt:new Date().toISOString(),
  modelResearchTiers:[tier('Small',4),tier('Medium',5),tier('Nuke',7)],
  verifiedBookParlays:[],...extra};
}
function render(data){
 const c={state:{date:'2026-10-18',selected:'401872996',currentBookSgpModel:null},
  esc,fmtStamp:()=> 'Recent snapshot',renderPublicBookResearch:()=>'<div>Unverified public research</div>',
  renderAutoRecheckStatus:()=>'',renderOdds:()=>'',sgpSelectionDisplay:()=>({label:'',target:''})};
 vm.runInNewContext(script.slice(start,end)+';this.draw=renderParlays;',c);
 return c.draw(data);
}
function bookSmall(overrides={}){
 const now=new Date().toISOString();
 return {book:'DraftKings',risk:'Small',mode:'VERIFIED_BOOK_SGP',
  combinedOddsVerified:true,americanOdds:2500,quotedAt:now,
  legs:Array.from({length:4},(_,i)=>({
   ...leg(i),bookOffer:{book:'DraftKings',attested:true,available:true,
    odds:-110,checkedAt:now,...(players[i][2]==='td'?{}:{line:players[i][3]})}
  })),...overrides};
}
test('public tiers show 4, 5, 7 distinct player-market research rows, never implied book odds',()=>{
 const html=render(base());
 assert.equal((html.match(/researched legs/g)||[]).length,3);
 assert.equal((html.match(/class="sgp-leg"/g)||[]).length,16);
 for(const risk of ['Small','Medium','Nuke'])assert.ok(html.includes('>'+risk+'</strong>'));
 for(const name of ['Trevor Lawrence','Parker Washington','Brenton Strange','Woody Marks'])
  assert.ok(html.includes(name),name);
 assert.match(html,/Why: Based on usage, injury screening/);
 assert.doesNotMatch(html,/\+2500 combined/);
 assert.match(html,/Model-only research/);
});
test('public card avoids technical score, probabilities, and inferred sportsbook lines',()=>{
 const html=render(base());
 for(const forbidden of ['Estimated hit probability','Heavy stats, explanatory history',
  'Long complex explanation','Model suggested sportsbook odds','AI forecast'])
  assert.ok(!html.includes(forbidden),forbidden);
 assert.match(html,/Player projections are not sportsbook-verified lines or combined odds/);
});
test('book research stays separate from bookmaker-issued quoted parlays',()=>{
 const html=render(base({verifiedBookParlays:[bookSmall()]}));
 assert.match(html,/DraftKings Same Game Parlays/);
 assert.match(html,/\+2500 combined/);
 assert.match(html,/FanDuel Same Game Parlays/);
 assert.match(html,/No complete FanDuel lineup/);
 assert.match(html,/NFL model research — not a sportsbook lineup/);
});
test('verified combined sportsbook price needs a fresh quote and every attested same-book leg',()=>{
 const old=new Date(Date.now()-16*60*1000).toISOString();
 const bad=bookSmall();bad.legs[0].bookOffer.attested=false;
 assert.doesNotMatch(render(base({verifiedBookParlays:[bad]})),/\+2500 combined/);
 const mismatched=bookSmall();mismatched.legs[1].bookOffer.book='FanDuel';
 assert.doesNotMatch(render(base({verifiedBookParlays:[mismatched]})),/\+2500 combined/);
 assert.doesNotMatch(render(base({verifiedBookParlays:[bookSmall({quotedAt:old})]})),/\+2500 combined/);
 assert.doesNotMatch(render(base({verifiedQuotes:[{book:'DraftKings',americanOdds:2500}]})),/\+2500 combined/);
});
test('complete quoted SGP is withheld for wrong-game, old or malformed snapshot',()=>{
 for(const item of [{gameId:'401872998'},{date:'2026-10-19'},
  {status:'LAST_SAVED',updatedDataCurrent:false},
  {updatedAt:new Date(Date.now()-16*60*1000).toISOString()}]){
  const html=render(base({...item,verifiedBookParlays:[bookSmall()]}));
  assert.match(html,/NOT READY/);
  assert.doesNotMatch(html,/\+2500 combined|Trevor Lawrence/);
 }
});
test('HTML-escaped names can show in complete model research without injecting markup',()=>{
 const t=tier('Small',4);t.legs[0].player='<img src=x onerror=alert(1)>';
 const html=render(base({modelResearchTiers:[t]}));
 assert.match(html,/&lt;img src=x/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.doesNotThrow(()=>new vm.Script(script));
});
test('mobile slips maintain readable single-column layout',()=>{
 assert.ok(page.includes('.sgp-leg-name{'));
 assert.ok(page.includes('font-size:16px'));
 assert.ok(page.includes('@media(max-width:570px){.sgp-slips{grid-template-columns:minmax(0,1fr)'));
});
test('saved older snapshot cannot show historic selections as current bets',()=>{
 const html=render(base({status:'LAST_SAVED',updatedDataCurrent:false,
  verifiedBookParlays:[bookSmall()]}));
 assert.match(html,/Previously saved predictions are expired/);
 assert.doesNotMatch(html,/<ol class="sgp-leg-list">|\+2500 combined/);
});
test('incomplete and all-touchdown tiers show NOT READY without leaking player picks',()=>{
 const short=tier('Nuke',7);short.legs=short.legs.slice(0,2);
 const allTd=tier('Small',4);allTd.legs=allTd.legs.map(l=>({...l,category:'td'}));
 const html=render(base({modelResearchTiers:[short,allTd]}));
 assert.match(html,/Nuke · NOT READY/);
 assert.match(html,/Small · NOT READY/);
 // The separate player matchup forecast may still render its own list.
 // Invalid Small/Nuke tier cards themselves must never contain a leg list.
 for(const risk of ['Small','Nuke']){
  const section=html.match(new RegExp('<section class="sgp-slip" aria-label="'+risk+' incomplete research"[\\s\\S]*?<\\/section>'))?.[0];
  assert.ok(section,risk+' incomplete card');
  assert.doesNotMatch(section,/<ol class="sgp-leg-list">/);
 }
});

test('public tier composition accepts rushing and receiving without a passing market',()=>{
 const start=script.indexOf('function nflPublicTierCountReady(risk,legs){');
 const end=script.indexOf('function nflPublicTierPriceReady(risk,odds){',start);
 assert.ok(start>=0&&end>start);
 const context={};
 vm.runInNewContext(script.slice(start,end)+';this.ready=nflPublicTierMarketMixReady;',context);
 const legs=[
  {player:'Runner A',team:'A',category:'rushing'},
  {player:'Receiver B',team:'B',category:'receiving'},
  {player:'Receiver C',team:'A',category:'receptions'},
  {player:'Runner D',team:'B',category:'td'}
 ];
 assert.equal(context.ready('Small',legs),true);
 assert.equal(context.ready('Small',legs.map(x=>({...x,category:'receiving'}))),false);
});
