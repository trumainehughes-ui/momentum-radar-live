import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {publicNflGameView} from '../lib/public-nfl-view.js';

const date='2026-10-18',gameId='401872996';
// Use a current fixture so the public 15-minute quote-age check is exercised.
const at=Date.now()-60_000;
const now=at+20_000;
const metadata=[
 ['C.J. Stroud','101','HOU','passing','QB',280],
 ['Parker Washington','102','JAX','receiving','WR',73],
 ['Woody Marks','103','HOU','rushing','RB',77],
 ['Parker Washington','102','JAX','td','WR',null]
];
const target={DraftKings:[250,55,65,'Anytime TD'],
 FanDuel:[255,60,70,'Anytime TD']};
const books=['DraftKings','FanDuel'];
function playerRow([name,playerID,team,category,position,projection]){
 const isTd=category==='td';
 const base={name,playerID,eventID:gameId,team,category,position,
  ...(isTd?{modelOnly:true,tdModelStatus:'ESPN_MATCHUP_MODEL',
   modelTdPercent:43,evidence:{games:5,opportunitiesPerGame:8.5,touchdowns:3},
   gamesPlayed:5}:{projection,gamesPlayed:5}),
  books:books.map(book=>{
   const i=metadata.findIndex(m=>m[1]===playerID&&m[3]===category);
   const line=target[book][i];
   return{book,available:true,gameId,playerId:playerID,
    category,offerId:book.toLowerCase()+'-'+playerID+'-'+category,
    ...(isTd?{}:{line}),odds:-110,
    checkedAt:new Date(at-30_000).toISOString(),
    sourceUrl:book==='DraftKings'?
     'https://sportsbook.draftkings.com/event/test':
     'https://co.sportsbook.fanduel.com/football/nfl/test'};
  })};
 return base;
}
const makeLeg=([name,playerID,team,category],line)=>({
 name,playerID,eventID:gameId,team,cat:category,
 ...(category==='td'?{analyticsThreshold:'Anytime TD'}:{analyticsThreshold:line})
});
function makeCard(book,legs=metadata.map((row,i)=>makeLeg(row,target[book][i]))){
 return{book,risk:'Small',requiredLegs:4,
  legs:legs.map(leg=>({...leg,bookOffer:{verified:true,book}})),
  tierVerified:true,combinedBookQuoteVerified:true,publishable:true,bookVerificationPending:false,
  quotedAt:new Date(at-25_000).toISOString(),actualSgpOdds:2500};
}
function sample({wrongFdLine=false,wrongFdCategory=false,oldFd=false}={}){
 const cats=Object.fromEntries(['td','passing','rushing','receiving','receptions']
  .map(c=>[c,metadata.filter(m=>m[3]===c).map(playerRow)]));
 if(wrongFdLine)cats.receiving[0].books[1].line=58;
 if(wrongFdCategory)cats.receiving[0].books[1].category='rushing';
 if(oldFd)cats.receiving[0].books[1].checkedAt=new Date(at-60*60_000).toISOString();
 return{at,body:{ok:true,date,gameId,home:'JAX',away:'HOU',
  validation:{injuryEligibilityChecked:true,officialInactivesVerified:true,
    injuryReportCheckedAt:new Date(at-30_000).toISOString()},
  categories:cats,sgps:{Analytics:[],
   DraftKings:[makeCard('DraftKings')],FanDuel:[makeCard('FanDuel')]}}};
}
test('two sportsbooks produce independent, exact-price public SGP cards',()=>{
 const v=publicNflGameView(sample(),{date,gameId,now});
 assert.equal(v.status,'CURRENT');
 assert.deepEqual(v.verifiedBookParlays.map(c=>c.book),books);
 const dk=v.verifiedBookParlays[0],fd=v.verifiedBookParlays[1];
 assert.equal(dk.legs[1].target,55);
 assert.equal(fd.legs[1].target,60);
 assert.equal(dk.legs[1].bookOffer.book,'DraftKings');
 assert.equal(fd.legs[1].bookOffer.book,'FanDuel');
 assert.equal(dk.legs[1].bookOffer.attested,true);
 assert.equal(fd.legs[1].bookOffer.attested,true);
 assert.equal(dk.legs[3].category,'td');
 assert.equal(dk.legs[1].player,dk.legs[3].player);
 assert.ok(!JSON.stringify(v).includes('offerId'));
 assert.ok(!JSON.stringify(v).includes('sourceUrl'));
});
test('FanDuel cannot borrow a DraftKings market, category, or stale line',()=>{
 for(const modified of [{wrongFdLine:true},{wrongFdCategory:true},{oldFd:true}]){
  const v=publicNflGameView(sample(modified),{date,gameId,now});
  assert.deepEqual(v.verifiedBookParlays.map(c=>c.book),['DraftKings']);
  assert.deepEqual(v.verifiedQuotes.map(q=>q.book),['DraftKings']);
 }
});
test('old shared snapshot cannot publish either sportsbook quote',()=>{
 const v=publicNflGameView(sample(),{date,gameId,now:at+16*60_000,
  includeLastSaved:true});
 assert.deepEqual(v.verifiedBookParlays,[]);
 assert.deepEqual(v.verifiedQuotes,[]);
});
const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const first=script.indexOf('function sgpSelectionDisplay(l){');
const last=script.indexOf('function offerHtml(',first);
assert.ok(first>0&&last>first);
function render(d){
 const context={state:{currentBookSgpModel:null,recheckLoading:false,
   selected:gameId,date},
  window:{},esc:x=>String(x??''),fmtStamp:()=> 'Updated',
  renderOdds:()=>'',renderPublicBookResearch:()=>'',
  renderLocalBookParity:()=>'',
  renderAutoRecheckStatus:()=>'Rechecking',URL};
 vm.runInNewContext(script.slice(first,last)+';this.view=renderParlays;',context);
 return context.view(d);
}
test('visitor sees separate book sections and no cross-book substituted legs',()=>{
 const v=publicNflGameView(sample(),{date,gameId,now});
 const h=render(v);
 assert.ok(h.includes('FanDuel Same Game Parlays'));
 assert.ok(h.includes('DraftKings Same Game Parlays'));
 assert.ok(h.includes('55+ yards'));
 assert.ok(h.includes('60+ yards'));
 // The independent player forecast panel may add matchup explanations;
 // count only the sportsbook sections for cross-book isolation.
 const bookHtml=h.split('FanDuel Same Game Parlays')[1]?.split('NFL model research')[0]||'';
 assert.equal((bookHtml.match(/class="sgp-leg-why"/g)||[]).length,8);
 const fd=h.split('FanDuel Same Game Parlays')[1].split('DraftKings Same Game Parlays')[0];
 const dk=h.split('DraftKings Same Game Parlays')[1].split('NFL model research')[0];
 assert.ok(fd.includes('<strong>60+ yards</strong>'));
 assert.ok(!fd.includes('<strong>55+ yards</strong>'));
 assert.ok(dk.includes('<strong>55+ yards</strong>'));
 assert.ok(!dk.includes('<strong>60+ yards</strong>'));
});
test('unverified models render as research, never book-price cards',()=>{
 const noQuote=sample();
 noQuote.body.sgps.DraftKings=[];
 noQuote.body.sgps.FanDuel=[];
 const v=publicNflGameView(noQuote,{date,gameId,now});
 const h=render(v);
 assert.ok(h.includes('No complete FanDuel lineup'));
 assert.ok(h.includes('No complete DraftKings lineup'));
 assert.ok(!h.includes('2500 combined'));
});

test('published day-ahead SGPs remain visible with an official-inactives warning',()=>{
 const data=sample();
 data.body.validation.officialInactivesVerified=false;
 const v=publicNflGameView(data,{date,gameId,now});
 assert.equal(v.inactivesVerified,false);
 const h=render(v);
 assert.ok(!h.includes('2500 combined'),'unverified inactives must withhold playable combined quotes');
 assert.ok(h.includes('Official game-day inactives are not final'));
 assert.ok(h.includes('30 minutes before kickoff'));
});
test('official market token aliases still map only to their exact NFL category',()=>{
 const data=sample();
 data.body.categories.passing[0].books[0].category=null;
 data.body.categories.passing[0].books[0].market='player_pass_yds';
 data.body.categories.rushing[0].books[0].category=null;
 data.body.categories.rushing[0].books[0].market='player_rush_yds';
 data.body.categories.receiving[0].books[0].category=null;
 data.body.categories.receiving[0].books[0].market='player_reception_yds';
 const v=publicNflGameView(data,{date,gameId,now});
 assert.deepEqual(v.verifiedBookParlays.map(c=>c.book),books);
});
