import assert from 'node:assert/strict';
import {nflOfficialWeeklyFromLeague} from '../lib/nfl-official-injury-feed.js';
const week=await nflOfficialWeeklyFromLeague({year:2026,week:5,teams:['PHI','JAX']});
assert.equal(week.available,true,'NFL weekly league page not accessible or parseable');
assert.ok(week.teamCount>=24,'expected most Week 5 team sections from one official league page');
assert.ok(week.entries.some(x=>x.name==='Jaylon Jones'&&x.status==='OUT'),'JAX published OUT not extracted');
assert.ok(week.practiceRows>=10,'official weekly practice entries missing');
const games=[
{id:'401872981',teams:['PHI','JAX']},
{id:'401872987',teams:['MIN','NO']},
{id:'401872994',teams:['DEN','LAC']}
];
for(const item of games){
 const r=await fetch('https://momentum-radar-live-xk-nl-fix.invalid',{signal:AbortSignal.timeout(10000)}).catch(()=>null);
 if(r?.ok)throw Error('unexpected');
}
console.log(JSON.stringify({teamCount:week.teamCount,totalGameDesignations:week.entries.length,totalPracticeEntries:week.practiceEntries.length,PHIJAXStatus:week.entries.filter(x=>x.team==='PHI'||x.team==='JAX').map(x=>({name:x.name,team:x.team,status:x.status})).slice(0,14)},null,2));
