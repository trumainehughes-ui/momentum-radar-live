import test from "node:test";
import assert from "node:assert/strict";
import {makeNflSearchBroker} from "../lib/ai-mechanics/nfl-search-broker.js";
import {makeOfficialNflMarketSearch} from "../lib/ai-mechanics/nfl-public-market-search.js";

const request=makeOfficialNflMarketSearch({
 gameId:"401872981",player:"Dallas Goedert",team:"PHI",
 market:"receiving",book:"DraftKings"
});
const bookResult={ok:true,results:[{
 url:"https://sportsbook.draftkings.com/nfl/props",
 title:"Official DK page",livePriceVerified:false
}],quotedBookPricesVerified:0,combinedSgpQuotesVerified:0};

test("simultaneous same-market clicks require only one upstream Brave query",async()=>{
 let calls=0,release;
 const wait=new Promise(done=>release=done);
 const broker=makeNflSearchBroker({clock:()=>10000000,
  search:async()=>{calls++;await wait;return bookResult;}});
 const first=broker({request,apiKey:"secret",clientId:"1.1.1.1"});
 const second=broker({request,apiKey:"secret",clientId:"1.1.1.1"});
 assert.equal(calls,1);
 release();
 const [a,b]=await Promise.all([first,second]);
 assert.equal(calls,1);
 assert.equal(a.code,200);
 assert.equal(a.body.gameId,"401872981");
 assert.equal(a.body.player,"Dallas Goedert");
 assert.equal(a.body.book,"DraftKings");
 assert.equal(a.body.cached,false);
 assert.equal(b.code,200);
 assert.equal(b.body.deduplicated,true);
 assert.equal(b.body.quotedBookPricesVerified,0);
 const third=await broker({request,apiKey:"secret",clientId:"1.1.1.1"});
 assert.equal(calls,1,"cached result must not spend another upstream search");
 assert.equal(third.body.cached,true);
 assert.equal(third.body.book,"DraftKings","cached body retains book/source metadata");
 assert.equal(third.body.gameId,request.gameId);
 assert.equal(third.body.player,request.player);
});
test("another player or a different sportsbook is a different search",async()=>{
 let calls=0;
 const broker=makeNflSearchBroker({
  search:async()=>{calls++;return bookResult}
 });
 await broker({request,apiKey:"key"});
 await broker({request:{...request,book:"FanDuel"},apiKey:"key"});
 await broker({request:{...request,player:"Saquon Barkley"},apiKey:"key"});
 assert.equal(calls,3);
});
test("per-instance quota blocks further unique searches but not cached repeats",async()=>{
 let calls=0,now=10000000;
 const broker=makeNflSearchBroker({clock:()=>now,limitPerHour:2,
  search:async()=>{calls++;return bookResult}});
 const one=await broker({request,apiKey:"key",clientId:"client"});
 const two=await broker({request:{...request,market:"rushing"},apiKey:"key",clientId:"client"});
 assert.equal(one.code,200);assert.equal(two.code,200);
 const denied=await broker({request:{...request,market:"passing"},apiKey:"key",clientId:"client"});
 assert.equal(denied.code,429);
 assert.equal(denied.body.error,"research_budget_reached");
 const cached=await broker({request,apiKey:"key",clientId:"client"});
 assert.equal(cached.code,200);
 assert.equal(cached.body.cached,true);
 assert.equal(calls,2);
 now+=3600000;
 const nextHour=await broker({request:{...request,market:"passing"},apiKey:"key",clientId:"client"});
 assert.equal(nextHour.code,200);
 assert.equal(calls,3);
});
test("failed lookups are not cached; authorization and rate-limit metadata stay safe",async()=>{
 let calls=0;
 const broker=makeNflSearchBroker({search:async()=>{
  calls++;return calls===1?{ok:false,error:"search_rate_limited"}:bookResult;
 }});
 const a=await broker({request,apiKey:"secret"});
 assert.equal(a.code,429);
 assert.equal(a.body.error,"search_rate_limited");
 assert.equal(JSON.stringify(a).includes("secret"),false);
 const b=await broker({request,apiKey:"secret"});
 assert.equal(b.code,200);
 assert.equal(calls,2);
});
test("cache expires and a new user search refreshes discovered pages",async()=>{
 let now=10000000,calls=0;
 const broker=makeNflSearchBroker({clock:()=>now,cacheMs:1000,
  search:async()=>{calls++;return {...bookResult,revision:calls}}});
 await broker({request,apiKey:"key"});
 now+=1001;
 const newer=await broker({request,apiKey:"key"});
 assert.equal(calls,2);
 assert.equal(newer.body.revision,2);
 assert.equal(newer.body.cached,false);
});
test("unexpected upstream exception is contained, with no stored sensitive message",async()=>{
 const broker=makeNflSearchBroker({search:async()=>{throw Error("API token: 12345")}});
 const out=await broker({request,apiKey:"secret"});
 assert.equal(out.code,502);
 assert.equal(out.body.error,"search_provider_unavailable");
 assert.equal(JSON.stringify(out).includes("12345"),false);
 assert.equal(JSON.stringify(out).includes("secret"),false);
});
