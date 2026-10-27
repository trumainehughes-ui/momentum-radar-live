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
 assert.deepEqual(feed.selections,[]);
 assert.equal(feed.verifiedSGPQuote,false);
});

test('aggregate handoff rejects incomplete coverage even when one category has good selections',async()=>{
 const {eligibleDraftKingsNflPlayerProps}=await import('../lib/draftkings-nash-feed.js');
 const now=Date.now();
 const prop={book:'DraftKings',eventId:'game1',marketId:'market1',selectionId:'sel1',
  player:'Example Player',marketName:'Passing Yards O/U',outcome:'over',line:225.5,
  americanOdds:-110,fetchedAt:new Date(now).toISOString(),
  sourceUrl:'https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1/leagues/88808/categories/1000/subcategories/9524',
  verifiedSGPQuote:false,stat:'passing_yards'};
 const categories=['passing_yards','receiving_yards','rushing_yards','receptions'].map(stat=>({stat,ok:true}));
 const validators={isActiveStarter:()=>true,isCurrentGame:()=>true,now};
 const complete={ok:true,complete:true,categories,selections:[prop]};
 assert.equal(eligibleDraftKingsNflPlayerProps(complete,validators).length,1);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps({...complete,complete:false},validators),[]);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps({...complete,categories:categories.map((c,i)=>i===1?{...c,ok:false}:c)},validators),[]);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps(complete,{...validators,isCurrentGame:()=>false}),[]);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps(complete,{...validators,isActiveStarter:()=>false}),[]);
});

test('independent evidence gate requires event ID, future kickoff and confirmed active player role',async()=>{
 const {eligibleDraftKingsWithEvidence}=await import('../lib/draftkings-nash-feed.js');
 const now=Date.now(),eventId='34118182';
 const prop={book:'DraftKings',eventId,marketId:'382675245',selectionId:'dk-real-id',
  player:'Jordan Love',marketName:'Passing Yards O/U',outcome:'over',line:215.5,
  americanOdds:-113,fetchedAt:new Date(now).toISOString(),
  sourceUrl:'https://sportsbook-nash.draftkings.com/api/sportscontent/dkusoh/v1/leagues/88808/categories/1000/subcategories/9524',
  verifiedSGPQuote:false,stat:'passing_yards'};
 const categories=['passing_yards','receiving_yards','rushing_yards','receptions'].map(stat=>({stat,ok:true}));
 const snapshot={ok:true,complete:true,categories,selections:[prop]};
 const game={confirmed:true,scheduled:true,draftKingsEventId:eventId,kickoff:new Date(now+86400000).toISOString()};
 const player={confirmed:true,active:true,starterOrHighSnap:true,draftKingsEventId:eventId,name:'Jordan Love'};
 assert.equal(eligibleDraftKingsWithEvidence(snapshot,{games:[game],players:[player],now}).length,1);
 assert.deepEqual(eligibleDraftKingsWithEvidence(snapshot,{games:[{...game,draftKingsEventId:'other'}],players:[player],now}),[]);
 assert.deepEqual(eligibleDraftKingsWithEvidence(snapshot,{games:[{...game,kickoff:new Date(now-1000).toISOString()}],players:[player],now}),[]);
 assert.deepEqual(eligibleDraftKingsWithEvidence(snapshot,{games:[game],players:[{...player,active:false}],now}),[]);
 assert.deepEqual(eligibleDraftKingsWithEvidence(snapshot,{games:[game],players:[{...player,confirmed:false}],now}),[]);
 assert.deepEqual(eligibleDraftKingsWithEvidence(snapshot,{games:[game],players:[{...player,draftKingsEventId:'other'}],now}),[]);
});

test('category handoff rejects duplicate, missing and invented category identities',async()=>{
 const {eligibleDraftKingsNflPlayerProps}=await import('../lib/draftkings-nash-feed.js');
 const stats=['passing_yards','receiving_yards','rushing_yards','receptions'];
 const categories=stats.map(stat=>({stat,ok:true}));
 const snapshot={ok:true,complete:true,categories,selections:[]};
 const gate={isActiveStarter:()=>true,isCurrentGame:()=>true};
 assert.deepEqual(eligibleDraftKingsNflPlayerProps(snapshot,gate),[]);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps({...snapshot,categories:[categories[0],categories[0],categories[2],categories[3]]},gate),[]);
 assert.deepEqual(eligibleDraftKingsNflPlayerProps({...snapshot,categories:[categories[0],{stat:'made_up',ok:true},categories[2],categories[3]]},gate),[]);
});

