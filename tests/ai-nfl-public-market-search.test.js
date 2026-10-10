import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeOfficialNflMarketSearch,pickOfficialNflSearchResults,
 queryOfficialNflMarketSearch} from "../lib/ai-mechanics/nfl-public-market-search.js";
import handler from "../api/nfl-public-market-search.js";

const chosen={gameId:"401872981",player:"Dallas Goedert",team:"PHI",
 market:"receiving",book:"DraftKings"};
const fakeTime=Date.parse("2026-10-10T16:10:00Z");
const build=()=>makeOfficialNflMarketSearch(chosen);
function response(){
 return {headers:{},code:0,body:null,setHeader(key,value){this.headers[key]=value;return this},
 status(code){this.code=code;return this},json(value){this.body=value;return this}};
}
test("NFL official-book web search is strictly a single prebuilt per-player lookup",()=>{
 const x=build();
 assert.equal(x.domain,"sportsbook.draftkings.com");
 assert.match(x.q,/^site:sportsbook\.draftkings\.com/);
 assert.ok(x.q.includes('"Dallas Goedert"'));
 assert.ok(x.q.includes('"receiving yards"'));
 assert.ok(x.q.includes('"PHI"'));
 assert.equal(x.count,5);
 assert.equal(makeOfficialNflMarketSearch({...chosen,book:"UntrustedBook"}),null);
 assert.equal(makeOfficialNflMarketSearch({...chosen,market:"banking"}),null);
 assert.equal(makeOfficialNflMarketSearch({...chosen,team:"https://evil"}),null);
 assert.equal(makeOfficialNflMarketSearch({...chosen,gameId:"../../etc/passwd"}),null);
 assert.equal(makeOfficialNflMarketSearch({...chosen,player:'A" OR site:evil.com'}),null);
});
test("only HTTPS exact official-book host links can be displayed",()=>{
 const parsed=pickOfficialNflSearchResults({web:{results:[
  {title:"Dal Goedert Receiving",url:"https://sportsbook.draftkings.com/nfl/game/props",description:"Estimated market odds are not verified"},
  {title:"Phishing",url:"https://sportsbook.draftkings.com.evil.com/free",description:"fake"},
  {title:"Other Book",url:"https://sportsbook.fanduel.com/nfl/props",description:"fake"},
  {title:"HTTP",url:"http://sportsbook.draftkings.com/nfl",description:"untrusted"},
  {title:"Offsite via credentials",url:"https://admin@evil.com/nfl",description:"untrusted"},
  {title:"Duplicate",url:"https://sportsbook.draftkings.com/nfl/game/props"}
 ]}},chosen.book,{now:fakeTime});
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].livePriceVerified,false);
 assert.equal(parsed[0].gamePlayerMarketVerified,false);
 assert.equal(parsed[0].combinedSgpQuoteVerified,false);
 assert.equal(parsed[0].price,null);
 assert.equal(parsed[0].sourceQuoteAt,null);
 assert.equal(parsed[0].discoveredAt,new Date(fakeTime).toISOString());
});
test("Brave token is header only; request stays on fixed documented endpoint",async()=>{
 let called=0;
 const output=await queryOfficialNflMarketSearch({
  request:build(),apiKey:"secret-do-not-leak",now:fakeTime,
  fetcher:async(url,opts)=>{
   called++;
   const parsed=new URL(url);
   assert.equal(parsed.origin,"https://api.search.brave.com");
   assert.equal(parsed.pathname,"/res/v1/web/search");
   assert.ok(parsed.searchParams.get("q").startsWith("site:sportsbook.draftkings.com"));
   assert.equal(parsed.searchParams.get("count"),"5");
   assert.equal(opts.headers["X-Subscription-Token"],"secret-do-not-leak");
   assert.equal(url.includes("secret-do-not-leak"),false);
   assert.equal(opts.redirect,"error");
   assert.equal(opts.cache,"no-store");
   return {ok:true,status:200,json:async()=>({web:{results:[
    {title:"Dallas Goedert receiving yards player props",url:"https://sportsbook.draftkings.com/nfl/props",description:"Dallas Goedert receiving yards +250 listed in an indexed web snippet"}
   ]}})};
  }
 });
 assert.equal(called,1);
 assert.equal(output.ok,true);
 assert.equal(output.results.length,1);
 assert.equal(output.results[0].livePriceVerified,false);
 assert.equal(output.results[0].relevance.playerMentioned,true);
 assert.equal(output.results[0].relevance.marketMentioned,true);
 assert.equal(output.results[0].relevance.gameVerified,false);
 assert.equal(output.results[0].relevance.currentPriceVerified,false);
 assert.equal(output.playerMatchedResults,1);
 assert.equal(output.marketMentionedResults,1);
 assert.equal(output.quotedBookPricesVerified,0);
 assert.equal(output.combinedSgpQuotesVerified,0);
 assert.equal(JSON.stringify(output).includes("secret-do-not-leak"),false);
});
test("rate limit, missing key, redirects and network errors fail closed",async()=>{
 assert.deepEqual(await queryOfficialNflMarketSearch({request:build()}),
   {ok:false,error:"search_not_configured"});
 assert.equal((await queryOfficialNflMarketSearch({request:build(),apiKey:"key",
  fetcher:async()=>({ok:false,status:429})})).error,"search_rate_limited");
 assert.equal((await queryOfficialNflMarketSearch({request:build(),apiKey:"key",
  fetcher:async()=>{throw Error("no connection")}})).error,"search_provider_unavailable");
 assert.equal((await queryOfficialNflMarketSearch({request:build(),apiKey:"key",
  fetcher:async()=>({ok:true,json:async()=>{throw Error("bad json")}})})).error,"search_invalid_response");
});
test("disabled search endpoint never makes external requests or reveals a key",async()=>{
 const prevEnabled=process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED,
       prevKey=process.env.BRAVE_SEARCH_API_KEY;
 try{
  delete process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED;
  process.env.BRAVE_SEARCH_API_KEY="secret-do-not-leak";
  const res=response();
  await handler({method:"POST",headers:{},body:chosen},res);
  assert.equal(res.code,503);
  assert.equal(res.body.error,"search_disabled");
  assert.equal(JSON.stringify(res.body).includes("secret-do-not-leak"),false);
  assert.equal(res.headers["Cache-Control"],"private, no-store");
 }finally{
  if(prevEnabled===undefined)delete process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED;
  else process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED=prevEnabled;
  if(prevKey===undefined)delete process.env.BRAVE_SEARCH_API_KEY;
  else process.env.BRAVE_SEARCH_API_KEY=prevKey;
 }
});
test("search rejects unauthorized origins, bad methods and bad player inputs",async()=>{
 const res1=response(),res2=response();
 await handler({method:"GET",headers:{},body:chosen},res1);
 assert.equal(res1.code,405);
 await handler({method:"POST",headers:{origin:"https://evil.com"},body:chosen},res2);
 assert.equal(res2.code,403);
});
test("the UI requires a direct click and labels indexed links as unquoted",()=>{
 const src=readFileSync(new URL("../public-ai.js",import.meta.url),"utf8");
 assert.ok(src.includes("researchButton.onclick=async()=>"));
 assert.ok(src.includes("fetch('/api/nfl-public-market-search'"));
 assert.ok(src.includes("setResearchQueue(research.queue,gameId)"));
 assert.ok(src.includes("No live line, plus/minus odds or SGP combined price verified."));
 assert.ok(src.includes("link.rel='noopener noreferrer'"));
 assert.ok(src.includes("researchResults.replaceChildren()"));
});
