import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectNflSgoShadow } from "../lib/ai-mechanics/nfl-shadow-bridge.js";

const now=10000000, capturedAt=now-30*1000;
const gameIdentity={gameId:"espn-evt",kickoff:"2026-10-11T20:00:00Z",
 teams:[{id:"4",abbr:"PHI",homeAway:"home"},{id:"7",abbr:"DAL",homeAway:"away"}]};
const rolePlayers=[{playerId:"espn-player-1",name:"Sample Runner",team:"PHI",
 position:"RB",availability:"ACTIVE_ROTATION",starterStatus:"CONFIRMED_STARTER",
 verification:{role:{verified:true}}}];
const line={statEntityID:"sgo-player-1",teamID:"PHILADELPHIA_EAGLES_NFL",
 statID:"rushing_yards",marketName:"Rushing Yards Over/Under",
 periodID:"game",betTypeID:"ou",sideID:"over",
 byBookmaker:{fanduel:{available:true,odds:-110,overUnder:84.5,
 lastUpdatedAt:new Date(now-60000).toISOString()}}};
const event={eventID:"sgo-evt",leagueID:"NFL",startTime:gameIdentity.kickoff,
 teams:{home:{teamID:"PHILADELPHIA_EAGLES_NFL",names:{short:"PHI"}},
 away:{teamID:"DALLAS_COWBOYS_NFL",names:{short:"DAL"}}},
 players:{"sgo-player-1":{playerID:"sgo-player-1",name:"Sample Runner",
 teamID:"PHILADELPHIA_EAGLES_NFL"}},odds:{a:line}};
const input={gameIdentity,rolePlayers,events:[event],capturedAt,now};

test("existing ESPN and SGO objects produce verified *shadow* identity counts",()=>{
 const r=inspectNflSgoShadow(input);
 assert.equal(r.ready,true,JSON.stringify(r));
 assert.equal(r.crosswalkVerified,true);
 assert.equal(r.matchedPlayers,1);
 assert.equal(r.quoteRows,1);
 assert.equal(r.advisoryOnly,true);
 assert.equal(r.publishingDisabled,true);
 assert.equal(r.combinedSgpQuoteVerified,false);
 assert.equal(r.sourceEventId,"sgo-evt");
});
test("a wrong game kickoff or team side cannot inherit another game's book lines",()=>{
 const wrong={...event,startTime:"2026-10-11T20:40:00Z"};
 assert.equal(inspectNflSgoShadow({...input,events:[wrong]}).ready,false);
 assert.equal(inspectNflSgoShadow({...input,events:[{...event,
 teams:{...event.teams,home:event.teams.away,away:event.teams.home}}]}).ready,false);
});
test("duplicate matching event IDs fail closed instead of picking first",()=>{
 const duplicate={...event,eventID:"sgo-evt2"};
 const r=inspectNflSgoShadow({...input,events:[event,duplicate]});
 assert.equal(r.reason,"ambiguous_sgo_event_identity");
 assert.equal(r.crosswalkVerified,false);
});
test("raw sportsbook quote must remain current, not merely the snapshot",()=>{
 const old={...line,byBookmaker:{fanduel:{
 ...line.byBookmaker.fanduel,lastUpdatedAt:new Date(now-3600000).toISOString()}}};
 const r=inspectNflSgoShadow({...input,events:[{...event,odds:{a:old}}]});
 assert.equal(r.ready,false);
 assert.equal(r.crosswalkVerified,true);
 assert.equal(r.quoteRows,0);
});
test("expired event snapshot, missing role roster and wrong league fail closed",()=>{
 assert.equal(inspectNflSgoShadow({...input,capturedAt:now-16*60000}).reason,"sgo_snapshot_stale");
 assert.equal(inspectNflSgoShadow({...input,rolePlayers:[]}).reason,"espn_player_roster_missing");
 assert.equal(inspectNflSgoShadow({...input,events:[{...event,leagueID:"NBA"}]}).ready,false);
});
test("missing exact player name or team cannot verify sportsbook rows",()=>{
 const noMatch={...event,players:{"sgo-player-1":{
 ...event.players["sgo-player-1"],name:"Another Person"}}};
 assert.equal(inspectNflSgoShadow({...input,events:[noMatch]}).crosswalkVerified,false);
});
test("NFL live handler wires only existing server-side ESPN/SGO snapshots",()=>{
 const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.match(src,/sgoShadow=inspectNflSgoShadow\(/);
 assert.match(src,/gameIdentity:eligibility\.gameIdentity/);
 assert.match(src,/rolePlayers:roles\.players\|\|\[\]/);
 assert.match(src,/events:chosen/);
 assert.match(src,/capturedAt:Number\(CACHE\.get\(date\)\?\.at\)/);
 assert.match(src,/verifiedCombinedBookQuotes:0/);
});
