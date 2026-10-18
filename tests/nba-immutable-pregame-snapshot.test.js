import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 nbaLegacyPregamePath,nbaPregameVersionPath,nbaPregameVersionPrefix,
 nbaFindLatestPregameBlob,nbaWritePregameSnapshot
} from '../lib/nba-pregame-snapshot-store.js';

const gameId='401909088',other='401909089';
const versions=new Map();
const listBlobs=async({prefix,limit})=>({
 blobs:[...versions].filter(([p])=>p.startsWith(prefix))
  .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit)
  .map(([pathname,v])=>({pathname,url:'memory://'+pathname,uploadedAt:v.checkedAt}))
});
const write=async (gameId,time,player,points)=>{
 const checkedAt=new Date(time).toISOString();
 const snapshot={gameId,checkedAt,status:'MODEL_ONLY',
  sgps:[{risk:'Small',status:'MODEL_CANDIDATE',legs:[
   {player,category:'points',projection:points}]}]};
 await nbaWritePregameSnapshot(snapshot,{nonce:'test'+points,
  putBlob:async(pathname,body,options)=>{
   assert.equal(options.addRandomSuffix,false);
   assert.equal(options.allowOverwrite,undefined);
   const record=JSON.parse(body);
   versions.set(pathname,record);
   return{url:'memory://'+pathname};
  }});
 return snapshot;
};
test('NBA owner and public reader share one immutable versioned namespace',()=>{
 assert.equal(nbaLegacyPregamePath(gameId),'momentum-pregame/v1/nba-'+gameId+'.json');
 assert.ok(nbaPregameVersionPrefix(gameId).startsWith('momentum-pregame/v1/nba-'));
 assert.ok(nbaPregameVersionPath(gameId,'2026-10-20T20:00:00.000Z','a')
  .startsWith(nbaPregameVersionPrefix(gameId)));
 assert.equal(nbaPregameVersionPath('bad','2026-10-20T20:00:00Z'),null);
});
test('NBA 90 to 60 points update replaces the active public snapshot',async()=>{
 versions.clear();
 await write(gameId,1792526400000,'Starting Guard',90);
 let b=await nbaFindLatestPregameBlob(gameId,{listBlobs});
 assert.equal(versions.get(b.pathname).sgps[0].legs[0].projection,90);
 await write(gameId,1792526460000,'Starting Guard',60);
 b=await nbaFindLatestPregameBlob(gameId,{listBlobs});
 assert.equal(versions.get(b.pathname).sgps[0].legs[0].projection,60);
});
test('late old NBA injury result cannot override a newer pregame model',async()=>{
 versions.clear();
 await write(gameId,1792526520000,'Starting Guard',35);
 await write(gameId,1792526460000,'Starting Guard',20);
 const b=await nbaFindLatestPregameBlob(gameId,{listBlobs});
 assert.equal(versions.get(b.pathname).sgps[0].legs[0].projection,35);
});
test('separate NBA games never borrow another matchup projection',async()=>{
 versions.clear();
 await write(gameId,1792526400000,'Celtics Guard',28);
 await write(other,1792526460000,'Knicks Guard',41);
 const a=await nbaFindLatestPregameBlob(gameId,{listBlobs});
 const b=await nbaFindLatestPregameBlob(other,{listBlobs});
 assert.equal(versions.get(a.pathname).gameId,gameId);
 assert.equal(versions.get(b.pathname).gameId,other);
});
test('NBA legacy snapshot can only be read until an immutable update exists',async()=>{
 versions.clear();
 const legacy=nbaLegacyPregamePath(gameId);
 versions.set(legacy,{gameId,checkedAt:'2026-10-20T10:00:00.000Z',sgps:[]});
 assert.equal((await nbaFindLatestPregameBlob(gameId,{listBlobs})).pathname,legacy);
 await write(gameId,1792526460000,'Starting Guard',31);
 const b=await nbaFindLatestPregameBlob(gameId,{listBlobs});
 assert.notEqual(b.pathname,legacy);
});
test('NBA game API is no-store and reads the same collected game snapshot',()=>{
 const health=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 const game=readFileSync(new URL('../api/nba-game.js',import.meta.url),'utf8');
 assert.match(health,/const hit=await nbaFindLatestPregameBlob\(id\)/);
 assert.match(health,/write=nbaWritePregameSnapshot/);
 assert.match(game,/await nbaReadPregame\(gameId\)/);
 assert.match(game,/private, no-store, max-age=0/);
 assert.match(game,/X-Momentum-NBA-Snapshot-Version/);
});
