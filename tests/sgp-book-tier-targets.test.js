import test from 'node:test';
import assert from 'node:assert/strict';
import {rebuildNflBookTierPools,nflOfferedOverThreshold} from '../lib/sgp-book-tier-targets.js';
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
 assert.equal(nflOfferedOverThreshold({line:'54.5',available:true},'rushing'),55);
 assert.equal(nflOfferedOverThreshold({line:'55+',available:true},'rushing'),55);
 assert.equal(nflOfferedOverThreshold({line:'57+',available:true},'rushing'),null);
 assert.equal(nflOfferedOverThreshold({line:'Over 54.5',available:true},'rushing'),null);
 assert.equal(nflOfferedOverThreshold({line:'55+',available:false},'rushing'),null);
 assert.equal(nflOfferedOverThreshold({line:null},'passing'),null);
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
