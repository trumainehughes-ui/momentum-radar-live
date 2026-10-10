import test from "node:test";
import assert from "node:assert/strict";
import {nbaSgoMarketId,reviewNbaSgoRawEvent} from "../lib/ai-mechanics/nba-sgo-raw.js";

const now=10000000, kickoff="2026-10-10T21:00:00Z";
const game={
  gameId:"nba-espn-game",kickoff,
  teams:[
    {id:"7",abbr:"DEN",homeAway:"home"},
    {id:"8",abbr:"MIN",homeAway:"away"}
  ],
  playerProjections:[{playerId:"espn-nba-player",name:"Example Center",
    team:"DEN",availability:"ACTIVE_ROTATION",starterStatus:"CONFIRMED_STARTER",
    verification:{role:{verified:true}}}]
};
const baseOdds={
  statID:"points",statEntityID:"sgo-nba-player",periodID:"game",
  betTypeID:"ou",sideID:"over",
  byBookmaker:{
    draftkings:{available:true,odds:-112,overUnder:24.5,
      lastUpdatedAt:new Date(now-1000).toISOString()},
    fanduel:{available:true,odds:-108,overUnder:25.5,
      lastUpdatedAt:new Date(now-1000).toISOString()}
  }
};
const event={
  eventID:"sgo-nba-game",leagueID:"NBA",startTime:kickoff,
  teams:{
    home:{teamID:"DENVER_NUGGETS_NBA",names:{short:"DEN"}},
    away:{teamID:"MINNESOTA_TIMBERWOLVES_NBA",names:{short:"MIN"}}
  },
  players:{
    "sgo-nba-player":{playerID:"sgo-nba-player",teamID:"DENVER_NUGGETS_NBA",name:"Example Center"}
  },
  odds:{prop:baseOdds}
};
const pick={gameId:"nba-espn-game",playerId:"espn-nba-player",
  team:"DEN",market:"points",line:24.5,sportsbook:"DraftKings"};
const input={game,event,picks:[pick],capturedAt:now-1000,now};

test("SportsGameOdds NBA player points normalize through strict ESPN game identity",()=>{
 const reviewed=reviewNbaSgoRawEvent(input);
 assert.equal(reviewed.ready,true,JSON.stringify(reviewed));
 assert.equal(reviewed.marketRows,1);
 assert.equal(reviewed.matchedPlayers,1);
 assert.equal(reviewed.advisoryOnly,true);
 assert.equal(reviewed.publishingDisabled,true);
 assert.equal(reviewed.combinedSgpQuoteVerified,false);
});
test("NBA sportsbook-specific prices are not interchangeable",()=>{
 assert.equal(reviewNbaSgoRawEvent({...input,picks:[{...pick,sportsbook:"FanDuel"}]}).ready,false);
 assert.equal(reviewNbaSgoRawEvent({...input,picks:[{...pick,sportsbook:"FanDuel",line:25.5}]}).ready,true);
});
test("NBA correct PRA statID is supported without guessing marketName",()=>{
 const raw={...baseOdds,statID:"points+rebounds+assists"};
 const reviewed=reviewNbaSgoRawEvent({...input,event:{...event,odds:{prop:raw}},
   picks:[{...pick,market:"pra"}]});
 assert.equal(reviewed.ready,true,JSON.stringify(reviewed));
});
test("NBA points, rebounds, assists, threes and combos use documented statID values",()=>{
 for(const [statID,expected] of Object.entries({
   points:"points",rebounds:"rebounds",assists:"assists",
   threePointersMade:"three_pointers","points+rebounds+assists":"pra",
   "points+rebounds":"points_rebounds","points+assists":"points_assists",
   "rebounds+assists":"rebounds_assists",steals:"steals",blocks:"blocks"
 })) assert.equal(nbaSgoMarketId({...baseOdds,statID}),expected);
});
test("NBA quarter/UNDER/spread markets fail closed",()=>{
 for(const changed of [{periodID:"1q"},{sideID:"under"},{betTypeID:"sp"}])
  assert.equal(nbaSgoMarketId({...baseOdds,...changed}),null);
});
test("NBA wrong league identity is rejected",()=>{
 assert.equal(reviewNbaSgoRawEvent({...input,event:{...event,leagueID:"WNBA"}}).reason,"wrong_upstream_league");
});
test("NBA kickoff or team mismatch blocks all market recommendations",()=>{
 assert.equal(reviewNbaSgoRawEvent({...input,event:{...event,startTime:"2026-10-10T21:30:00Z"}}).ready,false);
 assert.equal(reviewNbaSgoRawEvent({...input,event:{...event,teams:{
   ...event.teams,home:{...event.teams.home,names:{short:"LAL"}}
 }}}).ready,false);
});
test("NBA unmapped player cannot be substituted by display name",()=>{
 const ev={...event,odds:{prop:{...baseOdds,statEntityID:"some-other-player"}}};
 assert.equal(reviewNbaSgoRawEvent({...input,event:ev}).ready,false);
});
test("NBA expired book quote cannot be refreshed by the page",()=>{
 const expired={...baseOdds,byBookmaker:{draftkings:{
   ...baseOdds.byBookmaker.draftkings,lastUpdatedAt:new Date(now-20*60000).toISOString()
 }}};
 assert.equal(reviewNbaSgoRawEvent({...input,event:{...event,odds:{prop:expired}}}).ready,false);
});
test("NBA Alt line matches only exact offered alternate threshold",()=>{
 const draftkings={...baseOdds.byBookmaker.draftkings,
   altLines:[{available:true,odds:150,overUnder:29.5,
     lastUpdatedAt:new Date(now-1000).toISOString()}]};
 const ev={...event,odds:{prop:{...baseOdds,byBookmaker:{draftkings}}}};
 assert.equal(reviewNbaSgoRawEvent({...input,event:ev,picks:[{...pick,line:29.5}]}).ready,true);
 assert.equal(reviewNbaSgoRawEvent({...input,event:ev,picks:[{...pick,line:30.5}]}).ready,false);
});
