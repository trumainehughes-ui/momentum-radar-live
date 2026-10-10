import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nbaEasternGameDay,nbaVerifiedScheduledFallback} from '../lib/nba-scheduled-fallback.js';
import {nbaPregameStatus,NBA_PREGAME_MODEL_VERSION} from '../api/nba-health.js';
const kickoff='2026-10-20T23:00:00Z',id='401911111';
const valid={
 gameId:id,kickoff,stage:'DAY_AHEAD_BUILD',modelVersion:NBA_PREGAME_MODEL_VERSION,
 checkedAt:'2026-10-19T23:00:00.000Z',
 home:{id:'2',abbr:'BOS'},away:{id:'16',abbr:'MIA'},
 sgps:[{risk:'Small',status:'MODEL_CANDIDATE',legs:[
  {playerId:'123',name:'Roster evidence player',team:'BOS',
   category:'points',threshold:20}],combinedBookOdds:null}]
};
const event=(opts={})=>({
 id:opts.id||id,date:opts.date||kickoff,
 season:{type:2},status:{type:{state:opts.state||'pre'}},
 competitions:[{id:opts.id||id,status:{type:{state:opts.state||'pre'}},
  competitors:[
   {homeAway:'home',team:{id:'2',abbreviation:opts.home||'BOS',displayName:'Boston Celtics'}},
   {homeAway:'away',team:{id:'16',abbreviation:opts.away||'MIA',displayName:'Miami Heat'}}
 ]}]
});
test('Eastern game-day lookup handles UTC-midnight rollover, not a different scheduled slate',()=>{
 assert.equal(nbaEasternGameDay('2026-10-21T01:10:00Z'),'20261020');
 assert.equal(nbaEasternGameDay('2026-10-20T23:00:00Z'),'20261020');
 assert.equal(nbaEasternGameDay('invalid'),null);
});
test('before ESPN detailed summary exists, exact scheduled scoreboard event can verify stored model game identity',()=>{
 const d=nbaVerifiedScheduledFallback({events:[event()]},id,valid);
 assert.equal(d.ok,true);
 assert.equal(d.status,'SCHEDULED');
 assert.equal(d.pregameSourceMode,'SCOREBOARD_VERIFIED_FALLBACK');
 assert.equal(d.matchup.home.abbr,'BOS');
 assert.equal(d.matchup.away.abbr,'MIA');
 assert.deepEqual(d.players,[]);
 assert.deepEqual(d.injuries,[]);
 assert.equal(d.validation.officialInactivesVerified,false);
 assert.equal(d.validation.sportsbookMarketsVerified,false);
 assert.equal(d.validation.combinedSgpOddsVerified,false);
 const readiness=nbaPregameStatus(valid,{now:Date.parse(kickoff)-24*3600000});
 assert.equal(readiness.status,'MODEL_ONLY');
});
test('wrong game ID, teams or tipoff blocks cached model from attaching to a different event',()=>{
 const source={events:[event()]};
 assert.equal(nbaVerifiedScheduledFallback(source,id,{...valid,gameId:'401911112'}),null);
 assert.equal(nbaVerifiedScheduledFallback({events:[event({id:'401911112'})]},id,valid),null);
 assert.equal(nbaVerifiedScheduledFallback({events:[event({home:'PHI'})]},id,valid),null);
 assert.equal(nbaVerifiedScheduledFallback({events:[event({away:'PHI'})]},id,valid),null);
 assert.equal(nbaVerifiedScheduledFallback({events:[event({date:'2026-10-20T23:02:00Z'})]},id,valid),null);
 assert.equal(nbaVerifiedScheduledFallback({events:[event({state:'post'})]},id,valid),null);
 assert.equal(nbaVerifiedScheduledFallback({},id,valid),null);
 assert.equal(nbaVerifiedScheduledFallback(source,id,null),null);
});
test('old store content without home/away can still be cross-checked by exact ESPN game ID plus tipoff and two teams',()=>{
 const before={...valid};delete before.home;delete before.away;
 const fallback=nbaVerifiedScheduledFallback({events:[event()]},id,before);
 assert.equal(fallback?.ok,true);
 assert.equal(fallback?.injuryEvidenceStatus,'ESPN_GAME_SUMMARY_UNAVAILABLE');
});
test('application only publishes cached SGP when stage-specific freshness is CURRENT and never treats missing summary as injury clearance',()=>{
 const app=readFileSync(new URL('../api/nba-game.js',import.meta.url),'utf8');
 const health=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.ok(app.includes('nbaVerifiedScheduledFallback(schedule,gameId,snapshot)'));
 assert.ok(app.includes("data.pregameReadiness.freshness==='CURRENT'"));
 assert.ok(app.includes('nbaNotReadyTiers(data.pregameReadiness.reason)'));
 assert.ok(app.includes("snapshot.injuryReportStatus==='ESPN_REPORTED_INJURIES_RECHECKED'"));
 assert.ok(app.includes('return res.status(409).json(parsed)'),'wrong summary identity fails hard');
 assert.ok(health.includes('home:game.home,away:game.away'));
 assert.ok(ui.includes('ESPN detailed game preview is not yet available'));
 assert.ok(ui.includes('ESPN scoreboard'));
});
