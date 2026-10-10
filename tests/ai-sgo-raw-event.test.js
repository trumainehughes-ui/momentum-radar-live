import test from "node:test";
import assert from "node:assert/strict";
import { reviewRawSgoGameSnapshot } from "../lib/ai-mechanics/sgo-raw-event.js";

const player = { playerId:"p1", team:"PHI", availability:"ACTIVE_ROTATION",
  starterStatus:"CONFIRMED_STARTER", verification:{role:{verified:true}} };
const game = { gameId:"g1", teams:[{abbr:"PHI"},{abbr:"CHI"}], playerProjections:[player] };
const pick = { gameId:"g1", playerId:"p1", team:"PHI", market:"rushing_yards",
  line:84.5, sportsbook:"FanDuel" };
const raw = {statEntityID:"SGO-player-9",teamID:"PHI",marketName:"player_rush_yds",
  periodID:"game",betTypeID:"ou",sideID:"over",byBookmaker:{
    fanduel:{odds:-110,overUnder:84.5,available:true},
    draftkings:{odds:-105,overUnder:85.5,available:true},
    otherbook:{odds:+120,overUnder:84.5,available:true}
  }};
const event = { eventID:"e1",teams:{home:{teamID:"PHI"},away:{teamID:"CHI"}},
  odds:{prop1:raw} };
const playerMappings = [{gameId:"g1",eventId:"e1",upstreamPlayerId:"SGO-player-9",
  playerId:"p1",team:"PHI",source:"verified_espn_sgo_crosswalk",verifiedAt:1000}];
const input = { game,event,eventMapping:{gameId:"g1",eventId:"e1"},
  playerMappings,picks:[pick],capturedAt:1000,now:1100 };

test("real SGO v2 event.odds and byBookmaker review exact FanDuel half-yard", () => {
  const r=reviewRawSgoGameSnapshot(input);
  assert.equal(r.ready,true,JSON.stringify(r));
  assert.equal(r.acceptedMarkets,1);
  assert.equal(r.advisoryOnly,true);
});
test("does not conflate FanDuel and DraftKings thresholds", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,picks:[{...pick,line:85.5}]}).ready,false));
test("DraftKings line verifies only a DraftKings pick", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,picks:[{...pick,sportsbook:"DraftKings",line:85.5}]}).ready,true));
test("unmapped upstream player ID never becomes an ESPN ID", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,playerMappings:[]}).reason,"no_verified_raw_player_markets"));
test("caller cannot substitute a different ESPN player in mapping", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,playerMappings:[{...playerMappings[0],playerId:"p2"}]}).reason,"unverified_player_crosswalk"));
test("verified role source marker required for crosswalk", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,playerMappings:[{...playerMappings[0],source:"browser"}]}).reason,"unverified_player_crosswalk"));
test("crosswalk cannot be reused across another game", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,playerMappings:[{...playerMappings[0],gameId:"g2"}]}).reason,"unverified_player_crosswalk"));
test("duplicate upstream crosswalks fail closed", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,playerMappings:[...playerMappings,...playerMappings]}).reason,"ambiguous_player_crosswalk"));
test("mismatched event team list blocks raw odds", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,event:{...event,teams:{home:{teamID:"PHI"},away:{teamID:"NYG"}}}}).reason,"unverified_game_team_match"));
test("mismatched raw player team cannot verify pick", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,event:{...event,odds:{prop1:{...raw,teamID:"CHI"}}}}).ready,false));
test("expired capture fails closed", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,now:1000000}).reason,"stale_or_missing_raw_capture"));
test("future capture fails closed", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,capturedAt:1200}).reason,"stale_or_missing_raw_capture"));
test("expired player mapping fails closed", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,now:50*60*60*1000,capturedAt:50*60*60*1000}).reason,"unverified_player_crosswalk"));
test("market with unavailable FanDuel quote fails closed", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,event:{...event,odds:{prop1:{...raw,byBookmaker:{fanduel:{...raw.byBookmaker.fanduel,available:false}}}}}}).ready,false));
test("suspicious price value is rejected", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,event:{...event,odds:{prop1:{...raw,byBookmaker:{fanduel:{odds:-12,overUnder:84.5,available:true}}}}}}).ready,false));
test("wrong market or side fails closed", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,event:{...event,odds:{prop1:{...raw,sideID:"under"}}}}).ready,false));
test("name-only raw row without identity cannot verify quote", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,event:{...event,odds:{prop1:{...raw,statEntityID:null,playerName:"Player One"}}}}).ready,false));
test("real anytime TD Yes market normalized with 1-touchdown semantic line", () => {
  const tdPick={...pick,market:"anytime_td",line:1};
  const tdRaw={...raw,marketName:"touchdowns",statID:"touchdowns",betTypeID:"yn",sideID:"yes",
    byBookmaker:{fanduel:{available:true,odds:120}}};
  assert.equal(reviewRawSgoGameSnapshot({...input,picks:[tdPick],event:{...event,odds:{prop1:tdRaw}}}).ready,true);
});
test("zero raw odds never causes positive review", () =>
  assert.equal(reviewRawSgoGameSnapshot({...input,event:{...event,odds:{}}}).ready,false));
