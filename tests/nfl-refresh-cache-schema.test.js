import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {historySnap} from '../api/nfl-health.js';
import {NFL_SGP_SNAPSHOT_SCHEMA,nflSgpSnapshotPath} from '../lib/nfl-sgp-snapshot-status.js';

test('the writer and diagnostic reader use identical new cache schemas so old model-only snapshots cannot mask new DK/FD fields',()=>{
 const markets=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(markets,/import \{NFL_SGP_SNAPSHOT_SCHEMA\}/);
 assert.match(markets,/const CACHE_SCHEMA=NFL_SGP_SNAPSHOT_SCHEMA;/);
 assert.match(NFL_SGP_SNAPSHOT_SCHEMA,/^v88-priced-altlines-sgp-rebuild-/);
 assert.ok(!NFL_SGP_SNAPSHOT_SCHEMA.includes('v87'));
 const path=nflSgpSnapshotPath('2026-10-11','401872981');
 assert.ok(path.includes('v88-priced-altlines-sgp-rebuild'));
 assert.ok(!path.includes('v87-sgo-backup-only'));
});
test('NFL collector locks normalized book win thresholds and not raw sportsbook Over x.5 settlement lines',()=>{
 const game={gameId:'401872981',kickoff:new Date(Date.now()+30*60*60*1000).toISOString(),
  status:'SCHEDULED',home:{abbr:'JAX'},away:{abbr:'PHI'}};
 const legs=Array.from({length:4},(_,i)=>({
  name:'Athlete '+i,playerID:String(100+i),team:i%2?'PHI':'JAX',
  eventID:game.gameId,cat:['passing','rushing','receiving','receptions'][i],
  analyticsThreshold:[225,55,65,4][i],
  bookTierTarget:[225,55,65,4][i],
  bookOffer:{book:'DraftKings',line:['224.5','54.5','64.5','3.5'][i],
   odds:-110,available:true}
 }));
 const market={categories:{},sgps:{Analytics:[],
  DraftKings:[{risk:'Small',legs,requiredLegs:4,
   tierAssessment:{compositionOk:true}}],FanDuel:[]},
  sgpVerification:{league:'nfl',gameId:game.gameId,tiers:[]}};
 const snap=historySnap(game,market);
 const book=snap.sgps.find(x=>x.book==='DraftKings'&&x.risk==='Small');
 assert.ok(book);
 assert.deepEqual(book.legs.map(x=>x.threshold),[225,55,65,4]);
 assert.equal(book.legs[1].bookOffer.line,'54.5');
 assert.equal(book.actualSgpOdds,null);
 assert.equal(book.combinedBookQuoteVerified,false);
});
