import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../lib/nba-best-edge-parlay.js',import.meta.url),'utf8');
test('NBA Edge Hunter holds questionable and reserve-listed candidates without substring false positives',()=>{
 assert.ok(source.includes('/\\b(?:OUT|INACTIVE|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|SUSPENDED)\\b/i.test('));
 assert.ok(!source.includes('/OUT|INACTIVE|DOUBTFUL|SUSPENDED/i.test('));
});

test('public NBA Edge Hunter research also withholds questionable and reserve-listed players',()=>{
 const endpoint=readFileSync(new URL('../api/nba-best-edge.js',import.meta.url),'utf8');
 assert.ok(endpoint.includes('/\\b(OUT|INACTIVE|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|SUSPENDED)\\b/i.test('));
});

test('NBA Edge Hunter reports missing starters, last-ten histories and independently verified offers',()=>{
 const endpoint=readFileSync(new URL('../api/nba-best-edge.js',import.meta.url),'utf8');
 for(const blocker of ['GAME_SCOPED_STARTERS_NOT_CONFIRMED','TEN_GAME_PLAYER_HISTORY_MISSING',
  'TWO_FRESH_VERIFIED_BOOK_OFFERS_PER_PLAYER_MISSING','PREGAME_INJURY_CHECKS_MISSING']){
  assert.ok(endpoint.includes(blocker),blocker);
 }
 assert.ok(endpoint.includes('snapshotHealth,readinessBlockers,aiMatchupReviews'));
});

test('NBA early-season baseline requests up to twenty prior-season games per team for last-ten evidence',()=>{
 const model=readFileSync(new URL('../lib/nba-pregame-model.js',import.meta.url),'utf8');
 assert.ok(model.includes('nbaCompletedTeamGames(x,game.kickoff,20)))].slice(0,40)'));
 assert.ok(model.includes("sampleSource='PRIOR_SEASON'"));
});

test('NBA recent form is ordered by scheduled game dates, not fetch order',()=>{
 const model=readFileSync(new URL('../lib/nba-pregame-model.js',import.meta.url),'utf8');
 assert.ok(model.includes('const games=[...p.games.values()].sort('));
 assert.ok(model.includes('Date.parse(b.gameDate)'));
 assert.ok(model.includes('eventDates.get(String(h.gameId))'));
 assert.ok(model.includes('evidenceSchedules=previous'));
 assert.ok(model.includes('minuteRows.slice(0,3)'));
 assert.ok(model.includes('usageRows.slice(0,3)'));
 assert.ok(!model.includes('minuteRows.slice(-3)'));
 assert.ok(!model.includes('usageRows.slice(-3)'));
});
