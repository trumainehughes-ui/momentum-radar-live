import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 nflEasternDate,nflAddDate,nflCollectorDueGames,nflTierReadiness,
 nflCollectorSnapshotReady,nflRunCollectorBatch,MAX_NFL_COLLECTOR_CONCURRENCY
} from '../lib/nfl-collector-readiness.js';
import {historySnap} from '../api/nfl-health.js';
const when=Date.parse('2026-10-11T12:00:00Z');
const game=(id,minutes,status='SCHEDULED')=>({
 gameId:String(id),status,kickoff:new Date(when+minutes*60000).toISOString(),
 home:{abbr:'DEN'},away:{abbr:'LAC'}
});
test('Sunday and Monday stay in distinct Eastern NFL date scopes',()=>{
 assert.equal(nflAddDate('2026-10-11',1),'2026-10-12');
 assert.equal(nflAddDate('2026-10-14',1),'2026-10-15');
 assert.equal(nflEasternDate(new Date('2026-10-12T01:00:00Z')),'2026-10-11');
 assert.equal(MAX_NFL_COLLECTOR_CONCURRENCY,4);
});
test('collector includes all eligible upcoming games once, ordered by kickoff',()=>{
 const games=[game(401800001,180),game(401800002,20),game(401800003,-2),
 game(401800004,1440,'FINAL'),game(401800005,1890),game(401800002,20),game(401800006,30)];
 const due=nflCollectorDueGames(games,{now:when});
 assert.deepEqual(due.map(x=>x.gameId),['401800002','401800006','401800001']);
});
test('game failures do not prevent updates to all other matchups; bounded concurrency',async()=>{
 const games=Array.from({length:14},(_,i)=>game(401800010+i,70+i));
 let active=0,peak=0,completed=0;
 const done=await nflRunCollectorBatch(games,async(g)=>{
  active++;peak=Math.max(peak,active);
  try{
   await Promise.resolve();
   if(g.gameId==='401800015')throw Error('upstream_error');
   completed++;
   return{gameId:g.gameId,status:'locked'};
  }finally{active--}
 });
 assert.equal(done.length,14);
 assert.equal(completed,13);
 assert.equal(done.filter(x=>x.status==='locked').length,13);
 assert.deepEqual(done[5],{gameId:'401800015',status:'collector_error',error:'upstream_error'});
 assert.ok(peak<=4);
 assert.equal(peak,4);
});
test('empty, invalid Small Medium Nuke cards are reported as NOT_READY',()=>{
 const tiers=nflTierReadiness({sgps:{Analytics:[
  {risk:'Small',legs:[],requiredLegs:4,tierAssessment:{compositionOk:false}},
  {risk:'Medium',legs:[{cat:'rushing'}],requiredLegs:5},
  {risk:'Nuke',legs:[],requiredLegs:5,tierAssessment:{compositionOk:false}}
 ]}});
 for(const name of ['Small','Medium','Nuke']){
  assert.equal(tiers[name].status,'NOT_READY');
  assert.equal(tiers[name].combinedBookOddsVerified,false);
 }
});
test('five-leg Nuke can be complete while sportsbook combined odds remain unverified',()=>{
 const tiers=nflTierReadiness({sgps:{Analytics:[
  {risk:'Nuke',legs:['passing','rushing','receiving','receptions','td'].map((cat,i)=>({name:'Athlete'+i,playerID:String(900+i),cat})),
   requiredLegs:5,tierAssessment:{compositionOk:true}}
 ]}});
 assert.equal(tiers.Nuke.status,'MODEL_CANDIDATE');
 assert.equal(tiers.Nuke.legs,5);
 assert.equal(tiers.Nuke.combinedBookOddsVerified,false);
});
test('history snapshots exclude invalid SGP builds and yardage rows without thresholds',()=>{
 const g=game(401800020,120),m={ok:true,
  categories:{td:[{name:'One',playerID:'99'}],
   passing:[{name:'QB',playerID:'101',projection:230}],
   rushing:[{name:'RB',playerID:'102',analyticsThreshold:75,projection:65}]},
  sgps:{Analytics:[
   {risk:'Small',requiredLegs:4,legs:[],tierAssessment:{compositionOk:false}},
   {risk:'Medium',requiredLegs:5,legs:[{name:'RB',cat:'rushing',analyticsThreshold:70}],tierAssessment:{compositionOk:false}},
   {risk:'Nuke',requiredLegs:5,legs:['passing','rushing','receiving','receptions','td'].map((cat,i)=>({name:'P'+i,playerID:String(900+i),cat,analyticsThreshold:cat==='td'?null:70,projection:cat==='td'?null:55})),tierAssessment:{compositionOk:true}}
  ],DraftKings:[]}
 };
 const s=historySnap(g,m);
 assert.deepEqual(s.picks.map(x=>x.name),['One','RB']);
 assert.equal(s.sgps.length,1);
 assert.equal(s.sgps[0].risk,'Nuke');
 assert.equal(s.sgps[0].combinedBookQuoteVerified,false);
 assert.equal(s.modelTierReadiness.Small.status,'NOT_READY');
 assert.equal(s.modelTierReadiness.Medium.status,'NOT_READY');
 assert.equal(s.modelTierReadiness.Nuke.status,'MODEL_CANDIDATE');
 assert.equal(nflCollectorSnapshotReady(s),true);
 assert.equal(nflCollectorSnapshotReady({picks:[],sgps:[]}),false);
});
test('real market event IDs are mapped back to ESPN game identity',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(api.includes('async function oddsApiFallback(date,home,away,gameId)'));
 assert.ok(api.includes("return oddsApiRows(await r.json(),gameId).map(x=>({...x,providerEventID:ev.id}))"));
 assert.ok(api.includes('mergeAuthorizedPropLineRows(rows.map(x=>({...x,providerEventID:x.eventID,eventID:gameId})),signedPropLineRows)'));
 assert.ok(api.includes("buildBookSgp(quoteSourceRows,'DraftKings',ctx)"));
 assert.ok(api.includes('shouldUseSgoBackup({'),'SportsGameOdds must stay backup-only');
 assert.ok(!api.includes('providerBackup=1'));
});
test('NFL UI has Sunday Monday Thursday selector, date-scoped load and manual refresh',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const id of ['nflDate','nflRefreshAll','nflSlateFresh'])assert.ok(html.includes('id="'+id+'"'));
 for(const day of ['0','1','4'])assert.ok(html.includes('data-nflday="'+day+'"'));
 assert.ok(html.includes("const selectedDay=$('#nflDate')?.value||''"));
 assert.ok(html.includes("new URLSearchParams({...selectedDay?{date:selectedDay}:{}"));
 assert.ok(html.includes("if(league==='nfl')loadNFL()"));
});
test('15-minute collector scans the next two days, never invents market health',()=>{
 const source=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(config.crons.some(x=>x.path==='/api/nfl-health?cron=1'&&x.schedule==='*/10 * * * *'));
 assert.ok(source.includes("cron?[today,nflAddDate(today,1),nflAddDate(today,2)]"));
 assert.ok(source.includes("AbortSignal.timeout(65000)"));
 assert.ok(source.includes('nflRunCollectorBatch(due'));
 assert.ok(source.includes("status:'SEPARATE_SERVICE'"));
});

