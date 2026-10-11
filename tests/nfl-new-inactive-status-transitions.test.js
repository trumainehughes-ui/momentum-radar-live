import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedNflInjuryTransitions}
 from '../lib/nfl-injury-status-transitions.js';
const gameId='401872988';
const at='2026-10-11T16:00:00Z';
const p=(id,status,team='Washington Commanders')=>
 ({id:String(id),name:'Athlete '+id,team,position:'WR',status});
const detect=(old,current)=>verifiedNflInjuryTransitions(old,current,{gameId,observedAt:at});
test('a first injury baseline cannot invent an injury change or paid quote token',()=>{
 assert.deepEqual(verifiedNflInjuryTransitions(null,[p(12345,'out')],{gameId}),[]);
 assert.deepEqual(detect([], [p(12345,'questionable'),p(23456,'limited practice')]),[]);
});
test('newly official OUT/INACTIVE after baseline creates exactly one action',()=>{
 for(const state of ['out','Out','inactive','Inactive','ruled out','injured reserve']){
  const list=detect([p(11111,'questionable')],[p(11111,'questionable'),p(22222,state)]);
  assert.equal(list.length,1,state);
  assert.deepEqual({...list[0],observedAt:null},{
   type:'player_inactive',gameId,playerId:'22222',playerName:'Athlete 22222',
   position:'WR',unit:'offense_or_defense',
   before:'NOT_PREVIOUSLY_REPORTED',after:state.toLowerCase(),
   source:'ESPN NFL injury summary',observedAt:null});
 }
});
test('known athletes trigger on changed status but not identical or duplicate rows',()=>{
 const old=[p(11111,'questionable'),p(22222,'out')],current=[
  p(11111,'out'),p(11111,'out'),p(22222,'questionable')];
 const found=detect(old,current);
 assert.equal(found.length,2);
 assert.deepEqual(found.map(x=>[x.playerId,x.before,x.after,x.type]),[
  ['11111','questionable','out','player_inactive'],
  ['22222','out','questionable','player_injury']]);
 assert.deepEqual(detect(old,old),[]);
});
test('new non-definitive statuses cannot consume single-use sportsbook credits',()=>{
 const old=[p(11111,'questionable')];
 const current=[p(11111,'questionable'),p(22222,'questionable'),
  p(33333,'day-to-day'),p(44444,'probable')];
 assert.deepEqual(detect(old,current),[]);
});
test('removed injury row is not automatically treated as cleared or starter verified',()=>{
 const old=[p(11111,'out'),p(22222,'inactive')];
 assert.deepEqual(detect(old,[]),[]);
 assert.deepEqual(detect(old,[p(22222,'inactive')]),[]);
});
test('wrong team identity or malformed player rows cannot authorize an update',()=>{
 const old=[p(11111,'questionable')];
 assert.deepEqual(detect(old,[p(11111,'out','New York Giants')]),[]);
 for(const bad of [
  {...p(12345,'out'),id:''},
  {...p(12345,'out'),id:'../../path'},
  {...p(12345,'out'),name:''},
  {...p(12345,'out'),team:''},
  {...p(12345,'out'),status:'unknown'}]){
  assert.deepEqual(detect(old,[bad]),[]);
 }
});
test('signed detector still requires saved baseline and only authentic ESPN status changes',()=>{
 const route=readFileSync(new URL('../api/nfl-detect-changes.js',import.meta.url),'utf8');
 assert.ok(route.includes("if(prior){"));
 assert.ok(route.includes("verifiedNflInjuryTransitions(prior.players,current,"));
 assert.ok(route.includes("if(changes.length){"));
 assert.ok(route.includes("allowOverwrite:false"));
 assert.ok(route.includes("createHash('sha256')"));
 assert.ok(route.includes("req.headers.authorization!=='Bearer '+process.env.CRON_SECRET"));
 assert.ok(route.includes("'&verifiedChange=1'"));
});
