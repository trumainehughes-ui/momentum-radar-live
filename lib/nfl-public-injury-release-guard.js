// Read-only injury reconciliation used by the release audit. It cannot
// update or approve player props, bookmaker lines, or parlay prices.
import {nflInjuryRecommendationHold} from './nfl-injury-evidence.js';

const team=x=>String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const name=x=>String(x||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const validTime=(v,now,maxAge)=>{const n=Date.parse(v||'');return Number.isFinite(n)&&n>0&&n<=now+60_000&&now-n<=maxAge};
const ttl=15*60*1000;

export function nflPublicInjuryReadiness(game,published,report,{now=Date.now()}={}){
 const blockers=[],issues=[];
 const scheduled=new Set((game?.teams||[]).map(team).filter(Boolean));
 const reportTeams=(report?.teams||[]).map(x=>team(x.abbr||x.team||x));
 const expectedYear=Number(String(game?.date||'').slice(0,4));
 const expectedWeek=Number(game?.week);
 if(scheduled.size!==2||reportTeams.length!==2||
    !reportTeams.every(x=>scheduled.has(x)))
  blockers.push('INJURY_REPORT_GAME_TEAM_MISMATCH');
 if(String(report?.gameId)!==String(game?.gameId))
  blockers.push('INJURY_REPORT_GAME_ID_MISMATCH');
 if(report?.ok!==true||report?.reportAvailable!==true)
  blockers.push('INJURY_REPORT_UNAVAILABLE');
 if(report?.weeklyCoverage!==true||
    report?.reportCompleteness!=='NFL_PUBLISHED_WEEKLY_CROSS_CHECK')
  blockers.push('NFL_WEEKLY_REPORT_NOT_VERIFIED');
 if(!validTime(report?.checkedAt,now,ttl)||
    !validTime(report?.officialSourceCheckedAt,now,ttl))
  blockers.push('INJURY_CHECK_NOT_CURRENT');
 if(!Number.isInteger(expectedWeek)||expectedWeek<1||
    Number(report?.officialSourceWeek)!==expectedWeek||
    Number(report?.officialSourceYear)!==expectedYear)
  blockers.push('NFL_WEEK_OR_SEASON_MISMATCH');
 const officialUrl=String(report?.weeklySourceUrl||'');
 if(!/^https:\/\/www\.nfl\.com\/injuries\/league\/\d{4}\/(?:reg|post)\d{1,2}\/?$/i.test(officialUrl))
  blockers.push('OFFICIAL_WEEKLY_SOURCE_URL_UNVERIFIED');
 const kickoff=Date.parse(game?.kickoff||report?.kickoff||'');
 const isPregame=Number.isFinite(kickoff)&&kickoff>now&&kickoff-now<=90*60*1000;
 // A current weekly designation and ESPN roster flag do NOT constitute
 // the independently published final inactive list.
 if(isPregame&&report?.officialInactivesVerified!==true)
  blockers.push('FINAL_GAME_DAY_INACTIVES_UNVERIFIED');
 if(isPregame&&published?.inactivesVerified!==true)
  blockers.push('PUBLISHED_GAME_DAY_INACTIVES_UNVERIFIED');
 const conflicts=Array.isArray(report?.discrepancies)?report.discrepancies:[];
 if(conflicts.some(x=>String(x).startsWith('ESPN_DISAGREES_WITH_OFFICIAL:')))
  issues.push('ESPN_NFL_DESIGNATION_CONFLICT');
 const injured=[
  ...(Array.isArray(report?.injuries)?report.injuries:[]),
  // Official team IR transactions can be omitted by ESPN injury reports.
  ...(Array.isArray(report?.officialTransactionHolds)?report.officialTransactionHolds:[])
 ].filter(x=>scheduled.has(team(x.team))&&nflInjuryRecommendationHold(x));
 const categories=published?.categories||{};
 const publicPlayers=['td','passing','rushing','receiving','receptions']
  .flatMap(cat=>Array.isArray(categories[cat])?categories[cat]:[])
  .filter(x=>scheduled.has(team(x.team)));
 // Recheck saved starter designations against current event-scoped ESPN
 // starter flags. Historical depth-chart spots and an 'ACTIVE' roster status
 // cannot carry a player into a new game's betting model.
 const starterFlags=Array.isArray(report?.verifiedGameStarterFlags)?
  report.verifiedGameStarterFlags.filter(x=>x.starterVerified===true&&scheduled.has(team(x.team))):[];
 const currentStarterByName=new Set(starterFlags.filter(x=>name(x.name))
  .map(x=>team(x.team)+'|'+name(x.name)));
 if(report?.gameStarterEvidence?.checked!==true||
    report?.gameStarterEvidence?.teamsChecked!==2||
    report?.gameStarterEvidence?.startersConfirmed!==true)
  blockers.push('CURRENT_GAME_STARTERS_NOT_CONFIRMED');
 const unverifiablePublishedStarters=publicPlayers.filter(p=>p.starterVerified===true&&
  !currentStarterByName.has(team(p.team)+'|'+name(p.name)));
 if(unverifiablePublishedStarters.length)
  blockers.push('PUBLISHED_STARTER_NOT_IN_LIVE_GAME_ROSTER');
 const activeParlayLegs=(Array.isArray(published?.verifiedBookParlays)?published.verifiedBookParlays:[])
  .flatMap(x=>Array.isArray(x.legs)?x.legs:[]);
 if(activeParlayLegs.some(x=>!currentStarterByName.has(team(x.team)+'|'+name(x.player||x.name))))
  blockers.push('SGP_LEG_NOT_IN_VERIFIED_STARTERS');
 const affected=[];
 for(const entry of injured){
  const match=publicPlayers.find(p=>team(p.team)===team(entry.team)&&(
   entry.playerId&&p.playerId&&String(entry.playerId)===String(p.playerId)||
   entry.playerId&&p.playerID&&String(entry.playerId)===String(p.playerID)||
   name(entry.name)!==''&&name(entry.name)===name(p.name)));
  if(match)affected.push({name:String(entry.name).slice(0,80),
    team:team(entry.team),status:String(entry.status||'UNKNOWN'),
    evidenceTier:String(entry.evidenceTier||'UNSPECIFIED')});
 }
 if(affected.length)blockers.push('INJURED_PLAYER_PRESENT_IN_PUBLIC_PROJECTIONS');
 // Snapshot freshness remains a separate gate: a newly read injury report
 // must never relabel an older forecast as updated.
 if(published?.status!=='CURRENT'||!validTime(published?.injuryCheckedAt,now,ttl))
  blockers.push('PUBLISHED_INJURY_SCREEN_NOT_CURRENT');
 return {ok:blockers.length===0,blockers:[...new Set(blockers)],
  issues:[...new Set(issues)],heldPlayerCount:injured.length,
  currentGameStarterFlags:starterFlags.length,
  unverifiablePublishedStarters:unverifiablePublishedStarters.map(x=>({name:x.name,team:x.team})).slice(0,30),
  publishedHeldPlayers:affected,weeklyCoverage:report?.weeklyCoverage===true,
  officialSourceCheckedAt:report?.officialSourceCheckedAt||null,
  sourcePublishedAt:report?.weeklyPublishedAt||null,
  checkedAt:report?.checkedAt||null,
  officialInactivesVerified:report?.officialInactivesVerified===true,
  note:'Source checkedAt is retrieval time, not proof the NFL published a new injury designation.'};
}
