import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDraftKingsSelections, eligibleDraftKingsProp} from '../lib/draftkings-explorer-adapter.js';
const sourceUrl = 'https://sportsbook.draftkings.com/';
const fetchedAt = '2026-10-26T20:00:00Z';
const now = Date.parse(fetchedAt) + 60_000;
const snapshot = {events:[{id:'game1',name:'Example game'}],markets:[{id:'m1',eventId:'game1',name:'Receiving Yards',outcomes:[
 {playerName:'Example Receiver',label:'Over',points:75,oddsAmerican:-110,main:true},
 {playerName:'Example Receiver',label:'Over',points:80,oddsAmerican:140,main:false}
]}]};
test('preserves actual offered main and alternate lines without inventing a quote',()=>{
 const props=normalizeDraftKingsSelections(snapshot,{sourceUrl,fetchedAt});
 assert.equal(props.length,2);
 assert.equal(props[0].line,75);
 assert.equal(props[0].isMainLine,true);
 assert.equal(props[1].isMainLine,false);
 assert.equal(props[1].americanOdds,140);
 assert.equal(props[0].verifiedSGPQuote,false);
});
test('fails closed on missing provenance or malformed payload',()=>{
 assert.deepEqual(normalizeDraftKingsSelections(snapshot),[]);
 assert.deepEqual(normalizeDraftKingsSelections({markets:[]},{sourceUrl,fetchedAt}),[]);
});
test('requires active starter and exact offered five-yard line',()=>{
 const prop=normalizeDraftKingsSelections(snapshot,{sourceUrl,fetchedAt})[0];
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:true,offeredLines:[75,80],now}),true);
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:false,offeredLines:[75],now}),false);
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:true,offeredLines:[70],now}),false);
 assert.equal(eligibleDraftKingsProp({...prop,line:77},{activeStarter:true,offeredLines:[77],now}),false);
});

test('rejects spoofed DraftKings domains and empty price/line',()=>{
 assert.deepEqual(normalizeDraftKingsSelections(snapshot,{sourceUrl:'https://draftkings.com.evil.test/',fetchedAt}),[]);
 const bad={...snapshot,markets:[{...snapshot.markets[0],outcomes:[
  {playerName:'Example Receiver',points:null,oddsAmerican:-110},
  {playerName:'Example Receiver',points:75,oddsAmerican:null},
  {playerName:'Example Receiver',points:75,oddsAmerican:''}
 ]}]};
 assert.deepEqual(normalizeDraftKingsSelections(bad,{sourceUrl,fetchedAt}),[]);
});

test('rejects stale or future DraftKings props even if the line exists',()=>{
 const prop=normalizeDraftKingsSelections(snapshot,{sourceUrl,fetchedAt})[0];
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:true,offeredLines:[75],now:now+20*60_000}),false);
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:true,offeredLines:[75],now:Date.parse(fetchedAt)-1000}),false);
 assert.equal(eligibleDraftKingsProp({...prop,sourceUrl:'https://draftkings.com.evil.test/'},{activeStarter:true,offeredLines:[75],now}),false);
});
