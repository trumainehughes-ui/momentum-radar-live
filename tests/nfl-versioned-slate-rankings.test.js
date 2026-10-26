import test from 'node:test';
import assert from 'node:assert/strict';
import {nflSlateSnapshotPrefix,nflSlateSnapshotGameId,nflSlateNewestSnapshotBlobs}
 from '../lib/nfl-slate-rankings.js';

test('Monday game versioned snapshots resolve to the numeric game ID',()=>{
 const date='2026-10-26',prefix=nflSlateSnapshotPrefix(date);
 const old=prefix+'401873009/8207020000000.json';
 const newest=prefix+'401873009/8207019999999-new.json';
 assert.equal(nflSlateSnapshotGameId(newest,date),'401873009');
 assert.equal(nflSlateSnapshotGameId(old,date),'401873009');
 const selected=nflSlateNewestSnapshotBlobs([
  {pathname:old},{pathname:newest}],date);
 assert.equal(selected.length,1);
 assert.equal(selected[0].pathname,newest);
});
