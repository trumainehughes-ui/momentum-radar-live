import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {publicNflGameView} from '../lib/public-nfl-view.js';
import {publicAiSummary} from '../api/public-nfl-ai.js';
import {publicLiveTouchdowns} from '../api/public-nfl-live.js';
import {safePublicNflHistory} from '../api/public-nfl-history.js';
const date='2026-10-12',id='401872990',now=Date.parse('2026-10-12T20:30:00Z');
const role='RB';
const row={eventID:id,name:'Sample Rush Star',playerID:'17',team:'BUF',opponent:'LAR',
 position:role,projection:95,perGame:84,gamesPlayed:5,
 momentumScore:81,reason:'Recent workload and matchup volume.',
 range:{floor:40,ceiling:130},
 recentForm:{last5:[80,90,65,120,100],label:'UP'},
 rushingChance:{modelTargetYards:75,estimatedPercent:69},
 bestBook:{book:'DraftKings',line:79.5,odds:-110,
  checkedAt:new Date(now-60000).toISOString(),available:true,
  bookOutcomeId:'SECRET-PROVIDER-ID'}};
const game={at:now-60000,body:{ok:true,date,gameId:id,home:'LAR',away:'BUF',
 categories:{rushing:[row],passing:[],receiving:[],receptions:[],td:[]},
 validation:{injuryEligibilityChecked:true,injuryReportCheckedAt:new Date(now-80000).toISOString(),
  injuryEvidence:[
   {name:'Someone Questionable',team:'BUF',position:'WR',status:'QUESTIONABLE',section:'WEEKLY',
    sourceUrl:'https://private.example/internal',privateAudit:{token:'TEST_SECRET'}},
   {name:'Other Game',team:'KC',status:'OUT'}]},
 matchupEvidence:{status:'BILATERAL_EVIDENCE',
  privateToken:'TEST_SECRET',
  sides:[{offenseTeam:'BUF',defenseTeam:'LAR',
   offenseSampleGames:5,defenseSampleGames:5,
   positions:[{position:'RB',metrics:[{
    metric:'rushYards',offenseProducedPerGame:122.8,
    defenseAllowedPerGame:139.1,offenseRankMost:6,defenseRankMost:4,
    sourceUrl:'https://private.example/internal'
   }]}]},
   {offenseTeam:'LAR',defenseTeam:'BUF',offenseSampleGames:5,defenseSampleGames:5,
    positions:[{position:'QB',metrics:[{
     metric:'passYards',offenseProducedPerGame:255.2,
     defenseAllowedPerGame:238.1,offenseRankMost:15,defenseRankMost:23}]}]}]},
 outcomePrediction:{teamA:'BUF',teamB:'LAR',
  projectedFinalScore:{BUF:24,LAR:21},winProbability:{BUF:55,LAR:45},
  internalFactors:{apiKey:'TEST_SECRET'}},
 sgps:{Analytics:[],DraftKings:[],FanDuel:[]}}};
