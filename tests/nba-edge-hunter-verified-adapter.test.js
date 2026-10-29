import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVerifiedNbaEdgeHunterGames,researchVerifiedNbaEdgeHunter} from '../lib/nba-edge-hunter-verified-adapter.js';
const now=Date.parse('2026-10-29T12:00:00Z');
const observedAt='2026-10-29T11:55:00Z';
const sourceUrl='https://sportsbook.draftkings.com/leagues/basketball/nba';
const games=['401','402'].map((gameId,i)=>({
 gameId,totalEvidence:{gameId,book:'DraftKings',value:230+i,marketId:'total-'+gameId,sourceUrl,observedAt},
 spreadEvidence:{gameId,book:'DraftKings',value:3,marketId:'spread-'+gameId,sourceUrl,observedAt},
 players:[1,2].map((n)=>({playerId:gameId+'-'+n,name:'Player '+n,team:n===1?'A':'B',
  category:'points',prediction:30,last10:[30,30,30,30,30,30,30,10,10,10],
  starterVerified:true,injuryBlocked:false}))
}));
const offers=games.flatMap(g=>g.players.map(p=>({gameId:g.gameId,playerId:p.playerId,
 player:p.name,market:'points',exactLine:24.5,americanOdds:-110,
 selectionId:'selection-'+p.playerId,book:'DraftKings',sourceUrl,observedAt})));
test('verified official offers feed four research legs without book-native combined price',()=>{
 const result=researchVerifiedNbaEdgeHunter({games,offers,now});
 assert.equal(result.status,'MODEL_RESEARCH');assert.equal(result.legs.length,4);
 assert.equal(result.publishable,false);assert.equal(result.combinedBookOdds,null);
});
test('unverified props and unverified game totals never qualify',()=>{
 assert.equal(researchVerifiedNbaEdgeHunter({games,offers:[],now}).status,'NOT_READY');
 const noTotal=games.map(g=>({...g,totalEvidence:null}));
 assert.equal(researchVerifiedNbaEdgeHunter({games:noTotal,offers,now}).status,'NOT_READY');
});
test('stale sportsbook quotes cannot create Edge Hunter legs',()=>{
 const stale=offers.map(o=>({...o,observedAt:'2026-10-28T11:55:00Z'}));
 const result=buildVerifiedNbaEdgeHunterGames({games,offers:stale,now});
 assert.equal(result.every(g=>g.players.length===0),true);
});

test('rejects cross-book props even when each offer is valid',()=>{
 const mixed=offers.map(o=>({...o,book:'FanDuel',sourceUrl:'https://co.sportsbook.fanduel.com/nba'}));
 assert.equal(researchVerifiedNbaEdgeHunter({games,offers:mixed,now}).status,'NOT_READY');
});
test('rejects mismatched sportsbook source and game markets lacking IDs',()=>{
 const spoof=games.map(g=>({...g,totalEvidence:{...g.totalEvidence,sourceUrl:'https://co.sportsbook.fanduel.com/nba'}}));
 assert.equal(researchVerifiedNbaEdgeHunter({games:spoof,offers,now}).status,'NOT_READY');
 const missing=games.map(g=>({...g,spreadEvidence:{...g.spreadEvidence,marketId:''}}));
 assert.equal(researchVerifiedNbaEdgeHunter({games:missing,offers,now}).status,'NOT_READY');
});
