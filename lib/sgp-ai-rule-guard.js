// Same SGP rules apply to EVERY deterministic and AI-assisted candidate.
// This reviewer cannot publish picks, verify sportsbook offers, or quote odds.
import {LEAGUE_SGP_LEG_BOUNDS,LEAGUE_SGP_TARGETS} from './sgp-tier-contract.js';
import {NFL_SGP_TIERS,assessNflSgpTier} from './ai-mechanics/nfl-sgp-tiers.js';

const NFL_CATS=new Set(['passing','rushing','receiving','receptions','td']);
const NBA_CATS=new Set(['points','rebounds','assists','threes','pra']);
const NFL_YARDS=new Set(['passing','rushing','receiving']);
const norm=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const cat=x=>String(x?.cat||x?.category||'').toLowerCase();
const number=x=>x===null||x===undefined||x===''?null:Number(x);
const line=x=>number(x?.analyticsThreshold??x?.threshold??x?.line);
const blocked=x=>/^(OUT|INACTIVE|IR|INJURED_RESERVE|SUSPENDED|DOUBTFUL|DNP)$/
 .test(String(x?.injuryStatus||x?.availabilityStatus||x?.status||'').trim().toUpperCase());

export function validateAiSgpRules({league,risk,gameId,legs=[],requiredLegs=null}={}){
 const fails=[],bounds=LEAGUE_SGP_LEG_BOUNDS[league]?.[risk];
 const add=x=>{if(!fails.includes(x))fails.push(x)};
 if(!bounds)return{valid:false,rules:['UNSUPPORTED_LEAGUE_OR_TIER'],
  league,risk,canPublish:false,canSetOdds:false};
 if(!Array.isArray(legs))legs=[];
 if(legs.length<bounds[0]||legs.length>bounds[1]||
  requiredLegs!==null&&requiredLegs!==legs.length)add('TIER_LEG_COUNT');
 const counts=new Map(),used=new Set(),categories=new Set();
 let touchdowns=0,yards=0;
 const yardCategories=new Set();
 for(const l of legs){
  const c=cat(l),id=String(l?.playerID||l?.playerId||'').trim(),
   team=norm(l?.team),name=norm(l?.name),event=String(l?.eventID||l?.gameId||'');
  if(!id||!team||!name||event!==String(gameId||'')||
   !/^\d{7,12}$/.test(event))add('PLAYER_TEAM_GAME_IDENTITY');
  if(blocked(l))add('INELIGIBLE_PLAYER_STATUS');
  if(l?.recommendationEligible===false||l?.starterVerified===false&&
    l?.starterStatus==='NOT_STARTING')add('NOT_ELIGIBLE_STARTER');
  if(!(league==='nfl'?NFL_CATS:NBA_CATS).has(c))add('UNSUPPORTED_STAT_CATEGORY');
  categories.add(c);
  if(c==='td')touchdowns++;
  if(NFL_YARDS.has(c)){yards++;yardCategories.add(c)}
  if(!id)continue;
  const identity=id+'|'+c;
  if(used.has(identity))add('DUPLICATE_PLAYER_STAT_CATEGORY');
  used.add(identity);
  counts.set(id,(counts.get(id)||0)+1);
  if(counts.get(id)>2)add('TOO_MANY_LEGS_SAME_PLAYER');
  if(c!=='td'){
   const n=line(l);
   if(n===null||!Number.isFinite(n)||n<=0||
    !Number.isInteger(n))add('INVALID_STAT_THRESHOLD');
   if(league==='nfl'&&NFL_YARDS.has(c)&&Number.isFinite(n)&&n%5!==0)
    add('NFL_YARDS_NOT_MULTIPLE_OF_FIVE');
   if(league==='nfl'&&c==='receptions'&&Number.isFinite(n)&&!Number.isInteger(n))
    add('RECEPTIONS_NOT_INTEGER');
  }
  if(league==='nfl'&&c==='passing'&&l?.position&&l.position!=='QB')
   add('PASSING_REQUIRES_QB_ROLE');
  if(risk==='Nuke'&&c!=='td'){
   const center=number(l?.predictiveProjection??l?.projection??l?.perGame);
   const threshold=line(l);
   if(center===null||!Number.isFinite(center)||center<=0||
    threshold===null||!Number.isFinite(threshold)||threshold<=center)
    add('NUKE_NOT_ABOVE_MODEL_PROJECTION');
   if(league==='nfl'&&NFL_YARDS.has(c)&&center!==null&&
     Number.isFinite(center)&&threshold!==null&&Number.isFinite(threshold)){
    const minimum=c==='passing'?25:10;
    if(threshold<center+minimum)add('NUKE_YARDAGE_LIFT_TOO_LOW');
   }
  }
 }
 if(league==='nfl'){
  const tier=NFL_SGP_TIERS[risk];
  if(touchdowns>tier.maxTdLegs)add('TOO_MANY_ANYTIME_TOUCHDOWNS');
  if(categories.size<tier.minCategories)add('INSUFFICIENT_STAT_DIVERSITY');
  if(yards<tier.minYardageLegs||yardCategories.size<tier.minYardageMarkets)
   add('INSUFFICIENT_PASS_RUSH_RECEIVE_MIX');
  if(!assessNflSgpTier({risk,legs,requiredLegs:legs.length}).compositionOk)
   add('NFL_COMPOSITION_INVALID');
 }else{
  const minimum=risk==='Nuke'?3:2;
  if(categories.size<minimum)add('INSUFFICIENT_NBA_STAT_DIVERSITY');
 }
 return{valid:fails.length===0,rules:fails,league,risk,
  legCount:legs.length,allowedLegs:[...bounds],maxTdLegs:league==='nfl'?NFL_SGP_TIERS[risk].maxTdLegs:0,
  targetOdds:LEAGUE_SGP_TARGETS[risk],
  bookIssuedCombinedPriceRequired:true,
  // A valid MODEL composition alone never makes an SGP bookable.
  canPublish:false,canSetOdds:false,canPlaceWagers:false};
}
