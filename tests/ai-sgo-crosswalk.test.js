import test from "node:test";
import assert from "node:assert/strict";
import { buildSgoReadOnlyCrosswalk } from "../lib/ai-mechanics/sgo-crosswalk.js";
import { reviewRawSgoGameSnapshot } from "../lib/ai-mechanics/sgo-raw-event.js";

const game={
  gameId:"espn-001",kickoff:"2026-10-11T20:00:00Z",
  teams:[
    {abbr:"PHI",id:"21",homeAway:"home"},
    {abbr:"CHI",id:"3",homeAway:"away"}
  ],
  playerProjections:[
    {playerId:"espn-p1",name:"Example Runner",team:"PHI",position:"RB",
      availability:"ACTIVE_ROTATION",starterStatus:"CONFIRMED_STARTER",
      verification:{role:{verified:true}}},
    {playerId:"espn-p2",name:"Example Receiver",team:"CHI",position:"WR"}
  ]
};
const event={
  eventID:"sgo-event-001",startTime:game.kickoff,
  teams:{
    home:{teamID:"PHILADELPHIA_EAGLES_NFL",names:{short:"PHI"}},
    away:{teamID:"CHICAGO_BEARS_NFL",names:{short:"CHI"}}
  },
  players:{
    SGO_P1:{playerID:"SGO_P1",teamID:"PHILADELPHIA_EAGLES_NFL",name:"Example Runner"},
    SGO_P2:{playerID:"SGO_P2",teamID:"CHICAGO_BEARS_NFL",name:"Example Receiver"}
  },
  odds:{
    prop1:{
      statEntityID:"SGO_P1",marketName:"Rushing Yards Over/Under",statID:"rushing_yards",
      periodID:"game",betTypeID:"ou",sideID:"over",
      byBookmaker:{
        fanduel:{odds:"-110",overUnder:"84.5",available:true,lastUpdatedAt:new Date(1000).toISOString()}
      }
    }
  }
};
const inputs={game,event,capturedAt:1000,now:1100};

test("strict team, player and kickoff crosswalk generates advisory mappings",()=>{
  const r=buildSgoReadOnlyCrosswalk(inputs);
  assert.equal(r.ready,true,JSON.stringify(r));
  assert.equal(r.matchedPlayers,2);
  assert.equal(r.playerMappings[0].playerId,"espn-p1");
  assert.equal(r.playerMappings[0].upstreamPlayerId,"SGO_P1");
  assert.equal(r.eventMapping.teamIds.PHI,"PHILADELPHIA_EAGLES_NFL");
});
test("crosswalk supports actual raw quote review without browser mappings",()=>{
  const ids=buildSgoReadOnlyCrosswalk(inputs);
  const review=reviewRawSgoGameSnapshot({
    ...inputs,eventMapping:ids.eventMapping,playerMappings:ids.playerMappings,
    picks:[{gameId:game.gameId,playerId:"espn-p1",team:"PHI",
      market:"rushing_yards",line:84.5,sportsbook:"FanDuel"}]
  });
  assert.equal(review.ready,true,JSON.stringify(review));
});
test("swapped home and away teams are rejected",()=>{
  const swapped={...event,teams:{home:event.teams.away,away:event.teams.home}};
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,event:swapped}).reason,"unverified_home_away_team_crosswalk");
});
test("kickoff mismatches more than ten minutes fail closed",()=>{
  const changed={...event,startTime:"2026-10-11T20:11:00Z"};
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,event:changed}).reason,"kickoff_not_correlated");
});
test("missing kickoff fails closed",()=>{
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,game:{...game,kickoff:null}}).reason,"kickoff_not_correlated");
});
test("missing event player identity fails closed",()=>{
  const altered={...event,players:{SGO_P1:{...event.players.SGO_P1,playerID:null}}};
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,event:altered}).reason,"no_unambiguous_player_crosswalk");
});
test("same player name on opposing team must not cross",()=>{
  const altered={...event,players:{
    SGO_P1:{...event.players.SGO_P1,teamID:"CHICAGO_BEARS_NFL"}
  }};
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,event:altered}).reason,"no_unambiguous_player_crosswalk");
});
test("duplicate roster identity cannot be promoted to verified player mapping",()=>{
  const duplicate={...game,playerProjections:[
    game.playerProjections[0],
    {...game.playerProjections[0],playerId:"espn-p3"}
  ]};
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,game:duplicate}).reason,"no_unambiguous_player_crosswalk");
});
test("different SGO IDs cannot map to the same ESPN player",()=>{
  const ev={...event,players:{
    SGO_P1:event.players.SGO_P1,SGO_P3:{...event.players.SGO_P1,playerID:"SGO_P3"}
  }};
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,event:ev}).matchedPlayers,1);
});
test("snapshot past the 15 minute freshness gate fails closed",()=>{
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,now:1000000}).reason,"stale_event_snapshot");
});
test("missing ESPN team IDs fails closed",()=>{
  const invalid={...game,teams:[{...game.teams[0],id:null},game.teams[1]]};
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,game:invalid}).reason,"untrusted_espn_team_identity");
});
test("a misleading SGO team ID cannot be accepted merely because a name matches",()=>{
  const changed={...event,players:{SGO_P1:{...event.players.SGO_P1,teamID:"OTHER_NFL"}}};
  assert.equal(buildSgoReadOnlyCrosswalk({...inputs,event:changed}).reason,"no_unambiguous_player_crosswalk");
});
