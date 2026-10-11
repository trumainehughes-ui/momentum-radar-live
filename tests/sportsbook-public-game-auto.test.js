import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {officialPublicGamePages,eligiblePublicGameResearch,
 researchOfficialGamePages} from '../lib/sportsbook-public-game.js';
import {verifiedESPNPublicGame} from '../api/sportsbook-public-game.js';
const now=Date.parse('2026-10-10T23:00:00Z');
const fixture={gameId:'401872981',league:'nfl',home:'Kansas City Chiefs',
 away:'Denver Broncos',kickoff:new Date(now+22*3600000).toISOString()};
test('an ESPN-backed upcoming matchup generates official two FanDuel and one DK page only',()=>{
 assert.equal(eligiblePublicGameResearch(fixture,{now}),true);
 assert.deepEqual(officialPublicGamePages(fixture).map(x=>x.url),[
  'https://sportsbook.fanduel.com/teams/nfl/kansas-city-chiefs/odds',
  'https://sportsbook.fanduel.com/teams/nfl/denver-broncos/odds',
  'https://sportsbook.draftkings.com/page/nfl-player-props'
 ]);
 assert.equal(officialPublicGamePages({...fixture,league:'nba'}).length,3);
 assert.deepEqual(officialPublicGamePages({...fixture,league:'motorsports'}),[]);
});
test('unverifiable, wrong-ID, completed, over-horizon and arbitrary matchup input never auto-fetches any book',()=>{
 for(const bad of [
  {...fixture,gameId:'hello'},
  {...fixture,home:'<>'},
  {...fixture,home:fixture.away},
  {...fixture,kickoff:new Date(now-120000).toISOString()},
  {...fixture,kickoff:new Date(now+72*3600000).toISOString()},
  {...fixture,league:'mlb'}
 ])assert.equal(eligiblePublicGameResearch(bad,{now}),false);
 assert.equal(verifiedESPNPublicGame({
  header:{id:'999999999',competitions:[{id:'999999999'}]}},
  fixture.gameId,'nfl'),null);
 const summary={header:{competitions:[{
  id:fixture.gameId,date:fixture.kickoff,
  status:{type:{state:'pre'}},
  competitors:[
   {homeAway:'home',team:{displayName:fixture.home}},
   {homeAway:'away',team:{displayName:fixture.away}}
  ]
 }]}};
 assert.deepEqual(verifiedESPNPublicGame(summary,fixture.gameId,'nfl'),fixture);
 summary.header.competitions[0].status.type.state='post';
 assert.equal(verifiedESPNPublicGame(summary,fixture.gameId,'nfl'),null);
});
test('automatic public-site fetch checks both books once, preserves visibly paired odds, but never claims game/SGP verification',async()=>{
 const seen=[];
 const r=await researchOfficialGamePages(fixture,{
  now,inspect:async(url)=>{
   seen.push(url);
   if(url.includes('draftkings'))return{ok:true,status:'PUBLIC_PAGE_NO_RELIABLE_QUOTE_PAIRS',quotes:[]};
   return{ok:true,status:'PUBLIC_PAGE_QUOTES_OBSERVED_UNTIMED',
    checkedAt:new Date(now).toISOString(),
    quotes:[{player:'Travis Kelce',market:'receiving',rawLine:'54.5',
     americanOdds:'-114',winningMinimum:55}]};
  }
 });
 assert.equal(r.ok,true);
 assert.equal(seen.length,3);
 assert.deepEqual(r.booksChecked,['FanDuel','DraftKings']);
 assert.equal(r.quotes.length,2);
 assert.ok(r.quotes.every(x=>x.scope==='PUBLIC_PAGE_UNMATCHED_GAME'));
 assert.equal(r.eventIdentityVerified,false);
 assert.equal(r.verifiedCombinedBookPrice,false);
 assert.equal(r.canChangeSgp,false);
 assert.equal(r.pages.find(x=>x.book==='DraftKings').quotedSelectionCount,0);
 assert.equal(r.sourceQuoteTimestamp,null);
});
test('official team or bookmaker page failures leave no fabricated lines, and the healthy book can still be consulted',async()=>{
 const r=await researchOfficialGamePages(fixture,{
  now,inspect:async url=>{
   if(url.includes('draftkings'))throw Error('GEO_RESTRICTED');
   if(url.includes('denver'))return{ok:false,status:'PUBLIC_PAGE_HTTP_403',quotes:[]};
   return{ok:true,status:'PUBLIC_PAGE_QUOTES_OBSERVED_UNTIMED',
    quotes:[{player:'Player A',market:'rushing',rawLine:'64.5',
     winningMinimum:65,americanOdds:'-110'}]};
  }
 });
 assert.equal(r.pages.length,3);
 assert.equal(r.quotes.length,1);
 assert.equal(r.pages.find(x=>x.book==='DraftKings').status,'PUBLIC_PAGE_UNREADABLE');
 assert.equal(r.pages.find(x=>x.url.includes('denver')).quotedSelectionCount,0);
 assert.equal(r.verifiedCombinedBookPrice,false);
});
test('NFL full-slate and NBA detail refresh automatically use the ESPN verified two-book public research instead of requiring pasted URL',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const nba=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 const ai=readFileSync(new URL('../public-ai.js',import.meta.url),'utf8');
 const sys=readFileSync(new URL('../api/ai-analysis.js',import.meta.url),'utf8');
 const endpoint=readFileSync(new URL('../api/sportsbook-public-game.js',import.meta.url),'utf8');
 assert.match(html,/nflCurrentPublicMatchupResearch\(g.gameId\)/);
 assert.match(html,/void nflRefreshPublicMatchupOdds\(id,d\)/);
 assert.match(nba,/void nbaAutomaticBookResearch\(id\)/);
 assert.match(ai,/publicPageResearch:/);
 assert.match(sys,/publicPageResearch field contains independently scraped/);
 assert.match(endpoint,/verifiedESPNPublicGame/);
 assert.match(endpoint,/researchOfficialGamePages\(official\)/);
 assert.doesNotMatch(endpoint,/\.placeBet\(/);
});
