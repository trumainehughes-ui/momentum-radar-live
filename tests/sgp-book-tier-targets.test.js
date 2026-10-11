import test from 'node:test';
import assert from 'node:assert/strict';
import {rebuildNflBookTierPools,rebuildNflBookNukePool,nflOfferedOverThreshold} from '../lib/sgp-book-tier-targets.js';
import {sgpBookRebuildReport} from '../lib/sgp-book-rebuild-report.js';
import {readFileSync} from 'node:fs';

const g=new Map(),base=[];
for(const [id,cat,projection,conservative,medium] of [
 ['11','passing',300,225,275],
 ['12','rushing',75,45,65],
 ['13','receiving',95,55,85],
 ['14','receptions',6,3,5]
]){
 const offers=[conservative,medium].map((t,i)=>({
  playerID:id,name:'Player '+id,team:'JAX',eventID:'401872981',
  cat,projection,range:{ceiling:projection*1.3},
  momentumScore:76-i,bookOffer:{book:'FanDuel',odds:-110,
   line:t+'+',available:true}
 }));
 g.set(id+'|'+cat,offers);
 base.push(offers[0]);
}
const targets={Small:{passing:225,rushing:45,receiving:55,receptions:3},
 Medium:{passing:275,rushing:65,receiving:85,receptions:5}};
test('Small and Medium share existing injury/data rules, but MUST use different genuine sportsbook offered thresholds',()=>{
 const tiers=rebuildNflBookTierPools(base,g,(x,cat,risk)=>targets[risk][cat]);
 assert.equal(tiers.Small.length,4);
 assert.equal(tiers.Medium.length,4);
 for(const cat of ['passing','rushing','receiving','receptions']){
  const lo=tiers.Small.find(x=>x.cat===cat),hi=tiers.Medium.find(x=>x.cat===cat);
  assert.equal(lo.bookTierMode,'CONSERVATIVE_FLOOR');
  assert.equal(hi.bookTierMode,'ELEVATED_EXPECTATION');
  assert.ok(hi.bookTierTarget>lo.bookTierTarget,cat);
  assert.equal(lo.bookOffer.book,'FanDuel');
  assert.equal(hi.bookOffer.book,'FanDuel');
  if(cat!=='receptions'){
   assert.equal(lo.bookTierTarget%5,0);
   assert.equal(hi.bookTierTarget%5,0);
  }
 }
});
test('a missing Medium sportsbook alternate does not get relabeled as elevated payout',()=>{
 const rows=g.get('12|rushing');
 const single=new Map(g);single.set('12|rushing',[rows[0]]);
 const pools=rebuildNflBookTierPools(base,single,(x,cat,risk)=>targets[risk][cat]);
 assert.ok(pools.Small.some(x=>x.playerID==='12'));
 assert.ok(!pools.Medium.some(x=>x.playerID==='12'));
 assert.ok(pools.Medium.every(x=>x.bookTierMode==='ELEVATED_EXPECTATION'));
});
test('reject under, unsupported 57+ yardage, or disabled/past market instead of inventing target odds',()=>{
 assert.equal(nflOfferedOverThreshold({line:'54.5',odds:-110,available:true},'rushing'),55);
 assert.equal(nflOfferedOverThreshold({line:'55+',odds:-110,available:true},'rushing'),55);
 assert.equal(nflOfferedOverThreshold({line:'57+',odds:-110,available:true},'rushing'),null);
 assert.equal(nflOfferedOverThreshold({line:'Over 54.5',odds:-110,available:true},'rushing'),null);
 assert.equal(nflOfferedOverThreshold({line:'55+',odds:-110,available:false},'rushing'),null);
 assert.equal(nflOfferedOverThreshold({line:null},'passing'),null);
 assert.equal(nflOfferedOverThreshold({line:'55+',odds:null,available:true},'rushing'),null);
 const bad=new Map(g);bad.set('13|receiving',[
  {...g.get('13|receiving')[0],bookOffer:{book:'FanDuel',odds:null,line:'55+',available:false}},
  {...g.get('13|receiving')[1],bookOffer:{book:'FanDuel',odds:-110,line:'87+',available:true}}
 ]);
 const tiers=rebuildNflBookTierPools(base,bad,(x,cat,risk)=>targets[risk][cat]);
 assert.ok(!tiers.Small.some(x=>x.playerID==='13'));
 assert.ok(!tiers.Medium.some(x=>x.playerID==='13'));
});
test('production book generator uses tier-specific source pools, preserves high Nuke ceiling and does not quote unverified payout',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(src,/const tierPools=rebuildNflBookTierPools\(basePool,groups,/);
 assert.match(src,/let source=risk==='Nuke'\?nukePool:\(tierPools\[risk\]\|\|\[\]\)/);
 assert.match(src,/findTier\('Small',4,0\)/);
 assert.match(src,/findTier\('Medium',5,1\)/);
 assert.match(src,/for\(let n=5;n<=Math\.min\(7,nukePool.length\);n\+\+\)/);
 assert.match(src,/const est=null;/);
 assert.doesNotMatch(src,/const est=parlayPrice\(legs,book\)/);
});

