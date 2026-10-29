import {evaluateSharpSlate} from './sharp-engine.js';
import {NFL_SGP_TIERS} from './nfl-sgp-tiers.js';
// Read-only advisory mechanics. All inputs are application-provided evidence,
// NOT authenticated sportsbook quotes or independently trusted player identities.
// These reports cannot change an SGP, odds, injury designation or model weights.
export const ADVISORY_MODES=Object.freeze([
 'guardian','nuke','opportunity','value','simulation','learning','sharp'
]);
const VALID_CATS=new Set(['passing','rushing','receiving','receptions','td']);
const YARDS=new Set(['passing','rushing','receiving']);
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const finite=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const list=(a,limit=40)=>Array.isArray(a)?a.slice(0,limit):[];
const recent=(time,now,minutes=15)=>{
 const t=Date.parse(String(time||''));return Number.isFinite(t)&&t<=now&&t>=now-minutes*60000;
};
const issue=(code,detail,severity='review')=>({code,detail,severity});
const props=data=>Object.entries(data?.categories||{}).flatMap(([cat,rows])=>
 list(rows,12).filter(x=>VALID_CATS.has(cat)).map(x=>({...x,category:cat})));
const modelSgps=data=>list(data?.sgps,18).filter(x=>x.source==='Analytics');
const injured=data=>list(data?.playerAvailability?.skillPositionAlerts,20);
const checks=data=>list(data?.playerAvailability?.playerChecks,30);
const matched=(data,x)=>{
 const relevant=checks(data).filter(c=>norm(c.name)===norm(x.name));
 const check=relevant.find(c=>['TEAM_MISMATCH','NOT_CONFIRMED_IN_ROSTER_SNAPSHOT'].includes(c.status)||c.rosterTeam&&norm(c.rosterTeam)!==norm(x.team))||relevant[0];
 const allowed=new Set([norm(data?.game?.homeAbbr),norm(data?.game?.awayAbbr)].filter(Boolean));
 if(!allowed.size||!allowed.has(norm(x.team)))return false;
 if(check){
  if(['TEAM_MISMATCH','NOT_CONFIRMED_IN_ROSTER_SNAPSHOT'].includes(check.status))return false;
  if(check.rosterTeam&&norm(check.rosterTeam)!==norm(x.team))return false;
  if(['OUT','IR','DOUBTFUL','INACTIVE','QUESTIONABLE'].includes(String(check.injuryStatus||'').toUpperCase()))return false;
 }
 if(injured(data).some(i=>norm(i.name)===norm(x.name)&&['OUT','IR','DOUBTFUL','INACTIVE','QUESTIONABLE'].includes(String(i.status||'').toUpperCase())))return false;
 // No check is *not* verified; only prevents false certainty.
 return true;
};
const base=(mode,notes,flags,items=[])=>({
 mode,evidenceScope:'application-supplied, not independently authenticated',
 status:flags.some(f=>f.severity==='blocked')?'REVIEW_REQUIRED':items.length?'ADVISORY_READY':'INSUFFICIENT_EVIDENCE',
 canChangePicks:false,canSetOdds:false,canModifyModel:false,
 notes:notes.slice(0,8),flags:flags.slice(0,14),items:items.slice(0,12)
});
function guardian(data){
 const flags=[],notes=[],items=[];
 if(!data?.gameId)flags.push(issue('GAME_ID_MISSING','No selected ESPN game identity is available.','blocked'));
 if(data?.model?.stale||data?.model?.degraded)flags.push(issue('MODEL_DEGRADED','Data is stale or degraded; verify freshness before using recommendations.'));
 if(data?.model?.validation?.injuryEligibilityChecked!==true)flags.push(issue('INJURY_CHECK_PENDING','Injury eligibility has not been verified in the supplied evidence.'));
 const allowed=new Set([norm(data?.game?.homeAbbr),norm(data?.game?.awayAbbr)].filter(Boolean));
 const all=props(data);
 for(const x of all){
  if(!allowed.has(norm(x.team)))flags.push(issue('NON_GAME_PLAYER',x.name+' is assigned to '+x.team+' instead of the selected matchup.','blocked'));
  const bad=checks(data).find(c=>norm(c.name)===norm(x.name)&&(['TEAM_MISMATCH','NOT_CONFIRMED_IN_ROSTER_SNAPSHOT'].includes(c.status)||c.rosterTeam&&norm(c.rosterTeam)!==norm(x.team)));
  if(bad)flags.push(issue('ROSTER_CONFLICT',x.name+': '+bad.status,'blocked'));
  if(YARDS.has(x.category)&&finite(x.projection)===null)flags.push(issue('MISSING_PROJECTION',x.name+' lacks a numeric '+x.category+' projection.'));
 }
 for(const s of modelSgps(data))for(const leg of list(s.legs,10)){
  if(!matched(data,leg))flags.push(issue('PARLAY_IDENTITY',s.risk+': '+leg.name+' has a team/injury/roster conflict.','blocked'));
  const id=String(leg.eventID||'');
  if(id&&id!==String(data.gameId))flags.push(issue('WRONG_GAME',leg.name+' is from another ESPN game.','blocked'));
 }
 if(!flags.length)notes.push('No conflicts were detected within the supplied subset; absence of flags is NOT independent roster or injury clearance.');
 else notes.push('Keep flagged legs on review hold; the current application roster/injury validation remains authoritative.');
 if(!data?.playerAvailability)notes.push('Current-game roster cross-check was not provided; no verified clearance is possible.');
 items.push({label:'Review candidates',count:all.length,source:'model subset'});
 return base('guardian',notes,flags,items);
}
function nuke(data){
 const flags=[],notes=[],items=[];
 const rows=modelSgps(data).filter(x=>x.risk==='Nuke');
 if(!rows.length)flags.push(issue('NO_NUKE_MODEL','No Nuke model selection was provided.'));
 for(const row of rows){
  const legs=list(row.legs),cats=legs.map(x=>String(x.category||'').toLowerCase()),
    yards=legs.filter(x=>YARDS.has(String(x.category||'').toLowerCase())),
    types=new Set(yards.map(x=>x.category));
  const problems=[];
  if(legs.length<NFL_SGP_TIERS.Nuke.minLegs||legs.length>NFL_SGP_TIERS.Nuke.maxLegs)problems.push('leg count outside configured Nuke limits');
  if(yards.length<3||types.size<2)problems.push('requires 3+ yards legs in 2+ yardage categories');
  if(cats.filter(x=>x==='td').length>NFL_SGP_TIERS.Nuke.maxTdLegs)problems.push('too many anytime touchdowns');
  const markets=new Set(legs.map(x=>norm(x.playerId||x.playerID||x.name)+'|'+String(x.category||'').toLowerCase()));
  if(markets.size!==legs.length)problems.push('duplicate player market');
  const counts=new Map();
  for(const leg of legs){const id=norm(leg.playerId||leg.playerID||leg.name);counts.set(id,(counts.get(id)||0)+1)}
  if([...counts.values()].some(count=>count>2))problems.push('more than two markets for one player');
  for(const l of legs){
   if(!matched(data,l))problems.push(l.name+' is not cleared by supplied game roster/availability');
   if(YARDS.has(l.category)){
    const mid=finite(l.projection),alt=finite(l.modelThreshold);
    if(mid===null||alt===null||alt<=mid)problems.push(l.name+' has no demonstrated above-projection target');
    if(alt!==null&&alt%5!==0)problems.push(l.name+' yardage is not in increments of five');
   }
  }
  if(problems.length)flags.push(issue('NUKE_GUARD_HOLD',problems.join('; '),'blocked'));
  items.push({label:'Nuke '+(row.book||'model'),legs:legs.length,yardageLegs:yards.length,
    yardageTypes:[...types],sportsbookPriceVerified:false,reviewStatus:problems.length?'HOLD':'MODEL_COMPOSITION_ONLY'});
 }
 notes.push('Groq may suggest which existing verified model legs to review, but the SGP builder alone chooses thresholds and eligible players.');
 notes.push('Nuke targets +10000 or higher ($1,000+ NET profit on $10). No correlated book quote is established by independent props.');
 if(!rows.some(r=>list(r.legs).length))notes.push('Wait for five verified, elevated, mixed yardage selections rather than inventing a Nuke.');
 return base('nuke',notes,flags,items);
}
function opportunity(data){
 const alerts=injured(data),flags=[],notes=[],items=[],p=props(data);
 if(!alerts.length)flags.push(issue('NO_REPORTED_SKILL_INJURIES','No named, source-labeled skill-position injury alerts are supplied.'));
 for(const injuredPlayer of alerts){
  const peers=p.filter(x=>norm(x.team)===norm(injuredPlayer.team)&&norm(x.name)!==norm(injuredPlayer.name)&&matched(data,x))
   .sort((a,b)=>(finite(b.modelScore)||0)-(finite(a.modelScore)||0)).slice(0,3);
  items.push({name:injuredPlayer.name,team:injuredPlayer.team,reportedStatus:injuredPlayer.status,
   source:injuredPlayer.source||'unverified feed',possibleAlternates:peers.map(x=>({
     name:x.name,position:x.position,stat:x.category,modelProjection:finite(x.projection)
   })),nextStep:'Check verified role, updated snaps/targets/carries and game-day status before re-running the projection model'});
 }
 notes.push('Opportunity changes are qualitative and conditional; do not automatically transfer injured-player yardage or estimate new percentages.');
 notes.push('ESPN-reported injury designations are not necessarily confirmed official inactives.');
 return base('opportunity',notes,flags,items);
}
function value(data,now){
 const flags=[],notes=[],items=[];
 const verified=data?.model?.validation?.sportsbookVerificationAvailable===true;
 const stamp=data?.model?.fetchedAt;
 if(!verified)flags.push(issue('MARKETS_UNVERIFIED','Live DraftKings/FanDuel markets are not confirmed for this game.'));
 if(!recent(stamp,now,15))flags.push(issue('MARKETS_NOT_FRESH','A source-verified sportsbook snapshot within 15 minutes is not supplied.'));
 if(verified&&recent(stamp,now,15))for(const x of props(data)){
  if(!matched(data,x)||!['DraftKings','FanDuel'].includes(x.book))continue;
  const projection=finite(x.projection),line=finite(x.marketLine),odds=finite(x.bookOdds);
  if(projection===null||line===null||odds===null||!YARDS.has(x.category))continue;
  items.push({name:x.name,category:x.category,book:x.book,line,projection,
   difference:Number((projection-line).toFixed(1)),americanOdds:odds,sourceTimestamp:stamp,
   source:'application-reported market; recheck directly with bookmaker'});
 }
 if(!items.length)notes.push('No fresh, independently corroborated book lines are available. No positive-value picks or implied probabilities are claimed.');
 notes.push('Projection-minus-line is a descriptive gap, not expected betting value; value also requires calibrated probabilities and vig-aware prices.');
 return base('value',notes,flags,items);
}
function simulation(data){
 const notes=[],flags=[],items=[];
 const sides=list(data?.matchup?.sides,2);
 if(!sides.length)flags.push(issue('NO_MATCHUP_SPLITS','Defense-vs-position and offensive sample evidence is unavailable.'));
 for(const side of sides){
  const qb=list(side.positions).find(x=>x.position==='QB');
  const rb=list(side.positions).find(x=>x.position==='RB');
  items.push({offense:side.offense,defense:side.opponentDefense,
   offenseSampleGames:finite(side.offenseSampleGames),defenseSampleGames:finite(side.defenseSampleGames),
   questions:['If trailing, review passing volume and QB/WR usage','If leading, review RB rushing volume'],
   quarterbackMetrics:list(qb?.metrics,3).map(x=>({metric:x.metric,allowedPerGame:finite(x.defenseAllowedPerGame)})),
   rbMetrics:list(rb?.metrics,3).map(x=>({metric:x.metric,allowedPerGame:finite(x.defenseAllowedPerGame)}))});
  if(!side.defenseSampleGames||side.defenseSampleGames<5)flags.push(issue('SMALL_SAMPLE',side.opponentDefense+' has fewer than five completed defensive games.'));
 }
 notes.push('These are conditional scenarios only. No game outcome odds, attempt-share changes, snap splits or numeric player adjustments are inferred.');
 return base('simulation',notes,flags,items);
}
function learning(data){
 const flags=[],notes=[],items=[];
 const results=data?.results;
 if(!results?.final){flags.push(issue('NO_FINAL_LOCKED_RESULTS','A final game with graded pregame locked selections is needed.'));return base('learning',notes,flags,items)}
 const graded=list(results.picks,25).filter(x=>['HIT','MISS'].includes(x?.grade?.status));
 for(const p of graded){
  const actual=finite(p?.grade?.actual),forecast=finite(p?.grade?.projectionAtLock);
  if(actual===null||forecast===null)continue;
  items.push({name:p.name,category:p.category||p.cat,projectionAtLock:forecast,actual,
   signedError:Number((actual-forecast).toFixed(1)),grade:p.grade.status});
 }
 if(!items.length)flags.push(issue('NO_GRADED_PROJECTIONS','Final scores exist but there are no locked model-projection pairs to learn from.'));
 notes.push('Summarize signed projection errors by player/category and propose future backtests; do not change production weights from one game.');
 notes.push('Only pregame locked projections and completed results count; never evaluate against hindsight-edited predictions.');
 return base('learning',notes,flags,items);
}
export function generateAdvisory(mode,data,{now=Date.now()}={}){
 if(!ADVISORY_MODES.includes(mode))return null;
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 switch(mode){
  case 'guardian':return guardian(data);
  case 'nuke':return nuke(data);
  case 'opportunity':return opportunity(data);
  case 'value':return value(data,now);
  case 'simulation':return simulation(data);
  case 'learning':return learning(data);
  // Client-supplied values can NEVER authorize +EV: this public-facing mode
  // is always a fail-closed, advisory-only audit. Internal collectors may run
  // evaluateSharpSlate with their separately verified trusted evidence.
  case 'sharp':return {...evaluateSharpSlate(data,{now,trustedServerEvidence:false}),mode:'sharp'};
 }
 return null;
}