test('anytime TD uses current completed weeks and counts one game per player',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(src.includes('const currentWeek=Number(sc.week?.number||sc.events?.[0]?.week?.number||0)'));
 assert.ok(src.includes('w<=lastCompletedWeek;w++'));
 assert.ok(src.includes('games:new Set()'));
 assert.ok(src.includes('u.games.add(String(s.header?.id'));
 assert.ok(src.includes('const gp=Math.max(1,u.games.size),oppPG=opps/gp'));
 assert.ok(!src.includes('u.games++;usage.set(id,u)'));
});
test('NFL market metadata preserves verified offers and opt-in bookmaker feeds',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(src.includes("const DIRECT_PUBLIC_ODDS_ONLY=String(process.env.MOMENTUM_VERIFIED_BOOK_FEEDS||'').toLowerCase()!=='enabled'"));
 assert.ok(src.includes('const exactSiteOffers='));
 assert.ok(src.includes("String(o.gameId||'')===String(gameId)"));
 assert.ok(src.includes("Number.isFinite(Date.parse(o.observedAt||''))"));
 assert.ok(src.includes('sgpEligibleMarketRows:sgpGateDiagnostics.eligible'));
 assert.ok(src.includes('combinedBookSgpQuoteAvailable:sgpResponse.combinedBookQuoteVerified'));
 assert.ok(src.includes('Only verified bookmaker quotes can be presented as bettable parlays.'));
});
