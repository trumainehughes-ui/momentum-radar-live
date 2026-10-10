import test from "node:test";
import assert from "node:assert/strict";
import { reviewServerSgoShadow } from "../lib/ai-mechanics/sgo-shadow-review.js";
const now=1100, ts=new Date(1000).toISOString();
const game={gameId:"espn-111",kickoff:"2026-10-11T18:00:00Z",
  teams:[{id:"1",abbr:"KC",homeAway:"home"},{id:"2",abbr:"LV",homeAway:"away"}],
  playerProjections:[{playerId:"ep1",name:"Sample Runner",team:"KC",availability:"ACTIVE_ROTATION",
    starterStatus:"CONFIRMED_STARTER",verification:{role:{verified:true}}}]};
const event={eventID:"sgo-111",startTime:game.kickoff,
  teams:{home:{teamID:"KANSAS_CITY_CHIEFS_NFL",names:{short:"KC"}},
    away:{teamID:"LAS_VEGAS_RAIDERS_NFL",names:{short:"LV"}}},
  players:{sp1:{playerID:"sp1",teamID:"KANSAS_CITY_CHIEFS_NFL",name:"Sample Runner"}},
  odds:{stat1:{statEntityID:"sp1",statID:"rushing_yards",marketName:"Rushing Yards Over/Under",
    periodID:"game",betTypeID:"ou",sideID:"over",
    byBookmaker:{draftkings:{odds:"-110",overUnder:"85.5",
      lastUpdatedAt:ts,available:true}}}}};
const pick={gameId:"espn-111",playerId:"ep1",team:"KC",
  market:"rushing_yards",line:85.5,sportsbook:"DraftKings"};
const input={game,event,picks:[pick],capturedAt:1000,now};

test("server-only crosswalk yields read-only eligible book market evidence",()=>{
  const r=reviewServerSgoShadow(input);
  assert.equal(r.ready,true,JSON.stringify(r));
  assert.equal(r.advisoryOnly,true);
  assert.equal(r.publishingDisabled,true);
  assert.equal(r.combinedSgpQuoteVerified,false);
  assert.equal(r.matchedPlayers,1);
});
test("client-provided crosswalk fields are ignored even when adversarial",()=>{
  const r=reviewServerSgoShadow({...input,
    playerMappings:[{gameId:"spoof",playerId:"bad",source:"verified_espn_sgo_crosswalk"}],
    eventMapping:{gameId:"spoof",eventId:"spoof"}});
  assert.equal(r.ready,true);
  assert.equal(r.matchedPlayers,1);
});
test("unconfirmed starter blocks shadow pick even when identities align",()=>{
  const changed={...game,playerProjections:[{...game.playerProjections[0],starterStatus:"UNVERIFIED_ROLE"}]};
  const r=reviewServerSgoShadow({...input,game:changed});
  assert.equal(r.ready,false);
  assert.ok(r.reviewed?.some(x=>x.reasons.includes("starter_or_active_status_unconfirmed")));
});
test("wrong player team blocks crosswalk automatically",()=>{
  const changed={...event,players:{sp1:{...event.players.sp1,teamID:"LAS_VEGAS_RAIDERS_NFL"}}};
  const r=reviewServerSgoShadow({...input,event:changed});
  assert.equal(r.ready,false);
  assert.equal(r.reason,"no_unambiguous_player_crosswalk");
});
test("unverified capture blocks complete shadow review without fallback",()=>{
  const r=reviewServerSgoShadow({...input,now:1000000});
  assert.equal(r.ready,false);
  assert.equal(r.publishingDisabled,true);
  assert.equal(r.reason,"stale_event_snapshot");
});
test("no exact sportsbook line does not imply a verified selection",()=>{
  const r=reviewServerSgoShadow({...input,picks:[{...pick,line:90.5}]});
  assert.equal(r.ready,false);
  assert.equal(r.combinedSgpQuoteVerified,false);
});
