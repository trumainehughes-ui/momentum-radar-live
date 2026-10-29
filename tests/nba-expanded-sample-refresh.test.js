import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NBA_PREGAME_MODEL_VERSION,nbaPregameStage} from '../api/nba-health.js';
test('expanded NBA historical sample forces stale stored snapshots to rebuild',()=>{
 assert.match(NBA_PREGAME_MODEL_VERSION,/^v17-summary-starter-evidence$/);
 const game={status:'SCHEDULED',kickoff:new Date(Date.now()+4*3600000).toISOString()};
 const prior={modelVersion:'v7-game-scoped-starter-lineup-evidence',stage:'DAY_AHEAD_BUILD',checkedAt:new Date().toISOString()};
 const stage=nbaPregameStage(game,prior);
 assert.equal(stage.due,true);
 assert.equal(stage.reason,'model_version_changed');
});
test('NBA collector remains scheduled in both shards',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(config.crons.some(x=>x.path==='/api/nba-health'));
 assert.ok(config.crons.some(x=>x.path==='/api/nba-health?shard=1'));
});
