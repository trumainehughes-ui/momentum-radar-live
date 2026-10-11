// Day-before, MODEL-ONLY offensive role projection from current ESPN roster,
// injury screening and observed 2026 games. Never infer an official starter.
import {nflCanonTeam} from './nfl-official-injury-feed.js';
import {nflLegMatchesGameRoster} from './ai-mechanics/nfl-sgp-tiers.js';
import {nflProjectedDepthChartQbEligible} from './nfl-depthchart-qb1.js';
const canon=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const bad=/\b(OUT|INACTIVE|IR|PUP|NFI|SUSPENDED|DOUBTFUL|QUESTIONABLE|UNKNOWN|REPORTED_OTHER)\b/;
export function nflDayAheadRoleEvidence({gameId,home,away,eligibility,gate,statBoards,depthChartQbs=[]}={}){
 const out=new Map(gate?.roles instanceof Map?gate.roles:[]);
 const counters={sampled:0,excludedOtherMatchups:0,eligibleByExistingRole:0,
  projectedHighUsageRoles:0,projectedDepthChartQb1:0,missingSeasonUsage:0,
  missingRosterOrGameIdentity:0,blockedInjuryOrQuestionable:0,
  unconfirmedQuarterback:0,missingCurrentGameRole:0,roleRebuiltFromRoster:0};
 if(!gameId||!eligibility?.checked||!gate?.checked)
  return{roles:out,counters,source:'NOT_READY',
   reason:'Current game roster, injury feed or game role evidence unavailable'};
 const participants=new Set([nflCanonTeam(home),nflCanonTeam(away)]);
 const qbById=new Map((depthChartQbs||[]).map(x=>[String(x.playerId),x]));
 const seen=new Set();
 for(const x of Object.values(statBoards||{}).flat()){
  if(!x||typeof x!=='object')continue;
  const id=String(x.playerID||x.playerId||''),name=canon(x.name),
   team=nflCanonTeam(x.team),position=String(x.position||'').toUpperCase(),
   key=id+'|'+team;
  if(!id||!name||!['QB','RB','WR','TE'].includes(position)||seen.has(key))continue;
  seen.add(key);
  // A league-wide statistics table can contain 155 players. 145 players from
  // other games are NOT identity errors for the selected matchup.
  if(!participants.has(team)){counters.excludedOtherMatchups++;continue;}
  counters.sampled++;
  if(!nflLegMatchesGameRoster(x,{gameId,home,away,
   rosterChecked:eligibility.checked,rosterById:eligibility.rosterById,
   rosterByName:eligibility.rosterByName,normalizeName:canon})){
   counters.missingRosterOrGameIdentity++;continue;
  }
  if(eligibility.blockedIds?.has(id)||eligibility.blockedNames?.has(name)){
   counters.blockedInjuryOrQuestionable++;continue;
  }
  const existing=out.get(id)||out.get('name:'+name);
  if(existing&&(canon(existing.name)!==name||nflCanonTeam(existing.team)!==team)){
   counters.missingCurrentGameRole++;continue;
  }
  if(existing&&bad.test(String(existing.availability||existing.starterStatus||
   existing.status||'').toUpperCase())){
   counters.blockedInjuryOrQuestionable++;continue;
  }
  const games=Number(x.gamesPlayed)||0,u=x.usagePerGame||{},
   rush=Number(u.rushYards)||0,rec=Number(u.recYards)||0,
   targets=Number(u.targets)||0,receptions=Number(u.receptions)||0;
  const base=existing||{
   playerId:id,name:x.name,team,position,
   availability:'UNREPORTED',starterVerified:false,
   starterStatus:'ROLE_UNKNOWN',recommendationEligible:false,
   verification:{availability:{verified:eligibility.injuryChecked===true}}};
  // Do not let a past-game or merely high-usage QB count as a confirmed QB1.
  // A live verified ESPN QB starter retains its existing role separately.
  if(position==='QB'){
   const status=String(existing?.starterStatus||'');
   const trulyConfirmed=existing?.recommendationEligible===true&&
    existing?.starterVerified===true&&existing?.verification?.role?.verified===true&&
    ['CONFIRMED_STARTER','EXPECTED_STARTER'].includes(status);
   if(trulyConfirmed){counters.eligibleByExistingRole++;continue;}
   const depth=qbById.get(id);
   if(!depth||nflCanonTeam(depth.team)!==team||depth.rank!==1||
      games<2||Number(x.perGame)<100){
    counters.unconfirmedQuarterback++;continue;
   }
   const approved={...base,playerId:id,name:x.name,team,position:'QB',
    recommendationEligible:true,starterVerified:false,
    starterStatus:'PROJECTED_DEPTHCHART_QB1',confirmedStarter:false,
    gameModelOnly:true,qbDepthChartRank:1,qbRosterVerified:true,
    roleConfidence:'CONDITIONAL_DAY_AHEAD',
    roleSource:depth.source,
    verification:{...base.verification,
     role:{verified:false,status:'PROJECTED_DEPTHCHART_QB1',
      source:depth.source,officialStarter:false}}};
   if(!nflProjectedDepthChartQbEligible(approved)){
    counters.unconfirmedQuarterback++;continue;
   }
   out.set(id,approved);out.set('name:'+name,approved);
   counters.projectedDepthChartQb1++;continue;
  }
  if(existing?.recommendationEligible===true){
   counters.eligibleByExistingRole++;continue;
  }
  const substantial=games>=2&&(
   position==='RB'&&(rush>=25||rec>=20||targets>=3)||
   ['WR','TE'].includes(position)&&(rec>=20||targets>=3||receptions>=2.5));
  if(!substantial){counters.missingSeasonUsage++;continue}
  const approved={...base,playerId:id,name:x.name,team,position,
   recommendationEligible:true,starterVerified:false,
   starterStatus:'PROJECTED_HIGH_USAGE_ROLE',gameModelOnly:true,
   confirmedStarter:false,roleConfidence:'CONDITIONAL_DAY_AHEAD',
   roleSource:'ESPN 2026 completed-game usage and same-game current roster',
   verification:{...base.verification,role:{
    verified:false,status:'PROJECTED_HIGH_USAGE_ROLE',
    source:'ESPN completed-game usage + current game roster',
    officialStarter:false}}};
  out.set(id,approved);out.set('name:'+name,approved);
  if(!existing)counters.roleRebuiltFromRoster++;
  counters.projectedHighUsageRoles++;
 }
 return{roles:out,counters,source:'ESPN_GAME_SCOPED_USAGE_AND_DEPTHCHART',
  reason:'Current game roster + injury screening with conditional usage and depth-chart QB1 evidence; neither a confirmed starter nor a sportsbook prop offer'};
}
