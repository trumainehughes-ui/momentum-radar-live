import {nbaBestEdgeParlay} from '../lib/nba-best-edge-parlay.js';
import {nbaReadPregame} from './nba-health.js';
import {nbaAiMatchupIdentityConflict} from '../lib/pregame-ai-review.js';
// The public endpoint does not accept client-supplied odds or player forecasts.
// ESPN consensus lines are optional; missing lines result in NO_QUALIFYING_PARLAY.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const date=String(req.query?.date||new Date().toISOString().slice(0,10));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'INVALID_DATE'});
 try{
  const url='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='+date.replaceAll('-','');
  const response=await fetch(url,{signal:AbortSignal.timeout(9000),cache:'no-store'});
  if(!response.ok)throw Error('SCOREBOARD_UNAVAILABLE');
  const data=await response.json();
  const scheduled=(data.events||[]).filter(e=>String(e.status?.type?.state||'').toLowerCase()==='pre');
  const games=await Promise.all(scheduled.map(async e=>{
   const c=e.competitions?.[0]||{},odds=c.odds?.[0]||{};
   const snapshot=await nbaReadPregame(String(e.id)).catch(()=>null);
   const homeAbbr=c.competitors?.find(x=>x.homeAway==='home')?.team?.abbreviation||null;
   const awayAbbr=c.competitors?.find(x=>x.homeAway==='away')?.team?.abbreviation||null;
   const reviewConflict=nbaAiMatchupIdentityConflict(snapshot?.aiReview?.summary,{gameId:String(e.id),
    home:{abbr:homeAbbr},away:{abbr:awayAbbr}});
   const spread=odds.spread??odds.details?.match(/[-+]\d+(?:\.\d+)?/)?.[0];
   return {gameId:String(e.id),status:'SCHEDULED',kickoff:e.date,
    total:odds.overUnder??null,spread:spread??null,
    playerProjections:snapshot?.playerProjections||[],
    injuryCheckedAt:snapshot?.injuryCheckedAt||null,gameChanges:snapshot?.gameChanges||[],snapshotPresent:Boolean(snapshot),snapshotCheckedAt:snapshot?.checkedAt||null,snapshotModelVersion:snapshot?.modelVersion||null,aiReviewStatus:reviewConflict?'IDENTITY_CONFLICT':snapshot?.aiReview?.status||'NOT_RUN',aiReviewCheckedAt:snapshot?.aiReview?.checkedAt||null,
    aiReviewSummary:snapshot?.aiReview?.status==='REVIEWED'&&!reviewConflict?String(snapshot.aiReview.summary||'').slice(0,1400):null,
    starterEvidence:snapshot?.starterEvidence||null,
    homeTeam:c.competitors?.find(x=>x.homeAway==='home')?.team?.displayName||null,
    awayTeam:c.competitors?.find(x=>x.homeAway==='away')?.team?.displayName||null};
  }));
  const result=nbaBestEdgeParlay(games,{mode:'VERIFIED_MARKET'});
  const snapshotVersions=[...new Set(games.map(g=>g.snapshotModelVersion).filter(Boolean))];
  const staleSnapshotGames=games.filter(g=>g.snapshotModelVersion!=='v15-preserve-newest-ten-player-history').map(g=>g.gameId);
  const snapshotHealth={scheduledGames:games.length,snapshotsAvailable:games.filter(g=>g.snapshotPresent).length,
   gamesWithPlayerProjections:games.filter(g=>g.playerProjections.length>0).length,
   snapshotModelVersions:snapshotVersions.slice(0,6),
   staleSnapshotGames,staleSnapshotCount:staleSnapshotGames.length,
   gamesWithInjuryChecks:games.filter(g=>g.injuryCheckedAt).length,
   gamesWithEspnListedGameTotals:games.filter(g=>Number.isFinite(Number(g.total))&&Number(g.total)>0).length,
   gamesWithEspnListedSpreads:games.filter(g=>g.spread!==null&&Number.isFinite(Number(g.spread))).length,
   gamesWithEligibleProps:games.filter(g=>g.playerProjections.some(p=>Array.isArray(p.verifiedMarkets)&&p.verifiedMarkets.length>=2)).length,
   playersWithConfirmedStarterFlag:games.reduce((n,g)=>n+g.playerProjections.filter(p=>p.starterVerified===true).length,0),
   playersWithSourcedMarketPairs:games.reduce((n,g)=>n+g.playerProjections.filter(p=>Array.isArray(p.verifiedMarkets)&&p.verifiedMarkets.length>=2).length,0),
   playersWithTenGameHistory:games.reduce((n,g)=>n+g.playerProjections.filter(p=>Array.isArray(p.historicalValues)&&p.historicalValues.length>=10).length,0),
   playersWithThreeToNineGameHistory:games.reduce((n,g)=>n+g.playerProjections.filter(p=>Array.isArray(p.historicalValues)&&p.historicalValues.length>=3&&p.historicalValues.length<10).length,0),
   playersWithAnyHistoricalValues:games.reduce((n,g)=>n+g.playerProjections.filter(p=>Array.isArray(p.historicalValues)&&p.historicalValues.length>0).length,0),
   gamesAiReviewed:games.filter(g=>g.aiReviewStatus==='REVIEWED').length,
   gamesAiUnavailable:games.filter(g=>g.aiReviewStatus==='UNAVAILABLE').length,
   gamesWithConfirmedStarters:games.filter(g=>g.starterEvidence?.startersConfirmed===true).length,
   gamesWithStarterEvidenceChecked:games.filter(g=>g.starterEvidence?.checked===true).length,
   starterEvidenceReasons:[...new Set(games.map(g=>g.starterEvidence?.reason||'UNAVAILABLE'))].slice(0,6),
   starterEvidenceTeamReasons:games.flatMap(g=>Object.entries(g.starterEvidence?.teamReasons||{}).map(([team,reason])=>({gameId:g.gameId,team,reason,
    rowCounts:g.starterEvidence?.teamRowDiagnostics?.[team]||null}))).slice(0,24)};
  // Report every independent readiness blocker instead of implying that
  // confirming starters alone would make a sportsbook parlay playable.
  const readinessBlockers=[];
  if(snapshotHealth.gamesWithConfirmedStarters<2||snapshotHealth.playersWithConfirmedStarterFlag<4)
   readinessBlockers.push('GAME_SCOPED_STARTERS_NOT_CONFIRMED');
  if(snapshotHealth.playersWithTenGameHistory<4)
   readinessBlockers.push('TEN_GAME_PLAYER_HISTORY_MISSING');
  if(snapshotHealth.playersWithSourcedMarketPairs<4)
   readinessBlockers.push('TWO_FRESH_VERIFIED_BOOK_OFFERS_PER_PLAYER_MISSING');
  if(snapshotHealth.gamesWithInjuryChecks<2)
   readinessBlockers.push('PREGAME_INJURY_CHECKS_MISSING');
  const aiMatchupReviews=games.filter(g=>g.aiReviewStatus==='REVIEWED'&&g.aiReviewSummary)
   .map(g=>({gameId:g.gameId,homeTeam:g.homeTeam,awayTeam:g.awayTeam,
    checkedAt:g.aiReviewCheckedAt,summary:g.aiReviewSummary,advisoryOnly:true}));
  // Model projections are useful research even without a verified bookmaker
  // offer. Never mix them into publishable sportsbook legs.
  const research=games.flatMap(g=>(g.playerProjections||[])
   .filter(p=>['points','rebounds','assists','threes','pra'].includes(p.category)&&
    Number.isFinite(Number(p.projection))&&Number(p.projection)>=0&&
    !/\b(OUT|INACTIVE|IR|INJURED RESERVE|DOUBTFUL|QUESTIONABLE|SUSPENDED)\b/i.test(String([p.injuryStatus,p.availability].filter(Boolean).join(' '))))
   .map(p=>({gameId:g.gameId,playerId:p.playerId||null,
    name:p.name||p.playerName||null,team:p.team||null,category:p.category,
    projection:Number(p.projection),baseProjection:Number(p.baseProjection)||null,matchupAdjustment:p.matchupAdjustment||null,defenseVsPosition:p.defenseVsPosition||null,sampleGames:p.sampleGames||0,
    sampleSource:p.sampleSource||null,historicalSeason:p.historicalSeason||null,starterVerified:p.starterVerified===true,
    snapshotModelVersion:g.snapshotModelVersion,snapshotCheckedAt:g.snapshotCheckedAt,
    snapshotCurrentVersion:g.snapshotModelVersion==='v15-preserve-newest-ten-player-history',
    starterEvidenceStatus:p.starterVerified===true?'CONFIRMED':'UNCONFIRMED',
    historyGamesAvailable:Array.isArray(p.historicalValues)?p.historicalValues.length:0,
    matchupLiftPercent:Number(p.baseProjection)>0?
     Math.round((Number(p.projection)/Number(p.baseProjection)-1)*1000)/10:null,
    marketVerified:false,modelOnly:true,
    basis:p.basis||'Historical box-score projection, not a sportsbook line'})))
   .filter(p=>p.name&&Number(p.baseProjection)>=2&&Number(p.sampleGames)>=3).map(p=>({...p,sampleAdequacy:Number(p.sampleGames)>=10?'TEN_PLUS_GAMES':'LIMITED_SAMPLE_RESEARCH_ONLY'})).sort((a,b)=>{
    const lift=p=>Number(p.baseProjection)>0?(p.projection/Number(p.baseProjection)-1):-Infinity;
    const current=p=>p.sampleSource==='CURRENT_SEASON'?1:0;
    return current(b)-current(a)||lift(b)-lift(a)||b.sampleGames-a.sampleGames;
   }).slice(0,500);
  return res.status(200).json({ok:true,...result,date,checkedAt:new Date().toISOString(),
   gamesInspected:games.length,snapshotHealth,readinessBlockers,aiMatchupReviews,research,disclaimer:'Only confirmed starters with two fresh, independently sourced active sportsbook lines qualify. No offers are invented; missing sportsbook data blocks selections.'});
 }catch(e){
  console.error('nba_edge_screening_failed',String(e?.message||e).slice(0,160));
  return res.status(200).json({ok:true,status:'NO_QUALIFYING_PARLAY',legs:[],
   qualifyingGames:[],gamesInspected:0,date,
   sourceStatus:'SOURCE_UNAVAILABLE',reason:'GAME_SCREENING_SOURCE_UNAVAILABLE',
   note:'The current NBA screening feed could not be verified; no sportsbook picks have been generated.'});
 }
}
