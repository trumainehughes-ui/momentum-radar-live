import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ownerNflPublishedParity} from '../lib/nfl-owner-public-parity.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const owner=read('index.html'),publicPage=read('picks.html');
const start=owner.indexOf('async function loadNFLMulti(){');
const end=owner.indexOf('async function loadNFLHistory(){',start);
assert.ok(start>0&&end>start);
const multi=owner.slice(start,end);
test('published Best-of-Slate candidate stays identical to the public Small-tier first leg',()=>{
 const now=new Date().toISOString(),date='2026-10-18',gameId='401872999';
 const eligible=[
  {player:'QB Starter',team:'ATL',category:'passing',projection:230,target:'225+ yards'},
  {player:'Runner One',team:'CHI',category:'rushing',projection:80,target:'75+ yards'},
  {player:'Receiver One',team:'ATL',category:'receiving',projection:55,target:'50+ yards'},
  {player:'Scorer One',team:'CHI',category:'td',modelChancePct:39,target:'Anytime TD'}
 ];
 const cats={passing:[],rushing:[],receiving:[],receptions:[],td:[]};
 for(const leg of eligible)cats[leg.category].push({
  name:leg.player,team:leg.team,...leg});
 // Public server already screened a formerly questionable starter out.
 const published={ok:true,status:'CURRENT',updatedDataCurrent:true,
  date,gameId,home:'ATL',away:'CHI',updatedAt:now,
  categories:cats,modelResearchTiers:[{risk:'Small',complete:true,legs:eligible}],
  verifiedBookParlays:[]};
 const v=ownerNflPublishedParity(null,published,{date,gameId});
 assert.equal(v.ok,true);
 assert.equal(v.publicResearchTiers[0].legs[0].player,'QB Starter');
 assert.equal(v.publicResearchTiers[0].legs[0].target,'225+ yards');
 assert.equal(v.publicResearchTiers[0].legs.some(x=>x.player==='Questionable QB'),false);
 assert.equal(v.bookParlays.length,0);
});
test('all-game preview uses exact same published game URL, no market/roster workaround',()=>{
 assert.ok(multi.includes("fetch('/api/public-nfl-game?'"));
 assert.ok(multi.includes("ownerNflPublishedParity(null,saved"));
 assert.ok(multi.includes("safe.publicResearchTiers.find(t=>t.risk==='Small'"));
 assert.ok(multi.includes('for(let i=0;i<games.length;i+=4)'));
 assert.ok(!multi.includes("getNFLMarkets("));
 assert.ok(!multi.includes("/api/nfl-game?"));
 assert.ok(!multi.includes("getNFLMarkets(g.gameId)"));
 assert.match(multi,/This is NOT a sportsbook parlay/);
});
test('owner and public page mark identical published version for rendered-parity audits',()=>{
 assert.ok(owner.includes('data-published-game-version'));
 assert.ok(publicPage.includes('data-published-game-version'));
 assert.ok(owner.includes("nflEscape(parity?.updatedAt||'')"));
 assert.ok(publicPage.includes("esc(d?.researchSync?.version||d?.updatedAt||'')"));
 assert.ok(publicPage.includes('modelResearchTiers'));
 assert.ok(owner.includes('nflPollPublishedMatchup'));
});