test('public read-only game includes matchups, positional DVP, injuries and rich player evidence',()=>{
 const d=publicNflGameView(game,{date,gameId:id,now});
 assert.equal(d.status,'CURRENT');
 assert.equal(d.categories.rushing[0].projection,95);
 assert.equal(d.categories.rushing[0].avgPerGame,84);
 assert.deepEqual(d.categories.rushing[0].recentFive,[80,90,65,120,100]);
 assert.equal(d.categories.rushing[0].suggestedTarget,75);
 assert.equal(d.categories.rushing[0].suggestedTargetChance,69);
 // A bookmaker name and price without selection identity, source URL,
 // exact market and game provenance cannot qualify as a verified offer.
 assert.equal(d.categories.rushing[0].bookOffer,null);
 assert.equal(d.categories.rushing[0].modelOnly,true);
 assert.equal(d.pregameChecks.offerEvidence.status,'NO_SOURCE_VERIFIED_INDIVIDUAL_OFFERS');
 assert.equal(d.pregameChecks.offerEvidence.verifiedIndividualCount,0);
 assert.equal(d.pregameChecks.offerEvidence.verifiedCombinedCount,0);
 assert.equal(d.matchup.sides.length,2);
 assert.equal(d.matchup.sides[0].positions[0].metrics[0].defenseRank,4);
 assert.equal(d.projectedScore.scores[0].points,24);
 assert.deepEqual(d.injuries.map(x=>x.name),['Someone Questionable']);
 const serialized=JSON.stringify(d);
 for(const key of ['TEST_SECRET','bookOutcomeId','sourceUrl','privateAudit','apiKey',
  'providerEventId','oddsDebug'])assert.ok(!serialized.includes(key),key);
});
test('last saved mode preserves model evidence visibly but never stale prices',()=>{
 const x=structuredClone(game);
 x.at=now-48*60_000;
 const conservative=publicNflGameView(x,{date,gameId:id,now});
 assert.equal(conservative.status,'STALE');
 assert.equal(conservative.categories.rushing.length,0);
 const publicView=publicNflGameView(x,{date,gameId:id,now,includeLastSaved:true});
 assert.equal(publicView.status,'LAST_SAVED');
 assert.equal(publicView.categories.rushing[0].projection,95);
 assert.equal(publicView.categories.rushing[0].bookOffer,null);
 assert.equal(publicView.verifiedQuotes.length,0);
 assert.equal(publicView.pregameChecks.offerEvidence.status,'EXPIRED');
 assert.equal(publicView.pregameChecks.offerEvidence.verifiedIndividualCount,0);
 assert.equal(publicView.inactivesVerified,false);
 assert.equal(publicView.updatedDataCurrent,false);
 assert.match(publicView.message,/OLDER MODEL SNAPSHOT/);
 const tooOld=structuredClone(x);
 tooOld.at=now-37*60*60_000;
 assert.equal(publicNflGameView(tooOld,{date,gameId:id,now,includeLastSaved:true}).status,'STALE');
 const api=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(api.includes('includeLastSaved:true'));
 assert.ok(html.includes("['CURRENT','LAST_SAVED'].includes(d.status)"));
 assert.ok(!html.includes('Older saved predictions — not current betting information'));
 assert.ok(html.includes("'Model preview • ':'')+fmtStamp(d.updatedAt)"));
 assert.ok(html.includes("$('#match-content').innerHTML=tabs+'<div class=\"detail-body\">'+body+'</div>'"));
 assert.ok(html.includes("['CURRENT','LAST_SAVED'].includes(d.status)"));
 assert.ok(html.includes('Combined sportsbook odds and player lines are not verified'));
 assert.ok(html.includes('No matching public price captured for this selection.'));
 assert.ok(html.includes('Observed '));
 assert.ok(!html.includes('border:1px solid #ba8550;background:#342923'));
});
test('old book prices and questionable player projections remain hidden',()=>{
 const old=structuredClone(game);
 old.body.categories.rushing[0].bestBook.checkedAt=new Date(now-25*60_000).toISOString();
 old.body.categories.rushing.push({...row,playerID:'18',name:'Held Player',injuryStatus:'QUESTIONABLE'});
 const result=publicNflGameView(old,{date,gameId:id,now});
 assert.equal(result.categories.rushing.length,1);
 assert.equal(result.categories.rushing[0].bookOffer,null);
});
test('read-only AI viewer shows only actual saved vetted AI reviews',()=>{
 const history={league:'nfl',gameId:id,game:{gameId:id,kickoff:'2026-10-13T00:15:00Z'},
  checkedAt:new Date(now).toISOString(),
  injuryChecks:{rosterAndInjuryEligibilityChecked:true},
  aiReview:{status:'REVIEWED',summary:'Compare BUF running game with LAR rush defense.',
   checkedAt:new Date(now-60000).toISOString(),advisoryOnly:true,canAlterPicks:false,
   rawProviderToken:'TEST_SECRET'}};
 let out=publicAiSummary(history,{date,gameId:id,now});
 assert.equal(out.status,'SAVED_AI_REVIEW');
 assert.match(out.analysis,/BUF running game/);
 assert.ok(!JSON.stringify(out).includes('TEST_SECRET'));
 history.aiReview.canAlterPicks=true;
 out=publicAiSummary(history,{date,gameId:id,now});
 assert.equal(out.status,'REVIEW_PENDING');
 history.aiReview.canAlterPicks=false;
 history.game.gameId='401872999';
 assert.equal(publicAiSummary(history,{date,gameId:id,now}).status,'REVIEW_PENDING');
});
test('public touchdown tracker retains verified pregame star only, not raw player IDs',()=>{
 const result=publicLiveTouchdowns({ok:true,gameId:id,status:'In Progress',
  touchdowns:[{name:'Player Example',playerId:'SECRET',text:'10 yard rush for a TOUCHDOWN',
   period:3,clock:'06:24',star:true,providerAudit:{source:'TEST_SECRET'}}]},id);
 assert.equal(result.touchdowns[0].star,true);
 assert.equal(result.touchdowns[0].period,3);
 assert.ok(!JSON.stringify(result).includes('SECRET'));
 assert.equal(publicLiveTouchdowns({ok:true,gameId:'401872999'},id).ok,false);
});
test('public results history is archived and sanitized; all admin URLs stay private',()=>{
 const d=safePublicNflHistory({ok:true,history:[{providerKey:'SECRET'}],
 archive:[{league:'nfl',gameId:id,score:'BUF 24 — LAR 21',
  playerHits:4,playerTotal:8,sgpHits:1,sgpTotal:3,
  tiers:{Small:{hits:1,total:1},Medium:{hits:0,total:1}},
  rawKeys:'TEST_SECRET'}]});
 assert.equal(d.archive.length,1);
 assert.equal(d.archive[0].tiers.Small.hits,1);
 assert.ok(!JSON.stringify(d).includes('SECRET'));
 assert.ok(!JSON.stringify(d).includes('history'));
});
test('public AI analysis presents immediate real model evidence while saved Groq review is pending',()=>{
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(html.includes('AI-Assisted Model Brief'));
 assert.ok(html.includes('Top Anytime TD opportunities'));
 assert.ok(html.includes('Top yardage and reception candidates'));
 assert.ok(html.includes('observed rush/target opportunities per game'));
 assert.ok(html.includes('(uncalibrated model)'));
 assert.ok(html.includes('Model picks only · Combined sportsbook odds and player lines are not verified'));
 assert.ok(html.includes('Source-verified individual offers:'));
 assert.ok(html.includes('Correlated SGP quotes:'));
 const aiStart=html.indexOf('function showAi(d)');
 const aiEnd=html.indexOf('function showLive(d)');
 assert.ok(aiStart>0&&aiEnd>aiStart);
 assert.ok(html.slice(aiStart,aiEnd).includes('return intro+modelBrief+review+insight+'));
 assert.ok(!html.slice(aiStart,aiEnd).includes('/api/ai-analysis'));
});
test('public site auto-refresh reads saved responses only and retains matchup tab selection',()=>{
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const refreshStart=html.indexOf('async function refreshReadOnlyPredictions()');
 const refreshEnd=html.indexOf("$('#refresh').addEventListener",refreshStart);
 assert.ok(refreshStart>0&&refreshEnd>refreshStart);
 const code=html.slice(refreshStart,refreshEnd);
 assert.ok(code.includes('/api/public-nfl-game?'));
 assert.ok(code.includes('/api/public-nfl-rankings?'));
 assert.ok(code.includes('5*60*1000'));
 assert.ok(code.includes('state.selectedData=d'));
 assert.ok(code.includes('if(document.hidden'));
 assert.ok(!code.includes('/api/nfl-markets'));
 assert.ok(!code.includes('/api/ai-analysis'));
 assert.ok(!code.includes('/api/nfl-health'));
 assert.ok(!code.includes('loadSlate('));
});
test('public site has all core dashboard read-only modules, with syntactically valid JS',()=>{
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 for(const value of ['AI Game Analyzer','Matchup Edge','Injuries','Anytime TD',
 'Player Props','Same Game Parlays','Small','Medium','Nuke',
 'Live TD Tracker','Best of Slate',
 '/api/public-nfl-ai?','/api/public-nfl-live?',
 '/api/public-nfl-game?'])
  assert.ok(html.includes(value),value);
 const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new vm.Script(js));
 for(const prohibited of ['<a href="/api/nfl-markets"','<a href="/api/nfl-health"',
  'GROQ_API_KEY','CRON_SECRET','sourceUrl:','apiKey:'])
  assert.ok(!html.includes(prohibited),prohibited);
});

