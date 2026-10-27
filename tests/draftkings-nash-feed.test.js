import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchDraftKingsNashSelections,eligibleNashPlayerProps} from '../lib/draftkings-nash-feed.js';
const request={leagueId:'88808',categoryId:'1286',subcategoryId:'13354',now:Date.now()};
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
 assert.equal(eligibleNashPlayerProps(feedResult,{now:observedAt,isActiveStarter:()=>false}).length,0);
 const eligible=eligibleNashPlayerProps(feedResult,{now:observedAt,isActiveStarter:()=>true});
 assert.equal(eligible.length,1);
 assert.equal(eligible[0].selectionId,'selection1');
 assert.equal(eligible[0].verifiedSGPQuote,false);
 assert.equal(eligibleNashPlayerProps(feedResult,{now:observedAt+20*60_000,isActiveStarter:()=>true}).length,0);
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
