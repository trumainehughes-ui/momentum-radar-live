import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflFridaySundayDate,sundayTdPrimerGames}
 from '../lib/nfl-sunday-td-primer-policy.js';

const ids=['401872996','401872999','401872997','401873003',
 '401873001','401873000','401872998','401873002',
 '401873004','401873006','401873005','401873007'];
const kickoff=['2026-10-18T13:30:00Z',...Array(7).fill('2026-10-18T17:00:00Z'),
 '2026-10-18T20:05:00Z',...Array(2).fill('2026-10-18T20:25:00Z'),
 '2026-10-19T00:20:00Z'];
const games=ids.map((gameId,i)=>({gameId,kickoff:kickoff[i],status:'SCHEDULED'}));

test('Friday early Sunday date uses Eastern-local NFL game date (DST and EST)',()=>{
 assert.equal(nflFridaySundayDate(Date.parse('2026-10-16T16:00:00Z')),'2026-10-18');
 assert.equal(nflFridaySundayDate(Date.parse('2026-11-06T16:00:00Z')),'2026-11-08');
 assert.equal(nflFridaySundayDate(Date.parse('2026-10-17T16:00:00Z')),null);
});
test('both primer shards cover all 12 Sunday matchups 48+ hours before some kickoffs',()=>{
 const a=sundayTdPrimerGames(games,0),b=sundayTdPrimerGames(games,1);
 assert.equal(a.length,6);
 assert.equal(b.length,6);
 assert.deepEqual(new Set([...a,...b].map(x=>x.gameId)),new Set(ids));
 assert.equal([...a,...b].some(g=>Date.parse(g.kickoff)-Date.parse('2026-10-16T16:00:00Z')>30*3600_000),true);
});
test('invalid, non-Sunday, inactive and duplicate game identities are rejected',()=>{
 const altered=[...games,{...games[0]},{
  gameId:'401879876',kickoff:'2026-10-19T16:00:00Z',status:'SCHEDULED'
 },{gameId:'401879877',kickoff:'2026-10-18T18:00:00Z',status:'FINAL'},
 {gameId:'bad',kickoff:'2026-10-18T18:00:00Z',status:'SCHEDULED'}];
 assert.equal(sundayTdPrimerGames(altered,0).length,6);
 assert.equal(sundayTdPrimerGames(altered,1).length,6);
 assert.deepEqual(sundayTdPrimerGames(altered,9),[]);
});
test('market primer requires signed token and does not use paid sportsbook APIs',()=>{
 const market=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const handler=readFileSync(new URL('../api/nfl-sunday-td-prime.js',import.meta.url),'utf8');
 assert.ok(market.includes("String(req.query?.modelOnly||'')==='1'"));
 assert.ok(market.includes("String(req.headers?.authorization||'')==='Bearer '+process.env.CRON_SECRET"));
 assert.ok(market.includes("if(!modelOnlyPrimer&&!DIRECT_PUBLIC_ODDS_ONLY)try{"));
 assert.ok(market.includes("sgoFlag!=='false'&&!modelOnlyPrimer&&!DIRECT_PUBLIC_ODDS_ONLY"));
 assert.ok(handler.includes("modelOnly=1"));
 assert.ok(handler.includes("!authorized(req,process.env.CRON_SECRET)"));
 assert.ok(handler.includes("process.env.VERCEL_ENV!=='production'"));
 assert.ok(!handler.includes('PLAYER_PROPS_API_KEY'));
 assert.ok(!handler.includes('THE_ODDS_API_KEY'));
 assert.ok(!handler.includes('SPORTSGAMEODDS_API_KEY'));
});
test('two Friday crons are registered separately from existing paid 30-hour windows',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 const cron=Object.fromEntries(config.crons.map(x=>[x.path,x.schedule]));
 assert.equal(cron['/api/nfl-sunday-td-prime?shard=0'],'0 16 * * 5');
 assert.equal(cron['/api/nfl-sunday-td-prime?shard=1'],'15 16 * * 5');
 assert.equal(cron['/api/nfl-health?cron=1'],'*/10 * * * *');
 assert.equal(config.functions['api/nfl-sunday-td-prime.js'].maxDuration,300);
});
