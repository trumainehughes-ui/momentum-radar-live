import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVerifiedNflStarters} from '../lib/nfl-starter-evidence-resolver.js';
const gameId='401872996',date='2026-11-16';
const summary={header:{id:gameId,competitions:[{competitors:[
 {homeAway:'home',team:{id:'1',abbreviation:'JAX'}},
 {homeAway:'away',team:{id:'2',abbreviation:'HOU'}}]}]},
 rosters:[{team:{abbreviation:'JAX'},roster:[
 {starter:true,athlete:{id:'10',displayName:'Starter QB',position:{abbreviation:'QB'}}},
 {starter:false,athlete:{id:'11',displayName:'Backup RB',position:{abbreviation:'RB'}}}]},
 {team:{abbreviation:'HOU'},roster:[
 {starter:true,athlete:{id:'20',displayName:'Away QB',position:{abbreviation:'QB'}}}]}]};
const fetcher=async url=>({ok:true,json:async()=>url.includes('depthcharts')?
 {items:[{positions:{RB:{athletes:[{athlete:{id:'12',displayName:'Depth RB'},rank:1}]}}}]}:summary});
test('only player-specific ESPN starter flags are verified; depth chart remains research',async()=>{
 const v=await resolveVerifiedNflStarters({gameId,date,home:'JAX',away:'HOU',fetcher});
 assert.equal(v.starters.length,2);
 assert.equal(v.startersConfirmed,true);
 assert.equal(v.startersByTeam.JAX.find(x=>x.name==='Backup RB').starterVerified,false);
 assert.equal(v.projectedByTeam.JAX.some(x=>x.name==='Depth RB'&&x.starterVerified===false),true);
});
test('wrong opponent is rejected',async()=>{
 await assert.rejects(resolveVerifiedNflStarters({gameId,date,home:'NYJ',away:'HOU',fetcher}),/team_mismatch/);
});
