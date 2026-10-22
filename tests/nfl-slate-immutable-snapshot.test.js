import test from 'node:test';
import assert from 'node:assert/strict';
import {NFL_MARKET_RESPONSE_SCHEMA,nflSlateSnapshotPathValid,nflSlateSnapshotGameId} from '../lib/nfl-slate-rankings.js';
import {NFL_SGP_SNAPSHOT_SCHEMA,nflSgpVersionedSnapshotPath} from '../lib/nfl-sgp-snapshot-status.js';
test('slate rankings follow the current collector snapshot schema',()=>assert.equal(NFL_MARKET_RESPONSE_SCHEMA,NFL_SGP_SNAPSHOT_SCHEMA));
test('immutable and legacy snapshot paths identify exact games and dates',()=>{const date='2026-10-22',id='401873010';const version=nflSgpVersionedSnapshotPath(date,id,Date.parse('2026-10-22T14:55:00Z'),'abc');assert.equal(nflSlateSnapshotPathValid(version,date),true);assert.equal(nflSlateSnapshotGameId(version,date),id);assert.equal(nflSlateSnapshotPathValid(version,'2026-10-23'),false);const legacy='momentum-nfl-markets/v2/'+NFL_SGP_SNAPSHOT_SCHEMA+'-'+date+'-'+id+'.json';assert.equal(nflSlateSnapshotPathValid(legacy,date),true);assert.equal(nflSlateSnapshotGameId(legacy,date),id);});
