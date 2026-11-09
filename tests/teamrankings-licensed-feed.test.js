import test from 'node:test';
import assert from 'node:assert/strict';
import {licensedTeamRankings} from '../lib/teamrankings-licensed-feed.js';

const prior={url:process.env.TEAMRANKINGS_LICENSED_FEED_URL,confirmed:process.env.TEAMRANKINGS_LICENSE_CONFIRMED};
function restore(){
 for(const [k,v] of Object.entries({TEAMRANKINGS_LICENSED_FEED_URL:prior.url,TEAMRANKINGS_LICENSE_CONFIRMED:prior.confirmed})){
  if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
}
test('licensed TeamRankings integration defaults to disabled without explicit authorization',async()=>{
 try{
  delete process.env.TEAMRANKINGS_LICENSE_CONFIRMED;
  process.env.TEAMRANKINGS_LICENSED_FEED_URL='https://example.com/authorized-feed';
  let called=false;
  const data=await licensedTeamRankings(2026,{fetcher:async()=>{called=true;throw Error('unexpected fetch')}});
  assert.equal(data.status,'NOT_LICENSED');
  assert.equal(called,false);
 }finally{restore()}
});
test('licensed feed accepts only whitelisted finite nonnegative team metrics',async()=>{
 try{
  process.env.TEAMRANKINGS_LICENSE_CONFIRMED='true';
  process.env.TEAMRANKINGS_LICENSED_FEED_URL='https://example.com/authorized-feed';
  const data=await licensedTeamRankings(2026,{fetcher:async()=>({ok:true,json:async()=>({
   season:2026,updatedAt:new Date().toISOString(),
   rows:[
    {team:'BUF',metric:'opponent-passing-yards-per-game',value:251.5},
    {team:'MIN',metric:'opponent-rushing-yards-per-game',value:118},
    {team:'BUF',metric:'not-approved',value:123},
    {team:'BUF',metric:'opponent-points-per-game',value:-4},
    {team:'BUF',metric:'opponent-yards-per-play',value:'not-a-number'}
   ]
  })})});
  assert.equal(data.status,'READY');
  assert.deepEqual(data.teams,{BUF:{'opponent-passing-yards-per-game':251.5},MIN:{'opponent-rushing-yards-per-game':118}});
  assert.equal(data.metrics.length,2);
 }finally{restore()}
});
test('licensed feed rejects wrong season and stale snapshots',async()=>{
 try{
  process.env.TEAMRANKINGS_LICENSE_CONFIRMED='true';
  process.env.TEAMRANKINGS_LICENSED_FEED_URL='https://example.com/authorized-feed';
  for(const payload of [
   {season:2025,updatedAt:new Date().toISOString(),rows:[]},
   {season:2026,updatedAt:'2020-01-01T00:00:00Z',rows:[]}
  ]){
   const data=await licensedTeamRankings(2026,{fetcher:async()=>({ok:true,json:async()=>payload})});
   assert.equal(data.status,'UNAVAILABLE');
   assert.deepEqual(data.teams,{});
  }
 }finally{restore()}
});

test('licensed feed rejects null, empty, and entirely invalid rows',async()=>{
 try{
  process.env.TEAMRANKINGS_LICENSE_CONFIRMED='true';
  process.env.TEAMRANKINGS_LICENSED_FEED_URL='https://example.com/authorized-feed';
  const payload={season:2026,updatedAt:new Date().toISOString(),rows:[
   {team:'BUF',metric:'opponent-passing-yards-per-game',value:null},
   {team:'BUF',metric:'opponent-rushing-yards-per-game',value:''},
   {team:'MIN',metric:'opponent-points-per-game',value:undefined}
  ]};
  const data=await licensedTeamRankings(2026,{fetcher:async()=>({ok:true,json:async()=>payload})});
  assert.equal(data.status,'UNAVAILABLE');
  assert.deepEqual(data.teams,{});
 }finally{restore()}
});