test('ordinary Over x.5 source quote retains raw line but produces integer, 5-yard-model target in Small/Medium',()=>{
 const book='DraftKings',gameId='401872981';
 const dataset=[
  {id:'111',cat:'passing',base:'224.5',medium:'259.5',projection:285,ceiling:350},
  {id:'112',cat:'rushing',base:'49.5',medium:'64.5',projection:85,ceiling:120},
  {id:'113',cat:'receiving',base:'64.5',medium:'84.5',projection:105,ceiling:155},
  {id:'114',cat:'receptions',base:'3+',medium:'5+',projection:7,ceiling:12},
  {id:'115',cat:'rushing',base:'59.5',medium:'79.5',projection:95,ceiling:135}
 ];
 const base=[],group=new Map();
 const targets={
  Small:{passing:225,rushing:50,receiving:65,receptions:3},
  Medium:{passing:260,rushing:65,receiving:85,receptions:5}
 };
 for(const x of dataset){
  const rows=[x.base,x.medium].map((threshold,i)=>({
   playerID:x.id,name:'Player '+x.id,team:'JAX',eventID:gameId,
   cat:x.cat,sideID:'over',periodID:'game',betTypeID:'ou',
   projection:x.projection,predictiveProjection:x.projection,
   range:{ceiling:x.ceiling},momentumScore:80-i,
   bookOffer:{book,odds:-110,available:true,line:threshold}
  }));
  base.push(rows[0]);group.set(x.id+'|'+x.cat,rows);
 }
 const results=rebuildNflBookTierPools(base,group,(x,cat,risk)=>{
  // Two RBs in the test: keep identical tier-relative targets.
  if(x.playerID==='115')return risk==='Small'?60:80;
  return targets[risk][cat];
 });
 assert.equal(results.Small.length,5);
 assert.equal(results.Medium.length,5);
 for(const risk of ['Small','Medium']){
  for(const leg of results[risk]){
   const observed=nflOfferedOverThreshold(leg.bookOffer,leg.cat);
   assert.equal(leg.analyticsThreshold,observed);
   assert.equal(leg.bookTierTarget,observed);
   assert.equal(leg.rawSportsbookLine,leg.bookOffer.line);
   assert.equal(leg.bookOffer.book,book);
   assert.equal(leg.bookThresholdVerified,true);
   if(['passing','rushing','receiving'].includes(leg.cat))
    assert.equal(leg.analyticsThreshold%5,0);
  }
 }
 for(const x of results.Small){
  const harder=results.Medium.find(y=>y.playerID===x.playerID&&y.cat===x.cat);
  assert.ok(harder);
  assert.ok(harder.analyticsThreshold>x.analyticsThreshold);
 }
 // One 4-leg Small and 5-leg Medium both pass existing contract, but NONE
 // is allowed to assert a payout until a correlated bookmaker quote exists.
 const report=sgpBookRebuildReport({league:'nfl',gameId,sgps:{
  DraftKings:[
   {risk:'Small',requiredLegs:4,legs:results.Small.slice(0,4),tierGeneration:'BOOK_LISTED_FLOOR'},
   {risk:'Medium',requiredLegs:5,legs:results.Medium,tierGeneration:'BOOK_LISTED_ELEVATED'}
  ]
 }});
 for(const risk of ['Small','Medium']){
  const row=report.tiers.find(x=>x.risk===risk).books.find(x=>x.book===book);
  assert.equal(row.bookListedLegsVerified,true,JSON.stringify(row.ruleViolations));
  assert.equal(row.actualCombinedOdds,null);
  assert.equal(row.quotedPayoutWithinTier,false);
  assert.equal(row.nextAction,'REQUEST_AUTHENTIC_CORRELATED_SGP_QUOTE');
 }
});

