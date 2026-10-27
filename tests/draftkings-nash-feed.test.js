import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchDraftKingsNashSelections,eligibleNashPlayerProps} from '../lib/draftkings-nash-feed.js';
const request={leagueId:'88808',categoryId:'1286',subcategoryId:'13354'};
const feed={events:[{id:'game1',name:'Example'}],markets:[{id:'market1',eventId:'game1',name:'Receiving Yards',playerName:'Example Receiver'}],selections:[{id:'selection1',marketId:'market1',label:'Over 75.5',displayOdds:{american:'-110'},main:true}]};
test('fetches and normalizes first-party Nash feed with exact provenance',async()=>{
 let requested;
 const result=await fetchDraftKingsNashSelections({...request,fetchImpl:async(url,options)=>{requested={url,options};return {ok:true,json:async()=>feed};}});
 assert.equal(result.ok,true);
 assert.equal(result.selections.length,1);
 assert.equal(result.selections[0].line,75.5);
 assert.equal(result.selections[0].selectionId,'selection1');
 assert.equal(result.selections[0].verifiedSGPQuote,false);
 assert.equal(result.verifiedSGPQuote,false);
 assert.equal(requested.url,'https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1/leagues/88808/categories/1286/subcategories/13354');
 assert.equal(requested.options.redirect,'error');
 assert.equal(requested.options.cache,'no-store');
});
test('fails closed on HTTP, invalid feed, and invalid category ID',async()=>{
 const http=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:false,status:403})});
 assert.deepEqual(http.selections,[]);
 const malformed=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,json:async()=>({markets:[]})})});
 assert.equal(malformed.reason,'INVALID_FEED');
 const invalid=await fetchDraftKingsNashSelections({...request,categoryId:'../other',fetchImpl:async()=>{throw Error('should not fetch');}});
 assert.equal(invalid.reason,'INVALID_REQUEST');
});

test('empty or unidentifiable Nash markets never claim a successful usable feed',async()=>{
 const empty=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,json:async()=>({events:[],markets:[],selections:[]})})});
 assert.equal(empty.ok,false);
 assert.equal(empty.reason,'NO_USABLE_SELECTIONS');
 const noPlayer=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,json:async()=>({events:[{id:'game1'}],markets:[{id:'market1',eventId:'game1',name:'Receiving Yards'}],selections:[{id:'selection1',marketId:'market1',label:'Over',points:75,displayOdds:{american:'-110'}}]})})});
 assert.equal(noPlayer.ok,false);
 assert.equal(noPlayer.reason,'NO_USABLE_SELECTIONS');
});

test('handoff only accepts externally confirmed starters with exact fresh offers',async()=>{
 const feedResult=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,json:async()=>feed})});
 const observedAt=Date.parse(feedResult.fetchedAt);
 assert.equal(eligibleNashPlayerProps(feedResult,{now:observedAt}).length,0);
 assert.equal(eligibleNashPlayerProps(feedResult,{now:observedAt,isCurrentGame:()=>true,isActiveStarter:()=>false}).length,0);
 const eligible=eligibleNashPlayerProps(feedResult,{now:observedAt,isCurrentGame:()=>true,isActiveStarter:()=>true});
 assert.equal(eligible.length,1);
 assert.equal(eligible[0].selectionId,'selection1');
 assert.equal(eligible[0].verifiedSGPQuote,false);
 assert.equal(eligibleNashPlayerProps(feedResult,{now:observedAt+20*60_000,isCurrentGame:()=>true,isActiveStarter:()=>true}).length,0);
});

test('Nash fetch refuses HTML challenge pages and non-JSON content',async()=>{
 const result=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,headers:{get:()=> 'text/html'},json:async()=>feed})});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'INVALID_CONTENT_TYPE');
 assert.deepEqual(result.selections,[]);
});

test('Nash feed rejects oversized advertised responses before parsing',async()=>{
 let parsed=false;
 const result=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,headers:{get:key=>key==='content-length'?'3000000':'application/json'},json:async()=>{parsed=true;return feed;}})});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'RESPONSE_TOO_LARGE');
 assert.equal(parsed,false);
});

test('season-long DraftKings futures cannot masquerade as game-day player props',async()=>{
 const futures={...feed,markets:[{...feed.markets[0],name:'NFL Regular Season Receiving Yards'}]};
 const result=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,json:async()=>futures})});
 assert.equal(result.ok,true);
 assert.deepEqual(eligibleNashPlayerProps(result,{now:Date.parse(result.fetchedAt),isCurrentGame:()=>true,isActiveStarter:()=>true}),[]);
});

test('starter verification exceptions fail closed without leaking unverified props',async()=>{
 const result=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,json:async()=>feed})});
 assert.equal(result.ok,true);
 assert.deepEqual(eligibleNashPlayerProps(result,{now:Date.parse(result.fetchedAt),isCurrentGame:()=>true,isActiveStarter:()=>{throw Error('injury service unavailable');}}),[]);
});

