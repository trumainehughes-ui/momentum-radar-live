import test from 'node:test';
import assert from 'node:assert/strict';
import {nflResolveOfficialWeek,nflWeeklyForGame} from '../lib/nfl-injury-weekly-loader.js';
const comp=[{team:{id:'21',abbreviation:'PHI'}},{team:{id:'30',abbreviation:'JAX'}}];
const game={header:{season:{year:2026,type:2},competitions:[{date:'2026-10-11T13:30:00Z',competitors:comp}]}};
test('resolve ESPN schedule game ID to correct week, independent of hardcoded season date',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({events:[{id:'401872981',week:{number:5},season:{year:2026,type:2}}]})});
 const r=await nflResolveOfficialWeek({gameId:'401872981',summary:game,fetcher});
 assert.equal(r.week,5);assert.equal(r.year,2026);assert.equal(r.seasonType,'REG');
});
test('missing ESPN week never reuses other game/week and only date-scoped vetted fallback can remain',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({events:[{id:'different',week:{number:5}}]})});
 const r=await nflResolveOfficialWeek({gameId:'401872999',summary:game,fetcher});
 assert.equal(r,null);
 const other=await nflWeeklyForGame({gameId:'401872999',summary:game,competitors:comp,fetcher});
 assert.equal(other,null);
});
