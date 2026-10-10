import assert from 'node:assert/strict';
const origin='https://momentum-radar-live-ic1s76lbz-trumainehughes-6743.vercel.app';
const get=async url=>{
 const r=await fetch(origin+url,{signal:AbortSignal.timeout(120000),headers:{accept:'application/json'}});
 assert.equal(r.status,200,url+' HTTP '+r.status);
 const d=await r.json();assert.equal(d.ok,true);return d;
};
const board=await get('/api/nfl-injury-board?date=2026-10-11');
assert.ok(board.gamesChecked>=10,'expected full Sunday Week 5 slate');
assert.equal(board.sourceCoverage,board.gamesChecked,'each Sunday matchup requires official NFL weekly coverage');
const games=board.games;
for(const game of games){
 assert.equal(game.coverage,true);
 assert.equal(game.week,5);
 assert.equal(game.year,2026);
 assert.equal(game.officialInactivesVerified,false);
 assert.ok(/\/reg5$/.test(game.url));
}
const select=games.filter(g=>['PHI','JAX','MIN','NO','DEN','LAC','SF','SEA'].some(t=>g.teams.includes(t))).slice(0,4);
assert.ok(select.length>=3);
for(const game of select){
 const response=await get('/api/nfl-injuries?gameId='+game.gameId);
 assert.equal(response.weeklyCoverage,true,'selected game '+game.teams.join('-'));
 assert.equal(response.officialSourceAutomated,true,'nonautomatic source '+game.gameId);
 assert.equal(response.officialSourceWeek,5);
 assert.equal(response.officialInactivesVerified,false);
 assert.ok(response.officialSourceCheckedAt);
 assert.ok(response.weeklySourceUrl?.includes('/injuries/league/2026/reg5'));
 const allowed=new Set(game.teams);
 for(const p of response.injuries)assert.ok(allowed.has(p.team),'cross-game player '+p.name);
 console.log(JSON.stringify({teams:game.teams,gameId:game.gameId,status:response.status,weeklyStatuses:response.weeklyItems.length,practiceOnly:response.practiceOnlyCount,reserves:response.reserveItems.length,source:response.weeklySourceUrl}));
}
const monday=await get('/api/nfl-injury-board?date=2026-10-12');
assert.ok(monday.gamesChecked>=1,'Monday game not found');
assert.equal(monday.sourceCoverage,monday.gamesChecked);
assert.ok(monday.games.every(g=>g.week===5));
console.log(JSON.stringify({date:board.date,matchups:board.gamesChecked,verifiedWeeklyCoverage:board.sourceCoverage,mondays:monday.gamesChecked}));