test('Nuke recognizes real book 299.5 -> 300+ settlement, rejects mismatched book, beyond-ceiling and unsupported lifts',()=>{
 const book='DraftKings',gameId='401872981';
 const samples=[
  {id:'qb',cat:'passing',center:280,ceiling:355,base:'249.5',good:'319.5',bad:'399.5'},
  {id:'rb',cat:'rushing',center:80,ceiling:130,base:'59.5',good:'109.5',bad:'159.5'},
  {id:'wr',cat:'receiving',center:110,ceiling:160,base:'79.5',good:'139.5',bad:'199.5'}
 ];
 const base=[],group=new Map();
 for(const row of samples){
  const options=[row.base,row.good,row.bad].map((line,i)=>({
   playerID:row.id,name:'Athlete '+row.id,team:'JAX',eventID:gameId,
   cat:row.cat,periodID:'game',betTypeID:'ou',sideID:'over',
   predictiveProjection:row.center,projection:row.center,
   range:{ceiling:row.ceiling},momentumScore:85-i,
   bookOffer:{book,line,odds:+160,available:true}
  }));
  base.push(options[0]);
  group.set(row.id+'|'+row.cat,[...options,{...options[1],
   bookOffer:{...options[1].bookOffer,book:'FanDuel',line:'154.5'}}]);
 }
 const picks=rebuildNflBookNukePool(base,group,(x,cat)=>
  cat==='passing'?305:cat==='rushing'?100:135);
 assert.equal(picks.length,3);
 assert.equal(picks.find(x=>x.playerID==='qb').analyticsThreshold,320);
 assert.equal(picks.find(x=>x.playerID==='rb').analyticsThreshold,110);
 assert.equal(picks.find(x=>x.playerID==='wr').analyticsThreshold,140);
 assert.ok(picks.every(x=>x.bookOffer.book==='DraftKings'&&x.nukeJuiced&&
  x.nukeAboveProjection&&x.modelCeilingConfirmed));
 for(const p of picks)assert.equal(p.bookTierTarget,
  nflOfferedOverThreshold(p.bookOffer,p.cat));
 const noCeiling=structuredClone(base);noCeiling[0].range={ceiling:290};
 const declined=rebuildNflBookNukePool(noCeiling,group,()=>305);
 assert.equal(declined.some(x=>x.playerID==='qb'),false);
});

test('bare Over integer that may PUSH, wrong period and Under are not valid positive 5-yard alternate lines',()=>{
 assert.equal(nflOfferedOverThreshold({line:55,odds:-110},'rushing'),null);
 assert.equal(nflOfferedOverThreshold({line:55,odds:-110,lineType:'AT_LEAST'},'rushing'),55);
 const x={playerID:'221',name:'Runner',team:'JAX',eventID:'401872981',
  cat:'rushing',projection:80,range:{ceiling:130},momentumScore:80,
  bookOffer:{book:'DraftKings',line:'59.5',odds:-110,available:true}};
 const options=[{...x,sideID:'under'},
  {...x,sideID:'over',periodID:'first_half'},
  {...x,sideID:'over',periodID:'game',betTypeID:'ou'}];
 const all=rebuildNflBookTierPools([x],new Map([['221|rushing',options]]),
  (_,__,risk)=>risk==='Small'?60:70);
 assert.equal(all.Small.length,1);
 assert.equal(all.Small[0].rawSportsbookLine,'59.5');
});
