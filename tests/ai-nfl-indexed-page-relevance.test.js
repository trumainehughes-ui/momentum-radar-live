import test from "node:test";
import assert from "node:assert/strict";
import {assessNflIndexedPageRelevance} from "../lib/ai-mechanics/nfl-indexed-page-relevance.js";
import {pickOfficialNflSearchResults,queryOfficialNflMarketSearch,
 makeOfficialNflMarketSearch} from "../lib/ai-mechanics/nfl-public-market-search.js";

const gameRequest={gameId:"401872981",player:"Dallas Goedert",
 team:"PHI",market:"receiving",book:"DraftKings"};
const official="https://sportsbook.draftkings.com";
const result=(title,description="",pathname="/nfl/player-props")=>
 ({title,description,pathname});

test("full source-visible player name and prop are useful INDEX mentions, never sportsbook verification",()=>{
 const r=assessNflIndexedPageRelevance(
  result("Dallas Goedert receiving yards player props","NFL PHI receiving yards"),gameRequest);
 assert.equal(r.candidate,true);
 assert.equal(r.playerMentioned,true);
 assert.equal(r.marketMentioned,true);
 assert.equal(r.matchLevel,"PLAYER_AND_MARKET_INDEX_MENTION");
 assert.equal(r.gameVerified,false);
 assert.equal(r.playerIdVerified,false);
 assert.equal(r.currentPriceVerified,false);
 assert.equal(r.liveMarketVerified,false);
 assert.equal(r.combinedSgpVerified,false);
});
test("generic official sportsbook results cannot be assigned to an unrelated player",()=>{
 for(const title of ["NFL player props", "Dallas Cowboys receiving yards",
  "Goedert TD", "D. Goedert props", "Dallas Goedertson yards"]){
  const r=assessNflIndexedPageRelevance(result(title),gameRequest);
  assert.equal(r.candidate,false,title);
  assert.ok(r.findings.includes("PLAYER_NOT_FOUND_IN_INDEX"),title);
 }
});
test("page mentioning player but not requested stat is a weaker lead, not a verified prop",()=>{
 const r=assessNflIndexedPageRelevance(
   result("Dallas Goedert Anytime TD odds","Philadelphia Eagles touchdown scorer"),gameRequest);
 assert.equal(r.candidate,true);
 assert.equal(r.marketMentioned,false);
 assert.equal(r.matchLevel,"PLAYER_INDEX_MENTION_ONLY");
 assert.equal(r.currentPriceVerified,false);
 assert.ok(r.findings.includes("EXACT_PROP_MARKET_NOT_FOUND_IN_INDEX"));
});
test("market aliases do not confuse receptions with receiving yards",()=>{
 const receptions={...gameRequest,market:"receptions"};
 const receiving=assessNflIndexedPageRelevance(result("Dallas Goedert receiving yards"),receptions);
 const catches=assessNflIndexedPageRelevance(result("Dallas Goedert receptions props"),receptions);
 assert.equal(receiving.marketMentioned,false);
 assert.equal(catches.marketMentioned,true);
});
test("player name visible in official page path can be research lead but game remains unverified",()=>{
 const r=assessNflIndexedPageRelevance(
  result("NFL props market","", "/nfl/players/dallas-goedert"),
  gameRequest);
 assert.equal(r.candidate,true);
 assert.equal(r.marketMentioned,false);
 assert.equal(r.gameVerified,false);
});
test("football-relevant selected player beats a same-name non-NFL search result",()=>{
 const wrong=assessNflIndexedPageRelevance(
  result("Dallas Goedert basketball NBA fantasy props"),gameRequest);
 assert.equal(wrong.candidate,false);
 assert.equal(wrong.wrongSport,true);
});
test("Brave results filter irrelevant exact-host pages and prioritize correct market",()=>{
 const req=makeOfficialNflMarketSearch(gameRequest);
 const chosen=pickOfficialNflSearchResults({web:{results:[
  {title:"NFL touchdown scorer promotions",url:official+"/nfl/touchdown"},
  {title:"Dallas Goedert anytime touchdown odds",url:official+"/nfl/dallas-goedert-td"},
  {title:"Dallas Goedert receiving yards",url:official+"/nfl/markets/receiving"},
  {title:"Dallas Goedert receiving yards",url:"https://sportsbook.draftkings.com.evil.net/props"},
  {title:"College football receiving yards",url:official+"/college/receiving"},
  {title:"Dallas Goedert player home",url:official+"/nfl/dallas-goedert"},
  {title:"Other unrelated receiving yards",url:official+"/nfl/other"}
 ]}},req.book,{now:1728583800000,request:req});
 assert.equal(chosen.length,3);
 assert.equal(chosen[0].matchLevel,"PLAYER_AND_MARKET_INDEX_MENTION");
 assert.equal(chosen[0].relevance.marketMentioned,true);
 assert.equal(chosen[1].relevance.marketMentioned,false);
 for(const r of chosen){
  assert.equal(r.relevance.playerMentioned,true);
  assert.equal(r.relevance.gameVerified,false);
  assert.equal(r.livePriceVerified,false);
  assert.equal(r.combinedSgpQuoteVerified,false);
  assert.equal(r.price,null);
 }
});
test("query result count records player references but never marks a current price",async()=>{
 const req=makeOfficialNflMarketSearch(gameRequest);
 const result=await queryOfficialNflMarketSearch({
   request:req,apiKey:"unit-test",
   fetcher:async()=>({ok:true,json:async()=>({web:{results:[
    {title:"Unrelated NFL odds",url:official+"/nfl/odds"},
    {title:"Dallas Goedert receiving yards 65+",url:official+"/nfl/dallas-goedert-props",
     description:"Search index said +225 several days ago"}
   ]}})})
 });
 assert.equal(result.ok,true);
 assert.equal(result.playerMatchedResults,1);
 assert.equal(result.marketMentionedResults,1);
 assert.equal(result.results.length,1);
 assert.equal(result.quotedBookPricesVerified,0);
 assert.equal(result.combinedSgpQuotesVerified,0);
 assert.equal(result.results[0].price,null);
 assert.equal(result.results[0].sourceQuoteAt,null);
});
