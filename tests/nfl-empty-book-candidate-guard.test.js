import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterCompleteNflBookSgps} from '../lib/nfl-book-sgp-candidates.js';

const qualified=(risk,count)=>({
 book:'FanDuel',risk,requiredLegs:count,
 legs:Array.from({length:count},(_,i)=>({playerID:String(i+1)})),
 tierAssessment:{compositionOk:true},
 combinedBookQuoteVerified:false,publishable:false
});
test('empty or unpriced sportsbook tiers never crash whole game markets',()=>{
 assert.deepEqual(filterCompleteNflBookSgps([null,null,null]),[]);
 assert.deepEqual(filterCompleteNflBookSgps([]),[]);
 assert.deepEqual(filterCompleteNflBookSgps(null),[]);
 assert.deepEqual(filterCompleteNflBookSgps([undefined,false,0,'',{}]),[]);
});
test('valid Small Medium and Nuke candidates survive alongside missing peers',()=>{
 const small=qualified('Small',4),medium=qualified('Medium',5),
  nuke=qualified('Nuke',6);
 assert.deepEqual(filterCompleteNflBookSgps([null,small,undefined,medium,nuke]),
  [small,medium,nuke]);
 assert.deepEqual(filterCompleteNflBookSgps([null,null,nuke]),[nuke]);
});
test('incomplete or unqualified sportsbook legs remain unavailable',()=>{
 const good=qualified('Small',4);
 const invalid=[
  {...good,legs:good.legs.slice(1)},
  {...good,requiredLegs:null},
  {...good,requiredLegs:0},
  {...good,requiredLegs:1.5},
  {...good,tierAssessment:{compositionOk:false}},
  {...good,tierAssessment:null},
  {...good,legs:null}
 ];
 assert.deepEqual(filterCompleteNflBookSgps(invalid),[]);
});
test('production game market builder uses guarded filter without triggering a paid quote',()=>{
 const source=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(source.includes("return filterCompleteNflBookSgps(["));
 assert.ok(source.includes("findTier('Small',0),findTier('Medium',1),findTier('Large',2),findTier('Nuke',3)"));
 assert.ok(!source.includes("s?.legs?.length===s.requiredLegs"));
 assert.ok(source.includes('if(authorizedChange&&gameId&&!DIRECT_PUBLIC_ODDS_ONLY)'));
 assert.ok(source.includes('quoteEligibility'));
});
