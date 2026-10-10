import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import researchHandler from "../api/nfl-player-research.js";
import {buildNflPlayerResearchQueue} from "../lib/ai-mechanics/nfl-player-research.js";

const game={gameId:"401872981",homeAbbr:"JAX",awayAbbr:"PHI"};
const categories={
 td:[{name:"Josh Cameron",playerId:"espn-11",team:"JAX",projection:"Anytime TD"},
     {name:"Dallas Goedert",playerId:"espn-12",team:"PHI",projection:"Anytime TD"}],
 receiving:[{name:"Josh Cameron",playerId:"espn-11",team:"JAX",projection:62}],
 rushing:[{name:"Unknown Runner",playerId:"x42",team:"JAX",projection:38}]
};
const playerAvailability={
 players:[{name:"Josh Cameron",playerId:"espn-11",team:"JAX",position:"WR",
   starterVerified:false,availability:"QUESTIONABLE"},
   {name:"Dallas Goedert",playerId:"espn-12",team:"PHI",position:"TE",
   starterVerified:true,availability:"ACTIVE_ROTATION"}],
 injuries:[{name:"Josh Cameron",team:"JAX",status:"QUESTIONABLE"}],
 playerChecks:[{name:"Dallas Goedert",marketTeam:"JAX",rosterTeam:"PHI",
   status:"TEAM_MISMATCH"}]
};
const input={game,categories,playerAvailability,
 marketEvidence:{state:"PROVIDER_QUOTA_EXHAUSTED"}};
test("research tasks retain player, team, exact market, and source lookup strings",()=>{
 const r=buildNflPlayerResearchQueue(input);
 assert.equal(r.gameId,game.gameId);
 assert.equal(r.sportsbookEvidenceState,"PROVIDER_QUOTA_EXHAUSTED");
 assert.equal(r.quotedBookPricesVerified,0);
 assert.equal(r.combinedSgpQuotesVerified,0);
 assert.equal(r.aiMayVerifyPrices,false);
 assert.equal(r.queue.length,4);
 const p=r.queue.find(x=>x.player==="Josh Cameron"&&x.category==="receiving");
 assert.equal(p.market,"receiving yards");
 assert.ok(p.lookups.draftKings.includes("site:sportsbook.draftkings.com"));
 assert.ok(p.lookups.fanDuel.includes("site:sportsbook.fanduel.com"));
 assert.equal(p.bookOfferVerified,false);
});
test("reported injury and roster-team mismatch are prioritized as research tasks",()=>{
 const r=buildNflPlayerResearchQueue(input);
 const injured=r.queue.find(x=>x.player==="Josh Cameron"&&x.category==="td");
 assert.ok(injured.issues.includes("INJURY_OR_AVAILABILITY_CHECK"));
 const wrong=r.queue.find(x=>x.player==="Dallas Goedert");
 assert.equal(wrong.teamMismatch,true);
 assert.ok(wrong.issues.includes("TEAM_MISMATCH"));
});
test("name-only match or wrong ESPN athlete ID never counts as verified player identity",()=>{
 const r=buildNflPlayerResearchQueue({...input,categories:{receiving:[
  {name:"Josh Cameron",team:"JAX",projection:62},
  {name:"Dallas Goedert",playerId:"other-player",team:"PHI",projection:48}
 ]}});
 assert.ok(r.queue.every(x=>x.rosterMatched===false));
 assert.ok(r.queue.every(x=>x.issues.includes("ROSTER_IDENTITY_UNVERIFIED")));
});
test("reported sportsbook snippets and model lines cannot turn into verified odds",()=>{
 const r=buildNflPlayerResearchQueue({...input,categories:{
  receiving:[{...categories.receiving[0],bestBook:{
   book:"DraftKings",odds:+450,line:65,lastUpdatedAt:new Date().toISOString()}}]
 }});
 assert.equal(r.quotedBookPricesVerified,0);
 assert.equal(r.queue[0].bookOfferVerified,false);
 assert.equal(r.queue[0].combinedSgpQuoteVerified,false);
});
test("unknown categories, empty names and oversized player pool are bounded",()=>{
 const long=Array.from({length:65},(_,i)=>({name:"Sample Player "+i,team:"JAX",playerId:"p"+i}));
 const r=buildNflPlayerResearchQueue({
  game,categories:{rushing:long,bogus:long},maxPlayers:60
 });
 assert.equal(r.queue.length,8);
 assert.equal(buildNflPlayerResearchQueue({}).queue.length,0);
});
function res(){return{statusCode:null,body:null,headers:{},
 setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},
 json(value){this.body=value;return this}}}
test("server research endpoint builds advisory checklist with no external network",async()=>{
 const reply=res();
 await researchHandler({method:"POST",headers:{},body:input},reply);
 assert.equal(reply.statusCode,200);
 assert.equal(reply.body.ok,true);
 assert.equal(reply.body.evidenceBasis,"client_visible_snapshot_not_independently_refetched");
 assert.equal(reply.body.liveSportsbookScraping,false);
 assert.equal(reply.body.liveBookmakerOddsVerified,false);
 assert.equal(reply.headers["Cache-Control"],"private, no-store");
});
test("bad game IDs, origins, methods and payloads cannot invoke research",async()=>{
 for(const req of [
  {method:"GET",headers:{},body:input},
  {method:"POST",headers:{},body:{...input,game:{gameId:"../../secrets"}}},
  {method:"POST",headers:{origin:"https://untrusted.example"},body:input},
  {method:"POST",headers:{},body:{...input,noise:"x".repeat(40000)}}
 ]){
  const reply=res();
  await researchHandler(req,reply);
  assert.ok([400,403,405,413].includes(reply.statusCode));
  assert.equal(reply.body.ok,false);
 }
});
test("NFL Groq research mode is source-bounded, not browsing or verified betting",()=>{
 const server=readFileSync(new URL("../api/ai-analysis.js",import.meta.url),"utf8");
 const client=readFileSync(new URL("../public-ai.js",import.meta.url),"utf8");
 assert.ok(server.includes("'research'"));
 assert.ok(server.includes("Analyze the research.queue items"));
 assert.ok(server.includes("do not claim the websites were automatically browsed"));
 assert.ok(client.includes('<option value="research">Player &amp; market research</option>'));
 assert.ok(client.includes("fetch('/api/nfl-player-research'"));
 assert.ok(client.includes("quotedBookPricesVerified:0,combinedSgpQuotesVerified:0"));
 assert.ok(client.includes("playerId:x.playerID||x.playerId||null"));
});
