import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const first=script.indexOf('function nflPublicTierCountReady(risk,legs){');
const end=script.indexOf('function offerHtml(x){',first);
assert.ok(first>0&&end>first);
const code=script.slice(first,end);
const now=new Date().toISOString();
const escape=x=>String(x??'').replace(/[&<>"']/g,k=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
const players=[
 ['Starter Quarterback','ATL','passing',225],
 ['Starter Runner','CHI','rushing',75],
 ['Starter Receiver','ATL','receiving',65],
 ['Starter Scorer','CHI','td','Anytime TD'],
 ['Starter Catcher','ATL','receptions',4],
 ['Additional Receiver','CHI','receiving',50],
 ['Additional Runner','ATL','rushing',45]
];
const l=(i)=>({player:players[i][0],team:players[i][1],category:players[i][2],
 target:players[i][3],projection:players[i][2]==='td'?null:players[i][3],
 projectionNote:'AI matchup and recent player usage.'});
const tier=(risk,n)=>({risk,mode:'MODEL_RESEARCH',
 requiredLegs:n,complete:true,legs:Array.from({length:n},(_,i)=>l(i))});
const snapshot=(extra={})=>({ok:true,date:'2026-10-18',gameId:'401872999',
 status:'CURRENT',updatedAt:now,updatedDataCurrent:true,home:'ATL',away:'CHI',
 modelResearchTiers:[tier('Small',4),tier('Medium',5),tier('Nuke',5)],
 verifiedBookParlays:[],...extra});
function render(d){
 const context={state:{date:'2026-10-18',selected:'401872999',currentBookSgpModel:null},
 fmtStamp:()=> 'Oct 18, current',esc:escape,renderPublicBookResearch:()=>'<p>Research</p>',
 renderOdds:()=>'',renderAutoRecheckStatus:()=>'',sgpSelectionDisplay:()=>({label:'',target:''})};
 vm.runInNewContext(code+';this.render=renderParlays;',context);
 return context.render(d);
}
const bookCard=(opts={})=>({book:'DraftKings',risk:'Small',mode:'VERIFIED_BOOK_SGP',
 combinedOddsVerified:true,americanOdds:2500,quotedAt:now,
 legs:Array.from({length:4},(_,i)=>({...l(i),
 bookOffer:{book:'DraftKings',attested:true,available:true,odds:-115,
 checkedAt:now,...(players[i][2]==='td'?{}:{line:players[i][3]})}})),...opts});
test('current published NFL tier research remains clearly model-only and includes brief AI explanations',()=>{
 const out=render(snapshot());
 assert.equal((out.match(/researched legs/g)||[]).length,3);
 assert.match(out,/Starter Quarterback/);
 assert.match(out,/AI matchup and recent player usage/);
 assert.match(out,/NFL model research — not a sportsbook lineup/);
 assert.doesNotMatch(out,/\+2500 combined/);
});
test('official attested same-game quote displays only within current snapshot and fresh individual offers',()=>{
 const out=render(snapshot({verifiedBookParlays:[bookCard()]}));
 assert.match(out,/DraftKings Same Game Parlays/);
 assert.match(out,/\+2500 combined/);
 assert.match(out,/Official game-day inactives are not final/);
 const staleQuote=new Date(Date.now()-16*60*1000).toISOString();
 assert.doesNotMatch(render(snapshot({verifiedBookParlays:[bookCard({quotedAt:staleQuote})]})),/\+2500 combined/);
 const oldOffers=bookCard();oldOffers.legs[0].bookOffer.checkedAt=staleQuote;
 assert.doesNotMatch(render(snapshot({verifiedBookParlays:[oldOffers]})),/\+2500 combined/);
});
test('even authenticated quotes are suppressed for stale or cross-game data',()=>{
 for(const patch of [
  {gameId:'401872998'}, {date:'2026-10-19'},
  {status:'LAST_SAVED',updatedDataCurrent:false},
  {updatedAt:new Date(Date.now()-16*60*1000).toISOString()}
 ]){
  const out=render(snapshot({...patch,verifiedBookParlays:[bookCard()]}));
  assert.match(out,/NOT READY/);
  assert.doesNotMatch(out,/\+2500 combined/);
  assert.doesNotMatch(out,/Starter Quarterback/);
 }
});
test('non-confirmed individual offers cannot create a correlated bettable slip',()=>{
 const notAttested=bookCard();notAttested.legs[0].bookOffer.attested=false;
 assert.doesNotMatch(render(snapshot({verifiedBookParlays:[notAttested]})),/\+2500 combined/);
 const wrongBook=bookCard();wrongBook.legs[1].bookOffer.book='FanDuel';
 assert.doesNotMatch(render(snapshot({verifiedBookParlays:[wrongBook]})),/\+2500 combined/);
 const fakeOnly={...snapshot(),verifiedQuotes:[{book:'DraftKings',risk:'Small',americanOdds:2500}]};
 assert.doesNotMatch(render(fakeOnly),/\+2500 combined/);
});
test('public NFL renderer escapes player names and rejects incomplete and all-TD SGP lineups',()=>{
 const incomplete=tier('Nuke',3);incomplete.complete=true;
 const allTd=tier('Small',4);allTd.legs=allTd.legs.map(x=>({...x,category:'td'}));
 const broken=render(snapshot({modelResearchTiers:[incomplete,allTd]}));
 assert.match(broken,/Nuke · NOT READY/);
 assert.match(broken,/Small · NOT READY/);
 const evil=tier('Small',4);
 evil.legs[0].player='<img src=x onerror=alert(1)>';
 const clean=render(snapshot({modelResearchTiers:[evil]}));
 assert.match(clean,/&lt;img/);
 assert.doesNotMatch(clean,/<img src=x/);
});
