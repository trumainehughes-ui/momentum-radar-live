import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const first=script.indexOf('function sgpSelectionDisplay(l){');
const last=script.indexOf('function offerHtml(x){',first);
assert.ok(first>0&&last>first,'SGP renderer is available');
const snippet=script.slice(first,last);
function setup(){
 const context={
  state:{recheckLoading:false,recheckStatus:null},
  fmtStamp:()=> 'Updated Oct 17, 1:30 AM',
  esc:v=>String(v??'').replace(/[&<>"']/g,s=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[s]),
  renderPublicBookResearch:()=>'<div>Public odds detail</div>',
  renderOdds:q=>'<div>BOOK QUOTE '+q[0]?.americanOdds+'</div>',
  URL,
  publicWhy:(_leg,cat)=>cat==='td'?'Scoring opportunity evidence.':'Market-specific matchup evidence.'
 };
 vm.runInNewContext(snippet+';this.sgps=renderParlays;this.prop=sgpSelectionDisplay;',context);
 return context;
}
const leg=(player,category,target,extra={})=>({
 player,category,target,hitProbabilityPct:99,projectionNote:'Heavy stats, explanatory history',
 ...extra
});
const picks={verifiedQuotes:[],inactivesVerified:false,updatedDataCurrent:false,
 parlays:[
  {risk:'Small',mode:'MODEL_ONLY',legCount:4,explanation:'Long complex explanation',
   legs:[leg('Trevor Lawrence','passing','170+ yards'),
    leg('Xavier Hutchinson','receiving','30+ yards'),
    leg('Parker Washington','td','Anytime TD'),
    leg('Brenton Strange','receptions','2+ receptions')]},
  {risk:'Medium',mode:'MODEL_ONLY',legCount:5,legs:[
   leg('Bhayshul Tuten','rushing','60+ yards'),
   leg('C.J. Stroud','passing','255+ yards'),
   leg('Trevor Lawrence','passing','215+ yards'),
   leg('Parker Washington','td','Anytime TD'),
   leg('Xavier Hutchinson','receptions','2+ receptions')]},
  {risk:'Nuke',mode:'MODEL_ONLY',legCount:7,legs:[
   leg('Brenton Strange','receiving','60+ yards'),
   leg('Woody Marks','receiving','40+ yards'),
   leg('Parker Washington','receiving','85+ yards'),
   leg('Bhayshul Tuten','td','Anytime TD'),
   leg('Brian Thomas Jr.','receptions','3+ receptions'),
   leg('C.J. Stroud','passing','310+ yards'),
   leg('Jakobi Meyers','receptions','4+ receptions')]}
 ]};
test('rejects model-only legs that have no verified sportsbook offers',()=>{
 const html=setup().sgps(picks);
 assert.equal((html.match(/class="sgp-slip"/g)||[]).length,0);
 assert.ok(html.includes('SGP selections are being refreshed'));
 assert.ok(html.includes('Combined sportsbook odds and player lines are not verified'));
});
const verifiedLeg=(player,team,category,target)=>leg(player,category,target,{
 team,bookOffer:{available:true,book:'DraftKings',line:category==='td'?null:target,
  odds:-110,checkedAt:new Date().toISOString(),
  sourceUrl:'https://sportsbook.draftkings.com/'}
});
const verifiedPicks={
 home:'JAX',away:'HOU',status:'CURRENT',updatedDataCurrent:true,
 inactivesVerified:false,verifiedQuotes:[],
 researchParlays:['Small','Medium','Nuke'].map(risk=>({
  risk,mode:'MODEL_ONLY',researchFromCurrentMarkets:true,
  legs:[verifiedLeg('Trevor Lawrence','JAX','passing',170),
   verifiedLeg('Parker Washington','JAX','td','Anytime TD'),
   verifiedLeg('Parker Washington','JAX','receiving',45)]
 }))
};
test('renders each verified player market separately in all three tiers',()=>{
 const html=setup().sgps(verifiedPicks);
 assert.equal((html.match(/class="sgp-slip"/g)||[]).length,3);
 assert.equal((html.match(/class="sgp-leg"/g)||[]).length,9);
 assert.equal((html.match(/class="sgp-leg-why"/g)||[]).length,9);
 assert.equal((html.match(/Parker Washington/g)||[]).length,6);
 for(const expected of ['Passing yards','170+','Receiving yards','45+',
  'Anytime touchdown','Score a TD','Small','Medium','Nuke'])
  assert.ok(html.includes(expected),expected);
});
test('suppresses confidence, model narration and repeated verification paragraphs',()=>{
 const html=setup().sgps(picks);
 for(const removed of ['Estimated hit probability','uncalibrated model',
  'Long complex explanation','Heavy stats, explanatory history',
  'No sportsbook-verified parlays available yet','Sportsbook verification pending.'])
  assert.ok(!html.includes(removed),removed);
 assert.equal((html.match(/Model picks only/g)||[]).length,1);
 assert.ok(html.includes('Combined sportsbook odds and player lines are not verified'));
});
test('public bookmaker details stay available but are collapsed until requested',()=>{
 const html=setup().sgps(picks);
 assert.ok(html.includes('<section class="sgp-research-details"'));
 assert.ok(html.includes('Public DraftKings and FanDuel player odds'));
 assert.ok(!html.includes(' class="sgp-research-details" open'));
 assert.ok(html.includes('Public odds detail'));
});
test('already-authenticated combined sportsbook quote remains distinct and visible',()=>{
 const html=setup().sgps({...picks,verifiedQuotes:[{
  book:'DraftKings',risk:'Small',americanOdds:2500
 }],inactivesVerified:true,updatedDataCurrent:true});
 assert.ok(html.includes('BOOK QUOTE 2500'));
 assert.ok(html.includes('Sportsbook-issued combined quotes'));
 assert.ok(!html.includes('Model picks only'));
});
test('escapes untrusted names inside a verified selection',()=>{
 const payload=verifiedLeg('<img src=x onerror=alert(1)>','JAX','passing',170);
 const html=setup().sgps({...verifiedPicks,researchParlays:[{
  risk:'Small',mode:'MODEL_ONLY',researchFromCurrentMarkets:true,
  legs:[payload,verifiedLeg('Parker Washington','JAX','td','Anytime TD'),
   verifiedLeg('Trevor Lawrence','JAX','passing',170)]}]});
 assert.ok(html.includes('&lt;img'));
 assert.ok(!html.includes('<img'));
 assert.doesNotThrow(()=>new vm.Script(script));
});
test('public SGP styling allows a readable single-column phone layout',()=>{
 assert.ok(page.includes('.sgp-leg-name{'));
 assert.ok(page.includes('font-size:16px'));
 assert.ok(page.includes('@media(max-width:570px){.sgp-slips{grid-template-columns:minmax(0,1fr)'));
 assert.ok(page.includes('Simple player and prop selections'));
});

test('saved unverified NFL models cannot be promoted into current sportsbook slips',()=>{
 const html=setup().sgps({...picks,status:'LAST_SAVED',
  parlays:picks.parlays.map(x=>({...x,mode:'STALE_MODEL_ONLY',outdated:true}))});
 assert.equal((html.match(/class="sgp-slip"/g)||[]).length,0);
 assert.ok(html.includes('SGP selections are being refreshed'));
 assert.ok(!html.includes('BOOK QUOTE'));
});
test('stale game cannot display a purported verified combined price even if quote metadata leaks through',()=>{
 const snapshot={...picks,status:'LAST_SAVED',updatedDataCurrent:false,
  inactivesVerified:true,verifiedQuotes:[{book:'DraftKings',risk:'Small',americanOdds:2000}],
  parlays:picks.parlays.map(x=>({...x,mode:'STALE_MODEL_ONLY',outdated:true}))};
 const html=setup().sgps(snapshot);
 assert.ok(!html.includes('BOOK QUOTE'));
 assert.ok(html.includes('Combined sportsbook odds and player lines are not verified'));
});
test('unknown or malformed model candidate remains hidden rather than being promoted by individual market price',()=>{
 const snapshot={...picks,status:'CURRENT',updatedDataCurrent:true,
  parlays:[{risk:'Small',mode:'UNVERIFIED_INDIVIDUAL_MARKET',
    legs:[leg('Test Player','td','Anytime TD'),leg('Second Player','td','Anytime TD')]},
   {risk:'Medium',mode:'MODEL_ONLY',
    legs:[leg('Player One','td','Anytime TD'),{player:'Broken'}]}]};
 const html=setup().sgps(snapshot);
 assert.ok(html.includes('SGP selections are being refreshed'));
 assert.ok(!html.includes('sgp-leg-name'));
});