test('preliminary NFL Top 10 coverage and real book verification stay consistent across owner and public site',()=>{
 const owner=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const publicHtml=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const publicApi=readFileSync(new URL('../api/public-nfl-rankings.js',import.meta.url),'utf8');
 const ranks=readFileSync(new URL('../lib/nfl-slate-rankings.js',import.meta.url),'utf8');
 assert.ok(owner.includes('PRELIMINARY • Only '));
 assert.ok(owner.includes('Sunday Top 10 — Anytime TD Scorers'));
 assert.ok(owner.includes("nflRenderRankPanel('td',{background:true})"));
 assert.ok(publicHtml.includes('rows.slice(0,10)'));
 assert.ok(publicHtml.includes('SUNDAY TOP 10 — ANYTIME TD SCORING CANDIDATES'));
 assert.ok(owner.includes('x.verifiedIndividualOffer===true'));
 assert.ok(publicHtml.includes('PRELIMINARY MODEL WATCHLIST'));
 assert.ok(publicHtml.includes("Friday's scheduled Sunday-slate primer prepares roster/injury-screened Anytime TD scorer estimates"));
 const health=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
 assert.ok(health.includes('collectionForecast=nflCollectionForecast(games)'));
 assert.ok(publicApi.includes('categoryGameCounts:ranked.categoryGameCounts'));
 assert.ok(ranks.includes('nflBookOfferEligible(row,b,b.book,now)'));
 assert.ok(ranks.includes('categoryGameCounts:Object.fromEntries'));
});

