import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDraftKingsSelections, eligibleDraftKingsProp, draftKingsNashCategoryUrl} from '../lib/draftkings-explorer-adapter.js';
const sourceUrl = 'https://sportsbook.draftkings.com/';
const fetchedAt = '2026-10-26T20:00:00Z';
const now = Date.parse(fetchedAt) + 60_000;
const snapshot = {events:[{id:'game1',name:'Example game'}],markets:[{id:'m1',eventId:'game1',name:'Receiving Yards',outcomes:[
 {id:'sel-75',playerName:'Example Receiver',label:'Over',points:75,oddsAmerican:-110,main:true},
 {id:'sel-80',playerName:'Example Receiver',label:'Over',points:80,oddsAmerican:140,main:false}
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
test('requires active starter and exact offered line without invented increments',()=>{
 const prop=normalizeDraftKingsSelections(snapshot,{sourceUrl,fetchedAt})[0];
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:true,offeredLines:[75,80],now}),true);
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:false,offeredLines:[75],now}),false);
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:true,offeredLines:[70],now}),false);
 assert.equal(eligibleDraftKingsProp({...prop,line:77},{activeStarter:true,offeredLines:[77],now}),true);
});

test('rejects spoofed DraftKings domains and empty price/line',()=>{
 assert.deepEqual(normalizeDraftKingsSelections(snapshot,{sourceUrl:'https://draftkings.com.evil.test/',fetchedAt}),[]);
 const bad={...snapshot,markets:[{...snapshot.markets[0],outcomes:[
  {id:'bad-line',playerName:'Example Receiver',label:'Over',points:null,oddsAmerican:-110},
  {id:'bad-null',playerName:'Example Receiver',label:'Over',points:75,oddsAmerican:null},
  {id:'bad-empty',playerName:'Example Receiver',label:'Over',points:75,oddsAmerican:''}
 ]}]};
 assert.deepEqual(normalizeDraftKingsSelections(bad,{sourceUrl,fetchedAt}),[]);
});

test('rejects stale or future DraftKings props even if the line exists',()=>{
 const prop=normalizeDraftKingsSelections(snapshot,{sourceUrl,fetchedAt})[0];
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:true,offeredLines:[75],now:now+20*60_000}),false);
 assert.equal(eligibleDraftKingsProp(prop,{activeStarter:true,offeredLines:[75],now:Date.parse(fetchedAt)-1000}),false);
 assert.equal(eligibleDraftKingsProp({...prop,sourceUrl:'https://draftkings.com.evil.test/'},{activeStarter:true,offeredLines:[75],now}),false);
});

test('reception thresholds must match the actual first-party offered market',()=>{
 const p=normalizeDraftKingsSelections({...snapshot,markets:[{...snapshot.markets[0],name:'Player Receptions',outcomes:[{id:'sel-receptions',playerName:'Example Receiver',label:'Over',points:4,oddsAmerican:-120}]}]},{sourceUrl,fetchedAt})[0];
 assert.equal(eligibleDraftKingsProp(p,{activeStarter:true,offeredLines:[4],now}),true);
 assert.equal(eligibleDraftKingsProp({...p,line:4.5},{activeStarter:true,offeredLines:[4.5],now}),true);
 assert.equal(eligibleDraftKingsProp({...p,line:4.5},{activeStarter:true,offeredLines:[4],now}),false);
});
test('unknown markets are not eligible until explicitly mapped',()=>{
 const p=normalizeDraftKingsSelections(snapshot,{sourceUrl,fetchedAt})[0];
 assert.equal(eligibleDraftKingsProp({...p,marketName:'Mystery Market'},{activeStarter:true,offeredLines:[75],now}),false);
});

test('preserves exact DraftKings selection IDs for offer traceability',()=>{
 const withId={...snapshot,markets:[{...snapshot.markets[0],outcomes:[
  {...snapshot.markets[0].outcomes[0],selectionId:'DK-12345'}
 ]}]};
 const [p]=normalizeDraftKingsSelections(withId,{sourceUrl,fetchedAt});
 assert.equal(p.selectionId,'DK-12345');
 assert.equal(p.verifiedSGPQuote,false);
});

test('rejects closed or untraceable selections before they reach SGP research',()=>{
 const suspended={...snapshot,markets:[{...snapshot.markets[0],isOpen:false}]};
 assert.deepEqual(normalizeDraftKingsSelections(suspended,{sourceUrl,fetchedAt}),[]);
 const closed={...snapshot,markets:[{...snapshot.markets[0],outcomes:[
  {...snapshot.markets[0].outcomes[0],isOpen:false}
 ]}]};
 assert.deepEqual(normalizeDraftKingsSelections(closed,{sourceUrl,fetchedAt}),[]);
 const untraceable={...snapshot,markets:[{...snapshot.markets[0],outcomes:[
  {...snapshot.markets[0].outcomes[0],id:null}
 ]}]};
 assert.deepEqual(normalizeDraftKingsSelections(untraceable,{sourceUrl,fetchedAt}),[]);
});

