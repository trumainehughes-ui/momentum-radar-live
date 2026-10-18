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
test('renders Small / Medium / Nuke with 4/5/7 clear leg rows and exact targets',()=>{
 const html=setup().sgps(picks);
 assert.equal((html.match(/class="sgp-slip"/g)||[]).length,3);
 assert.equal((html.match(/class="sgp-leg"/g)||[]).length,16);
 for(const risk of ['Small','Medium','Nuke'])assert.ok(html.includes('>'+risk+'</strong>'));
 for(const expected of ['Trevor Lawrence','Passing yards','170+',
  'Xavier Hutchinson','Receiving yards','30+','Parker Washington',
  'Anytime touchdown','Score a TD','Brenton Strange','Receptions','2+',
  'Bhayshul Tuten','Rushing yards','60+','C.J. Stroud','310+'])
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
 assert.ok(html.includes('<details class="sgp-research-details">'));
 assert.ok(html.includes('<summary>Public sportsbook price research (optional)</summary>'));
 assert.ok(!html.includes('<details class="sgp-research-details" open'));
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
test('escapes user-controlled player names rather than injecting HTML',()=>{
 const html=setup().sgps({...picks,parlays:[{risk:'Small',mode:'MODEL_ONLY',
  legs:[leg('<img src=x onerror=alert(1)>','passing','170+ yards'),
   leg('Test Player','td','Anytime TD')]}]});
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

test('older saved NFL game still shows all Small, Medium and Nuke model slips rather than a false empty message',()=>{
 const snapshot={...picks,status:'LAST_SAVED',updatedDataCurrent:false,
  inactivesVerified:false,verifiedQuotes:[],
  parlays:picks.parlays.map(x=>({...x,mode:'STALE_MODEL_ONLY',outdated:true}))};
 const html=setup().sgps(snapshot);
 assert.equal((html.match(/class="sgp-slip"/g)||[]).length,3);
 assert.equal((html.match(/class="sgp-leg"/g)||[]).length,16);
 for(const risk of ['Small','Medium','Nuke'])assert.ok(html.includes('>'+risk+'</strong>'));
 assert.ok(html.includes('Needs refresh · Saved model selections'));
 assert.equal((html.match(/Needs refresh<\/span>/g)||[]).length,3);
 assert.ok(html.includes('Trevor Lawrence'));
 assert.ok(html.includes('Parker Washington'));
 assert.ok(!html.includes('No model parlay selections are available'));
 assert.ok(!html.includes('BOOK QUOTE'));
 assert.equal((html.match(/Model picks only/g)||[]).length,1);
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
 assert.ok(html.includes('No complete model SGP tier was generated'));
 assert.ok(!html.includes('sgp-leg-name'));
});
