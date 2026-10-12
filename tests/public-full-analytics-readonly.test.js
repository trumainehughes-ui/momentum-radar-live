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
 assert.equal(d.categories.rushing[0].bookOffer.book,'DraftKings');
 assert.equal(d.categories.rushing[0].bookOffer.odds,-110);
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
 assert.ok(html.includes('Older saved predictions — not current betting information'));
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
test('public site has all core dashboard read-only modules, with syntactically valid JS',()=>{
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 for(const value of ['AI Game Analyzer','Matchup Edge','Injuries','Anytime TD',
 'Player Props','Same Game Parlays','Small','Medium','Nuke',
 'Live TD Tracker','NFL Results History','Best of Slate',
 '/api/public-nfl-ai?','/api/public-nfl-live?',
 '/api/public-nfl-history','/api/public-nfl-game?'])
  assert.ok(html.includes(value),value);
 const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js);
 assert.doesNotThrow(()=>new vm.Script(js));
 for(const prohibited of ['<a href="/api/nfl-markets"','<a href="/api/nfl-health"',
  'GROQ_API_KEY','CRON_SECRET','sourceUrl:','apiKey:'])
  assert.ok(!html.includes(prohibited),prohibited);
});