test('non-over-under outcomes and negative prop thresholds cannot enter the offer list',()=>{
 const bad={...snapshot,markets:[{...snapshot.markets[0],outcomes:[
  {...snapshot.markets[0].outcomes[0],label:'Yes'},
  {...snapshot.markets[0].outcomes[0],points:-2},
  {...snapshot.markets[0].outcomes[0],label:'Over',points:75}
 ]}]};
 const normalized=normalizeDraftKingsSelections(bad,{sourceUrl,fetchedAt});
 assert.equal(normalized.length,1);
 assert.equal(normalized[0].outcome,'over');
 assert.equal(eligibleDraftKingsProp({...normalized[0],outcome:'under'},{activeStarter:true,offeredLines:[75],now}),true);
 assert.equal(eligibleDraftKingsProp({...normalized[0],outcome:'yes'},{activeStarter:true,offeredLines:[75],now}),false);
});

test('deduplicates identical DraftKings selection identities without merging distinct alternate lines',()=>{
 const original=snapshot.markets[0].outcomes[0];
 const duplicate={...snapshot,markets:[{...snapshot.markets[0],outcomes:[original,{...original},snapshot.markets[0].outcomes[1]]}]};
 const props=normalizeDraftKingsSelections(duplicate,{sourceUrl,fetchedAt});
 assert.equal(props.length,2);
 assert.deepEqual(props.map(p=>p.selectionId),['sel-75','sel-80']);
});
test('eligibility fails closed if sportsbook price or market identity disappears',()=>{
 const [prop]=normalizeDraftKingsSelections(snapshot,{sourceUrl,fetchedAt});
 for(const bad of [{americanOdds:null},{americanOdds:50},{marketId:''},{eventId:''},{selectionId:' '}]){
  assert.equal(eligibleDraftKingsProp({...prop,...bad},{activeStarter:true,offeredLines:[75],now}),false);
 }
});

test('normalizes Nash top-level market selections and embedded line labels',()=>{
 const feed={events:[{id:'game1',name:'Example game'}],
  markets:[{id:'m1',eventId:'game1',name:'Receiving Yards',playerName:'Example Receiver'}],
  selections:[
   {id:'sel-75',marketId:'m1',label:'Over 75.5',displayOdds:{american:'−110'},main:true},
   {id:'sel-80',marketId:'m1',label:'Under',points:80.5,displayOdds:{american:'+125'}}]};
 const props=normalizeDraftKingsSelections(feed,{sourceUrl,fetchedAt});
 assert.equal(props.length,2);
 assert.deepEqual(props.map(p=>p.line),[75.5,80.5]);
 assert.deepEqual(props.map(p=>p.americanOdds),[-110,125]);
 assert.deepEqual(props.map(p=>p.outcome),['over','under']);
 assert.equal(props[0].selectionId,'sel-75');
 assert.equal(props[0].verifiedSGPQuote,false);
});

test('Nash URL builder accepts only numeric IDs and fixed first-party host',()=>{
 assert.equal(draftKingsNashCategoryUrl({leagueId:'88808',categoryId:'1286',subcategoryId:'13354'}),
  'https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1/leagues/88808/categories/1286/subcategories/13354');
 assert.equal(draftKingsNashCategoryUrl({leagueId:'88808',categoryId:'1286'}),
  'https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1/leagues/88808/categories/1286');
 assert.equal(draftKingsNashCategoryUrl({leagueId:'88808',categoryId:'../other'}),null);
 assert.equal(draftKingsNashCategoryUrl({leagueId:'https://example.com',categoryId:'1286'}),null);
});

test('closed and settled Nash markets or selections are never eligible',()=>{
 const mk=()=>({events:[{id:'game1'}],markets:[{id:'m1',eventId:'game1',name:'Receiving Yards',outcomes:[
  {id:'sel1',playerName:'Example Receiver',label:'Over',points:75,oddsAmerican:-110}]}]});
 for(const status of ['CLOSED','SETTLED','CANCELLED','INACTIVE','SUSPENDED']){
  const market=mk();market.markets[0].status=status;
  assert.equal(normalizeDraftKingsSelections(market,{sourceUrl,fetchedAt}).length,0,status+' market');
  const selection=mk();selection.markets[0].outcomes[0].status=status;
  assert.equal(normalizeDraftKingsSelections(selection,{sourceUrl,fetchedAt}).length,0,status+' selection');
 }
});
