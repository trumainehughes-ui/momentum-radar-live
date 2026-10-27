import test from 'node:test';
import assert from 'node:assert/strict';
import {draftKingsCategoryUrl,normalizeDraftKingsSelections} from '../lib/draftkings-public-market-adapter.js';
test('uses explicit category and subcategory IDs',()=>{
 assert.match(draftKingsCategoryUrl({categoryId:'1286',subcategoryId:'13354'}),/leagues\/88808\/categories\/1286\/subcategories\/13354$/);
 assert.throws(()=>draftKingsCategoryUrl({categoryId:'../x'}));
});
test('preserves DraftKings main flag, actual line, odds, timestamp',()=>{
 const r=normalizeDraftKingsSelections({markets:[{id:7,name:'Passing Yards'}],
 selections:[{id:1,marketId:7,label:'Over',points:249.5,main:true,displayOdds:{american:'+110'}},
 {id:2,marketId:7,label:'Under',points:249.5,main:false,displayOdds:{american:'−120'}}]},
 {observedAt:'2026-10-26T12:00:00Z',categoryId:'1'});
 assert.equal(r.offers.length,2);assert.equal(r.offers[0].isMain,true);
 assert.equal(r.offers[1].americanOdds,'-120');assert.equal(r.offers[0].line,249.5);
});
test('unknown market response never creates verified sportsbook offers',()=>{
 const r=normalizeDraftKingsSelections({markets:[],selections:null});
 assert.equal(r.ok,false);assert.deepEqual(r.offers,[]);
});
