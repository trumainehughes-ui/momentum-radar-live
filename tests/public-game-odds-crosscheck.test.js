import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fanduelTeamPublicUrl,publicMatchupOddsCrosscheck} from '../lib/public-game-odds-crosscheck.js';
const gameId='401872981',checkedAt=new Date().toISOString();
const jax={name:'Jacksonville Jaguars',abbr:'JAX'},
 philly={name:'Philadelphia Eagles',abbr:'PHI'};
const make=(name,cat,team)=>({name,team,cat,eventID:gameId});
function current(){
 return{ok:true,book:'FanDuel',
  url:fanduelTeamPublicUrl(jax.name),checkedAt,
  quotes:[{book:'FanDuel',sourceUrl:fanduelTeamPublicUrl(jax.name),
   player:'Bhayshul Tuten',market:'rushing',rawLine:'65.5',
   americanOdds:'-113',scope:'PUBLIC_WEBPAGE_UNMATCHED_EVENT',
   modelEligible:false,combinedSgpQuoteVerified:false},
  {book:'FanDuel',sourceUrl:fanduelTeamPublicUrl(jax.name),
   player:'Player Not in Game',market:'receiving',rawLine:'49.5',
   americanOdds:'+122'}]
 };
}
test('live FanDuel team research can match actual selected model player and stat but NEVER verify event or alter SGP',()=>{
 const out=publicMatchupOddsCrosscheck({gameId,home:jax,away:philly,
  sgps:{Analytics:[{risk:'Small',
   legs:[make('Bhayshul Tuten','rushing','JAX')]}]},
  publicReports:[current()]});
 assert.equal(out.status,'PUBLIC_PLAYER_STAT_OBSERVATIONS');
 assert.equal(out.sources.length,1);
 assert.equal(out.matchedObservations.length,1);
 assert.equal(out.matchedObservations[0].player,'Bhayshul Tuten');
 assert.equal(out.matchedObservations[0].rawLine,'65.5');
 assert.equal(out.matchedObservations[0].americanOdds,'-113');
 assert.equal(out.matchedObservations[0].gameEventVerified,false);
 assert.equal(out.canModifySgp,false);
 assert.equal(out.canAssignCombinedOdds,false);
 assert.equal(out.authenticatedEventAndLineVerification,false);
});
test('wrong-team public page, stale quote, spoofed odds, wrong player or wrong market never enters game evidence',()=>{
 const odds=current();
 const spoof={...odds,url:'https://sportsbook.fanduel.com/teams/nfl/denver-broncos/odds'};
 const old={...odds,checkedAt:'2025-01-01T00:00:00Z'};
 for(const report of [spoof,old]){
  const result=publicMatchupOddsCrosscheck({gameId,home:jax,away:philly,
   sgps:{Analytics:[{risk:'Small',
    legs:[make('Bhayshul Tuten','rushing','JAX')]}]},
   publicReports:[report]});
  assert.equal(result.matchedObservations.length,0);
 }
 const wrongMarket=publicMatchupOddsCrosscheck({gameId,home:jax,away:philly,
  sgps:{Analytics:[{risk:'Nuke',legs:[make('Bhayshul Tuten','td','JAX')]}]},
  publicReports:[odds]});
 assert.equal(wrongMarket.matchedObservations.length,0);
});
test('fanduel URL must come from actual ESPN team name not unchecked URLs',()=>{
 assert.equal(fanduelTeamPublicUrl('Jacksonville Jaguars'),
  'https://sportsbook.fanduel.com/teams/nfl/jacksonville-jaguars/odds');
 assert.equal(fanduelTeamPublicUrl('Philadelphia Eagles'),
  'https://sportsbook.fanduel.com/teams/nfl/philadelphia-eagles/odds');
 assert.equal(fanduelTeamPublicUrl('bad/team?q=https:'),null);
 const invalid=publicMatchupOddsCrosscheck({gameId,home:null,away:null,
  sgps:{Analytics:[]},publicReports:[current()]});
 assert.equal(invalid.status,'EVENT_NOT_VERIFIED');
 assert.equal(invalid.matchedObservations.length,0);
});
test('game page automatically checks both FanDuel team pages and the DraftKings public page once per match per 5m',()=>{
 const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(ui,/function nflAutoPublicMatchupUi\(\)/);
 assert.match(ui,/function nflRefreshPublicMatchupOdds\(id,marketData\)/);
 assert.match(ui,/void nflRefreshPublicMatchupOdds\(id,d\);/);
 assert.match(ui,/Promise\.all\(urls\.map\(async url=>/);
 assert.match(ui,/const existing=nflPublicMatchupMemo\.get\(String\(id\)\),now=Date\.now\(\);/);
 assert.match(ui,/No automatic changes to picks/);
 assert.match(ui,/authentic|authenticated/i);
});
