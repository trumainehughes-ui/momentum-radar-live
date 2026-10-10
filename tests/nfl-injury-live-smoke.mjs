import assert from 'node:assert/strict';
const url='https://momentum-radar-live-9b4013052-trumainehughes-6743.vercel.app/api/nfl-injuries?gameId=401872987';
const response=await fetch(url,{signal:AbortSignal.timeout(120000),headers:{accept:'application/json'}});
assert.equal(response.status,200,'ESPN injury source has not returned a verified report: HTTP '+response.status);
assert.match(response.headers.get('cache-control')||'',/private.*no-store/);
const data=await response.json();
assert.equal(data.ok,true);
assert.equal(String(data.gameId),'401872987');
assert.equal(data.reportAvailable,true);
assert.equal(data.officialInactivesVerified,false,'ESPN report must not masquerade as NFL official inactives');
assert.equal(data.sourceUpdatedAt,null,'unknown provider timestamp must not be invented');
assert.ok(Number.isFinite(Date.parse(data.checkedAt)));
assert.ok(Math.abs(Date.now()-Date.parse(data.checkedAt))<120000,'injury fetched-at time is stale');
assert.deepEqual(new Set(data.teams.map(x=>x.abbr)),new Set(['MIN','NO']));
for(const row of data.injuries||[]){
 assert.ok(['MIN','NO'].includes(row.team),'wrong game injury '+row.name);
 assert.ok(['IR','INACTIVE','OUT','DOUBTFUL','QUESTIONABLE','PROBABLE','ACTIVE','REPORTED_OTHER','UNKNOWN'].includes(row.status),'unknown normalized injury status');
}
for(const row of data.blockers||[])assert.ok(['IR','INACTIVE','OUT','DOUBTFUL'].includes(row.status));
const gameUrl='https://momentum-radar-live-9b4013052-trumainehughes-6743.vercel.app/api/nfl-game?gameId=401872987';
const gameRsp=await fetch(gameUrl,{signal:AbortSignal.timeout(160000),headers:{accept:'application/json'}});
assert.equal(gameRsp.status,200,'roster/injury eligibility feed failed');
const game=await gameRsp.json();
assert.equal(game.ok,true);
assert.equal(game.injuryReport?.reportAvailable,true);
assert.equal(game.injuryReport?.officialInactivesVerified,false);
const invalid=new Set((game.blockers||[]).map(x=>String(x.playerId||'')));
for(const player of game.playerProjections||[]){
 assert.ok(!invalid.has(String(player.playerId||'')),'excluded player in model projection: '+player.name);
 if(player.availability==='QUESTIONABLE')
  assert.equal(player.recommendationEligible,false,'questionable player must be held for review');
 if(player.recommendationEligible)assert.equal(player.verification?.availability?.verified,true);
}

console.log(JSON.stringify({gameId:data.gameId,teams:data.teams.map(x=>x.abbr),reportStatus:data.status,reportSource:data.source,checkedAt:data.checkedAt,injuryCount:data.injuries.length,blockerCount:data.blockers.length,refreshMinutes:data.refreshMinutes,officialInactivesVerified:data.officialInactivesVerified,warning:data.officialInactivesStatus},null,2));
