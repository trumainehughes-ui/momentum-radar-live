import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicMatchupOddsCrosscheck} from '../lib/public-game-odds-crosscheck.js';

const markets=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
test('historical screenshots or past public odds cannot turn into live sportsbook-verified player markets',()=>{
 assert.doesNotMatch(markets,/publicSportsbookVerified:true/);
 assert.doesNotMatch(markets,/function publicOfferFor\(/);
 assert.doesNotMatch(markets,/source:'public sportsbook',verified:true/);
 assert.match(markets,/analyticsOnly:true,publicReferenceOnly:true,sportsbookVerified:false/);
 assert.match(markets,/Historical\/manual public market references are research only/);
 assert.match(markets,/directRows=alt/);
 assert.match(markets,/directRows=rows\.map/);
});
test('matchup public odds observations remain research even if displayed player name/category match a model leg exactly',()=>{
 const url='https://sportsbook.fanduel.com/teams/nfl/jacksonville-jaguars/odds';
 const result=publicMatchupOddsCrosscheck({
  gameId:'401872981',home:{name:'Jacksonville Jaguars'},away:{name:'Philadelphia Eagles'},
  sgps:{Analytics:[{risk:'Small',legs:[{name:'Bhayshul Tuten',cat:'rushing',team:'JAX'}]}]},
  publicReports:[{ok:true,url,book:'FanDuel',checkedAt:new Date().toISOString(),
   quotes:[{player:'Bhayshul Tuten',market:'rushing',rawLine:'65.5',
    americanOdds:'-113',book:'FanDuel',sourceUrl:url}]}]
 });
 assert.equal(result.matchedObservations.length,1);
 assert.equal(result.matchedObservations[0].bookSelectionVerified,false);
 assert.equal(result.matchedObservations[0].combinedOddsVerified,false);
 assert.equal(result.authenticatedEventAndLineVerification,false);
 assert.equal(result.canModifySgp,false);
});