test('ESPN schedule crosswalk requires confirmed exact DK event mapping and scheduled future kickoff',async()=>{
 const {draftKingsGamesFromEspnSchedule}=await import('../lib/draftkings-nash-feed.js');
 const now=Date.now(),date=new Date(now+86400000).toISOString();
 const event={id:'401123456',date,competitions:[{status:{type:{name:'STATUS_SCHEDULED',completed:false}}}]};
 const mapping={espnEventId:'401123456',draftKingsEventId:'34118182',confirmed:true};
 assert.deepEqual(draftKingsGamesFromEspnSchedule([event],{eventCrosswalk:[],now}),[]);
 assert.equal(draftKingsGamesFromEspnSchedule([event],{eventCrosswalk:[mapping],now})[0].draftKingsEventId,'34118182');
 assert.deepEqual(draftKingsGamesFromEspnSchedule([event],{eventCrosswalk:[{...mapping,confirmed:false}],now}),[]);
 assert.deepEqual(draftKingsGamesFromEspnSchedule([event],{eventCrosswalk:[mapping,{...mapping,draftKingsEventId:'34118183'}],now}),[]);
 assert.deepEqual(draftKingsGamesFromEspnSchedule([{...event,date:new Date(now-1000).toISOString()}],{eventCrosswalk:[mapping],now}),[]);
 assert.deepEqual(draftKingsGamesFromEspnSchedule([{...event,competitions:[{status:{type:{name:'STATUS_FINAL',completed:true}}}]}],{eventCrosswalk:[mapping],now}),[]);
});

test('ESPN schedule fetch accepts a valid bounded scoreboard and rejects untrusted input',async()=>{
 const {fetchEspnNflSchedule}=await import('../lib/draftkings-nash-feed.js');
 const now=Date.now(),events=[{id:'401123456',date:new Date(now+86400000).toISOString()}];
 const good=await fetchEspnNflSchedule({date:'20261027',now,fetchImpl:async url=>{
  assert.match(url,/site.api.espn.com/);
  return {ok:true,headers:{get:()=>null},json:async()=>({events})};
 }});
 assert.equal(good.ok,true);
 assert.deepEqual(good.events,events);
 assert.equal((await fetchEspnNflSchedule({date:'2026-10-27',now,fetchImpl:async()=>{throw Error('should not fetch');}})).ok,false);
 const oversized=await fetchEspnNflSchedule({date:'20261027',now,fetchImpl:async()=>({
  ok:true,headers:{get:key=>key==='content-length'?'2000001':null},
  json:async()=>{throw Error('should not parse');}
 })});
 assert.equal(oversized.reason,'RESPONSE_TOO_LARGE');
});

test('team and kickoff matching only produces unconfirmed unique crosswalk candidates',async()=>{
 const {draftKingsEspnEventCandidates,draftKingsGamesFromEspnSchedule}=await import('../lib/draftkings-nash-feed.js');
 const now=Date.now(),kickoff=new Date(now+86400000).toISOString();
 const espn={id:'401123456',date:kickoff,competitions:[{
  status:{type:{name:'STATUS_SCHEDULED',completed:false}},
  competitors:[{team:{displayName:'Buffalo Bills'}},{team:{displayName:'Baltimore Ravens'}}]}]};
 const dk={id:'34118182',startDate:kickoff,teamNames:['Baltimore Ravens','Buffalo Bills']};
 const candidates=draftKingsEspnEventCandidates([dk],[espn]);
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].confirmed,false);
 assert.deepEqual(draftKingsGamesFromEspnSchedule([espn],{eventCrosswalk:candidates,now}),[]);
 assert.deepEqual(draftKingsEspnEventCandidates([{...dk,teamNames:['Other','Buffalo Bills']}],[espn]),[]);
 assert.deepEqual(draftKingsEspnEventCandidates([dk,{...dk,id:'34118183'}],[espn]),[]);
 assert.deepEqual(draftKingsEspnEventCandidates([dk],[espn,{...espn,id:'401123457'}]),[]);
});

test('actual Nash event participant codes match ESPN abbreviations without self-confirming',async()=>{
 const {draftKingsNashEspnEventCandidates}=await import('../lib/draftkings-nash-feed.js');
 const date=new Date(Date.now()+86400000).toISOString();
 const nash={id:'34118182',startEventDate:date,participants:[
  {type:'Team',metadata:{shortName:'GB'}},{type:'Team',metadata:{shortName:'CAR'}}]};
 const espn={id:'401123456',date,competitions:[{competitors:[
  {team:{abbreviation:'CAR'}},{team:{abbreviation:'GB'}}]}]};
 const matches=draftKingsNashEspnEventCandidates([nash],[espn]);
 assert.equal(matches.length,1);
 assert.equal(matches[0].confirmed,false);
 assert.deepEqual(draftKingsNashEspnEventCandidates([{...nash,participants:[{type:'Team',metadata:{shortName:'GB'}}]}],[espn]),[]);
 assert.deepEqual(draftKingsNashEspnEventCandidates([nash],[{...espn,date:new Date(Date.now()+2*86400000).toISOString()}]),[]);
 assert.deepEqual(draftKingsNashEspnEventCandidates([nash],[espn,{...espn,id:'401123457'}]),[]);
});
