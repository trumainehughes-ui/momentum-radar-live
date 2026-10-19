import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicNflGameView} from '../lib/public-nfl-view.js';
import {ownerNflPublishedParity} from '../lib/nfl-owner-public-parity.js';
import {renderPublicMatchupIntelligence} from '../lib/nfl-public-matchup-intelligence-cards.js';
const gameId='401872999',date='2026-10-18';
const now=Date.parse('2026-10-18T18:30:00Z');
const at=now-22000;
const rows={
 passing:[{eventID:gameId,playerID:'11',name:'Eligible QB',team:'ATL',position:'QB',
  projection:235,category:'passing',reason:'Game matchup',gamesPlayed:3},
 {eventID:gameId,playerID:'12',name:'Held QB',team:'ATL',position:'QB',
  projection:280,category:'passing',reason:'Outdated historical comparison',gamesPlayed:3}],
 rushing:[{eventID:gameId,playerID:'21',name:'Eligible RB',team:'CHI',position:'RB',
  projection:90,category:'rushing',gamesPlayed:3}],
 receiving:[{eventID:gameId,playerID:'31',name:'Eligible WR',team:'ATL',position:'WR',
  projection:60,category:'receiving',gamesPlayed:3}],
 receptions:[{eventID:gameId,playerID:'31',name:'Eligible WR',team:'ATL',position:'WR',
  projection:5,category:'receptions',gamesPlayed:3}],
 td:[]};
const base={ok:true,date,gameId,home:'ATL',away:'CHI',fetchedAt:new Date(at).toISOString(),
 categories:rows,
 sgps:{Analytics:[],DraftKings:[],FanDuel:[]},
 validation:{injuryEligibilityChecked:true,injuryEvidence:[
  {name:'Held QB',team:'ATL',status:'QUESTIONABLE',section:'WEEKLY',evidenceTier:'WEEKLY_OFFICIAL'}]}};
test('published public metadata declares one injury-screened saved game version for both interfaces',()=>{
 const published=publicNflGameView({at,body:base},{date,gameId,now});
 assert.equal(published.ok,true);
 assert.equal(published.status,'CURRENT');
 assert.deepEqual(published.researchSync,{basis:'PUBLISHED_NFL_GAME_SNAPSHOT',
  version:new Date(at).toISOString(),injuryScreened:true,gameId,date});
 const owner=ownerNflPublishedParity(base,published,{date,gameId,now});
 assert.equal(owner.ok,true);
 assert.deepEqual(owner.categories.passing.map(x=>x.name),['Eligible QB']);
 assert.deepEqual(published.categories.passing.map(x=>x.name),['Eligible QB']);
 assert.equal(owner.categories.passing[0].projection,published.categories.passing[0].projection);
 assert.equal(owner.updatedAt,published.researchSync.version);
});
test('stale public data is labeled and owner parity fails closed',()=>{
 const oldAt=now-16*60000;
 const stale=publicNflGameView({at:oldAt,body:{...base,fetchedAt:new Date(oldAt).toISOString()}},
   {date,gameId,now,includeLastSaved:true});
 assert.equal(stale.status,'LAST_SAVED');
 const output=ownerNflPublishedParity(base,stale,{date,gameId,now});
 assert.equal(output.ok,false);
 assert.equal(output.tiers.length,0);
 assert.equal(output.categories.passing.length,0);
});
test('public synchronization metadata never contains private raw market diagnostics or provider credentials',()=>{
 const src=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');
 assert.match(src,/researchSync:\{basis:'PUBLISHED_NFL_GAME_SNAPSHOT',version:updatedAt/);
 const publicPage=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(publicPage.includes("getJson('/api/public-nfl-game?'"));
 const ownerPage=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(ownerPage.includes("fetch('/api/public-nfl-game?'"));
 assert.ok(!src.includes('process.env.CRON_SECRET'));
});


test('owner and customer matchup readouts retain verified starter averages from one published snapshot',()=>{
 const qb={...rows.passing[0],starterVerified:true,starterStatus:'CONFIRMED_STARTER',
  perGame:227.3,range:{floor:180,ceiling:296},gamesPlayed:5};
 const bad={...rows.passing[1],starterVerified:false,starterStatus:'UNCONFIRMED',
  perGame:260,range:{floor:220,ceiling:310},gamesPlayed:5};
 const matchupEvidence={status:'BILATERAL_EVIDENCE',sides:[
  {offenseTeam:'ATL',defenseTeam:'CHI',offenseSampleGames:5,defenseSampleGames:5,
   positions:[{position:'QB',metrics:[{metric:'passYards',
    offenseProducedPerGame:245,defenseAllowedPerGame:270}]}]},
  {offenseTeam:'CHI',defenseTeam:'ATL',offenseSampleGames:5,defenseSampleGames:5,
   positions:[{position:'RB',metrics:[{metric:'rushYards',
    offenseProducedPerGame:105,defenseAllowedPerGame:110}]}]}
 ]};
 const current={...base,categories:{...rows,passing:[qb,bad]},matchupEvidence};
 const customer=publicNflGameView({at,body:current},{date,gameId,now});
 assert.equal(customer.ok,true);
 assert.equal(customer.status,'CURRENT');
 assert.deepEqual(customer.categories.passing.map(x=>x.name),['Eligible QB']);
 assert.equal(customer.categories.passing[0].starterVerified,true);
 assert.equal(customer.categories.passing[0].gameSample,5);
 assert.equal(customer.categories.passing[0].avgPerGame,227.3);
 assert.equal(customer.categories.passing[0].range.ceiling,296);
 const oldOwner={...current,fetchedAt:new Date(at-120_000).toISOString(),
  categories:{...rows,passing:[{...qb,starterVerified:false,perGame:300}]}};
 const synced=ownerNflPublishedParity(oldOwner,customer,{date,gameId,now});
 assert.equal(synced.ok,true);
 assert.equal(synced.diagnosticSnapshotMatches,false);
 assert.equal(synced.categories.passing[0].starterVerified,true);
 assert.equal(synced.categories.passing[0].avgPerGame,227.3);
 assert.equal(synced.categories.passing[0].gameSample,5);
 assert.equal(synced.categories.passing[0].range.ceiling,296);
 const noRange={...customer,categories:{...customer.categories,
  passing:[{...customer.categories.passing[0],range:{floor:null,ceiling:null}}]}};
 const safelyMissing=ownerNflPublishedParity(oldOwner,noRange,{date,gameId,now});
 assert.equal(safelyMissing.ok,true);
 assert.equal(safelyMissing.categories.passing[0].range,null);
 const customerReadout=renderPublicMatchupIntelligence(customer.matchup.sides,customer.categories);
 const ownerReadout=renderPublicMatchupIntelligence(customer.matchup.sides,synced.categories);
 for(const html of [customerReadout,ownerReadout]){
  assert.match(html,/Player to watch: Eligible QB/);
  assert.match(html,/227.3 yards\/game/);
  assert.match(html,/CHI allows <b>270 yards\/game<\/b> to quarterbacks combined/);
  assert.doesNotMatch(html,/Held QB|300 yards\/game/);
 }
});
