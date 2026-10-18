import test from 'node:test';
import assert from 'node:assert/strict';
import {nflSgpSnapshotKey,nflSgpSnapshotPath,
 nflSgpSnapshotVersionPrefix,nflSgpVersionedSnapshotPath,
 nflSgpFindLatestBlob} from '../lib/nfl-sgp-snapshot-status.js';
import {readFileSync} from 'node:fs';
const date='2026-10-18',gameId='401873004',otherGame='401873005';
const records=new Map();
const listBlobs=async({prefix,limit})=>({
 blobs:[...records.entries()].filter(([pathname])=>pathname.startsWith(prefix))
  .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([pathname,record])=>({
   pathname,url:'memory://'+pathname,uploadedAt:new Date(record.at)}))
});
function write(time,yards,nonce='a',id=gameId){
 const pathname=nflSgpVersionedSnapshotPath(date,id,time,nonce);
 assert.ok(pathname);
 records.set(pathname,{at:time,body:{ok:true,date,gameId:id,
  categories:{receiving:[{name:'Parker Washington',projection:yards}]}}});
}
test('writer and every read-side consumer use one shared versioned namespace',()=>{
 assert.ok(nflSgpSnapshotVersionPrefix(date,gameId).startsWith(
  nflSgpSnapshotPath(date,gameId).slice(0,-5)));
 assert.ok(nflSgpVersionedSnapshotPath(date,gameId,1780000000000).startsWith(
  nflSgpSnapshotVersionPrefix(date,gameId)));
 const writer=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const publicApi=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
 const status=readFileSync(new URL('../lib/nfl-sgp-snapshot-status.js',import.meta.url),'utf8');
 assert.match(writer,/nflSgpVersionedSnapshotPath\(date,gameId,startedAt/);
 assert.match(writer,/nflSgpFindLatestBlob\(\{date,gameId\}\)/);
 assert.match(publicApi,/nflSgpFindLatestBlob\(\{date,gameId\}\)/);
 assert.match(status,/const blob=await nflSgpFindLatestBlob/);
});
test('90 to 60 yard update immediately replaces old active public snapshot',async()=>{
 records.clear();
 write(1790000000000,90,'old');
 let blob=await nflSgpFindLatestBlob({date,gameId,listBlobs});
 assert.equal(records.get(blob.pathname).body.categories.receiving[0].projection,90);
 write(1790000001000,60,'new');
 blob=await nflSgpFindLatestBlob({date,gameId,listBlobs});
 assert.equal(records.get(blob.pathname).body.categories.receiving[0].projection,60);
 assert.notEqual(blob.pathname,nflSgpVersionedSnapshotPath(date,gameId,1790000000000,'old'));
});
test('older computation finishing last cannot overwrite newer version',async()=>{
 records.clear();
 write(1790000002000,75,'new');
 write(1790000001000,90,'late-old');
 const blob=await nflSgpFindLatestBlob({date,gameId,listBlobs});
 assert.equal(records.get(blob.pathname).body.categories.receiving[0].projection,75);
});
test('different matches and books cannot inherit one another snapshot',async()=>{
 records.clear();
 write(1790000000000,45,'a',gameId);
 write(1790000001000,55,'b',otherGame);
 const a=await nflSgpFindLatestBlob({date,gameId,listBlobs});
 const b=await nflSgpFindLatestBlob({date,gameId:otherGame,listBlobs});
 assert.equal(records.get(a.pathname).body.gameId,gameId);
 assert.equal(records.get(b.pathname).body.gameId,otherGame);
});
test('legacy snapshot can be read only before any immutable version exists',async()=>{
 records.clear();
 const legacy=nflSgpSnapshotPath(date,gameId);
 records.set(legacy,{at:1780000000000,body:{legacy:true}});
 let b=await nflSgpFindLatestBlob({date,gameId,listBlobs});
 assert.equal(b.pathname,legacy);
 write(1790000000000,60);
 b=await nflSgpFindLatestBlob({date,gameId,listBlobs});
 assert.notEqual(b.pathname,legacy);
});
