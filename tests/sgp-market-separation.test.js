import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNflProjectedSgpTierDetails,renderNflProjectedSgpTierDetails} from '../lib/nfl-sgp-model-yardage-cards.js';

const player={name:'Jakobi Meyers',team:'JAX',position:'WR',projection:54,gamesPlayed:5,starterVerified:true};
const market={
 ok:true,scope:'game',gameId:'401872996',date:'2026-10-18',
 validation:{injuryEvidence:[]},
 categories:{receiving:[player]},
 sgps:{Analytics:['Small','Medium','Nuke'].map(risk=>({risk,legs:[
  {name:'Jakobi Meyers',team:'JAX',category:'td'},
  {name:'Jakobi Meyers',team:'JAX',category:'receiving'},
  {name:'Jakobi Meyers',team:'JAX',category:'td'}
 ]}))}
};
test('NFL tier cards keep touchdown and yardage as separate legs, without duplicate same-market rows',()=>{
 const built=buildNflProjectedSgpTierDetails({market,gameId:'401872996',date:'2026-10-18',home:'HOU',away:'JAX'});
 for(const tier of built.tiers){
  assert.deepEqual(tier.legs.map(x=>x.category),['td','receiving']);
  assert.equal(tier.modelOnly,true);
  assert.equal(tier.bookmakerSgpQuoteVerified,false);
 }
 const html=renderNflProjectedSgpTierDetails(built);
 assert.equal((html.match(/Anytime TD model candidate/g)||[]).length,3);
 assert.equal((html.match(/Receiving model candidate/g)||[]).length,3);
 assert.doesNotMatch(html,/Player yardage outlook:/);
 assert.match(html,/NOT sportsbook odds/);
});
test('NFL injury hold removes all markets for held player',()=>{
 const held={...market,validation:{injuryEvidence:[{name:'Jakobi Meyers',team:'JAX',status:'IR'}]}};
 const built=buildNflProjectedSgpTierDetails({market:held,gameId:'401872996',date:'2026-10-18',home:'HOU',away:'JAX'});
 assert.ok(built.tiers.every(t=>t.legs.length===0));
});