test('public NFL module menu mirrors consumer production categories without History',()=>{
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const menu=html.match(/<nav id="nfl-module-tabs"[\s\S]*?<\/nav>/)?.[0]||'';
 const expected=['games','td','passing','rushing','receiving','receptions','sgps','best','live'];
 assert.deepEqual([...menu.matchAll(/data-nfl-module="([^"]+)"/g)].map(x=>x[1]),expected);
 for(const label of ['Game Day','Anytime TD','Passing','Rushing','Receiving',
   'Receptions','Same Game Parlays','Best of Slate','Live TD Tracker'])
  assert.ok(menu.includes(label),label);
 assert.ok(!menu.includes('History'));
 assert.ok(!html.includes('NFL Results History'));
 assert.ok(!html.includes('/api/public-nfl-history'));
 assert.ok(html.includes("moduleContent.appendChild($('#rankings-section'))"));
 assert.ok(html.includes("moduleContent.appendChild($('#extra-section'))"));
 assert.ok(html.includes("$('#game-day-board').hidden=nfl&&!gameModules.has(module)"));
 assert.ok(html.includes("$('#nfl-module-tabs').addEventListener('click'"));
 assert.ok(html.includes('/api/public-nfl-game?'));
 assert.ok(html.includes('/api/public-nfl-rankings?'));
 assert.ok(!html.includes('/api/nfl-markets?'));
});
