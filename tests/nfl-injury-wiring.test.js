import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const game=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
const market=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
test('game and markets use shared injury source gate and do not turn missing reports into all-clear',()=>{
 assert.ok(game.includes("nflGameInjuryEvidence({summary,league:leagueInj,competitors"));
 assert.ok(game.includes("availability=inj?.status||'UNREPORTED'"));
 assert.ok(game.includes("availabilityVerified=injuryReport.reportAvailable"));
 assert.ok(game.includes("needsReview=availability==='QUESTIONABLE'"));
 assert.ok(game.includes("officialInactivesVerified:false"));
 assert.ok(market.includes("nflGameInjuryEvidence({summary:d,league,competitors:teams"));
 assert.ok(market.includes('checked:injury.reportAvailable&&rosterById.size>0'));
 assert.ok(market.includes("function eligibilityFilter(rows,elig){if(!elig?.checked)return [];"));
 assert.ok(market.includes("const rows=gameId?eligibilityFilter(rawRows,eligibility):rawRows;"));
 assert.ok(market.includes("CACHE_SCHEMA='v85-official-weekly-reconcile'"));
});
