// Day-ahead role evidence for *model-only* SGP selection, never sportsbook
// player availability, official starter or actual game-day inactive status.
// The model may use proven current-season offensive usage for non-QB players
// only after it cross-checks the selected ESPN game, roster ID and injuries.
import {nflCanonTeam} from './nfl-official-injury-feed.js';
import {nflLegMatchesGameRoster} from './ai-mechanics/nfl-sgp-tiers.js';
const canon=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const bad=/\b(OUT|INACTIVE|IR|PUP|NFI|SUSPENDED|DOUBTFUL|QUESTIONABLE|UNKNOWN|REPORTED_OTHER)\b/;
export function nflDayAheadRoleEvidence({gameId,home,away,eligibility,gate,statBoards}={}){
 const out=new Map(gate?.roles instanceof Map?gate.roles:[]),
  counters={sampled:0,eligibleByExistingRole:0,projectedHighUsageRoles:0,
   missingSeasonUsage:0,missingRosterOrGameIdentity:0,blockedInjuryOrQuestionable:0,
   unconfirmedQuarterback:0,missingCurrentGameRole:0};
 // The pregame roster and official/ESPN report availability remain HARD gates.
 if(!gameId||!eligibility?.checked||!gate?.checked)
  return{roles:out,counters,source:'NOT_READY',reason:'Game roster, injury report or game role endpoint was not verified'};
 const items=Object.values(statBoards||{}).flat().filter(x=>x&&typeof x==='object');
 const seen=new Set();
 for(const x of items){
  const id=String(x.playerID||x.playerId||''),name=canon(x.name),team=nflCanonTeam(x.team),
   p=String(x.position||'').toUpperCase(),key=id+'|'+team;
  if(!id||!name||!['QB','RB','WR','TE'].includes(p)||seen.has(key))continue;
  seen.add(key);counters.sampled++;
  if(!nflLegMatchesGameRoster(x,{gameId,home,away,
   rosterChecked:eligibility.checked,rosterById:eligibility.rosterById,
   rosterByName:eligibility.rosterByName,normalizeName:canon})){
   counters.missingRosterOrGameIdentity++;continue;
  }
  const role=out.get(id)||out.get('name:'+name);
  if(!role||canon(role.name)!==name||nflCanonTeam(role.team)!==team){
   counters.missingCurrentGameRole++;continue;
  }
  if(eligibility.blockedIds?.has(id)||eligibility.blockedNames?.has(name)||
   bad.test(String(role.availability||role.starterStatus||role.status||'').toUpperCase())){
   counters.blockedInjuryOrQuestionable++;continue;
  }
  if(role.recommendationEligible===true){
   counters.eligibleByExistingRole++;continue;
  }
  // A provisional role is not an official confirmed starter. For QBs we
  // preserve the stricter verified-QB1 requirement: no season-average-only QB.
  if(p==='QB'){counters.unconfirmedQuarterback++;continue}
  const games=Number(x.gamesPlayed)||0,u=x.usagePerGame||{},
   rush=Number(u.rushYards)||0,rec=Number(u.recYards)||0,
   targets=Number(u.targets)||0,receptions=Number(u.receptions)||0;
  const substantial=games>=2&&(
   p==='RB'&&(rush>=25||rec>=20||targets>=3)||
   ['WR','TE'].includes(p)&&(rec>=20||targets>=3||receptions>=2.5)
  );
  if(!substantial){counters.missingSeasonUsage++;continue}
  // Existing ESPN *current game* player identity and season usage prove
  // a projected offensive role, NOT a starter nor an active book prop.
  const approved={...role,recommendationEligible:true,
   starterVerified:false,starterStatus:'PROJECTED_HIGH_USAGE_ROLE',
   gameModelOnly:true,confirmedStarter:false,
   roleConfidence:'CONDITIONAL_DAY_AHEAD',
   roleSource:'ESPN current-season completed games + verified game roster + reported injury status',
   verification:{...role.verification,role:{
    verified:false,status:'PROJECTED_HIGH_USAGE_ROLE',
    source:'ESPN completed-game usage + current game roster',
    officialStarter:false
   }}};
  out.set(id,approved);
  out.set('name:'+name,approved);
  counters.projectedHighUsageRoles++;
 }
 return{roles:out,counters,source:'ESPN_SAME_SEASON_USAGE_CONDITIONAL',
  reason:'Non-QB role projections conditional on current game roster and injury report; game-day starter and sportsbook line not verified'};
}
