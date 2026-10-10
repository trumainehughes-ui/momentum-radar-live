import assert from 'node:assert/strict';
const origin='https://momentum-radar-live-lcth5y5lw-trumainehughes-6743.vercel.app';
const gameId='401872987';
const [app,script,injury]=await Promise.all([
 fetch(origin+'/',{signal:AbortSignal.timeout(30000),headers:{accept:'text/html'}}),
 fetch(origin+'/public-nfl-impact.js',{signal:AbortSignal.timeout(30000)}),
 fetch(origin+'/api/nfl-injuries?gameId='+gameId,{signal:AbortSignal.timeout(90000)})
]);
assert.equal(app.status,200,'Preview page did not render');
assert.equal(script.status,200,'Client impact engine missing from preview');
assert.equal(injury.status,200,'Game injury report unavailable');
const html=await app.text(),source=await script.text(),inj=await injury.json();
assert.ok(html.includes('id="nflParlayWatch"'),'watchlist UI missing');
assert.ok(html.includes('src="/public-nfl-impact.js"'),'client script tag missing');
assert.ok(source.includes("momentumParlayWatch={decorate,onSnapshot,render"),'client impact events missing');
assert.ok(source.includes("MODEL_REBUILD_REQUIRED"),'model exclusion logic missing');
assert.ok(source.includes('BOOK_SETTLEMENT')===false,'untrusted settlement must not be synthesized');
assert.equal(inj.ok,true);
assert.equal(inj.reportAvailable,true);
assert.equal(inj.officialInactivesVerified,false);
assert.equal(inj.teamStrategySignalsVerified,false);
assert.equal(typeof inj.rosterSignalsAvailable,'boolean');
assert.ok(Array.isArray(inj.rosterSignals));
assert.ok(Array.isArray(inj.defensiveInjurySignals));
assert.equal(inj.refreshSeconds,inj.minutesToKickoff<=120&&inj.minutesToKickoff>=-240?30:180);
assert.deepEqual(new Set(inj.teams.map(x=>x.abbr)),new Set(['MIN','NO']));
for(const p of inj.rosterSignals){
 assert.ok(['MIN','NO'].includes(p.team),'cross-game roster '+p.name);
}
console.log(JSON.stringify({preview:origin,gameId,injuries:inj.injuries.length,blocked:inj.blockers.length,
 rosterSignals:inj.rosterSignals.length,rosterFeedAvailable:inj.rosterSignalsAvailable,defensiveInjurySignals:inj.defensiveInjurySignals.length,
 refreshSeconds:inj.refreshSeconds,bookSettlementConnected:false,officialInactivesVerified:inj.officialInactivesVerified},null,2));
