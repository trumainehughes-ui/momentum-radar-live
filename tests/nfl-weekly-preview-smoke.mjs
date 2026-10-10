import assert from 'node:assert/strict';
const origin='https://momentum-radar-live-bgqt09bk9-trumainehughes-6743.vercel.app';
const id='401872981';
const url=origin+'/api/nfl-injuries?gameId='+id;
const [response,gameResponse]=await Promise.all([
 fetch(url,{signal:AbortSignal.timeout(120000),headers:{accept:'application/json'}}),
 fetch(origin+'/api/nfl-game?gameId='+id,{signal:AbortSignal.timeout(120000),headers:{accept:'application/json'}})
]);
assert.equal(response.status,200,'injury preview did not return 200');
assert.equal(gameResponse.status,200,'roster check preview did not return 200');
const d=await response.json(),g=await gameResponse.json();
assert.equal(d.gameId,id);
assert.equal(d.ok,true);
assert.equal(d.weeklyCoverage,true,'dated official NFL weekly report not attached');
assert.equal(d.reportCompleteness,'NFL_PUBLISHED_WEEKLY_CROSS_CHECK');
assert.equal(d.officialInactivesVerified,false,'published injury report is NOT official final inactives');
assert.ok(d.weeklyPublishedAt,'published date should appear separately from checkedAt');
assert.equal(d.weeklyItems.length,8,'expected eight weekly PHI/JAX statuses');
assert.deepEqual(new Set(d.teams.map(t=>t.abbr)),new Set(['JAX','PHI']));
for(const [team,name,status] of [['PHI','Saquon Barkley','OUT'],['JAX','Jaylon Jones','OUT'],['PHI','DeVonta Smith','OUT'],['PHI','Marquise Brown','OUT'],['JAX','Eric Murray','DOUBTFUL'],['PHI','Jonathan Greenard','QUESTIONABLE']]){
 const r=d.weeklyItems.find(x=>x.team===team&&x.name===name);
 assert.ok(r,'missing official weekly entry '+team+' '+name);
 assert.equal(r.status,status);
 assert.equal(r.gameDesignationVerified,true);
}
assert.equal(d.injuries.filter(x=>/hollywood brown|marquise brown/i.test(x.name)).length,1,'Brown nickname duplicate');
assert.ok(d.reserveItems.every(x=>x.section==='RESERVE'));
assert.equal(g.ok,true);
assert.equal(g.injuryReport?.weeklyCoverage,true,'model roster did not get weekly report');
for(const name of ['Saquon Barkley','Jaylon Jones']){
 assert.ok(g.blockers.some(x=>x.name===name&&x.status==='OUT'),'parlay roster failed to exclude '+name);
}
for(const p of g.playerProjections||[]){
 assert.ok(!(['Saquon Barkley','Jaylon Jones','Marquise Brown','Hollywood Brown'].includes(p.name)),
  'out player entered an eligible projection pool: '+p.name);
}
console.log(JSON.stringify({gameId:d.gameId,weeklyCount:d.weeklyItems.length,reportedCount:d.injuries.length,blockers:d.blockers.length,reserves:d.reserveItems.length,
 source:d.weeklySource,sourceDate:d.weeklyPublishedAt,checkedAt:d.checkedAt,officialInactivesVerified:d.officialInactivesVerified,
 missingStarsRecovered:['Saquon Barkley','Jaylon Jones'],marketOddsVerified:false},null,2));
