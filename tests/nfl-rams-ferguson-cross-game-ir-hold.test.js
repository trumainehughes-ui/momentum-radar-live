import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches} from '../lib/nfl-official-transaction-holds.js';
const player={playerID:'4570037',name:'Terrance Ferguson',team:'LAR',
 position:'TE',eventID:'401873008',cat:'receiving'};
test('Rams Terrance Ferguson official IR transaction remains a hard hold against Cardinals Week 6',()=>{
 const holds=nflOfficialTransactionHolds({
  date:'2026-10-18',gameId:'401873008',home:'LAR',away:'ARI'});
 assert.ok(holds.some(x=>nflOfficialHoldMatches(player,x)&&x.status==='IR'));
 assert.ok(holds.some(x=>x.name==='Terrance Ferguson'&&x.sourceUrl?.includes('therams.com/team/transactions')));
});
test('IR hold follows the Rams across other games instead of expiring after Week 5',()=>{
 for(const date of ['2026-10-02','2026-10-12','2026-10-18','2026-10-25']){
  const holds=nflOfficialTransactionHolds({date,gameId:'999999999',home:'LAR',away:'ARI'});
  assert.equal(holds.some(x=>nflOfficialHoldMatches(player,x)),true,date);
 }
});
test('Ferguson hold cannot leak across teams or dates before the official IR move',()=>{
 assert.equal(nflOfficialTransactionHolds({
  date:'2026-10-01',gameId:'999999999',home:'LAR',away:'ARI'})
  .some(x=>nflOfficialHoldMatches(player,x)),false);
 assert.equal(nflOfficialTransactionHolds({
  date:'2026-10-18',gameId:'999999999',home:'SEA',away:'ARI'})
  .some(x=>x.name==='Terrance Ferguson'),false);
});
test('both injury-screened SGP research and real bookmaker ticket paths consume game-scoped transaction holds',()=>{
 const view=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(view,/nflOfficialTransactionHolds\(\{gameId:id,date,home,away\}\)/);
 assert.match(view,/holds\.some\(h=>nflOfficialHoldMatches\(x,h\)\)/);
 assert.match(api,/nflOfficialTransactionHolds\(\{gameId,date,home,away\}\)/);
 assert.match(api,/blockedIds/);
});
