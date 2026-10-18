import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNflModelChoiceBoard} from '../lib/nfl-model-choice-board.js';
const date='2026-10-18',gameId='401872999';
const profile={name:'Jaylin Noel',team:'HOU',position:'WR',projection:50,
 gamesPlayed:5,perGame:45.4,recentForm:{last5:[53,31,17,85,41]}};
const market=player=>({ok:true,scope:'game',gameId,date,
 categories:{receiving:[player]},sgps:{Analytics:[{risk:'Small',legs:[
  {player:'Jaylin Noel',team:'HOU',category:'receiving'}]}]}});
const build=p=>buildNflModelChoiceBoard({market:market(p),gameId,date,home:'HOU',away:'JAX'});
test('model projection alone cannot display a sportsbook-eligible receiver',()=>{
 assert.equal(build(profile).rows.length,0);
 assert.equal(build({...profile,bookOffer:{book:'DraftKings',available:false,line:49.5}}).rows.length,0);
});
test('wrong domain and stale offer cannot qualify a model-only player',()=>{
 const bookOffer={available:true,book:'DraftKings',line:49.5,odds:-110,
  checkedAt:new Date().toISOString(),sourceUrl:'https://example.com/market'};
 assert.equal(build({...profile,bookOffer}).rows.length,0);
 assert.equal(build({...profile,bookOffer:{...bookOffer,sourceUrl:'https://sportsbook.draftkings.com/',checkedAt:'2026-01-01T00:00:00Z'}}).rows.length,0);
});
test('fresh exact official book market permits statistical comparison, not sportsbook target',()=>{
 const bookOffer={available:true,book:'DraftKings',line:49.5,odds:-110,
  checkedAt:new Date().toISOString(),sourceUrl:'https://sportsbook.draftkings.com/'};
 const result=build({...profile,bookOffer,starterVerified:true});
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].name,'Jaylin Noel');
 assert.equal(result.rows[0].target,50);
 assert.equal(result.sportsbookOddsVerified,false);
});

test('a book offer does not override lack of offensive playing time',()=>{
 const bookOffer={available:true,book:'FanDuel',line:49.5,odds:-110,
  checkedAt:new Date().toISOString(),sourceUrl:'https://sportsbook.fanduel.com/'};
 assert.equal(build({...profile,bookOffer}).rows.length,0);
 assert.equal(build({...profile,bookOffer,offensiveSnapShare:0.45,usageGames:5,targetsPerGame:3.2}).rows.length,0);
 assert.equal(build({...profile,bookOffer,offensiveSnapShare:0.60,usageGames:5,targetsPerGame:4.5}).rows.length,1);
 assert.equal(build({...profile,bookOffer,starterVerified:true,recommendationEligible:false}).rows.length,0);
});

test('backup running back requires demonstrated carries, not roster presence',()=>{
 const bookOffer={available:true,book:'DraftKings',line:44.5,odds:-110,
  checkedAt:new Date().toISOString(),sourceUrl:'https://sportsbook.draftkings.com/'};
 const runner={name:'Rotational RB',team:'HOU',position:'RB',projection:45,
  gamesPlayed:5,offensiveSnapShare:0.55,usageGames:5,carriesPerGame:3,bookOffer};
 const m=market(profile);
 m.categories={rushing:[runner]};
 m.sgps={Analytics:[{risk:'Small',legs:[{player:'Rotational RB',team:'HOU',category:'rushing'}]}]};
 const run=()=>buildNflModelChoiceBoard({market:m,gameId,date,home:'HOU',away:'JAX'});
 assert.equal(run().rows.length,0);
 runner.carriesPerGame=8;
 assert.equal(run().rows.length,1);
});