test('game-day handoff rejects unverified, out-of-slate and failing event checks',async()=>{
 const result=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,json:async()=>feed})});
 const now=Date.parse(result.fetchedAt);
 assert.deepEqual(eligibleNashPlayerProps(result,{now,isActiveStarter:()=>true}),[]);
 assert.deepEqual(eligibleNashPlayerProps(result,{now,isCurrentGame:()=>false,isActiveStarter:()=>true}),[]);
 assert.deepEqual(eligibleNashPlayerProps(result,{now,isCurrentGame:()=>{throw Error('schedule unavailable');},isActiveStarter:()=>true}),[]);
 assert.equal(eligibleNashPlayerProps(result,{now,isCurrentGame:({eventId})=>eventId==='game1',isActiveStarter:()=>true}).length,1);
});

test('streamed Nash responses stop at the byte limit before JSON parsing',async()=>{
 let cancelled=false;
 let reads=0;
 const reader={
  read:async()=>{reads++;return {done:false,value:new Uint8Array(1_100_000)};},
  cancel:async()=>{cancelled=true;},
  releaseLock:()=>{}
 };
 const result=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,headers:{get:()=> 'application/json'},body:{getReader:()=>reader},json:async()=>{throw Error('must not parse oversized body');}})});
 assert.equal(result.reason,'RESPONSE_TOO_LARGE');
 assert.equal(cancelled,true);
 assert.equal(reads,2);
});

test('bounded streamed JSON still normalizes valid DraftKings selections',async()=>{
 const bytes=new TextEncoder().encode(JSON.stringify(feed));
 let done=false;
 const result=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,headers:{get:()=> 'application/json'},body:{getReader:()=>({read:async()=>{if(done)return {done:true};done=true;return {done:false,value:bytes};},releaseLock:()=>{}})}})});
 assert.equal(result.ok,true);
 assert.equal(result.selections[0].selectionId,'selection1');
});

test('malformed null selections in an otherwise valid feed fail closed',async()=>{
 const result=await fetchDraftKingsNashSelections({...request,fetchImpl:async()=>({ok:true,json:async()=>feed})});
 const corrupted={...result,selections:[null,...result.selections,undefined]};
 const eligible=eligibleNashPlayerProps(corrupted,{now:Date.parse(result.fetchedAt),isCurrentGame:()=>true,isActiveStarter:()=>true});
 assert.equal(eligible.length,1);
 assert.equal(eligible[0].selectionId,'selection1');
});

test('NFL catalog aggregates four verified first-party categories without claiming SGP quotes',async()=>{
 const {fetchDraftKingsNflPlayerProps,DK_NFL_PLAYER_PROP_CATEGORIES}=await import('../lib/draftkings-nash-feed.js');
 assert.equal(DK_NFL_PLAYER_PROP_CATEGORIES.length,4);
 const seen=[];
 const feed=await fetchDraftKingsNflPlayerProps({fetchImpl:async url=>{
  seen.push(url);
  return {ok:true,headers:{get:()=>null},json:async()=>({
   events:[{id:'event1',name:'Game'}],
   markets:[{id:'market1',eventId:'event1',name:'Example Player Passing Yards O/U'}],
   selections:[{id:'sel1',marketId:'market1',label:'Over',points:200.5,
    playerName:'Example Player',displayOdds:{american:'−110'}}]
  })};
 }});
 assert.equal(seen.length,4);
 assert.equal(feed.ok,true);
 assert.equal(feed.complete,true);
 assert.equal(feed.categories.length,4);
 assert.equal(feed.selections.length,4);
 assert.equal(feed.verifiedSGPQuote,false);
 assert.equal(feed.selections[0].stat,'passing_yards');
});
test('NFL catalog reports incomplete coverage rather than silently treating partial books as complete',async()=>{
 const {fetchDraftKingsNflPlayerProps}=await import('../lib/draftkings-nash-feed.js');
 const feed=await fetchDraftKingsNflPlayerProps({fetchImpl:async url=>({
  ok:!url.includes('/categories/1001/'),
  headers:{get:()=>null},
  json:async()=>({events:[],markets:[]})
 })});
 assert.equal(feed.ok,false);
 assert.equal(feed.complete,false);
 assert.equal(feed.categories.length,4);
 assert.equal(feed.verifiedSGPQuote,false);
});

test('aggregate handoff rejects incomplete coverage even when one category has good selections',async()=>{
 const {eligibleDraftKingsNflPlayerProps}=await import('../lib/draftkings-nash-feed.js');
 const now=Date.now();
 const prop={book:'DraftKings',eventId:'game1',marketId:'market1',selectionId:'sel1',
  player:'Example Player',marketName:'Passing Yards O/U',outcome:'over',line:225.5,
  americanOdds:-110,fetchedAt:new Date(now).toISOString(),
  sourceUrl:'https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1/leagues/88808/categories/1000/subcategories/9524',
  verifiedSGPQuote:false};
 const categories=['passing_yards','receiving_yards','rushing_yards','receptions'].map(stat=>({stat,ok:true}));
 const validators={isActiveStarter:()=>true,isCurrentGame:()=>true,now};
 const complete={ok:true,complete:true,categories,selections:[prop]};
 assert.equal(eligibleDraftKingsNflPlayerProps(complete,validators).length,1);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps({...complete,complete:false},validators),[]);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps({...complete,categories:categories.map((c,i)=>i===1?{...c,ok:false}:c)},validators),[]);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps(complete,{...validators,isCurrentGame:()=>false}),[]);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps(complete,{...validators,isActiveStarter:()=>false}),[]);
});
