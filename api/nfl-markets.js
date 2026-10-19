import { put, list } from '@vercel/blob';
import {NFL_SGP_SNAPSHOT_SCHEMA,nflSgpSnapshotKey,nflSgpVersionedSnapshotPath,nflSgpFindLatestBlob} from '../lib/nfl-sgp-snapshot-status.js';
import {nflBookOfferEligible} from '../lib/nfl-book-offer-provenance.js';
import {nflMeaningfulOpportunity} from '../lib/nfl-meaningful-opportunity.js';
import {publishedNflModelTier} from '../lib/nfl-public-model-sgp-serializer.js';
import { sportsbookCoverageAudit } from '../lib/sportsbook-source-policy.js';
import { NFL_SGP_TIERS, classifyNflSgpOdds, assessNflSgpTier, fillNflSgpMarketMix, guardFinalNflSgpCards, modelNflSgpStatThreshold, nflLegMatchesGameRoster, selectNflAdaptiveNuke, selectNflAdaptiveTier } from '../lib/ai-mechanics/nfl-sgp-tiers.js';
import {validNflDvpRank,capNflTierYardTarget,isNflConfirmedGameQb} from '../lib/ai-mechanics/nfl-projection-safety.js';
import {nflDayAheadRoleEvidence} from '../lib/nfl-day-ahead-roles.js';
import {summarizeNflNukeEvidence} from '../lib/nfl-nuke-evidence-diagnostics.js';
import {filterCompleteNflBookSgps} from '../lib/nfl-book-sgp-candidates.js';
import {evaluateNflBookQuoteReadiness} from '../lib/nfl-book-quote-readiness.js';
import {evaluateSportBookSgpLineup,sportResearchVerificationStatus} from '../lib/sport-sgp-verification-gate.js';
import {nflPublicMarketResponse} from '../lib/nfl-public-market-response.js';
import {nflPublicBookTrustedOrigin} from './nfl-public-book-research.js';
import {mergeAuthorizedPropLineRows,nflAuthorizedBookSgpRows} from '../lib/nfl-propline-authorized-merge.js';
import {shouldServeCachedNflMarkets,signedNflCollectorLock} from '../lib/nfl-market-response-cache.js';
import {chooseNflCheckpointQuotes} from '../lib/nfl-checkpoint-quote-selection.js';
import {nflProfessionalBilateralReview} from '../lib/nfl-professional-bilateral-review.js';
import {buildNflAnytimeTdCandidates} from '../lib/nfl-anytime-td-model.js';
import {estimateNflHitChance} from '../lib/nfl-model-hit-chance.js';
import {nflScheduledGameDvpIdentity} from '../lib/nfl-game-dvp-week-identity.js';
import {nflCurrentGameDepthChartQbs,nflProjectedDepthChartQbEligible} from '../lib/nfl-depthchart-qb1.js';
import {nflCurrentRosterAthletes} from '../lib/nfl-roster-evidence.js';
import {nflOfficialTransactionHolds,nflRosterReserveHold}
 from '../lib/nfl-official-transaction-holds.js';
import {nflGameInjuryEvidence,nflInjuryBlocks,nflInjuryRecommendationHold} from '../lib/nfl-injury-evidence.js';
import {nflWeeklyForGame} from '../lib/nfl-injury-weekly-loader.js';
import {nflCanonTeam} from '../lib/nfl-official-injury-feed.js';
import {NFL_MARKET_HOLDS,oddsMonthlyQuotaExhausted,sgoRateLimitHoldMs,shouldUseSgoBackup} from '../lib/nfl-provider-rate-guard.js';
const SGO='https://api.sportsgameodds.com/v2/events';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ODDS='https://api.the-odds-api.com/v4/sports/americanfootball_nfl';
const NS={};
const EDGE_GOOD='public, s-maxage=60, must-revalidate';
const EDGE_GAME='private, no-store';
const EDGE_BROWSER='public, max-age=0';
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Every outbound HTTP request, including internal API and blob reads, must have a deadline.
const timedFetch=(url,opts={})=>fetch(url,{...opts,signal:opts.signal||AbortSignal.timeout(8000)});
const CACHE=new Map(),TTL=15*60*1000,MARKET_SNAPSHOT_TTL=15*60*1000;
const LAST_CALL=new Map(),BACKOFF=new Map(),MIN_UPSTREAM_GAP=15*60*1000,RATE_BACKOFF=15*60*1000;
const RESPONSE_CACHE=new Map(),ANALYTICS_CACHE=new Map();const ANALYTICS_TTL=6*60*60*1000;let ODDS_QUOTA_BLOCKED_UNTIL=0,ODDS_QUOTA_DETAIL='';
const SNAP_PREFIX='momentum-nfl-markets/v2/';
// Share exact tier odds bands with the single official model policy.
// Small: +2000..+2999; Medium: +3000..+8000; Nuke: +10000 and above.
const SGP_ODDS_BANDS=Object.fromEntries(Object.entries(NFL_SGP_TIERS).map(
 ([risk,tier])=>[risk,{min:tier.minOdds,max:tier.maxOdds}]));
// Public sites are the sole odds authority; third-party odds APIs are disabled.
const DIRECT_PUBLIC_ODDS_ONLY=true;
// Mandatory website-first odds policy:
// 1) DraftKings and FanDuel public sportsbook pages supply exact, observed market lines/prices ONLY.
// 2) NFL.com / ESPN roles, injuries, team offense/defense and DVP drive independent projections.
// 3) Third-party odds API calls are disabled; unreadable/blocked pages never produce guessed offers.
// 4) A listed individual prop is not a verified correlated SGP quote.
// This contract is intentionally sport-portable so the future NBA module can use NBA.com / ESPN + public DK/FD the same way.
const MARKET_SOURCE_POLICY={projection:['NFL.com','ESPN','team offense vs defense','DVP','injuries/roles','DraftKings public stats/trends','FanDuel public stats/trends'],marketResearch:['DraftKings public markets','FanDuel public markets'],apiAssist:[],apiRequired:false,publicBookResearchRequired:true,publicBookEvidence:['lines','alternate lines','American odds','recent-game results','hit-rate/trend context','player matchup notes','TD markets','passing/rushing/receiving/receptions markets'],rule:'combine_all_public_evidence_projection_first_api_optional'};
function sgpOddsInBand(risk,odds){const value=Number(odds);return Number.isSafeInteger(value)&&classifyNflSgpOdds(value)===risk}
function sgpPayoutLabel(risk){return risk==='Small'?'$10 stake → $200–under $300 NET profit (target +2000 to +2999)':risk==='Medium'?'$10 stake → $300–$800 NET profit (target +3000 to +8000)':'$10 stake → $1,000+ NET profit (target +10000 or higher)'}
function manualAtlNoTonightSgps(date,home,away){
 const teams=new Set([norm(home),norm(away)]);if(date!=='2026-10-05'||!teams.has('ATL')||!(teams.has('NO')||teams.has('NOS')))return null;
 const src='ESPN + NFL.com • 2026 Weeks 1–3 • matchup model';
 const publicMarketSnapshot={checkedAt:'2026-10-05',sources:['DraftKings public','FanDuel public'],references:[
  {book:'DraftKings',player:'Bijan Robinson',market:'Rushing yards',line:'100+',odds:'+138'},
  {book:'DraftKings',player:'Bijan Robinson',market:'Anytime TD',line:'Anytime TD',odds:'-195'},
  {book:'DraftKings',player:'Chris Olave',market:'Anytime TD',line:'Anytime TD',odds:'+125'},
  {book:'DraftKings',player:'Juwan Johnson',market:'Anytime TD',line:'Anytime TD',odds:'+260'},
  {book:'FanDuel',player:'Chris Olave',market:'Receiving yards',line:'85.5',odds:'-113'},
  {book:'FanDuel',player:'Tyler Shough',market:'Rushing yards',line:'16.5',odds:'-113'},
  {book:'DraftKings',player:'Tyler Shough',market:'Passing yards',line:'260+',odds:'-117'},
  {book:'DraftKings',player:'Tyler Shough',market:'Passing yards',line:'250+',odds:'-151'},
  {book:'DraftKings',player:'Chris Olave',market:'Receiving yards',line:'90+',odds:'+109'},
  {book:'DraftKings',player:'Chris Olave',market:'Receiving yards',line:'100+',odds:'+156'},
  {book:'DraftKings',player:'Juwan Johnson',market:'Receiving yards',line:'50+',odds:'+127'},
  {book:'DraftKings',player:'Juwan Johnson',market:'Receptions',line:'4+',odds:'-159'},
  {book:'DraftKings',player:'Chris Olave',market:'Receptions',line:'7+',odds:'-147'},
  {book:'DraftKings',player:'Bijan Robinson',market:'Rushing yards',line:'90+',odds:'-105'},
  {book:'DraftKings',player:'Bijan Robinson',market:'Rushing yards',line:'80+',odds:'-157'},
  {book:'FanDuel',player:'Drake London',market:'Receiving yards',line:'79.5',odds:'-113'}
 ]};
 const leg=(name,team,position,cat,threshold,manualForm)=>({name,team,position,cat,analyticsThreshold:cat==='td'?'Anytime TD':threshold,projectionLabel:cat==='td'?'Anytime TD':String(threshold),displayLabel:cat==='td'?'Anytime TD':cat==='passTD'?'Passing TDs: '+threshold+'+':(cat==='passing'?'Passing yards':cat==='rushing'?'Rushing yards':cat==='receiving'?'Receiving yards':'Receptions')+': '+threshold,sportsbookVerified:false,manualOverride:true,manualForm,source:src});
 const small=[
  leg('Tyler Shough','NO','QB','passing',225,'917 pass yards / 3 games; 305.7 per game; ATL allows 263.0 pass yards/game'),
  leg('Chris Olave','NO','WR','receiving',70,'375 receiving yards / 3 games; 125.0 per game; 27 receptions'),
  leg('Juwan Johnson','NO','TE','receiving',35,'173 receiving yards / 3 games; 57.7 per game; 15 receptions'),
  leg('Bijan Robinson','ATL','RB','rushing',80,'349 rush yards / 3 games; 116.3 per game; 5.3 YPC; NO allows 128.7 rush yards/game')
 ];
 const medium=[
  leg('Tyler Shough','NO','QB','passing',250,'2026 passing: 410, 252, 255; NO No. 3 passing offense vs ATL No. 29 pass defense'),
  leg('Chris Olave','NO','WR','receiving',85,'2026 receiving: 182, 86, 107; 125.0 per game'),
  leg('Bijan Robinson','ATL','RB','rushing',100,'2026 rushing: 83, 72, 194; ATL No. 2 rushing offense vs NO No. 27 run defense'),
  leg('Juwan Johnson','NO','TE','receiving',45,'2026 receiving: 54, 66, 53; 57.7 per game'),
  leg('Bijan Robinson','ATL','RB','td',null,'2 rushing TD plus 1 receiving TD through three games; favorable run matchup')
 ];
 const nuke=[
  leg('Bijan Robinson','ATL','RB','rushing',125,'Ceiling threshold supported by 194-yard Week 3 and favorable NO run defense'),
  leg('Bijan Robinson','ATL','RB','td',null,'Primary ATL scoring/volume ceiling'),
  leg('Chris Olave','NO','WR','receiving',100,'Cleared 100 in 2 of 3 games; 125.0 receiving yards/game'),
  leg('Chris Olave','NO','WR','td',null,'27 catches / 375 yards through three games; high-volume passing environment'),
  leg('Juwan Johnson','NO','TE','receiving',60,'54, 66, 53 through three games; ceiling threshold just above current average'),
  leg('Juwan Johnson','NO','TE','td',null,'3 TD through three games'),
  leg('Tyler Shough','NO','QB','passing',300,'917 yards / 3 games; 305.7 average; ATL allows 263.0 passing yards/game')
 ];
 const make=(risk,legs,note)=>({book:'Model Projection',mode:'MANUAL_TONIGHT',risk,legs,estimatedOdds:null,actualSgpOdds:null,payoutTarget:sgpPayoutLabel(risk),targetOddsBand:SGP_ODDS_BANDS[risk],payoutBandVerified:false,manualOverride:true,sourcePolicy:MARKET_SOURCE_POLICY,publicMarketSnapshot,verifiedAt:new Date().toISOString(),requiredLegs:legs.length,verifiedLegs:0,marketMix:[...new Set(legs.map(x=>x.cat))],correlation:sgpCorrelation(legs),explanation:{summary:note+' These are Momentum Radar projection thresholds, not copied sportsbook lines. Current 2026 production is combined with team offense vs opponent defense, DVP context and injury availability.',legs:legs.map(x=>x.name+': '+x.manualForm),correlation:[]},reason:'Tonight-only ESPN/NFL.com data-model override while sportsbook APIs are unavailable. Rebuild on material injury/inactive/role news; expires after tonight.'});
 return[
  make('Small',small,'High-confidence matchup build with thresholds set below current player averages/ceilings.'),
  make('Medium',medium,'Stronger performance thresholds aligned to the same ATL-run / NO-pass matchup thesis.'),
  make('Nuke',nuke,'Ceiling build requiring the strongest versions of the two matchup advantages.')
 ];
}
// Enforce sportsbook provenance even for pre-deployment Blob cache hits.
// Do not mutate cached objects: multiple requests can share RESPONSE_CACHE.
function nflVerifiedOnlySgpResponse(body){
 if(!body||!body.sgps||body.scope!=='game')return body;
 const sgps={...body.sgps};
 for(const book of ['DraftKings','FanDuel']){
  sgps[book]=(Array.isArray(sgps[book])?sgps[book]:[]).filter(card=>
   card?.publishable===true&&card?.combinedBookQuoteVerified===true&&
   Number.isFinite(Number(card?.actualSgpOdds))&&
   sgpOddsInBand(card.risk,card.actualSgpOdds));
 }
 sgps.Analytics=(Array.isArray(sgps.Analytics)?sgps.Analytics:[]).filter(c=>
  c?.mode==='MODEL_ONLY'&&c?.publishable===false&&
  c?.combinedBookQuoteVerified===false&&
  ['Small','Medium','Nuke'].includes(c?.risk)&&
  Array.isArray(c.legs)&&c.legs.length>0&&
  c.tierAssessment?.compositionOk===true&&
  c.legs.length>=NFL_SGP_TIERS[c.risk].minLegs&&
  c.legs.length<=NFL_SGP_TIERS[c.risk].maxLegs&&
  Number(c.requiredLegs)===c.legs.length&&
  c.legs.every(l=>l?.player&&l?.team&&l?.category))
  // A cache HIT must obey the same no-unlisted-line rule as a new build.
  .map(c=>({...c,legs:c.legs.map(l=>({...l,target:null,
   marketSelectionStatus:'NO_EXACT_DRAFTKINGS_OR_FANDUEL_OFFER'}))}));
 sgps.mode=sgps.DraftKings.length||sgps.FanDuel.length?
  'VERIFIED_BOOK_SGPS_WITH_MODEL_RESEARCH':sgps.Analytics.length?'MODEL_ONLY_RESEARCH':'NO_VERIFIED_BOOK_SGPS';
 sgps.rule='Only accepted bookmaker-priced SGPs appear as parlays; model estimates are not sportsbook offers.';
 return {...body,sgps};
}
async function readResponseSnapshot(key,date,gameId,forceShared=false){
 const local=RESPONSE_CACHE.get(key);
 if(!forceShared&&local&&Date.now()-local.localReadAt<5000)return local.snapshot;
 try{
  const b=gameId?await nflSgpFindLatestBlob({date,gameId}):null;
  if(!b)return null;
  // Every immutable snapshot gets its own URL, so Vercel Blob's
  // 60-second overwrite propagation cannot return a prior game version.
  const r=await timedFetch(b.url,{cache:'no-store'});
  if(!r.ok)return null;
  const snap=await r.json();
  if(!Number.isFinite(Number(snap?.at)))return null;
  RESPONSE_CACHE.set(key,{snapshot:snap,localReadAt:Date.now()});
  return snap;
 }catch{return null}
}
async function writeResponseSnapshot(key,body,date,gameId,startedAt){
 const snap={at:Date.now(),startedAt,body};
 const pathname=nflSgpVersionedSnapshotPath(date,gameId,startedAt,
  Math.random().toString(36).slice(2,12));
 if(!pathname)return null;
 try{
  await put(pathname,JSON.stringify(snap),
   {access:'public',addRandomSuffix:false});
  RESPONSE_CACHE.set(key,{snapshot:snap,localReadAt:Date.now()});
  return snap.at;
 }catch(e){
  console.error('market_snapshot_write_failed',String(e?.message||e));
  RESPONSE_CACHE.delete(key);
  return null;
 }
}
const RAW_SNAP_PREFIX='momentum-nfl-sgo-events/v2/';
async function readSnapshot(date){const c=CACHE.get(date);if(c)return c;try{const path=RAW_SNAP_PREFIX+encodeURIComponent(date)+'.json',x=await list({prefix:path,limit:5}),b=x.blobs?.find(v=>v.pathname===path);if(!b)return null;const r=await timedFetch(b.url,{cache:'no-store'});if(!r.ok)return null;const snap=await r.json();if(!Array.isArray(snap?.events))return null;CACHE.set(date,snap);return snap}catch(e){console.error('raw_market_snapshot_read_failed',String(e?.message||e));return null}}
async function writeSnapshot(date,events){const s={at:Date.now(),events};CACHE.set(date,s);try{await put(RAW_SNAP_PREFIX+encodeURIComponent(date)+'.json',JSON.stringify(s),{access:'public',addRandomSuffix:false,allowOverwrite:true})}catch(e){console.error('raw_market_snapshot_write_failed',String(e?.message||e))}}
async function json(url,opts={},tries=3){let last;for(let i=0;i<tries;i++){try{const r=await timedFetch(url,{cache:'no-store',signal:AbortSignal.timeout(6500),...opts});if(r.ok)return r.json();last=new Error('upstream_'+r.status);if(r.status===429){const retry=Number(r.headers.get('retry-after'));if(Number.isFinite(retry)&&retry>0)last.retryAfterSeconds=retry;throw last}if(![500,502,503,504].includes(r.status))throw last}catch(e){last=e;if(String(e.message||e)==='upstream_429')break}if(i<tries-1)await sleep(250*(i+1))}throw last}
function playerName(o){const explicit=o.statEntityName||o.playerName||o.player?.name||o.statEntity?.name;if(explicit)return explicit;const m=String(o.marketName||'').match(/^(.+?)\s+(?:To Record|Touchdowns?|Passing|Rushing|Receiving|Receptions?)/i);if(m)return m[1].trim().replace(/\s+Any$/i,'');return String(o.statEntityID||'Unknown').replace(/_1_NFL$/i,'').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,x=>x.toUpperCase())}
function canonicalBook(x){const raw=String(x||''),k=raw.toLowerCase().replace(/[^a-z]/g,'');if(k.includes('draftkings'))return'DraftKings';if(k.includes('fanduel'))return'FanDuel';if(k.includes('betmgm')||k==='mgm')return'BetMGM';if(k.includes('caesars'))return'Caesars';if(k.includes('betrivers'))return'BetRivers';if(k.includes('fanatics'))return'Fanatics';if(k.includes('betonline'))return'BetOnline';if(k.includes('bovada'))return'Bovada';return raw||null}
const PRIMARY_BOOKS=['DraftKings','FanDuel'];
const APPROVED_BOOKS=['DraftKings','FanDuel','BetMGM','Caesars','BetRivers','Fanatics','BetOnline','Bovada'];
function approvedBook(m){for(const name of APPROVED_BOOKS){const b=bookFor(m,name);if(b)return b}return null; } // Only approved sportsbooks qualify; never silently substitute another book.
function market(o,eventID){const books=Object.entries(o.byBookmaker||{}).filter(([,v])=>v?.available).map(([book,v])=>({book:canonicalBook(book)||book,odds:v.odds??null,line:v.overUnder??v.spread??null,available:true}));const rawTeam=o.teamID||o.team?.abbreviation||o.statEntity?.teamID||o.statEntity?.team?.abbreviation||'';return{eventID,playerID:o.playerID||o.statEntityID||'',name:playerName(o),team:norm(rawTeam),marketName:o.marketName||'',statID:o.statID||'',periodID:o.periodID||'',betTypeID:o.betTypeID||'',sideID:o.sideID||'',fairOdds:o.fairOdds??null,bookOdds:o.bookOdds??null,line:o.bookOverUnder??null,books}}
function category(m){const key=String(m.marketName||'').toLowerCase();if(key.startsWith('player_pass_yds'))return'passing';if(key.startsWith('player_rush_yds'))return'rushing';if(key.startsWith('player_reception_yds'))return'receiving';if(key.startsWith('player_receptions'))return'receptions';const s=(m.statID+' '+m.marketName).toLowerCase();if(m.periodID!=='game')return null;if(m.statID==='touchdowns'&&m.betTypeID==='yn'&&m.sideID==='yes')return'td';if(m.betTypeID!=='ou'||m.sideID!=='over')return null;if(s.includes('passing')&&s.includes('yard')&&!s.includes('rushing')&&!s.includes('receiving'))return'passing';if(s.includes('rushing')&&s.includes('yard')&&!s.includes('receiving')&&!s.includes('passing'))return'rushing';if((s.includes('receiving')||s.includes('reception'))&&s.includes('yard')&&!s.includes('rushing')&&!s.includes('passing'))return'receiving';if(s.includes('reception')&&!s.includes('yard')&&!s.includes('longest'))return'receptions';return null}
function americanToProb(a){a=+a;if(!Number.isFinite(a)||!a)return null;return a>0?100/(a+100):(-a)/(-a+100)}
function bookFor(m,name){return (m.books||[]).find(offer=>nflBookOfferEligible(m,offer,name))||null}
function bestBook(m){return PRIMARY_BOOKS.map(x=>bookFor(m,x)).find(Boolean)||approvedBook(m)||null}
function threshold(m){const b=bestBook(m),raw=b?.line??m.line;if(raw===null||raw===undefined||raw==='')return null;const v=Number(raw);return Number.isFinite(v)?v:null}
function reasonFor(m,cat){const b=bestBook(m);const book=b?.book||'market feed';const line=threshold(m);const base=cat==='td'?'Anytime-TD market is active':cat==='passing'?'Passing-yard market is active':cat==='rushing'?'Rushing-yard market is active':cat==='receiving'?'Receiving-yard market is active':'Reception market is active';return base+' at '+book+(line!=null?' with a '+line+' threshold':'')+'. Sportsbook availability validates the market; verified line/price data may also contribute to Edge and Momentum scoring.'}
function pickRows(rows,cat,limit=10){const x=rows.filter(m=>category(m)===cat&&approvedBook(m));const by=new Map();for(const m of x){const k=m.playerID+'|'+cat,old=by.get(k);if(!old)by.set(k,m)}return[...by.values()].slice(0,limit).map((m,i)=>({rank:i+1,...m,threshold:threshold(m),confidence:null,bestBook:bestBook(m),sportsbooks:Object.fromEntries(APPROVED_BOOKS.map(name=>[name,bookFor(m,name)]).filter(([,v])=>v)),verifiedAt:new Date().toISOString(),reason:reasonFor(m,cat)}))}
function probToAmerican(p){if(!Number.isFinite(p)||p<=0||p>=1)return null;return Math.round(p>=.5?-100*p/(1-p):100*(1-p)/p)}
function parlayPrice(legs,book){const ps=legs.map(x=>americanToProb(bookFor(x,book)?.odds)).filter(Number.isFinite);if(ps.length!==legs.length)return null;return probToAmerican(ps.reduce((a,p)=>a*p,1))}
function metricFor(cat){return cat==='passing'?'passYards':cat==='rushing'?'rushYards':cat==='receiving'?'recYards':cat==='receptions'?'receptions':cat==='td'?'recTD':null}
function positionFor(cat){return cat==='passing'?'QB':cat==='rushing'?'RB':cat==='receiving'?'WR':cat==='receptions'?'WR':null}
function edgeAnalytics(x,offer){const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)),line=valid(offer?.line)?Number(offer.line):null,projection=valid(x?.projection)?Number(x.projection):null,marketProb=americanToProb(offer?.odds),hasLine=line!==null,hasProjection=projection!==null,edge=hasLine&&hasProjection?Number((projection-line).toFixed(1)):null,edgePct=edge!=null&&line!==0?Number((edge/Math.abs(line)*100).toFixed(1)):null;return{sportsbookLine:line,modelProjection:projection,rawEdge:edge,edgePct,marketImpliedProbability:marketProb!=null?Number((marketProb*100).toFixed(1)):null,impliedProbabilityIncludesVig:marketProb!=null,projectionVerified:hasProjection,marketVerified:!!offer&&(hasLine||marketProb!=null)}}
function recentHitRates(x,line){if(!Number.isFinite(Number(line)))return null;const calc=a=>{const vals=(a||[]).map(Number).filter(Number.isFinite);if(!vals.length)return null;const hits=vals.filter(v=>v>Number(line)).length,pushes=vals.filter(v=>v===Number(line)).length;return{hits,sample:vals.length,pushes,rate:Number((hits/vals.length*100).toFixed(1))}};return{line:Number(line),last5:calc(x?.recentForm?.last5),last10:calc(x?.recentForm?.last10),side:'OVER'}}
function attachAnalyticsToMarkets(rows,statBoards){const maps={};for(const cat of ['passing','rushing','receiving','receptions'])maps[cat]=new Map((statBoards?.[cat]||[]).map(x=>[norm(x.name),x]));return(rows||[]).map(m=>{const cat=category(m),a=maps[cat]?.get(norm(m.name));if(!a)return m;return{...m,marketPlayerID:m.playerID,playerID:a.playerID||m.playerID,team:a.team||m.team,projection:a.projection,projectionUnit:a.projectionUnit,projectionMethod:a.projectionMethod,range:a.range,recentForm:a.recentForm,gamesPlayed:a.gamesPlayed,perGame:a.perGame,position:a.position,targets:a.targets,receptions:a.receptions,analyticsMatched:true}})}
function momentumScore(x,ctx){
 const cat=x.cat,metric=metricFor(cat),actualPos=String(x.position||'').toUpperCase(),pos=['QB','RB','WR','TE'].includes(actualPos)?actualPos:positionFor(cat);let score=cat==='td'&&Number.isFinite(Number(x.modelTdPercent))?
 Math.round(30+Math.min(75,Number(x.modelTdPercent))*.7):50,signals=[];
 const offer=x.bookOffer||bestBook(x),edge=edgeAnalytics(x,offer),marketProb=americanToProb(offer?.odds);
 if(cat==='td'&&marketProb!=null){score+=Math.max(-10,Math.min(10,(marketProb-.35)*35));signals.push('active TD market '+Math.round(marketProb*100)+'% implied')}
 if(edge.edgePct!=null){score+=Math.max(-15,Math.min(15,edge.edgePct*.75));signals.push((edge.rawEdge>=0?'+':'')+edge.rawEdge+' model edge vs line')}
 const hits=recentHitRates(x,offer?.line),recent=hits?.last5||hits?.last10;if(recent&&recent.sample>=2){const hitAdj=Math.max(-8,Math.min(8,(recent.rate-50)*.16));score+=hitAdj;signals.push('recent over hit rate '+recent.hits+'/'+recent.sample+' ('+recent.rate+'%)')}
 const trend=Number(x?.recentForm?.trend);if(Number.isFinite(trend)){const denom=cat==='receptions'?1:10,trendAdj=Math.max(-4,Math.min(4,trend/denom));score+=trendAdj;if(Math.abs(trendAdj)>=1)signals.push('recent form '+(trend>0?'up ':'down ')+Math.abs(trend).toFixed(1))}
 const team=norm(x.team);if(team&&ctx?.opponents?.[team]&&metric&&pos){const def=ctx.opponents[team],defRank=Number(ctx.dvp?.defenseRanks?.[pos]?.[def]?.[metric]?.rankMost),offRank=Number(ctx.dvp?.offenseRanks?.[pos]?.[team]?.[metric]?.rankMost);if(Number.isFinite(defRank)){const adj=(16.5-defRank)/2;score+=adj;signals.push(def+' defense #'+defRank+' most '+metric+' allowed')}if(Number.isFinite(offRank)){const offAdj=(16.5-offRank)/3;score+=offAdj;signals.push(team+' offense #'+offRank+' '+metric+' produced')}}
 const gp=Number(x.gamesPlayed);if(Number.isFinite(gp)&&gp>0&&gp<3){score=50+(score-50)*.7;signals.push('early-season sample dampener ('+gp+' games)')}
 if(offer&&Number.isFinite(+offer.line))signals.push('verified '+x.cat+' line '+offer.line);
 return{score:Math.max(1,Math.min(99,Math.round(score))),signals,edge,hits};
}
function pairCorrelation(a,b){let s=0,reasons=[];const sameTeam=norm(a.team)&&norm(a.team)===norm(b.team),samePlayer=String(a.playerID||'')===String(b.playerID||'');if(samePlayer){if(a.cat==='td'||b.cat==='td'){s+=8;reasons.push('same-player TD + production alignment')}else{s-=12;reasons.push('same-player overlapping production markets')}}if(sameTeam&&!samePlayer){const cats=new Set([a.cat,b.cat]);if(cats.has('passing')&&(cats.has('receiving')||cats.has('receptions'))){s+=10;reasons.push('QB passing + teammate receiving correlation')}if(cats.has('rushing')&&cats.has('td')){s+=5;reasons.push('team rushing + TD game-script alignment')}if(cats.has('passing')&&cats.has('rushing')){s-=3;reasons.push('passing/rushing volume can compete')}}if(!sameTeam){if(a.cat==='passing'&&b.cat==='passing'){s+=3;reasons.push('opposing QB shootout correlation')}if(a.cat==='rushing'&&b.cat==='rushing'){s-=2;reasons.push('opposing rushing volume can imply competing scripts')}}return{score:s,reasons}}
function sgpCorrelation(legs){if(!legs||legs.length<2)return{score:50,label:'NEUTRAL',pairs:[]};let total=0,pairs=[];for(let i=0;i<legs.length;i++)for(let j=i+1;j<legs.length;j++){const p=pairCorrelation(legs[i],legs[j]);total+=p.score;if(p.score||p.reasons.length)pairs.push({a:legs[i].name,b:legs[j].name,score:p.score,reasons:p.reasons})}const score=Math.max(1,Math.min(99,Math.round(50+total))),label=score>=65?'STRONG_ALIGNMENT':score>=55?'ALIGNED':score<=40?'CONFLICTING':'NEUTRAL';return{score,label,pairs}}
function buildBookSgp(rows,book,ctx){
 const all=[];
 for(const cat of ['passing','receiving','rushing','receptions','td'])for(const m of rows.filter(x=>category(x)===cat&&bookFor(x,book))){const offer=bookFor(m,book);const offeredLine=offer?.line;const exactLine=cat==='td'?1:Number(offeredLine);if(cat!=='td'&&(offeredLine===null||offeredLine===undefined||offeredLine===''||!Number.isFinite(exactLine)))continue;const base={...m,cat,bookOffer:offer,threshold:exactLine,thresholdSource:'EXACT_BOOK_OFFER'},mom=momentumScore(base,ctx);all.push({...base,momentumScore:mom.score,momentumSignals:mom.signals,edgeAnalytics:mom.edge,recentHitRates:recentHitRates(base,base.bookOffer?.line)})}
 all.sort((a,b)=>b.momentumScore-a.momentumScore);
 const groups=new Map();for(const x of all){const k=x.playerID+'|'+x.cat;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)}
 const basePool=[];for(const g of groups.values()){const primary=g.find(x=>!String(x.marketName).includes('alternate'));basePool.push(primary||g.slice().sort((a,b)=>(+a.bookOffer?.line||0)-(+b.bookOffer?.line||0))[0])}
 basePool.sort((a,b)=>b.momentumScore-a.momentumScore);
 const nukePool=basePool.map(x=>{if(!['passing','receiving','rushing','receptions'].includes(x.cat)||!Number.isFinite(+x.bookOffer?.line))return x;const avg=Number(x.predictiveProjection??x.projection??x.perGame)||+x.bookOffer.line,modelTarget=analyticsLine(x,x.cat,'Nuke',ctx),step=x.cat==='receptions'?1:5,minimum=x.cat==='receptions'?Math.floor(avg)+1:Math.ceil((avg+0.0001)/step)*step,target=Number.isFinite(modelTarget)?Math.max(minimum,modelTarget):minimum,g=groups.get(x.playerID+'|'+x.cat)||[],higher=g.filter(v=>Number.isFinite(+v.bookOffer?.line)&&+v.bookOffer.line>+x.bookOffer.line&&+v.bookOffer.line>=minimum*.92).sort((a,b)=>Math.abs(+a.bookOffer.line-target)-Math.abs(+b.bookOffer.line-target));const ceiling=x.cat==='receptions'?Math.ceil(avg)+2:x.cat==='passing'?Math.ceil((avg+25)/5)*5:Math.ceil((avg+15)/5)*5;const available=higher.filter(v=>+v.bookOffer.line<=ceiling);const fallbackFloor=x.cat==='receptions'?Math.max(minimum,target-1):Math.max(minimum,target-10);const pick=available.find(v=>+v.bookOffer.line>=target)||available.filter(v=>+v.bookOffer.line>=fallbackFloor).sort((a,b)=>Math.abs(+a.bookOffer.line-target)-Math.abs(+b.bookOffer.line-target))[0];if(!pick)return{...x,nukeTarget:target,nukeCeiling:ceiling,nukeJuiced:false,nukeAboveProjection:false,nukeRejectedReason:'No '+book+' alternate within supported Momentum Nuke range '+target+' to '+ceiling+' above projection '+avg};return{...pick,nukeTarget:target,nukeJuiced:+pick.bookOffer?.line>+x.bookOffer.line,nukeAboveProjection:+pick.bookOffer?.line>avg,nukeMeetsModelTarget:+pick.bookOffer?.line>=target}}).sort((a,b)=>{const aj=a.nukeJuiced?1:0,bj=b.nukeJuiced?1:0;return bj-aj||(Number(b.momentumScore)||0)-(Number(a.momentumScore)||0)});
 const make=(risk,count,offset)=>{let source=risk==='Nuke'?nukePool:basePool;if(risk==='Nuke'){source=source.filter(x=>x.cat==='td'||x.nukeAboveProjection===true);const juiced=source.filter(x=>x.nukeJuiced||x.cat==='td'),standard=source.filter(x=>!x.nukeJuiced&&x.cat!=='td');source=juiced.concat(standard)}const legs=[],used=new Set(),usedCats=new Set(),rotated=source.slice(offset).concat(source.slice(0,offset));const add=x=>{if(!x||used.has(x.playerID+'|'+x.cat))return false;used.add(x.playerID+'|'+x.cat);usedCats.add(x.cat);legs.push(x);return true};const mix=fillNflSgpMarketMix({risk,count,pool:rotated,legs,add});const complete=mix.filled;if(!complete)return{book,risk,legs:[],estimatedOdds:null,momentumScore:null,sgpScore:null,correlation:sgpCorrelation([]),marketMix:[],verifiedAt:new Date().toISOString(),requiredLegs:count,verifiedLegs:legs.length,reason:'No fully qualified '+book+' '+risk+' model candidate is available right now ('+legs.length+'/'+count+' eligible legs).'};const juicedCount=legs.filter(x=>x.nukeJuiced).length;if(risk==='Nuke'&&juicedCount<2)return{book,risk,legs:[],estimatedOdds:null,juicedLegs:juicedCount,nukeCeilingVerified:false,momentumScore:null,sgpScore:null,correlation:sgpCorrelation([]),marketMix:[],verifiedAt:new Date().toISOString(),requiredLegs:count,verifiedLegs:0,reason:'No model-estimated Nuke candidate is shown because fewer than two data-supported juiced alternate lines are currently available at '+book+'. The Data Model Nuke remains available separately.'};const tierAssessment=assessNflSgpTier({risk,legs,requiredLegs:count});if(!tierAssessment.compositionOk)return{book,risk,legs:[],estimatedOdds:null,verifiedLegs:0,requiredLegs:count,reason:tierAssessment.reason,tierAssessment};const est=parlayPrice(legs,book);if(!Number.isFinite(est))return{book,risk,legs:[],estimatedOdds:null,nukeCeilingVerified:false,requiredLegs:count,verifiedLegs:0,reason:'Incomplete fresh individual bookmaker odds for this candidate.'};const avg=Math.round(legs.reduce((s,x)=>s+x.momentumScore,0)/legs.length),corr=sgpCorrelation(legs),combined=Math.max(1,Math.min(99,Math.round(avg*.8+corr.score*.2))),juicedLegs=legs.filter(x=>x.nukeJuiced).length,nukeCeilingVerified=risk!=='Nuke'||juicedLegs>=2;return{book,risk,legs,tierAssessment,estimatedOdds:est,estimateMethod:'INDEPENDENT_LEG_MULTIPLICATION',estimateConfidence:'UNCALIBRATED_SAME_GAME_CORRELATION',estimateToleranceGuaranteed:false,estimatedProfitForTenDollars:est>0?Math.round(est)/10:null,juicedLegs,nukeCeilingVerified,momentumScore:avg,sgpScore:combined,correlation:corr,marketMix:[...usedCats],verifiedAt:new Date().toISOString(),requiredLegs:count,verifiedLegs:legs.length,reason:risk==='Nuke'?'Nuke prioritizes the highest-confidence data-supported ceiling and uses a candidate juiced alternate line only when market evidence supports one near that ceiling; every leg remains sportsbook-listed. Correlation is scored separately and contributes 20% of the SGP score.':'Individual prop legs were observed for '+book+'; the correlated combined SGP price is unverified. Correlation is scored separately and contributes 20% of the SGP score.'}};
 const findTier=(risk,count,offset=0)=>{
  const band=SGP_ODDS_BANDS[risk],target=(band.min+band.max)/2;
  let best=null,bestDistance=Infinity;
  for(let o=0;o<Math.min(basePool.length,5);o++){
   const candidate=make(risk,count,offset+o);
   if(candidate?.legs?.length!==count||candidate.tierAssessment?.compositionOk!==true)continue;
   const odds=Number(candidate.estimatedOdds);
   if(!Number.isFinite(odds))continue;
   // Prefer a valid estimate inside the requested tier, closest to its midpoint.
   // An outside-tier candidate remains research-only, never a priced ticket.
   const inBand=sgpOddsInBand(risk,odds);
   const distance=(inBand?0:1e9)+Math.abs(odds-target);
   if(distance<bestDistance){best=candidate;bestDistance=distance;}
  }
  return best?{...best,payoutTarget:sgpPayoutLabel(risk),payoutBandVerified:false,
   estimatedPayoutTargetInBand:sgpOddsInBand(risk,best.estimatedOdds)}:null;
 };
 const dynamicNuke=()=>{
  let best=null;
  for(const n of [7,6,5]){
   const s=make('Nuke',n,2);
   if(s?.legs?.length!==n||s.tierAssessment?.compositionOk!==true||!s.nukeCeilingVerified)continue;
   if(sgpOddsInBand('Nuke',s.estimatedOdds))
    return {...s,payoutTarget:sgpPayoutLabel('Nuke'),payoutBandVerified:false,estimatedPayoutTargetInBand:true};
   if(!best||Number(s.estimatedOdds)>Number(best.estimatedOdds))best=s;
  }
  return best?{...best,payoutTarget:sgpPayoutLabel('Nuke'),payoutBandVerified:false,
   estimatedPayoutTargetInBand:false}:null;
 };
 // Candidate composition is independent of payout verification. Do not drop
 // exact, book-offered legs based on multiplied odds; a genuine correlated
 // combined sportsbook price must be quoted separately.
 return filterCompleteNflBookSgps([
  findTier('Small',4,0),findTier('Medium',5,1),dynamicNuke()
 ]);
}
function analyticsMetric(cat,pos){
 if(cat==='passing')return'passYards';
 if(cat==='rushing')return'rushYards';
 if(cat==='receiving')return'recYards';
 if(cat==='receptions')return'receptions';
 if(cat==='td')return pos==='QB'||pos==='RB'?'rushTD':'recTD';
 return null;
}
function matchupAdjustedProjection(x,cat,ctx){
 const base=Number(x.projection);if(!Number.isFinite(base)||base<=0)return null;
 const pos=String(x.position||'').toUpperCase(),team=norm(x.team),opp=norm(x.opponent),metric=analyticsMetric(cat,pos);
 let factor=1,defRank=null,offRank=null;
 if(metric&&pos&&team&&opp){
  defRank=validNflDvpRank(ctx?.dvp?.defenseRanks?.[pos]?.[opp]?.[metric]?.rankMost);
  offRank=validNflDvpRank(ctx?.dvp?.offenseRanks?.[pos]?.[team]?.[metric]?.rankMost);
  // rankMost #1 = most allowed/produced. Strong matchup and strong positional production raise the ceiling.
  if(defRank!==null)factor+=Math.max(-.12,Math.min(.22,(16.5-defRank)/70));
  if(offRank!==null)factor+=Math.max(-.08,Math.min(.14,(16.5-offRank)/100));
 }
 const recentVals=Array.isArray(x.recentForm?.last5)?x.recentForm.last5.map(Number).filter(Number.isFinite):[];const recent=recentVals.length?recentVals.reduce((a,b)=>a+b,0)/recentVals.length:Number(x.recentForm?.last5),pg=Number(x.perGame);
 if(Number.isFinite(recent)&&Number.isFinite(pg)&&pg>0)factor+=Math.max(-.08,Math.min(.10,((recent/pg)-1)*.18));
 factor=Math.max(.78,Math.min(1.38,factor));
 return{base,adjusted:base*factor,factor,defRank,offRank,metric};
}
function yardTarget5(value,mode='nearest'){
 const n=Number(value);if(!Number.isFinite(n)||n<0)return null;
 const round=mode==='ceil'?Math.ceil:mode==='floor'?Math.floor:Math.round;
 return Math.max(0,round(n/5)*5);
}
function predictiveStatProjection(x,cat,ctx){
 if(cat==='td')return null;const m=matchupAdjustedProjection(x,cat,ctx),base=Number(x.perGame??x.projection),recent=Array.isArray(x.recentForm?.last5)?x.recentForm.last5.map(Number).filter(Number.isFinite):[];
 if(!Number.isFinite(base)||base<0)return null;const recentAvg=recent.length?recent.reduce((a,b)=>a+b,0)/recent.length:base;let matchup=Number(m?.adjusted);if(!Number.isFinite(matchup))matchup=base;
 const sample=Math.max(1,Number(x.gamesPlayed)||recent.length||1),rw=Math.min(.30,.15+sample*.03),mw=.25,bw=1-rw-mw,p=base*bw+recentAvg*rw+matchup*mw;
 return cat==='receptions'?Math.max(0,Number(p.toFixed(1))):yardTarget5(p);
}
function populatePredictiveLines(categories,ctx){
  for(const cat of ['passing','rushing','receiving','receptions']){
    categories[cat]=(categories[cat]||[]).map(x=>{
      const predicted=predictiveStatProjection(x,cat,ctx);
      const raw=Number.isFinite(predicted)?predicted:Number(x.projection);
      const projection=cat==='receptions'?raw:yardTarget5(raw);
      const pos=String(x.position||'').toUpperCase(),opp=norm(x.opponent),metric=analyticsMetric(cat,pos);
      const rank=ctx?.dvp?.defenseRanks?.[pos]?.[opp]?.[metric]?.rankMost;
      const hasDvp=rank!==null&&rank!==undefined&&Number.isFinite(Number(rank))&&Number(rank)>=1&&Number(rank)<=32;
      const gp=Number(x.gamesPlayed)||0,baseline=Number(x.perGame);
      const sample=gp>0?`${gp} completed games`:'available completed-game data';
      const avg=Number.isFinite(baseline)?`${baseline.toFixed(1)} ${cat==='receptions'?'receptions':'yards'} per game`:'baseline unavailable';
      const matchup=hasDvp?`${opp} allows the #${rank} most ${cat==='receptions'?'receptions':cat+' yards'} to ${pos} players; matchup included in projection.`:'Opponent defense-vs-position data unavailable; no matchup-rank adjustment applied.';
      const reason=Number.isFinite(Number(projection))
        ?`Model projection: ${projection} ${cat==='receptions'?'receptions':cat+' yards'}. Based on ${sample} (${avg}), recent form, and available matchup evidence. ${matchup}${gp>0&&gp<5?' Small early-season sample.':''} Sportsbook lines are separate and shown only when available.`
        :x.reason;
      return {...x,projection,predictiveProjection:projection,projectionMethod:hasDvp?'Momentum Radar weighted prediction: season, recent form and opponent DVP':'Momentum Radar weighted prediction: season and recent form; DVP pending',matchupRankMost:hasDvp?Number(rank):null,reason};
    }).filter(x=>Number.isFinite(Number(x.projection)));
  }
  return categories;
}

// NFL rushing-yard target probabilities are explicit model estimates, not bookmaker implied odds.
// A target of 75+ means 75 or more rushing yards; unverified model targets use 5-yard steps.
function standardNormalCdf(z){
  const n=Number(z);
  if(!Number.isFinite(n))return null;
  const a=Math.abs(n),t=1/(1+.2316419*a),pdf=Math.exp(-a*a/2)/Math.sqrt(2*Math.PI);
  const tail=pdf*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return Math.max(0,Math.min(1,n>=0?1-tail:tail));
}
function rushingProbability(x,ctx){
  const gp=Number(x.gamesPlayed),projected=Number(x.projection),avg=Number(x.perGame);
  const history=(Array.isArray(x.recentForm?.last10)?x.recentForm.last10:x.recentForm?.last5||[])
    .map(Number).filter(n=>Number.isFinite(n)&&n>=0);
  // Never silently display a 50% "guess" for missing data or tiny samples.
  if(!Number.isFinite(gp)||gp<3||!Number.isFinite(projected)||projected<=0||
     !Number.isFinite(avg)||avg<=0||history.length<3)return null;
  const target=Math.max(5,Math.floor(avg*.82/5)*5); // Stable season-based benchmark; matchup affects odds, not benchmark.
  const pos=String(x.position||'').toUpperCase(),team=norm(x.team),opp=norm(x.opponent)||ctx?.opponents?.[team]||'';
  const metric='rushYards',def=ctx?.dvp?.defenseRanks?.[pos]?.[opp]?.[metric]||null;
  const off=ctx?.dvp?.offenseRanks?.[pos]?.[team]?.[metric]||null;
  const defRank=Number(def?.rankMost),offRank=Number(off?.rankMost);
  const hasDefense=def?.rankMost!=null&&Number.isFinite(defRank)&&defRank>=1&&defRank<=32;
  const hasOffense=off?.rankMost!=null&&Number.isFinite(offRank)&&offRank>=1&&offRank<=32;
  const mean=history.reduce((s,v)=>s+v,0)/history.length;
  const sampleVar=history.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,history.length-1);
  const priorSigma=Math.max(13,projected*.30);
  const varWeight=Math.min(.75,history.length/(history.length+5));
  const sigma=Math.sqrt(Math.max(144,sampleVar*varWeight+priorSigma**2*(1-varWeight)));
  // Limited-game shrinkage moderates raw parametric estimates toward 50%.
  // It does not manufacture an 80%+ recommendation from a four-game sample.
  const reliability=Math.min(.92,.35+Math.min(gp,10)*.075)*(hasDefense&&hasOffense?1:.77);
  const estimate=threshold=>{
    const raw=1-standardNormalCdf((threshold-.5-projected)/sigma);
    return Math.max(1,Math.min(99,Math.round(100*(.5+(raw-.5)*reliability))));
  };
  const nearProjectionTarget=Math.max(5,Math.floor(projected/5)*5),nearProjectionPercent=estimate(nearProjectionTarget);
  const targetChance=estimate(target),offer=bestBook(x);
  const bookLine=offer?.line!==null&&offer?.line!==undefined&&offer?.line!==''&&Number.isFinite(Number(offer.line))?Number(offer.line):null;
  const bookVerified=Boolean(offer&&['DraftKings','FanDuel'].includes(offer.book)&&
    offer.odds!==null&&offer.odds!==undefined&&offer.odds!==''&&Number.isFinite(Number(offer.odds))&&bookLine!==null);
  const marketChance=bookVerified?estimate(bookLine+.5):null; // Main-book Over X.5 settles at the next whole yard.
  const matchup=hasDefense&&hasOffense?'Offense #'+offRank+' most RB/QB rushing yards produced vs defense #'+defRank+' most allowed':
    hasDefense?'Defense #'+defRank+' most rushing yards allowed to '+pos:
    'Opponent/team positional ranking unavailable';
  return{
    estimatedPercent:targetChance,modelTargetYards:target,nearProjectionTargetYards:nearProjectionTarget,nearProjectionPercent,
    marketOverPercent:marketChance,marketLine:bookVerified?bookLine:null,marketBook:bookVerified?offer.book:null,
    offenseRankMost:hasOffense?offRank:null,defenseRankMost:hasDefense?defRank:null,
    defenseAllowedPerGame:hasDefense&&Number.isFinite(Number(def?.value))?Number(def.value):null,
    offenseProducedPerGame:hasOffense&&Number.isFinite(Number(off?.value))?Number(off.value):null,
    games:gp,historySample:history.length,variationYards:Math.round(sigma),
    matchupSummary:matchup,method:'model estimate using projected yards, completed games, variability, recent form and available offense/defense vs position',
    modelOnly:!bookVerified,notCalibrated:true
  };
}

function analyticsLine(x,cat,risk,ctx){
 if(cat==='td')return 'Anytime TD';
 const m=matchupAdjustedProjection(x,cat,ctx);if(!m){const fallback=Number(x.projection??x.perGame);if(!Number.isFinite(fallback))return null;const p=risk==='Small'?fallback*.72:risk==='Medium'?fallback*.92:fallback*1.15;if(cat==='receptions')return Math.max(1,Math.floor(p));return capNflTierYardTarget({category:cat,tier:risk,target:Math.max(cat==='passing'?125:5,yardTarget5(p,risk==='Nuke'?'ceil':'floor')),projection:x.projection??x.perGame});}
 const floor=Number(x.range?.floor),ceiling=Number(x.range?.ceiling),expected=m.adjusted,avg=Number(x.perGame)||Number(x.projection)||expected;
 const floorAdj=Number.isFinite(floor)?floor*m.factor:expected*.72,ceilingAdj=Number.isFinite(ceiling)?ceiling*m.factor:expected*1.22;
 let p=risk==='Small'?Math.max(expected*.60,Math.min(expected*.78,floorAdj*.95)):risk==='Medium'?expected*.92:Math.max(expected*1.08,ceilingAdj*.90);
 // Momentum Radar Nuke = highest-confidence ceiling SGP. Yardage must be meaningfully above the player's established baseline,
 // not merely a normal sportsbook line. Keep the juice data-supported by the observed ceiling and matchup adjustment.
 if(risk==='Nuke'){
  const desiredLift=cat==='passing'?25:cat==='receptions'?1:10;
  const observedCeiling=Number.isFinite(ceiling)?ceiling:expected*1.18;
  // A Nuke is a plus/ceiling outcome, not the absolute mathematical maximum. Keep the target
  // meaningfully above MR's central prediction while limiting matchup inflation to a realistic band.
  const maxLift=cat==='passing'?75:cat==='receptions'?2:30;
  const supportedCeiling=Math.min(Math.max(avg+desiredLift,observedCeiling),avg+maxLift);
  if(supportedCeiling<avg+desiredLift)return null;
  const modelCeiling=Math.max(avg+desiredLift,avg*(cat==='passing'?1.10:cat==='receptions'?1.12:1.15));
  p=Math.min(modelCeiling,supportedCeiling);
 }
 if(cat==='receptions')return Math.max(1,risk==='Nuke'?Math.ceil(p):Math.floor(p));
 const requested=Math.max(cat==='passing'?125:5,yardTarget5(p,risk==='Nuke'?'ceil':'floor'));return capNflTierYardTarget({category:cat,tier:risk,target:requested,projection:x.projection??x.perGame});
}
function bookThresholdCaps(x,cat){
 const refs=x?.publicMarketRefs||[];const caps={};
 for(const r of refs){const n=Number(String(r.line??'').replace('+',''));if(Number.isFinite(n))caps[r.book]=Math.max(Number(caps[r.book])||0,n)}
 const offer=x?.bestBook||x?.bookOffer;if(offer?.book&&Number.isFinite(Number(offer.line)))caps[offer.book]=Math.max(Number(caps[offer.book])||0,Number(offer.line));
 return caps;
}
function playableThreshold(x,cat,target){
 if(cat==='td')return{threshold:'Anytime TD',books:Object.keys(bookThresholdCaps(x,cat)),bookCaps:bookThresholdCaps(x,cat)};
 if(!Number.isFinite(Number(target)))return null;const caps=bookThresholdCaps(x,cat),books=Object.entries(caps).filter(([,cap])=>Number(target)<=Number(cap)).map(([book])=>book);
 if(!Object.keys(caps).length)return null;
 if(!books.length)return null;
 return{threshold:Number(target),books,bookCaps:caps,capped:false,requested:Number(target)};
}
function sgpExplanation(risk,legs,corr){const details=(legs||[]).map(x=>{const bits=[];const pg=Number(x.perGame),recent=Array.isArray(x.recentForm?.last5)?x.recentForm.last5.map(Number).filter(Number.isFinite):[];if(Number.isFinite(pg))bits.push('season '+pg.toFixed(x.cat==='receptions'?1:0)+' per game');if(recent.length){const a=recent.reduce((s,v)=>s+v,0)/recent.length;bits.push('recent '+recent.length+'-game avg '+a.toFixed(x.cat==='receptions'?1:0))}const dr=Number(x.matchupDefenseRank),or=Number(x.matchupOffenseRank);if(Number.isInteger(or)&&or>=1&&or<=32)bits.push(x.team+' offense #'+or+' most '+(x.matchup?.metric||x.cat)+' production');if(Number.isInteger(dr)&&dr>=1&&dr<=32)bits.push((x.opponent||'opponent')+' defense #'+dr+' most allowed to '+(x.position||'position'));if(Number.isFinite(x.matchupFactor))bits.push('matchup adjustment '+((x.matchupFactor-1)*100>=0?'+':'')+Math.round((x.matchupFactor-1)*100)+'%');if(x.cat!=='td'&&Number.isFinite(Number(x.analyticsThreshold)))bits.push(risk+' target '+x.analyticsThreshold);return x.name+': '+bits.join(' • ')});const pairs=(corr?.pairs||[]).filter(p=>p.score!==0).slice(0,3).map(p=>p.a+' + '+p.b+': '+p.reasons.join(', '));return{summary:risk==='Small'?'Built around the strongest conservative floors after matchup adjustment.':risk==='Medium'?'Built around the strongest matchup-adjusted expected outcomes.':'Built around the strongest data-supported ceiling outcomes; Nuke payout still requires downstream sportsbook verification of odds strictly greater than +10000.',legs:details,correlation:pairs,correlationLabel:corr?.label||'NEUTRAL'}}
function buildAnalyticsSgp(categories,ctx,roles,identity){
 const tdByPlayer=new Map((categories?.td||[]).filter(x=>
  x?.playerID||x?.playerId).map(x=>[
  String(x.playerID||x.playerId)+'|'+nflCanonTeam(x.team),x]));
 const pool=[];for(const cat of ['passing','rushing','receiving','receptions','td'])for(const x of categories?.[cat]||[]){
  if(cat!=='td'&&!Number.isFinite(Number(x.projection??x.perGame)))continue;
  // Build only from the selected ESPN event's authenticated/current roster.
  // Removing bad game identities BEFORE ranking avoids discarding valid Nukes
  // after an invalid cross-team leg has already been picked.
  if(!nflLegMatchesGameRoster(x,identity))continue;
  const verifiedRole=roleFor(roles,x);
  if(identity?.gameId&&(!verifiedRole||verifiedRole.recommendationEligible!==true||
    nflCanonTeam(verifiedRole.team)!==nflCanonTeam(x.team)||
    (verifiedRole.playerId&&String(verifiedRole.playerId)!==String(x.playerID||x.playerId||''))))continue;
  const pairedTd=tdByPlayer.get(String(x.playerID||x.playerId)+'|'+nflCanonTeam(x.team))||null;
  if(!nflMeaningfulOpportunity(x,verifiedRole,{pairedTd}))continue;
  const mom=momentumScore({...x,cat,bookOffer:null},ctx),matchup=matchupAdjustedProjection(x,cat,ctx);
  pool.push({...x,cat,momentumScore:mom.score,momentumSignals:mom.signals,matchupProjection:matchup?.adjusted??null,matchupFactor:matchup?.factor??null,matchupDefenseRank:matchup?.defRank??null,matchupOffenseRank:matchup?.offRank??null});
 }
 // Observability only: distinguish an empty projection pool from a failed
 // composition or quote gate without weakening roster/injury safeguards.
 const poolDiagnostics={eligibleRows:pool.length,uniqueAthletes:new Set(pool.map(x=>String(x.playerID||x.playerId||norm(x.name)))).size,byCategory:Object.fromEntries(['passing','rushing','receiving','receptions','td'].map(cat=>[cat,pool.filter(x=>x.cat===cat).length]))};
 const strength=(x,risk='Medium')=>{
  const pg=Math.max(.1,Number(x.perGame)||Number(x.projection)||.1),adj=Number(x.matchupProjection)||Number(x.projection)||0,usage=x.usagePerGame||{},opp=x.cat==='rushing'?Number(usage.rushYards)||pg:(x.cat==='receiving'||x.cat==='receptions')?(Number(usage.targets)||0)*8+(Number(usage.receptions)||0)*5+(Number(usage.recYards)||0):pg,ceil=Number(x.range?.ceiling)||adj,ceilingLift=(ceil-pg)/Math.max(1,pg),matchupLift=(adj-pg)/Math.max(1,pg);
  // Compare candidates at the actual tier target, not just raw production. Recent target hit rate is direct evidence.
  const target=analyticsLine(x,x.cat,risk,ctx),vals=Array.isArray(x.recentForm?.last5)?x.recentForm.last5.map(Number).filter(Number.isFinite):[];
  const targetHit=(x.cat!=='td'&&Number.isFinite(Number(target))&&vals.length)?vals.filter(v=>v>=Number(target)).length/vals.length:null;
  const sampleAdj=targetHit==null?0:Math.max(-12,Math.min(12,(targetHit-.5)*24));
  return (Number(x.momentumScore)||0)+Math.min(18,Math.log1p(Math.max(0,opp))*4)+Math.min(10,(adj/pg)*6)+sampleAdj+(risk==='Nuke'?Math.max(-8,Math.min(18,ceilingLift*30+matchupLift*25)):0)
 };pool.sort((a,b)=>strength(b)-strength(a)||(Number(b.confidence)||0)-(Number(a.confidence)||0));
 const selectedTierKeys=new Map();
 const make=(risk,count)=>{
  const priorKeys=risk==='Small'?[]:risk==='Medium'?[selectedTierKeys.get('Small')].filter(Boolean):
   [selectedTierKeys.get('Small'),selectedTierKeys.get('Medium')].filter(Boolean);
  const maxShared=risk==='Medium'?2:risk==='Nuke'?3:Infinity;
  const legs=[],used=new Set(),cats=new Set(),riskPool=[...pool].sort((a,b)=>{
   // Prioritize new athletes and markets in later tiers. Rejecting only
   // after filling can exhaust the count before alternatives are considered.
   const priorCount=x=>priorKeys.filter(keys=>keys.has(String(x.playerID||norm(x.name))+'|'+x.cat)).length;
   return priorCount(a)-priorCount(b)||strength(b,risk)-strength(a,risk)||
    (Number(b.confidence)||0)-(Number(a.confidence)||0);
  });
  const eligible=x=>{
    const pos=String(x?.position||'').toUpperCase(),role=roleFor(roles,x);
    if(!x||!['QB','RB','WR','TE'].includes(pos))return false;
    // High usage alone does not establish a starting role. A confirmed or
    // expected starter designation is required for all skill positions.
    // Unconfirmed rotation players remain in analytics, not model SGP slips.
    if(pos!=='QB')return role?.starterVerified===true&&
      role?.verification?.role?.verified===true&&
      ['CONFIRMED_STARTER','EXPECTED_STARTER'].includes(String(role?.starterStatus||'').toUpperCase());
    // Existing "HIGH_USAGE_ROLE" flags are not a confirmed QB starter.
    // Day-ahead model allows ESPN depth-chart QB1 ONLY after game roster,
    // injury eligibility and 2+ game passing samples have been verified.
    const confirmed=['CONFIRMED_STARTER','EXPECTED_STARTER'].includes(String(role?.starterStatus||''))&&
      isNflConfirmedGameQb({position:pos,role});
    return confirmed||nflProjectedDepthChartQbEligible(role);
   };
  const add=x=>{if(!eligible(x))return false;
   // Avoid building a slip around the same athlete in three markets.
   // This is a diversification rule, not a sportsbook-availability claim.
   const athlete=String(x.playerID||norm(x.name));
   if(legs.filter(v=>String(v.playerID||norm(v.name))===athlete).length>=2)return false;
   if(x.cat==='td'&&legs.filter(v=>v.cat==='td').length>=(risk==='Nuke'?2:1))return false;const id=x.playerID||norm(x.name);if(used.has(id+'|'+x.cat))return false;
   const candidateKey=String(id)+'|'+x.cat;
   if(priorKeys.some(previous=>previous.has(candidateKey)&&
      legs.filter(v=>previous.has(String(v.playerID||norm(v.name))+'|'+v.cat)).length>=maxShared))return false;
   const requested=analyticsLine(x,x.cat,risk,ctx);const threshold=modelNflSgpStatThreshold(x,x.cat,risk,requested);if(threshold===null)return false;const playable=playableThreshold(x,x.cat,threshold);used.add(id+'|'+x.cat);cats.add(x.cat);legs.push({...x,analyticsThreshold:threshold,sportsbookVerified:false,availableAt:[],bookThresholdCaps:{},thresholdCappedToSportsbook:false,modelRequestedThreshold:x.cat==='td'?null:Number(requested),modelCeilingOnly:risk==='Nuke'&&!playable});return true};
  const ranked=(cat,pred=()=>true)=>pool.filter(v=>v.cat===cat&&pred(v)&&!used.has((v.playerID||norm(v.name))+'|'+v.cat)).sort((a,b)=>(Number(b.momentumScore)||0)-(Number(a.momentumScore)||0)||(Number(b.perGame)||0)-(Number(a.perGame)||0)||(Number(b.matchupFactor)||1)-(Number(a.matchupFactor)||1));
  const pick=(cat,pred)=>add(ranked(cat,pred)[0]);
  // Yardage must be supported before any anytime TD; never pad Small/Medium with TDs.
  const mix=fillNflSgpMarketMix({risk,count,pool:riskPool,legs,add});
  const tierAssessment=mix.assessment;
  if(!tierAssessment.compositionOk)return{book:'Combined',mode:'DATA_MODEL',risk,legs:[],tierAssessment,modelOnly:true,candidateComplete:false,publishable:false,combinedBookQuoteVerified:false,estimatedOdds:null,momentumScore:null,sgpScore:null,correlation:sgpCorrelation([]),explanation:null,marketMix:[],requiredLegs:count,verifiedLegs:0,reason:mix.reason};
  const corr=sgpCorrelation(legs),avg=legs.length?Math.round(legs.reduce((s,x)=>s+(Number(x.momentumScore)||50),0)/legs.length):null;
  return{book:'Combined',mode:'DATA_MODEL',risk,legs,tierAssessment,modelOnly:true,candidateComplete:tierAssessment.compositionOk,publishable:false,combinedBookQuoteVerified:false,estimatedOdds:null,momentumScore:avg,sgpScore:avg==null?null:Math.max(1,Math.min(99,Math.round(avg*.8+corr.score*.2))),correlation:corr,explanation:sgpExplanation(risk,legs,corr),marketMix:[...cats],verifiedAt:new Date().toISOString(),requiredLegs:count,verifiedLegs:0,reason:legs.length===count?'Analytics Build — starter/high-usage production is matchup-adjusted using offense production and opponent defense-vs-position. Small targets the floor, Medium the adjusted expectation, and Nuke the supported ceiling; every market competes on model evidence. Verify availability at your sportsbook before placing.':'Not enough starter/high-usage analytics data to complete this build yet.'};
 };
 const nukeEvidence=summarizeNflNukeEvidence(pool.map(x=>{
  const pos=String(x?.position||'').toUpperCase(),role=roleFor(roles,x);
  const confirmed=['CONFIRMED_STARTER','EXPECTED_STARTER'].includes(String(role?.starterStatus||''))&&
   isNflConfirmedGameQb({position:pos,role});
  const roleEligible=['QB','RB','WR','TE'].includes(pos)&&(pos!=='QB'||confirmed||nflProjectedDepthChartQbEligible(role));
  return {athleteId:String(x.playerID||x.playerId||norm(x.name)),
   category:x.cat,roleEligible,ceilingSupported:x.cat==='td'||
   modelNflSgpStatThreshold(x,x.cat,'Nuke',analyticsLine(x,x.cat,'Nuke',ctx))!==null};
 }));
 const small=selectNflAdaptiveTier(make,'Small');
 if(small?.tierAssessment?.compositionOk)selectedTierKeys.set('Small',new Set(small.legs.map(v=>String(v.playerID||norm(v.name))+'|'+v.cat)));
 const medium=selectNflAdaptiveTier(make,'Medium');
 if(medium?.tierAssessment?.compositionOk)selectedTierKeys.set('Medium',new Set(medium.legs.map(v=>String(v.playerID||norm(v.name))+'|'+v.cat)));
 const nuke=selectNflAdaptiveNuke(make);
 const nukeWithEvidence={...nuke,nukeEvidence,
  reason:nuke?.legs?.length?nuke.reason:
   (nuke?.reason||'Nuke not ready')+' Blocker: '+nukeEvidence.blocker+'. '+nukeEvidence.uniqueEligibleAthletes+
    ' eligible athletes; '+nukeEvidence.supportedYardageRows+' ceiling-backed yardage rows across '+
    nukeEvidence.distinctYardageMarkets+' yardage markets.'};
 const nukeHasStat=Boolean(nukeWithEvidence?.legs?.some(x=>x.cat!=='td'));return[{...small,poolDiagnostics,payoutTarget:sgpPayoutLabel('Small'),targetOddsBand:SGP_ODDS_BANDS.Small},{...medium,payoutTarget:sgpPayoutLabel('Medium'),targetOddsBand:SGP_ODDS_BANDS.Medium,poolDiagnostics},{...(nukeHasStat?nukeWithEvidence:{...nukeWithEvidence,legs:[],marketMix:[],reason:nukeWithEvidence.reason}),payoutTarget:sgpPayoutLabel('Nuke'),targetOddsBand:SGP_ODDS_BANDS.Nuke,poolDiagnostics}];
}
async function gameRoleGate(gameId,base){if(!gameId)return{checked:false,roles:new Map()};try{const r=await timedFetch(base+'/api/nfl-game?gameId='+encodeURIComponent(gameId)+'&ts='+Date.now(),{cache:'no-store'});if(!r.ok)return{checked:false,roles:new Map()};const d=await r.json(),m=new Map();for(const x of d.playerProjections||[]){if(x.playerId)m.set(String(x.playerId),x);if(x.name)m.set('name:'+norm(x.name),x)}return{checked:true,roles:m,players:d.playerProjections||[],source:d.source||null,gameScopedStarters:d.gameScopedStarters||null}}catch{return{checked:false,roles:new Map()}}}
function roleFor(gate,x){const roles=gate?.roles||new Map();return roles.get(String(x.playerID||x.playerId||''))||roles.get('name:'+norm(x.name))||null}
function analyticsUsageEligible(x,r,cat){
 const pos=String(x.position||r?.position||'').toUpperCase(),u=x.usagePerGame||{},pg=Number(x.gamesPlayed)||Number(x.evidence?.games)||0,per=Number(x.perGame)||0,tgt=Number(u.targets)||Number(x.evidence?.targets)||0,rec=Number(u.receptions)||0,rush=Number(u.rushYards)||0,recv=Number(u.recYards)||0;
 if(pg<1||!['QB','RB','WR','TE'].includes(pos))return false;
 // A verified role is necessary context, not a substitute for meaningful production/opportunity.
 if(cat==='passing')return pos==='QB'&&per>=100;
 if(cat==='rushing')return (pos==='RB'&&rush>=25)||(pos==='QB'&&rush>=15);
 if(cat==='receiving')return ['RB','WR','TE'].includes(pos)&&(recv>=20||tgt>=3);
 if(cat==='receptions')return ['RB','WR','TE'].includes(pos)&&(rec>=2.5||tgt>=3);
 if(cat==='td')return ['QB','RB','WR','TE'].includes(pos)&&(r?.starterVerified===true||r?.recommendationEligible===true||Number(x.confidence||0)>=50);
 return false;
}
function roleFilter(rows,gate,cat){
 const slateFallback=!gate?.checked;
 const eligible=(rows||[]).filter(x=>{const r=slateFallback?{position:x.position,recommendationEligible:true}:roleFor(gate,x);if(!r||cat==='td'&&!slateFallback&&r.recommendationEligible!==true)return false;const pos=String(x.position||r.position||'').toUpperCase(),status=String(r.starterStatus||r.status||'').toUpperCase();if(/(^|[_ -])(OUT|INACTIVE|IR|SUSPENDED|SUSPEND|DOUBTFUL)($|[_ -])/.test(status))return false;if(!x.analyticsOnly&&(Number.isFinite(Number(x.perGame))||x.usagePerGame))return analyticsUsageEligible(x,r,cat);if(!x.analyticsOnly)return true;return analyticsUsageEligible(x,r,cat)});
 // Fail closed to the highest-usage players at each team/position. QB is QB1 only; skill positions allow primary plus substantial rotation.
 const limits={QB:1,RB:2,WR:3,TE:2},groups=new Map();
 for(const x of eligible){const r=slateFallback?{position:x.position}:roleFor(gate,x),pos=String(x.position||r?.position||'').toUpperCase(),k=norm(x.team)+'|'+pos;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)}
 const keep=new Set();
 for(const [k,a] of groups){const pos=k.split('|')[1],n=limits[pos]||1;a.sort((p,q)=>{const pu=p.usagePerGame||{},qu=q.usagePerGame||{};const ps=Number(p.perGame)||0,qs=Number(q.perGame)||0;const catScore=(x,u)=>cat==='passing'?Number(x.perGame)||0:cat==='rushing'?Number(u.rushYards)||Number(x.perGame)||0:(cat==='receiving'||cat==='receptions')?((Number(u.targets)||0)*8+(Number(u.receptions)||0)*5+(Number(u.recYards)||0)):Number(x.perGame)||0;const pUsage=catScore(p,pu),qUsage=catScore(q,qu);return qUsage-pUsage||qs-ps});for(const x of a.slice(0,n))keep.add(String(x.playerID||x.playerId||norm(x.name)))}
 return eligible.filter(x=>keep.has(String(x.playerID||x.playerId||norm(x.name))));
}
function sgpRoleFilter(rows,gate){if(!gate?.checked)return[];return(rows||[]).map(x=>{const r=roleFor(gate,x);if(!r||r.recommendationEligible!==true)return null;const cat=category(x),pos=String(x.position||r.position||'').toUpperCase();if(cat==='passing'&&(pos!=='QB'||r.starterVerified!==true))return null;return{...x,playerID:r.playerId||x.playerID||x.playerId,team:norm(r.team||x.team),position:pos,starterVerified:r.starterVerified===true,starterStatus:r.starterStatus||'VERIFIED_ROLE',roleSource:r.verification?.role?.source||null}}).filter(Boolean)}
async function gameEligibility(gameId,{date,home,away}={}){if(!gameId)return{blockedIds:new Set(),blockedNames:new Set(),rosterById:new Map(),rosterByName:new Map(),checked:false};try{const d=await json(ESPN+'/summary?event='+encodeURIComponent(gameId),{},1),comp=d.header?.competitions?.[0]||{},teams=comp.competitors||[],ids=new Set(teams.map(x=>String(x.team?.id||'')).filter(Boolean)),abbrs=new Set(teams.map(x=>String(x.team?.abbreviation||'').toUpperCase()).filter(Boolean)),
 teamIdsByAbbr=new Map(teams.map(x=>[nflCanonTeam(x.team?.abbreviation),String(x.team?.id||'')]).filter(x=>x[0]&&/^\d{1,5}$/.test(x[1])));let league=null;try{league=await json(ESPN+'/injuries',{},1)}catch(e){console.warn('league_injury_unavailable',String(e?.message||e))}const weekly=await nflWeeklyForGame({gameId,summary:d,competitors:teams});const injury=nflGameInjuryEvidence({summary:d,league,weekly,competitors:teams,checkedAt:new Date().toISOString()});const blockedIds=new Set(),blockedNames=new Set();for(const x of injury.injuries||[]){
 // A player on a current team injury/reserve/practice list stays OFF ALL
 // model parlay tiers until verified clearance arrives. Historical box scores
 // and an unconfirmed high-usage role cannot override this hard rule.
 if(!nflInjuryRecommendationHold(x))continue;
 if(x.playerId)blockedIds.add(String(x.playerId));
 for(const name of [x.name,...(x.aliases||[])])if(name)blockedNames.add(norm(name))
}const officialHolds=nflOfficialTransactionHolds({gameId,date,home,away});
for(const hold of officialHolds){
 blockedIds.add(hold.playerId);blockedNames.add(norm(hold.name));
}
const rosterHoldEvidence=[];
const rosterById=new Map(),rosterByName=new Map();await Promise.all([...abbrs].map(async abbr=>{try{const rd=await json(ESPN+'/teams/'+encodeURIComponent(abbr)+'/roster',{},1),athletes=nflCurrentRosterAthletes(rd);for(const a of athletes){const id=a.id,name=a.name,pos=a.position||'';
 if(nflRosterReserveHold(a)){
  blockedIds.add(id);blockedNames.add(norm(name));
  rosterHoldEvidence.push({playerId:id,name,team:abbr,status:'IR',
   source:'ESPN_CURRENT_ROSTER_RESERVE_STATUS',
   evidenceTier:'ESPN_ROSTER_RESERVE',section:'RESERVE',
   gameDesignationVerified:true});
 }
 if(id)rosterById.set(id,{team:abbr,name,pos});
 if(name)rosterByName.set(norm(name),{team:abbr,id,pos})
}}catch(e){console.error('current_roster_fetch_failed',abbr,String(e?.message||e))}}));return{blockedIds,blockedNames,rosterById,rosterByName,checked:injury.reportAvailable&&rosterById.size>0,injuryChecked:injury.reportAvailable,injuryCheckedAt:injury.checkedAt,officialInactivesVerified:false,teamIdsByAbbr,
 injuryEvidence:[...(injury.injuries||[]),...rosterHoldEvidence,
 ...officialHolds.map(x=>({playerId:x.playerId,name:x.name,
   team:x.team,status:'IR',source:x.source,
   evidenceTier:'TEAM_OFFICIAL_TRANSACTION',section:'RESERVE',
   gameDesignationVerified:true}))].slice(0,100).map(x=>({
  playerId:String(x.playerId||''),name:String(x.name||'').slice(0,110),
  team:String(x.team||''),status:String(x.status||'UNKNOWN'),
  source:String(x.source||injury.source||'ESPN injury/roster evidence').slice(0,120),
  evidenceTier:String(x.evidenceTier||'UNVERIFIED').slice(0,40),
  section:String(x.section||'UNKNOWN').slice(0,30),
  gameDesignationVerified:x.gameDesignationVerified===true
 })),
 source:injury.source+' + current team rosters'}}catch(e){console.error('game_eligibility_failed',String(e?.message||e));return{blockedIds:new Set(),blockedNames:new Set(),rosterById:new Map(),rosterByName:new Map(),checked:false}}}
function eligibilityFilter(rows,elig){if(!elig?.checked)return [];return(rows||[]).filter(x=>{const id=String(x.playerID||x.playerId||''),name=norm(x.name);if(elig.blockedIds.has(id)||elig.blockedNames.has(name))return false;const rr=elig.rosterById?.get(id)||elig.rosterByName?.get(name);if(!rr)return false;return !x.team||norm(nflCanonTeam(rr.team))===norm(nflCanonTeam(x.team))})}
function pruneSgpsForEligibility(sgps,elig,{gameId,home,away}={}){
 return guardFinalNflSgpCards(sgps,{
   blockedIds:elig?.blockedIds,blockedNames:elig?.blockedNames,
   normalizeName:norm,
   gameId,home,away,rosterChecked:elig?.checked===true,
   rosterById:elig?.rosterById,rosterByName:elig?.rosterByName
 });
}
function oddsApiCategory(k){return k==='player_anytime_td'?'td':k==='player_pass_yds'||k==='player_pass_yds_alternate'?'passing':k==='player_rush_yds'||k==='player_rush_yds_alternate'?'rushing':k==='player_reception_yds'||k==='player_reception_yds_alternate'?'receiving':k==='player_receptions'||k==='player_receptions_alternate'?'receptions':null}
function propLineRows(payload,eventID){
 const groups=new Map();
 for(const o of payload?.offers||[]){
  const book=o.book==='draftkings'?'DraftKings':o.book==='fanduel'?'FanDuel':null;
  const cat=oddsApiCategory(o.market);
  if(!book||!cat||!o.player||(!['Over','over'].includes(o.side)&&cat!=='td'))continue;
  if(String(o.player).includes('D/ST')||String(o.player).toLowerCase().includes('defense'))continue;
  const line=cat==='td'?null:Number(o.point);
  if(cat!=='td'&&(o.point===null||o.point===undefined||
    String(o.point).trim()===''||!Number.isFinite(line)||line<=0))continue;
  const odds=Number(o.americanOdds),checkedAt=o.updatedAt;
  if(!Number.isFinite(odds)||!checkedAt||Math.abs(Date.now()-Date.parse(checkedAt))>15*60*1000)continue;
  const k=[norm(o.player),cat,line??'td'].join('|');
  if(!groups.has(k))groups.set(k,{eventID,playerID:norm(o.player),name:o.player,team:'',marketName:o.market,statID:cat==='td'?'touchdowns':o.market,periodID:'game',betTypeID:cat==='td'?'yn':'ou',sideID:cat==='td'?'yes':'over',line,books:[],provider:'PropLine',providerEventId:String(payload?.event?.id||''),checkedAt});
  groups.get(k).books.push({book,odds,line,available:true,checkedAt,sourceProvider:'PropLine',sourceUrl:'https://prop-line.com',bookOutcomeId:o.bookOutcomeId||null,marketKey:o.market,outcomeName:o.outcomeName||null,outcomeDescription:o.outcomeDescription??null});
 }
 return [...groups.values()];
}
function oddsApiRows(d,eventID){
 const out=[];
 for(const b of d?.bookmakers||[]){const book=canonicalBook(b.key||b.title);if(!book)continue;for(const mk of b.markets||[]){const cat=oddsApiCategory(mk.key);if(!cat)continue;for(const o of mk.outcomes||[]){const side=String(o.description||o.name||'');const isTD=cat==='td',isOver=String(o.name||'').toLowerCase()==='over';if(!isTD&&!isOver)continue;const name=isTD?String(o.description||''):side;if(!name)continue;out.push({eventID,playerID:norm(name),name,team:'',marketName:mk.key,statID:cat==='td'?'touchdowns':mk.key,periodID:'game',betTypeID:isTD?'yn':'ou',sideID:isTD?'yes':'over',fairOdds:null,bookOdds:o.price??null,line:o.point??null,books:[{book,odds:o.price??null,line:o.point??null,available:true,checkedAt:mk.last_update||b.last_update||null,sourceProvider:'The Odds API',sourceBookmakerKey:b.key||null}],provider:'The Odds API',checkedAt:mk.last_update||b.last_update||null})}}}return out
}
// Distinct from request/response caches: a provider-wide hold is persisted in
// Blob so fresh serverless workers do not repeatedly spend an exhausted quota.
const PROVIDER_HOLD_PREFIX='momentum-nfl-provider-holds/v1/';
const PROVIDER_HOLD_MEMO=new Map(),PROVIDER_HOLD_MEMO_TTL=30*1000;
async function readMarketHold(provider){
 const now=Date.now(),memo=PROVIDER_HOLD_MEMO.get(provider);
 if(memo&&now-memo.checkedAt<PROVIDER_HOLD_MEMO_TTL)return memo.until>now?memo:null;
 let hold=null;
 try{
  const path=PROVIDER_HOLD_PREFIX+provider+'.json';
  const found=await list({prefix:path,limit:5});
  const blob=found.blobs?.find(x=>x.pathname===path);
  if(blob){const r=await timedFetch(blob.url,{cache:'no-store'});if(r.ok){const saved=await r.json();
   if(Number.isFinite(Number(saved.until))&&Number(saved.until)>now)
    hold={until:Number(saved.until),reason:String(saved.reason||'provider_cooldown')};
  }}
 }catch(e){console.warn('market_provider_hold_read_unavailable',provider,String(e?.message||e))}
 PROVIDER_HOLD_MEMO.set(provider,{checkedAt:now,until:hold?.until||0,reason:hold?.reason||null});
 return hold;
}
async function writeMarketHold(provider,delayMs,reason){
 const now=Date.now(),until=now+Math.max(0,Number(delayMs)||0);
 if(until<=now)return;
 PROVIDER_HOLD_MEMO.set(provider,{checkedAt:now,until,reason});
 try{await put(PROVIDER_HOLD_PREFIX+provider+'.json',JSON.stringify({until,reason,at:now}),
  {access:'public',addRandomSuffix:false,allowOverwrite:true});}
 catch(e){console.warn('market_provider_hold_write_unavailable',provider,String(e?.message||e))}
}
async function oddsApiFailure(r,stage){
 let code='';try{const data=await r.json();code=String(data?.error_code||data?.code||data?.message||'').slice(0,80)}catch{}
 const remaining=r.headers?.get('x-requests-remaining');
 const used=r.headers?.get('x-requests-used');
 const detail=[code&&('code='+code),remaining!==null&&('remaining='+remaining),used!==null&&('used='+used)].filter(Boolean).join('|');
 if(oddsMonthlyQuotaExhausted({code,remaining,status:r.status})){
  ODDS_QUOTA_BLOCKED_UNTIL=Date.now()+NFL_MARKET_HOLDS.oddsMonthlyRecheckMs;
  ODDS_QUOTA_DETAIL=detail||'monthly_credits_exhausted';
  await writeMarketHold('odds',NFL_MARKET_HOLDS.oddsMonthlyRecheckMs,'monthly_credits_exhausted');
 }
 return Error(['odds_api_'+stage+'_'+r.status,detail].filter(Boolean).join('|'));
}
async function oddsApiFallback(date,home,away,gameId){
 const key=process.env.THE_ODDS_API_KEY;if(!key)return null;if(Date.now()<ODDS_QUOTA_BLOCKED_UNTIL)throw Error('odds_api_quota_cooldown|'+ODDS_QUOTA_DETAIL);const sharedHold=await readMarketHold('odds');if(sharedHold)return null;
 const er=await timedFetch(ODDS+'/events?apiKey='+encodeURIComponent(key)+'&dateFormat=iso',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!er.ok)throw await oddsApiFailure(er,'events');const events=await er.json();
 const aliases={ARI:['ARI','ARIZONACARDINALS'],ATL:['ATL','ATLANTAFALCONS'],BAL:['BAL','BALTIMORERAVENS'],BUF:['BUF','BUFFALOBILLS'],CAR:['CAR','CAROLINAPANTHERS'],CHI:['CHI','CHICAGOBEARS'],CIN:['CIN','CINCINNATIBENGALS'],CLE:['CLE','CLEVELANDBROWNS'],DAL:['DAL','DALLASCOWBOYS'],DEN:['DEN','DENVERBRONCOS'],DET:['DET','DETROITLIONS'],GB:['GB','GREENBAYPACKERS'],HOU:['HOU','HOUSTONTEXANS'],IND:['IND','INDIANAPOLISCOLTS'],JAX:['JAX','JACKSONVILLEJAGUARS'],KC:['KC','KANSASCITYCHIEFS'],LAC:['LAC','LOSANGELESCHARGERS'],LAR:['LAR','LOSANGELESRAMS'],LV:['LV','LASVEGASRAIDERS'],MIA:['MIA','MIAMIDOLPHINS'],MIN:['MIN','MINNESOTAVIKINGS'],NE:['NE','NEWENGLANDPATRIOTS'],NO:['NO','NEWORLEANSSAINTS'],NYG:['NYG','NEWYORKGIANTS'],NYJ:['NYJ','NEWYORKJETS'],PHI:['PHI','PHILADELPHIAEAGLES'],PIT:['PIT','PITTSBURGHSTEELERS'],SEA:['SEA','SEATTLESEAHAWKS'],SF:['SF','SANFRANCISCO49ERS'],TB:['TB','TAMPABAYBUCCANEERS'],TEN:['TEN','TENNESSEETITANS'],WSH:['WSH','WASHINGTONCOMMANDERS']};const match=(name,abbr)=>(aliases[norm(abbr)]||[norm(abbr)]).includes(norm(name));
 const ev=(events||[]).find(x=>match(x.home_team,home)&&match(x.away_team,away));if(!ev){console.warn('nfl_sportsbook_event_not_found',JSON.stringify({date,home,away,gameId,providerEventCount:(events||[]).length}));return [];}
 const markets=['player_anytime_td','player_pass_yds','player_rush_yds','player_reception_yds','player_receptions'].join(',');
 const u=ODDS+'/events/'+encodeURIComponent(ev.id)+'/odds?apiKey='+encodeURIComponent(key)+'&regions=us&bookmakers=draftkings,fanduel&markets='+markets+'&oddsFormat=american';
 const r=await timedFetch(u,{cache:'no-store'});if(!r.ok)throw await oddsApiFailure(r,'markets');return oddsApiRows(await r.json(),gameId).map(x=>({...x,providerEventID:ev.id}))
}
async function oddsApiSlateFallback(date){const key=process.env.THE_ODDS_API_KEY;if(!key)return null;if(await readMarketHold('odds'))return [];const er=await timedFetch(ODDS+'/events?apiKey='+encodeURIComponent(key)+'&dateFormat=iso',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!er.ok)throw await oddsApiFailure(er,'events');const events=await er.json(),espn=await json(ESPN+'/scoreboard?dates='+date.replaceAll('-',''),{},1).catch(()=>({events:[]}));const wanted=new Set();for(const e of espn.events||[]){const cs=e.competitions?.[0]?.competitors||[],names=cs.map(x=>norm(x.team?.displayName||x.team?.shortDisplayName||x.team?.name||''));if(names.length===2)wanted.add(names.sort().join('|'))}const slate=(events||[]).filter(e=>wanted.has([norm(e.home_team),norm(e.away_team)].sort().join('|')));const markets=['player_anytime_td','player_pass_yds','player_rush_yds','player_reception_yds','player_receptions'].join(',');const chunks=[];for(let i=0;i<slate.length;i+=4){const part=await Promise.all(slate.slice(i,i+4).map(async ev=>{const u=ODDS+'/events/'+encodeURIComponent(ev.id)+'/odds?apiKey='+encodeURIComponent(key)+'&regions=us&bookmakers=draftkings,fanduel,betmgm,williamhill_us,betrivers,fanatics&markets='+markets+'&oddsFormat=american';try{const r=await timedFetch(u,{cache:'no-store'});if(!r.ok){const error=await oddsApiFailure(r,'slate_markets');console.warn('odds_slate_event_skipped',ev.id,error.message);return[]}return oddsApiRows(await r.json(),ev.id)}catch{return[]}}));chunks.push(...part.flat());if(i+4<slate.length)await sleep(100)}return chunks}
async function analyticsTdBoard(date){try{const sc=await json(ESPN+'/scoreboard?dates='+date.replaceAll('-',''));const evs=(sc.events||[]).filter(e=>!['STATUS_FINAL','STATUS_IN_PROGRESS'].includes(e.status?.type?.name));const teams=[],games=new Map();for(const ev of evs){const cs=ev.competitions?.[0]?.competitors||[],pair=cs.map(x=>String(x.team?.abbreviation||'').toUpperCase()).filter(Boolean);for(const comp of cs){const abbr=String(comp.team?.abbreviation||'').toUpperCase();if(abbr){teams.push({abbr,eventID:String(ev.id)});games.set(abbr,pair.find(x=>x!==abbr)||'')}}}const unique=[...new Map(teams.map(x=>[x.abbr,x])).values()];const season=Number(date.slice(0,4));const statsBoard=await json(ESPN+'/scoreboard?dates='+season+'&seasontype=2&week=1&limit=100').catch(()=>({events:[]}));const currentWeek=Number(sc.week?.number||sc.events?.[0]?.week?.number||0);const lastCompletedWeek=currentWeek>=1&&currentWeek<=18?Math.max(1,currentWeek-1):3;const completed=[];for(let w=1;w<=lastCompletedWeek;w++){const bd=w===1?statsBoard:await json(ESPN+'/scoreboard?dates='+season+'&seasontype=2&week='+w+'&limit=100').catch(()=>({events:[]}));for(const e of bd.events||[])if(String(e.status?.type?.state||'').toLowerCase()==='post')completed.push(String(e.id))}const usage=new Map();for(let i=0;i<completed.length;i+=6){const chunk=completed.slice(i,i+6),sums=await Promise.all(chunk.map(id=>json(ESPN+'/summary?event='+id,{},1).catch(()=>null)));for(const s of sums.filter(Boolean)){for(const block of s.boxscore?.players||[]){for(const group of block.statistics||[]){const gn=String(group.name||group.displayName||'').toLowerCase(),labels=(group.labels||group.names||[]).map(x=>String(x).toUpperCase());for(const row of group.athletes||[]){const id=String(row.athlete?.id||row.id||'');if(!id)continue;const vals=row.stats||[],m={};labels.forEach((k,j)=>m[k]=Number(String(vals[j]??0).replace(/[^0-9.-]/g,''))||0);const u=usage.get(id)||{games:new Set(),rush:0,targets:0,rec:0,rushTD:0,recTD:0};if(gn.includes('rushing')){u.rush+=m.CAR||m.ATT||0;u.rushTD+=m.TD||0}if(gn.includes('receiv')){u.targets+=m.TGTS||m.TGT||0;u.rec+=m.REC||0;u.recTD+=m.TD||0}u.games.add(String(s.header?.id||s.header?.competitions?.[0]?.id||s.header?.competitions?.[0]?.date||i));usage.set(id,u)}}}}}let injuryGroups=[];try{const inj=await json(ESPN+'/injuries',{},1);injuryGroups=inj.injuries||inj.items||[]}catch{}const blocked=new Set(),questionable=new Set();for(const g of injuryGroups)for(const x of g.injuries||[]){const id=String(x.athlete?.id||''),st=String(x.status||x.details?.status||'').toLowerCase();if(!id)continue;if(st.includes('out')||st.includes('injured reserve')||st==='ir'||st.includes('doubt'))blocked.add(id);else if(st.includes('question'))questionable.add(id)}const results=await Promise.all(unique.map(async t=>{try{const rd=await json(ESPN+'/teams/'+encodeURIComponent(t.abbr)+'/roster',{},1),groups=Array.isArray(rd.athletes)?rd.athletes:[],roster=groups.flatMap(g=>Array.isArray(g.items)?g.items:Array.isArray(g.athletes)?g.athletes:[]);return roster.filter(a=>['RB','WR','TE','QB'].includes(a.position?.abbreviation||a.position?.name||'')&&!blocked.has(String(a.id||''))).map(a=>{const id=String(a.id||''),pos=a.position?.abbreviation||a.position?.name||'',u=usage.get(id)||{games:new Set(),rush:0,targets:0,rec:0,rushTD:0,recTD:0},opp=games.get(t.abbr)||'',opps=u.rush+u.targets,totalTD=u.rushTD+u.recTD;const evidence=opps>=5||totalTD>0;if(!evidence)return null;const gp=Math.max(1,u.games.size),oppPG=opps/gp,tdPG=totalTD/gp,tdPerOpp=totalTD/Math.max(1,opps),rushShare=u.rush/Math.max(1,opps),targetShare=u.targets/Math.max(1,opps);const volume=Math.min(24,oppPG*2.2),scoring=Math.min(28,tdPG*24+tdPerOpp*35),role=Math.min(10,(rushShare*.55+targetShare*.45)*10),score=Math.max(1,Math.min(99,34+volume+scoring+role-(questionable.has(id)?12:0)));return{playerID:id,name:a.displayName||a.fullName||a.name||'Unknown',team:t.abbr,opponent:opp,position:pos,eventID:t.eventID,marketName:'analytics_anytime_td_candidate',statID:'touchdowns',periodID:'game',betTypeID:'analytics',sideID:'candidate',books:[],analyticsOnly:true,injuryStatus:questionable.has(id)?'QUESTIONABLE':'ACTIVE',confidence:Math.round(score),evidence:{games:gp,opportunities:opps,opportunitiesPerGame:Number(oppPG.toFixed(1)),rushAttempts:u.rush,targets:u.targets,touchdowns:totalTD,touchdownsPerGame:Number(tdPG.toFixed(2)),touchdownsPerOpportunity:Number(tdPerOpp.toFixed(3))},verifiedAt:new Date().toISOString(),reason:oppPG.toFixed(1)+' rush/target opportunities per game, '+totalTD+' TD in '+gp+' completed-game sample ('+tdPG.toFixed(2)+' TD/game); current roster/injury eligible. Sportsbook line not required for model ranking.'}}).filter(Boolean)}catch{return[]}}));return results.flat().sort((x,y)=>y.confidence-x.confidence||y.evidence.touchdowns-x.evidence.touchdowns||y.evidence.opportunities-x.evidence.opportunities).slice(0,60)}catch(e){console.error('analytics_td_fallback_failed',String(e?.message||e));return[]}}
async function slateRosterPositions(teams){const out=new Map();for(let i=0;i<teams.length;i+=6){const chunk=teams.slice(i,i+6),rs=await Promise.all(chunk.map(async team=>{try{const d=await json(ESPN+'/teams/'+encodeURIComponent(team)+'/roster',{},1),m=[];for(const g of d.athletes||[]){const gp=String(g.position?.abbreviation||g.position?.name||'').toUpperCase();for(const a of (g.items||g.athletes||[])){const id=String(a.id||a.athlete?.id||''),p=String(a.position?.abbreviation||a.athlete?.position?.abbreviation||gp||'').toUpperCase();if(id&&['QB','RB','WR','TE'].includes(p))m.push([id,p])}}return m}catch{return[]}}));rs.flat().forEach(([id,p])=>out.set(id,p))}return out}
async function analyticsStatBoards(date,focusTeams=[]){const season=Number(date.slice(0,4)),teamScope=focusTeams.map(norm).filter(Boolean).sort(),cacheKey='season-'+season+'-slate-'+date+'-teams-'+teamScope.join('-');const cached=ANALYTICS_CACHE.get(cacheKey);if(cached&&Date.now()-cached.at<ANALYTICS_TTL)return cached.data;try{const sc=await json(ESPN+'/scoreboard?dates='+date.replaceAll('-',''),{},1),slateTeams=new Map();for(const e of sc.events||[]){if(String(e.status?.type?.state||'').toLowerCase()==='post')continue;for(const x of e.competitions?.[0]?.competitors||[]){const a=norm(x.team?.abbreviation);if(a&&(!teamScope.length||teamScope.includes(a)))slateTeams.set(a,{eventID:String(e.id),opponent:norm((e.competitions?.[0]?.competitors||[]).find(y=>y!==x)?.team?.abbreviation)})}}const rosterPos=await slateRosterPositions([...slateTeams.keys()]);
const currentTeamByPlayer=new Map();
for(let i=0;i<[...slateTeams.keys()].length;i+=6){const chunk=[...slateTeams.keys()].slice(i,i+6),rs=await Promise.all(chunk.map(async team=>{try{const d=await json(ESPN+'/teams/'+encodeURIComponent(team)+'/roster',{},1),ids=[];for(const g of d.athletes||[])for(const a of (g.items||g.athletes||[])){const id=String(a.id||a.athlete?.id||'');if(id)ids.push(id)}return[team,ids]}catch{return[team,[]]}}));for(const [team,ids] of rs)for(const id of ids)currentTeamByPlayer.set(id,team)}
const games=[];const activeWeek=Number(sc.week?.number||sc.events?.[0]?.week?.number||1);const lastHistoricalWeek=Math.max(0,Math.min(18,activeWeek-1));for(let w=1;w<=lastHistoricalWeek;w+=4){const weeks=Array.from({length:Math.min(4,lastHistoricalWeek-w+1)},(_,i)=>w+i);const boards=await Promise.all(weeks.map(week=>json(ESPN+'/scoreboard?dates='+season+'&seasontype=2&week='+week+'&limit=100',{},1).catch(()=>({events:[]}))));for(const b of boards)for(const e of b.events||[])if(String(e.status?.type?.state||'').toLowerCase()==='post'&&Date.parse(e.date||0)<Date.now()&&(!teamScope.length||(e.competitions?.[0]?.competitors||[]).some(x=>teamScope.includes(norm(x.team?.abbreviation)))))games.push(String(e.id))}const historyIds=teamScope.length?games.slice(-16):games.slice(-48);const stats=new Map(),seen=new Map();for(let i=0;i<historyIds.length;i+=12){const sums=await Promise.all(historyIds.slice(i,i+12).map(id=>json(ESPN+'/summary?event='+id,{},1).catch(()=>null)));for(const s of sums.filter(Boolean)){const gid=String(s.header?.id||s.header?.competitions?.[0]?.id||'');for(const block of s.boxscore?.players||[]){const historicalTeam=norm(block.team?.abbreviation);if(!slateTeams.has(historicalTeam))continue;for(const group of block.statistics||[]){const gn=String(group.name||group.displayName||'').toLowerCase(),labels=(group.labels||group.names||[]).map(x=>String(x).toUpperCase());for(const row of group.athletes||[]){const id=String(row.athlete?.id||row.id||'');if(!id||!rosterPos.has(id))continue;const key=id+'|'+gid+'|'+gn;if(seen.has(key))continue;seen.set(key,1);const vals=row.stats||[],m={};labels.forEach((k,j)=>m[k]=Number(String(vals[j]??0).replace(/[^0-9.-]/g,''))||0);const rowPos=String(row.athlete?.position?.abbreviation||row.position?.abbreviation||rosterPos.get(id)||'').toUpperCase();const team=currentTeamByPlayer.get(id)||historicalTeam;if(!slateTeams.has(team))continue;const u=stats.get(id)||{playerID:id,name:row.athlete?.displayName||row.athlete?.fullName||'Unknown',team,position:['QB','RB','WR','TE'].includes(rowPos)?rowPos:'',games:new Set(),gameStats:new Map(),passing:0,rushing:0,receiving:0,receptions:0,targets:0,rushingAttempts:0,rushTouchdowns:0,receivingTouchdowns:0};if(!u.position&&['QB','RB','WR','TE'].includes(rowPos))u.position=rowPos;u.games.add(gid);if(gn.includes('passing'))u.passing+=m.YDS||0;if(gn.includes('rushing')){u.rushing+=m.YDS||0;u.rushingAttempts+=m.CAR||m.ATT||0;u.rushTouchdowns+=m.TD||0;}if(gn.includes('receiv')){u.receiving+=m.YDS||0;u.receptions+=m.REC||m.RECEPTIONS||0;u.targets+=m.TGTS||m.TGT||m.TAR||m.TARGETS||0;u.receivingTouchdowns+=m.TD||0}const gs=u.gameStats.get(gid)||{gameId:gid,date:String(s.header?.competitions?.[0]?.date||s.header?.season?.year||''),passing:0,rushing:0,receiving:0,receptions:0,targets:0,rushTouchdowns:0,receivingTouchdowns:0};if(gn.includes('passing'))gs.passing=m.YDS||0;if(gn.includes('rushing')){gs.rushing=m.YDS||0;gs.rushTouchdowns=m.TD||0}if(gn.includes('receiv')){gs.receiving=m.YDS||0;gs.receptions=m.REC||m.RECEPTIONS||0;gs.targets=m.TGTS||m.TGT||m.TAR||m.TARGETS||0;gs.receivingTouchdowns=m.TD||0}u.gameStats.set(gid,gs);stats.set(id,u)}}}}}const out={passing:[],rushing:[],receiving:[],receptions:[],td:[]};for(const u of stats.values()){const gp=Math.max(1,u.games.size),usagePerGame={rushYards:Number((u.rushing/gp).toFixed(1)),recYards:Number((u.receiving/gp).toFixed(1)),receptions:Number((u.receptions/gp).toFixed(1)),targets:Number((u.targets/gp).toFixed(1))},base={playerID:u.playerID,name:u.name,team:u.team,position:u.position||'',opponent:slateTeams.get(u.team)?.opponent||'',eventID:slateTeams.get(u.team)?.eventID||'',analyticsOnly:true,books:[],usagePerGame,verifiedAt:new Date().toISOString()};out.td.push({...base,gamesPlayed:gp,perGame:Number(((u.rushingAttempts+u.targets)/gp).toFixed(1)),rushingAttempts:u.rushingAttempts,targets:u.targets,rushTouchdowns:u.rushTouchdowns,receivingTouchdowns:u.receivingTouchdowns,last5Touchdowns:[...u.gameStats.values()].slice(-5).map(g=>(g.rushTouchdowns||0)+(g.receivingTouchdowns||0))});for(const cat of ['passing','rushing','receiving','receptions']){const total=cat==='receptions'?u.receptions:u[cat],avg=total/gp;if(total<=0)continue;const gameRows=[...u.gameStats.values()],vals=gameRows.map(g=>Number(g[cat])||0),recent=vals.slice(-10),l5=recent.slice(-5),mean=recent.length?recent.reduce((a,b)=>a+b,0)/recent.length:avg,variance=recent.length?recent.reduce((s,v)=>s+(v-mean)**2,0)/recent.length:0,sd=Math.sqrt(variance),floor=Math.max(0,mean-sd),ceiling=mean+sd,trend=l5.length>=3?l5.reduce((a,b)=>a+b,0)/l5.length-mean:null;out[cat].push({...base,category:cat,seasonTotal:total,gamesPlayed:gp,perGame:Number(avg.toFixed(1)),projection:Number((cat==='receptions'?avg:Math.round(avg)).toFixed(cat==='receptions'?1:0)),projectionUnit:cat==='receptions'?'receptions':'yards',projectionMethod:'completed-game per-game production baseline',range:{floor:Number(floor.toFixed(1)),projection:Number(mean.toFixed(1)),ceiling:Number(ceiling.toFixed(1)),sample:recent.length},recentForm:{last5:l5.map(v=>Number(v.toFixed(1))),last10:recent.map(v=>Number(v.toFixed(1))),trend:trend==null?null:Number(trend.toFixed(1)),label:l5.length<3?'EARLY_SAMPLE':trend>5?'UP':trend<-5?'DOWN':'STEADY',sample:recent.length},targets:u.targets,receptions:u.receptions,confidence:Math.max(35,Math.min(95,Math.round(45+Math.min(35,avg/(cat==='passing'?10:cat==='receptions'?.25:3))))),reason:'Projected '+(cat==='receptions'?avg.toFixed(1):Math.round(avg))+' '+(cat==='receptions'?'receptions':cat+' yards')+' from '+gp+' completed-game production sample ('+avg.toFixed(1)+' per game baseline). Current slate/team eligible. Sportsbook line attaches separately when verified.'})}}for(const cat of Object.keys(out))out[cat]=out[cat].sort((a,b)=>b.perGame-a.perGame).slice(0,60).map((x,i)=>({...x,rank:i+1}));ANALYTICS_CACHE.set(cacheKey,{at:Date.now(),data:out});return out}catch(e){console.error('analytics_stat_boards_failed',String(e?.message||e));return{passing:[],rushing:[],receiving:[],receptions:[],td:[]}}}
async function sgoUsage(key){try{const r=await timedFetch('https://api.sportsgameodds.com/v2/account/usage',{headers:{'x-api-key':key},cache:'no-store'});if(!r.ok)return null;const d=await r.json();return d?.data||null}catch{return null}}
async function allEvents(date){let cached=CACHE.get(date),now=Date.now();if(!cached){cached=await readSnapshot(date);if(cached){CACHE.set(date,cached)}}if(cached&&now-cached.at<TTL)return cached.events;const sharedHold=await readMarketHold('sgo');if(sharedHold){const err=new Error('sportsbook_rate_limited_no_snapshot');err.retryAfterSeconds=Math.ceil((sharedHold.until-now)/1000);throw err}const pending=await readMarketHold('sgo-request-'+date);if(pending){const err=new Error('sportsbook_backup_recently_checked');err.retryAfterSeconds=Math.ceil((pending.until-now)/1000);throw err}const blockedUntil=BACKOFF.get(date)||0;if(now<blockedUntil){if(cached&&now-cached.at<MARKET_SNAPSHOT_TTL)return cached.events;const err=new Error('sportsbook_rate_limited_no_snapshot');err.retryAfterSeconds=Math.ceil((blockedUntil-now)/1000);throw err}const key=process.env.SPORTSGAMEODDS_API_KEY;if(!key)throw new Error('missing_api_key');const baseUrl=new URL(SGO);baseUrl.searchParams.set('leagueID','NFL');baseUrl.searchParams.set('oddsAvailable','true');baseUrl.searchParams.set('limit','100');baseUrl.searchParams.set('startsAfter',date+'T00:00:00Z');const e=new Date(date+'T23:59:59Z');e.setUTCHours(e.getUTCHours()+6);baseUrl.searchParams.set('startsBefore',e.toISOString());let events=[],cursor=null,pages=0;LAST_CALL.set(date,now);await writeMarketHold('sgo-request-'+date,MIN_UPSTREAM_GAP,'backup_request_budget');try{do{const u=new URL(baseUrl);if(cursor)u.searchParams.set('cursor',cursor);const d=await json(u,{headers:{'x-api-key':key}},3);const page=Array.isArray(d?.data)?d.data:Array.isArray(d)?d:[];events.push(...page);cursor=d?.nextCursor||null;pages++;if(!page.length)break}while(cursor&&pages<1);const byId=new Map();for(const ev of events){const id=String(ev?.eventID||ev?.id||'');if(id&&!byId.has(id))byId.set(id,ev)}events=byId.size?[...byId.values()]:events;CACHE.set(date,{at:Date.now(),events});await writeSnapshot(date,events);BACKOFF.delete(date);return events}catch(e){if(String(e.message||e).includes('upstream_429')){const usage=await sgoUsage(key);if(usage)e.sgoUsage=usage;const delayMs=sgoRateLimitHoldMs({retryAfterSeconds:e.retryAfterSeconds,usage});e.providerHoldMs=delayMs;BACKOFF.set(date,Date.now()+delayMs);await writeMarketHold('sgo',delayMs,'rate_limited')}if(cached&&now-cached.at<MARKET_SNAPSHOT_TTL)return cached.events;if(String(e.message||e).includes('upstream_429')){const err=new Error('sportsbook_rate_limited_no_snapshot');err.retryAfterSeconds=Math.ceil((e.providerHoldMs||RATE_BACKOFF)/1000);err.sgoUsage=e.sgoUsage||null;throw err}throw e}}
export default async function handler(req,res){res.removeHeader('Pragma');res.removeHeader('Expires');Object.entries(NS).forEach(([k,v])=>res.setHeader(k,v));let requestStage='initializing';const requestStarted=Date.now();const hardDeadline=setTimeout(()=>{if(!res.headersSent&&!res.writableEnded){console.error('nfl_markets_request_deadline_exceeded',JSON.stringify({stage:requestStage,elapsedMs:Date.now()-requestStarted,gameId:String(req.query?.gameId||'').slice(0,24)}));res.setHeader('Cache-Control','no-store');res.status(503).json({ok:false,error:'market_refresh_timeout',retryable:true,degraded:true,fetchedAt:new Date().toISOString()})}},45000);res.once('close',()=>clearTimeout(hardDeadline));try{let gameId=String(req.query.gameId||''),date=String(req.query.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({ok:false,error:'date_required'});// Legacy tier/cache contract sentinel. The shared public schema must always
 // match the builder version; fail rather than publish under a different key.
 const CACHE_SCHEMA='v92-strict-nuke-profit-20261011'+'-nuke-roster-adaptive-1-game-identity-2'+'-day-ahead-roles-v5-teamid-depthchart'+'-public-quote-scrub-v1'+'-official-reserve-holds-v1'+'-model-hit-chance-v1'+'-injury-list-hardgate-v1'+'-model-sgp-response-v2'+'-roster-hardgate-v1'+'-adaptive-short-nuke-v1'+'-all-tier-adaptive-v1'+'-nuke-10leg-v1'+'-nuke-cache-10leg-fix'+'-website-only-sportsbook-sources-20261017'+'-strict-no-unlisted-sgp-props-20261017';
 if(CACHE_SCHEMA!==NFL_SGP_SNAPSHOT_SCHEMA)throw Error('snapshot_schema_mismatch');
 const responseKey=gameId?nflSgpSnapshotKey(date,gameId):
 (NFL_SGP_SNAPSHOT_SCHEMA+'-'+date+'-auto').replace(/[^A-Za-z0-9_-]/g,'');const clientCachePolicy=gameId?EDGE_GAME:EDGE_GOOD;requestStage='snapshot_read';const saved=await Promise.race([readResponseSnapshot(responseKey,date,gameId),new Promise(resolve=>setTimeout(()=>resolve(null),2500))]);if(shouldServeCachedNflMarkets(saved,req,{secret:process.env.CRON_SECRET,ttl:TTL})){res.setHeader('X-Momentum-Cache','HIT');res.setHeader('X-Momentum-Snapshot-Version',String(saved.at));res.setHeader('Cache-Control',clientCachePolicy);res.setHeader('CDN-Cache-Control',clientCachePolicy);res.setHeader('Vercel-CDN-Cache-Control',clientCachePolicy);return res.status(200).json(nflVerifiedOnlySgpResponse(saved.body))}if(!gameId){const empty={td:[],passing:[],rushing:[],receiving:[],receptions:[]};const body={ok:true,scope:'slate',gameId:null,date,categories:empty,sgps:{},provider:'Slate metadata only',degraded:true,analyticsAvailable:false,marketRows:0,oddsDebug:{stage:'slate_fast_path',note:'Use per-game NFL markets for verified player props and SGPs; slate response does not claim sportsbook coverage'},validation:{sgpEligibleMarketRows:0,bookSpecificSgpsRequired:true,combinedBookSgpQuoteAvailable:false},fetchedAt:new Date().toISOString()};res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=120');res.setHeader('X-Momentum-Data','SLATE_METADATA_ONLY');return res.status(200).json(body)}let home='',away='';
 let kickoff=null;
 if(gameId){const s=await json(ESPN+'/summary?event='+encodeURIComponent(gameId));const c=s.header?.competitions?.[0]||{},cs=c.competitors||[];home=cs.find(x=>x.homeAway==='home')?.team?.abbreviation||'';away=cs.find(x=>x.homeAway==='away')?.team?.abbreviation||'';kickoff=c.date||null}
 let events=[],provider='Analytics / ESPN',directRows=null,oddsDebug={attempted:false,stage:'model_primary'};
 const signedPropLineRows=[];
 let authorizedChange=false,verifiedToken='';
 // Privileged early slate priming skips all paid sportsbook integrations.
 // A public ?modelOnly=1 alone is not authorized to bypass normal policy.
 const modelOnlyPrimer=String(req.query?.modelOnly||'')==='1'&&
  Boolean(process.env.CRON_SECRET)&&
  String(req.headers?.authorization||'')==='Bearer '+process.env.CRON_SECRET;
 const sgoFlag=String(process.env.SPORTSGAMEODDS_ENABLED||'').toLowerCase();
 const sgoEnabled=Boolean(process.env.SPORTSGAMEODDS_API_KEY)&&sgoFlag!=='false'&&!modelOnlyPrimer&&!DIRECT_PUBLIC_ODDS_ONLY;
 oddsDebug.primaryConfigured=!DIRECT_PUBLIC_ODDS_ONLY&&Boolean(process.env.THE_ODDS_API_KEY);oddsDebug.oddsApisDisabled=DIRECT_PUBLIC_ODDS_ONLY;oddsDebug.primarySource='Direct FanDuel and DraftKings websites';oddsDebug.reserveConfigured=sgoEnabled;oddsDebug.requestedGameId=gameId||null;if(!gameId)oddsDebug.note='League slate uses ESPN analytics only; reserve sportsbook API is not queried.';
 if(gameId&&home&&away){
  if(modelOnlyPrimer)oddsDebug.stage='ESPN_MODEL_ONLY_SUNDAY_PRIMER';
  if(!modelOnlyPrimer&&DIRECT_PUBLIC_ODDS_ONLY)try{
   requestStage='first_party_sportsbook_websites';
   // A preview must never silently pull a production game's sportsbook
   // observations. Unknown deployment identity fails closed and remains model-only.
   const trustedOrigin=nflPublicBookTrustedOrigin(process.env);
   if(!trustedOrigin)throw Error('first_party_collector_deployment_identity_unverified');
   const url=trustedOrigin+'/api/nfl-public-book-research?date='+
    encodeURIComponent(date)+'&gameId='+encodeURIComponent(gameId);
   const response=await timedFetch(url,{cache:'no-store',signal:AbortSignal.timeout(12500)});
   if(!response.ok)throw Error('public_books_http_'+response.status);
   const research=await response.json();
   oddsDebug.directPublicResearchStatus=String(research.status||'UNKNOWN').slice(0,70);
   oddsDebug.directPublicSources=research.directSources||{};
   const names={td:'player_anytime_td',passing:'player_pass_yds',
    rushing:'player_rush_yds',receiving:'player_reception_yds',
    receptions:'player_receptions'};
   // DK Network's popular-props listing is only research, not a direct book offer.
   const exactSiteOffers=(Array.isArray(research.offers)?research.offers:[]).filter(o=>
    String(o.gameId||'')===String(gameId)&&
    ['DraftKings','FanDuel'].includes(o.book)&&
    typeof o.player==='string'&&o.player.length>2&&
    typeof o.playerID==='string'&&o.playerID.length>0&&
    names[o.category]&&
    (o.book==='DraftKings'?/^https:\/\/sportsbook\.draftkings\.com\//.test(o.sourceUrl):
     /^https:\/\/co\.sportsbook\.fanduel\.com\//.test(o.sourceUrl))&&
    Number.isFinite(Number(o.odds))&&Number(o.odds)!==0&&
    Number.isFinite(Date.parse(o.observedAt||''))&&
    (o.category==='td'||o.line!==null&&o.line!==undefined&&Number.isFinite(Number(o.line))));
   directRows=exactSiteOffers.map(o=>({
    eventID:gameId,playerID:o.playerID,name:o.player,team:o.team||'',
    position:o.position||'',marketName:names[o.category],
    statID:o.category==='td'?'touchdowns':o.category+' yards',
    periodID:'game',betTypeID:o.category==='td'?'yn':'ou',
    sideID:o.category==='td'?'yes':'over',
    books:[{book:o.book,available:true,odds:Number(o.odds),
     line:o.category==='td'?null:Number(o.line),checkedAt:o.observedAt,
     sourceUrl:o.sourceUrl,sourceProvider:'Direct official sportsbook webpage'}],
    provider:'Direct official sportsbook webpage'}));
   provider='DraftKings / FanDuel official public sites';
   oddsDebug.primaryMarketRows=directRows.length;
   oddsDebug.stage=directRows.length?'first_party_web_lines_observed':
    'first_party_web_no_eligible_lines';
  }catch(e){
   oddsDebug.stage='first_party_web_collection_unreadable';
   oddsDebug.directPublicFailure=String(e?.message||e).slice(0,120);
   directRows=[];
  }

  // Ordinary reads try the configured market provider only. The SGO reserve
  // budget is never touched by routine UI polls or manual "Refresh" clicks.
  if(!modelOnlyPrimer&&!DIRECT_PUBLIC_ODDS_ONLY)try{
   requestStage='primary_book_provider';const alt=await oddsApiFallback(date,home,away,gameId);
   if(Array.isArray(alt)&&alt.length){directRows=alt;provider='The Odds API';oddsDebug.stage='primary_market_ready'}
   else {oddsDebug.stage='primary_market_unavailable';oddsDebug.primaryMarketRows=0;oddsDebug.primaryFailureReason='No exact DraftKings/FanDuel player prop rows returned for this ESPN matchup';}
  }catch(e){
   oddsDebug.attempted=true;oddsDebug.stage='primary_market_degraded';
   oddsDebug.error=String(e?.message||e);
   console.warn('primary_market_degraded',oddsDebug.error);
  }
  // PropLine credits are reserved for verified roster/offense/defense change events.
  // Public page reads, routine refreshes and missing primary odds never spend credits.
  const changeType=String(req.query.changeType||'').toLowerCase();
  const allowedChange=new Set(['player_injury','player_inactive','qb_change','offense_change','defense_change','depth_chart_change','scheduled_checkpoint']);
  const auth=String(req.headers.authorization||'');
  verifiedToken=String(req.headers['x-momentum-change-token']||'');
  authorizedChange=Boolean(process.env.CRON_SECRET)&&auth==='Bearer '+process.env.CRON_SECRET&&allowedChange.has(changeType)&&/^[a-f0-9]{64}$/.test(verifiedToken); // PropLine validates stored evidence and atomically claims it.
  oddsDebug.aiInWorkflow=Boolean(process.env.GROQ_API_KEY);
  oddsDebug.sportsbookStatus='verified_market_data_pending';
  oddsDebug.propLineCreditPolicy='verified_change_or_signed_checkpoint_only';
  oddsDebug.propLineChangeType=authorizedChange?changeType:null;
  if(process.env.PLAYER_PROPS_API_KEY&&authorizedChange&&!DIRECT_PUBLIC_ODDS_ONLY){
   try{
    const propDeploymentHost=String(process.env.VERCEL_URL||'').toLowerCase();
    const propProductionHost=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'').toLowerCase();
    const propTrustedHost=/^momentum-radar-live-[a-z0-9-]+\.vercel\.app$/.test(propDeploymentHost)||
     propDeploymentHost==='momentum-radar-live.vercel.app'?propDeploymentHost:
     process.env.VERCEL_ENV==='production'&&propProductionHost==='momentum-radar-live.vercel.app'?propProductionHost:'';
    if(!propTrustedHost)throw Error('untrusted_prop_line_origin');
    const trustedPropOrigin='https://'+propTrustedHost;
    const propUrl=trustedPropOrigin+'/api/prop-line-markets?league=nfl&date='+date+'&gameId='+encodeURIComponent(gameId);
    const propResult=await Promise.race([(async()=>{const r=await timedFetch(propUrl,{cache:'no-store',headers:{Authorization:'Bearer '+process.env.CRON_SECRET,'x-momentum-change-token':verifiedToken}});return r.ok?await r.json():{ok:false,providerUnavailable:true}})(),new Promise(resolve=>setTimeout(()=>resolve({ok:false,providerUnavailable:true,reason:'collector_deadline_exceeded'}),16500))]);
    // Never convert an unavailable provider response or unmatched event into
    // the misleading claim that a valid book returned zero selections.
    if(propResult?.providerUnavailable||propResult?.ok===false){
     oddsDebug.propLineStage='provider_response_unavailable';
     oddsDebug.propLineFailureReason=String(propResult?.error||propResult?.reason||'upstream_unavailable').slice(0,80);
     oddsDebug.propLineProviderStatus=Number(propResult?.providerStatus)||null;
    }
    else if(propResult?.status==='event_not_matched')
     oddsDebug.propLineStage='event_not_matched';
    const offers=propLineRows(propResult,gameId);
    if(offers.length){signedPropLineRows.push(...offers);
     directRows=mergeAuthorizedPropLineRows(directRows,offers);
     provider=provider==='Analytics / ESPN'?'PropLine':provider+' + PropLine';
     oddsDebug.stage='prop_line_market_ready';oddsDebug.propLineRows=offers.length}
    else if(!oddsDebug.propLineStage) oddsDebug.propLineStage='no_current_verified_offers';
   }catch(e){oddsDebug.propLineStage='provider_unavailable';console.warn('prop_line_fallback_unavailable',String(e?.message||e))}
  }
  // "Available" means enough real yardage markets for the diversified SGP
  // builder, not simply one isolated TD offer from a single sportsbook.
  const yardOffers=(directRows||[]).filter(m=>['passing','rushing','receiving'].includes(category(m))&&
   (bookFor(m,'DraftKings')||bookFor(m,'FanDuel')));
  const primaryBooksReady=new Set(yardOffers.map(category)).size>=2&&
   new Set(yardOffers.map(m=>norm(m.playerID||m.name))).size>=3;
  const backupAllowed=sgoEnabled&&shouldUseSgoBackup({
   gameId,kickoff,finalCheck:/^(1|true)$/i.test(String(req.query.finalCheck||'')),
   lockRun:/^(1|true)$/i.test(String(req.query.lockRun||'')),
   primaryBooksReady
  });
  oddsDebug.sgoRole='reserve_only';oddsDebug.backupEligible=backupAllowed;
  if(backupAllowed){
   try{
    events=await allEvents(date);
    const matches=events.filter(e=>{
     const h=e.teams?.home||{},a=e.teams?.away||{};
     return [h.teamID,h.names?.short,h.names?.medium,h.names?.long].map(norm).includes(norm(home))&&
       [a.teamID,a.names?.short,a.names?.medium,a.names?.long].map(norm).includes(norm(away))
    });
    const rows=matches.flatMap(e=>Object.values(e.odds||{}).filter(o=>
      o&&!['all','home','away'].includes(String(o.statEntityID||'').toLowerCase())).map(o=>market(o,e.eventID||e.id)));
    if(rows.some(m=>bookFor(m,'DraftKings')||bookFor(m,'FanDuel'))){
     directRows=mergeAuthorizedPropLineRows(rows.map(x=>({...x,providerEventID:x.eventID,eventID:gameId})),signedPropLineRows);provider=signedPropLineRows.length?'SportsGameOdds (backup) + PropLine':'SportsGameOdds (backup)';oddsDebug.stage='sgo_backup_market_ready'
    }else oddsDebug.stage='sgo_backup_no_market';
   }catch(e){
    oddsDebug.stage='sgo_backup_unavailable';oddsDebug.sgoError=String(e?.message||e);
    oddsDebug.sgoRetryAfter=Number(e?.retryAfterSeconds)||null;
    oddsDebug.sgoUsage=e?.sgoUsage||null;
    console.warn('sgo_backup_skipped',oddsDebug.sgoError);
   }
  }else if(!primaryBooksReady&&!DIRECT_PUBLIC_ODDS_ONLY){oddsDebug.backupReason=sgoEnabled?'Reserved for signed scheduled checkpoint or final pregame refresh; ordinary browser reload does not invoke backup provider.':'Backup sportsbook provider is not configured.';oddsDebug.stage=sgoEnabled?'backup_reserved':'backup_not_configured';}
 }let chosen=events;if(gameId)chosen=events.filter(e=>{const h=e.teams?.home||{},a=e.teams?.away||{};const hs=[h.teamID,h.names?.short,h.names?.medium,h.names?.long].map(norm),as=[a.teamID,a.names?.short,a.names?.medium,a.names?.long].map(norm);return hs.includes(norm(home))&&as.includes(norm(away))});const rawRows=directRows||chosen.flatMap(e=>Object.values(e.odds||{}).filter(o=>o&&!['all','home','away'].includes(String(o.statEntityID||'').toLowerCase())).map(o=>market(o,e.eventID||e.id)));const emptyStatBoards={passing:[],rushing:[],receiving:[],receptions:[],td:[]};
// ESPN's matchup summary collection involves team rosters plus completed
// games. A six-second race could silently discard ALL rushing and passing
// projections even though ESPN's completed-game evidence existed.
const HISTORICAL_STAT_BOARDS_TIMEOUT_MS=18000;
let historicalStatBoardsTimedOut=false;
const statBoardsPromise=gameId?Promise.race([
 analyticsStatBoards(date,[home,away]),
 new Promise(resolve=>setTimeout(()=>{
  historicalStatBoardsTimedOut=true;
  resolve(emptyStatBoards);
 },HISTORICAL_STAT_BOARDS_TIMEOUT_MS))
]):Promise.resolve(emptyStatBoards);const base=process.env.VERCEL_PROJECT_PRODUCTION_URL?'https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL:'https://momentum-radar-live.vercel.app';requestStage='eligibility_and_roles';const [eligibility,roles]=await Promise.all([Promise.race([gameEligibility(gameId,{date,home,away}),new Promise(resolve=>setTimeout(()=>resolve({blockedIds:new Set(),blockedNames:new Set(),rosterById:new Map(),rosterByName:new Map(),checked:false,injuryChecked:false,injuryEvidence:[],teamIdsByAbbr:new Map()}),10000))]),Promise.race([gameRoleGate(gameId,base),new Promise(resolve=>setTimeout(()=>resolve({checked:false,roles:new Map(),players:[]}),8500))])]);const rows=gameId?eligibilityFilter(rawRows,eligibility):rawRows;const categories={};for(const c of ['td','passing','rushing','receiving','receptions'])categories[c]=pickRows(rows,c,10);// Game-scoped model TD candidates are built below from the same already-loaded ESPN box scores.
const publicRefs=gameId?manualAtlNoTonightSgps(date,home,away)?.[0]?.publicMarketSnapshot?.references||[]:[];
// Public ATD observations must become real category rows even when an upstream API supplies no TD base row.
if(gameId&&categories.td.length===0){const seen=new Set();categories.td=publicRefs.filter(r=>String(r.market||'').toLowerCase().includes('anytime td')).map(r=>{const rr=roleFor(roles,{name:r.player})||null,key=norm(r.player);if(seen.has(key))return null;seen.add(key);return{name:r.player,playerID:rr?.playerId||key,team:rr?.team||'',position:rr?.position||'',eventID:gameId,category:'td',projection:'Anytime TD',projectionUnit:'touchdown',projectionMethod:'Momentum Radar TD matchup model + verified public sportsbook market',analyticsOnly:false,confidence:60,reason:'Verified current-game anytime touchdown market; final confidence is adjusted by role, usage, matchup and injury eligibility.'}}).filter(Boolean)}
const publicRefByPlayerCat=new Map();
for(const r of publicRefs){const mk=String(r.market||'').toLowerCase();let cat=mk.includes('passing yard')?'passing':mk.includes('rushing yard')?'rushing':mk.includes('receiving yard')?'receiving':mk.includes('reception')?'receptions':mk.includes('anytime td')?'td':'';if(!cat)continue;const key=norm(r.player)+'|'+cat,arr=publicRefByPlayerCat.get(key)||[];arr.push(r);publicRefByPlayerCat.set(key,arr)}
function publicOfferFor(name,cat){
 // Historical/public research references are NOT live sportsbook offers.
 // Do not elevate them to verified selections without a fresh event-scoped
 // observation, source URL, timestamp, and exact market identity.
 const refs=publicRefByPlayerCat.get(norm(name)+'|'+cat)||[];
 const now=Date.now();
 const r=refs.find(x=>{
  const checked=Date.parse(x.checkedAt||x.observedAt||'');
  const url=String(x.sourceUrl||'');
  return ['DraftKings','FanDuel'].includes(x.book)&&
   String(x.gameId||'')===String(gameId)&&
   Number.isFinite(checked)&&checked<=now&&now-checked<=15*60_000&&
   /^https:\/\/(?:sportsbook\.draftkings\.com|sportsbook\.fanduel\.com)\//.test(url)&&
   Number.isFinite(Number(x.odds))&&Number(x.odds)!==0&&
   (cat==='td'||Number.isFinite(Number(x.line)));
 });
 if(!r)return null;
 return{book:r.book,line:cat==='td'?null:Number(r.line),
  odds:Number(r.odds),checkedAt:r.checkedAt||r.observedAt,
  sourceUrl:r.sourceUrl,market:cat,available:true,verified:true};
}

requestStage='historical_stats';const statBoards=await statBoardsPromise;
 const countedByMarket=Object.fromEntries(['passing','rushing','receiving','receptions','td']
  .map(c=>[c,Array.isArray(statBoards[c])?statBoards[c].length:0]));
 oddsDebug.espnHistoricalStatBoards={
  source:'ESPN_COMPLETED_GAME_BOXSCORES',
  rowsByCategory:countedByMarket,
  timedOut:historicalStatBoardsTimedOut,
  status:historicalStatBoardsTimedOut?'ESPN_COLLECTION_TIMED_OUT':
   Object.values(countedByMarket).some(n=>n>0)?'COMPLETED_GAME_EVIDENCE_READY':
   'MISSING_COMPLETED_GAME_EVIDENCE'
 };
 // Audit game-scoped major-usage players before and after official roster
 // and role checks. This diagnoses incomplete ESPN player inventories without
 // allowing a missing athlete to bypass injury/roster verification.
 const rosterCandidateAudit=(statBoards.rushing||[])
  .filter(x=>String(x.eventID)===String(gameId)&&
   [norm(home),norm(away)].includes(norm(x.team)))
  .sort((a,b)=>(Number(b.usagePerGame?.rushYards)||0)-
   (Number(a.usagePerGame?.rushYards)||0))
  .slice(0,8).map(x=>{
   const id=String(x.playerID||''),name=norm(x.name);
   return{name:String(x.name||'').slice(0,65),team:String(x.team||''),
    position:String(x.position||''),avgRushingYards:x.usagePerGame?.rushYards,
    games:x.gamesPlayed,
    onESPNCurrentRoster:Boolean(eligibility?.rosterById?.has(id)||
     eligibility?.rosterByName?.has(name)),
    injuryHold:Boolean(eligibility?.blockedIds?.has(id)||
     eligibility?.blockedNames?.has(name)),
    inESPNGameRole:Boolean(roleFor(roles,x))};
  });
 oddsDebug.espnHistoricalStatBoards.gameScopedRushingAudit=rosterCandidateAudit;
 // Day-ahead verified-roster usage enables *provisional* non-QB model-only
 // SGP legs for games absent from old hardcoded starter evidence.
 const depthChartDiagnostics=[];
 requestStage='qb_depth_chart';const depthChartQbs=gameId&&eligibility.checked?
    await Promise.race([nflCurrentGameDepthChartQbs({
     home,away,teamIdsByAbbr:eligibility.teamIdsByAbbr,
     fetchJson:url=>json(url,{},1),
     onDiagnostic:x=>depthChartDiagnostics.push(x)
    }),new Promise(resolve=>setTimeout(()=>resolve([]),5000))]):[];
 const dayAheadRoles=gameId?nflDayAheadRoleEvidence({
   gameId,home,away,eligibility,gate:roles,statBoards,depthChartQbs
 }):null;
 if(dayAheadRoles)roles.roles=dayAheadRoles.roles;
 // Passing projections are QB1-only for the current game. A backup QB with historical attempts must never appear beside the verified starter.
if(gameId&&roles?.checked){const starterQbTeams=new Set((roles.players||[]).filter(x=>String(x.position||'').toUpperCase()==='QB'&&x.starterVerified===true&&x.recommendationEligible===true).map(x=>norm(x.team)));for(const x of statBoards.passing||[]){const r=roleFor(roles,x);if(String(x.position||r?.position||'').toUpperCase()==='QB'&&starterQbTeams.has(norm(x.team))&&r?.starterVerified!==true)x._excludeBackupQb=true}}
for(const cat of ['passing','rushing','receiving','receptions']){const analytics=statBoards[cat]||[],markets=categories[cat]||[],marketByName=new Map(markets.map(x=>[norm(x.name),x]));const merged=analytics.filter(a=>!a._excludeBackupQb).map(a=>{const m=marketByName.get(norm(a.name));return m?{...a,...m,eventID:a.eventID,playerID:a.playerID,team:a.team,opponent:a.opponent,position:a.position,projection:a.projection,projectionUnit:a.projectionUnit,projectionMethod:a.projectionMethod,seasonTotal:a.seasonTotal,gamesPlayed:a.gamesPlayed,perGame:a.perGame,range:a.range,recentForm:a.recentForm,usagePerGame:a.usagePerGame,targets:a.targets,receptions:a.receptions,confidence:a.confidence,reason:a.reason,bestBook:m.bestBook,books:m.books,analyticsOnly:false}:a});for(const m of markets)if(!merged.some(a=>norm(a.name)===norm(m.name)))merged.push(m);categories[cat]=merged.filter(x=>(!gameId||String(x.eventID)===gameId)&&(!gameId||[norm(home),norm(away)].includes(norm(x.team)))).map(x=>{const po=publicOfferFor(x.name,cat);return po&&!x.bestBook?{...x,bestBook:po,bookOffer:po,books:[po],publicSportsbookVerified:true}:x}).sort((a,b)=>(Number(b.confidence)||0)-(Number(a.confidence)||0)||(Number(b.projection)||0)-(Number(a.projection)||0)).slice(0,60).map((x,i)=>({...x,rank:i+1}))}categories.td=(categories.td||[]).map(x=>{const r=roleFor(roles,x),po=publicOfferFor(x.name,'td'),base=r?.playerId?{...x,marketPlayerID:x.playerID,playerID:r.playerId}:x;return po?{...base,bestBook:po,bookOffer:po,books:[po],publicSportsbookVerified:true}:base});
if(gameId){for(const cat of ['passing','rushing','receiving','receptions','td'])categories[cat]=(categories[cat]||[]).map(x=>{const po=publicOfferFor(x.name,cat);return po?{...x,bestBook:po,bookOffer:po,books:[po],publicMarketRefs:publicRefByPlayerCat.get(norm(x.name)+'|'+cat)||[],publicSportsbookVerified:true}:x})}requestStage='matchup_context';let ctx={opponents:{},dvp:null};if(gameId&&home&&away){ctx.opponents[norm(home)]=norm(away);ctx.opponents[norm(away)]=norm(home);try{
 const base=process.env.VERCEL_PROJECT_PRODUCTION_URL?
  'https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL:
  'https://momentum-radar-live.vercel.app';
 const schedule=await Promise.race([
  (async()=>{const r=await timedFetch(base+'/api/nfl-schedule?date='+encodeURIComponent(date),
   {cache:'no-store',signal:AbortSignal.timeout(1900)});
   return r.ok?await r.json():null})().catch(()=>null),
  new Promise(resolve=>setTimeout(()=>resolve(null),2100))
 ]);
 const gameWeek=nflScheduledGameDvpIdentity(schedule,{gameId,date});
 if(gameWeek){
  oddsDebug.dvpGameWeek=gameWeek.week;
  const dvpUrl=base+'/api/nfl-dvp?season='+gameWeek.season+
   '&week='+gameWeek.week+'&teams='+encodeURIComponent(home+','+away);
  const dvpData=await Promise.race([
   (async()=>{const dr=await timedFetch(dvpUrl,{cache:'no-store',
    signal:AbortSignal.timeout(2300)});
    return dr.ok?await dr.json():null})().catch(()=>null),
   new Promise(resolve=>setTimeout(()=>resolve(null),2400))
  ]);
  if(dvpData?.ok&&Number(dvpData.completedGames)>0&&
   Number(dvpData.season)===gameWeek.season&&
   Number(dvpData.week)===gameWeek.week){
   ctx.dvp=dvpData;oddsDebug.dvpStage='ESPN_SCHEDULE_WEEK_VERIFIED';
  }else oddsDebug.dvpStage='WEEK_MATCHED_DVP_UNAVAILABLE';
 }else oddsDebug.dvpStage='CURRENT_GAME_WEEK_UNVERIFIED';
 }catch{oddsDebug.dvpStage='CURRENT_GAME_WEEK_UNVERIFIED'}}
else if(!gameId){
  for(const x of Object.values(statBoards).flat()){
    const team=norm(x.team),opponent=norm(x.opponent);
    if(team&&opponent)ctx.opponents[team]=opponent;
  }
  if(Object.keys(ctx.opponents).length){
    try{
      const slate=await json(ESPN+'/scoreboard?dates='+date.replaceAll('-',''),{},1);
      const upcoming=(slate.events||[]).find(e=>String(e.status?.type?.state||'').toLowerCase()!=='post');
      const week=Number(upcoming?.week?.number||slate?.week?.number||slate?.events?.[0]?.week?.number);
      if(Number.isFinite(week)&&week>=1&&week<=18){
        const dvpBase=(req.headers['x-forwarded-proto']||'https')+'://'+req.headers.host;
        const dr=await timedFetch(dvpBase+'/api/nfl-dvp?season='+Number(date.slice(0,4))+'&week='+week,{cache:'no-store'});
        if(dr.ok){
          const dvp=await dr.json();
          if(dvp.ok&&Number(dvp.completedGames)>0)ctx.dvp=dvp;
        }
      }
    }catch(e){console.warn('slate_dvp_pending',String(e?.message||e))}
  }
}
if(gameId&&ctx.dvp){for(const cat of ['passing','rushing','receiving','receptions'])categories[cat]=(categories[cat]||[]).map(x=>{const team=norm(x.team),opp=ctx.opponents[team],metric=metricFor(cat),pos=String(x.position||'').toUpperCase();if(!['QB','RB','WR','TE'].includes(pos))return {...x,reason:x.reason+' Positional DVP omitted because player position was not verified.'};const z=ctx.dvp?.defenseRanks?.[pos]?.[opp]?.[metric];const best=z?{...z,pos}:null;if(!best)return x;const rank=Number(best.rankMost),matchup=rank<=8?'favorable':rank>=25?'difficult':'neutral',sample=Math.max(1,Number(x.gamesPlayed)||1),sampleNote=sample<3?'Small '+sample+'-game sample; projection confidence is capped.':sample<5?'Developing '+sample+'-game sample.':'Season sample: '+sample+' games.';const workload=cat==='receptions'||cat==='receiving'?(Number(x.targets)||0)+' targets / '+(Number(x.receptions)||0)+' receptions':'Production baseline '+x.perGame+' per game';const conf=Math.min(Number(x.confidence)||50,sample<3?72:sample<5?82:92);return {...x,confidence:conf,matchup:{opponent:opp,position:best.pos,metric,rankMost:rank,allowedPerGame:best.value,label:matchup},reason:'Projected '+x.projection+' '+(cat==='receptions'?'receptions':cat+' yards')+' from actual completed-game production ('+x.perGame+' per game). '+workload+'. '+opp+' is #'+rank+' most '+metric+' allowed to '+best.pos+' ('+matchup+' matchup). '+sampleNote+' Sportsbook line attaches separately when verified.'}})}
requestStage='td_matchup_model';
 // Reuse the same completed-game box scores, current ESPN roster/injury gate
 // and bilateral DVP as the yardage model. Do not query an extra provider.
 const tdModel=gameId?buildNflAnytimeTdCandidates(statBoards.td,{
  gameId,home,away,dvp:ctx.dvp,limit:20}):[];
 const priorTd=categories.td||[];
 const tdIdent=x=>String(x.playerID||'')+'|'+norm(x.name);
 const tdById=new Map(priorTd.map(x=>[tdIdent(x),x]));
 const modelTdNames=new Set(tdModel.map(x=>norm(x.name)));
 categories.td=[...tdModel.map(x=>{
  const observed=tdById.get(tdIdent(x))||
   priorTd.find(m=>norm(m.name)===norm(x.name)&&norm(m.team)===norm(x.team));
  return observed?{...x,analyticsOnly:false,modelOnly:true,
   bestBook:observed.bestBook||null,bookOffer:observed.bookOffer||null,
   books:observed.books||[],sportsbooks:observed.sportsbooks||{},
   verifiedAt:observed.verifiedAt||x.verifiedAt}:x;
 }),...priorTd.filter(x=>!modelTdNames.has(norm(x.name)))];
 oddsDebug.modelAnytimeTdCandidates=tdModel.length;
 requestStage='projection_and_scoring';populatePredictiveLines(categories,ctx);
for(const cat of ['td','passing','rushing','receiving','receptions']){let qualified=roleFilter(eligibilityFilter(categories[cat]||[],eligibility),roles,cat).map(x=>{const offer=bestBook(x),edge=edgeAnalytics(x,offer),mom=momentumScore({...x,cat,bookOffer:offer},ctx),rushingChance=cat==='rushing'?rushingProbability(x,ctx):null;return{...x,edgeAnalytics:edge,recentHitRates:recentHitRates(x,offer?.line),momentumScore:mom.score,momentumSignals:mom.signals,hitChance:estimateNflHitChance(x,cat),...(cat==='rushing'?{rushingChance}:{} )}});if(cat==='td')qualified.sort((a,b)=>(Number(b.momentumScore)||0)-(Number(a.momentumScore)||0)||(Number(b.confidence)||0)-(Number(a.confidence)||0)||(Number(b.evidence?.touchdowns)||0)-(Number(a.evidence?.touchdowns)||0)||(Number(b.evidence?.opportunities)||0)-(Number(a.evidence?.opportunities)||0));if(cat==='rushing')qualified.sort((a,b)=>((Number(b.projection)||0)*(Number(b.rushingChance?.estimatedPercent)||0))-((Number(a.projection)||0)*(Number(a.rushingChance?.estimatedPercent)||0))||(Number(b.projection)||0)-(Number(a.projection)||0));else if(cat!=='td')qualified.sort((a,b)=>(Number(b.projection)||0)-(Number(a.projection)||0)||(Number(b.momentumScore)||0)-(Number(a.momentumScore)||0));categories[cat]=qualified.slice(0,10).map((x,i)=>{const role=roleFor(roles,x);return{...x,rank:i+1,starterVerified:roles?.checked===true&&role?.starterVerified===true,starterStatus:role?.starterStatus||'UNCONFIRMED'}})}const publicBookRows=publicRefs.map(r=>{const cat=String(r.market||'').toLowerCase().includes('touchdown')?'td':String(r.market||'').toLowerCase().includes('passing')?'passing':String(r.market||'').toLowerCase().includes('rushing')?'rushing':String(r.market||'').toLowerCase().includes('reception')&&!String(r.market||'').toLowerCase().includes('receiving')?'receptions':'receiving',rr=roleFor(roles,{name:r.player}),raw=String(r.line??''),line=cat==='td'?null:Number(raw.replace('+','')),odds=Number(String(r.odds??'').replace('+',''));return{eventID:gameId,playerID:rr?.playerId||norm(r.player),name:r.player,team:rr?.team||'',position:rr?.position||'',marketName:cat==='td'?'player_anytime_td':cat==='passing'?'player_pass_yds':cat==='rushing'?'player_rush_yds':cat==='receiving'?'player_reception_yds':'player_receptions',statID:cat==='td'?'touchdowns':cat==='passing'?'passing yards':cat==='rushing'?'rushing yards':cat==='receiving'?'receiving yards':'receptions',periodID:'game',betTypeID:cat==='td'?'yn':'ou',sideID:cat==='td'?'yes':'over',line:Number.isFinite(line)?line:null,books:[{book:r.book,line:Number.isFinite(line)?line:null,odds:Number.isFinite(odds)?odds:null,available:true,source:'public sportsbook'}],provider:'Public sportsbook research'};
});
const publicDerivedRows=[];for(const r of publicRefs){if(!String(r.market||'').toLowerCase().includes('touchdown'))continue;for(const book of ['DraftKings','FanDuel']){if(r.book!==book)continue;const rr=roleFor(roles,{name:r.player}),odds=Number(String(r.odds??'').replace('+',''));publicDerivedRows.push({eventID:gameId,playerID:rr?.playerId||norm(r.player),name:r.player,team:rr?.team||'',position:rr?.position||'',marketName:'player_anytime_td',statID:'touchdowns',periodID:'game',betTypeID:'yn',sideID:'yes',line:null,books:[{book,line:null,odds:Number.isFinite(odds)?odds:null,available:true,source:'public sportsbook'}],provider:'Public sportsbook research'})}}// Historical October 5 public bookmaker reference lines stay in the historical context only.
// Never insert manual or hardcoded prices into the live game-specific market pool.
const mergedMarketRows=[...(rows||[])];
requestStage='market_enrichment';const enrichedMarketRows=attachAnalyticsToMarkets(mergedMarketRows,statBoards).map(x=>{const r=roleFor(roles,x),cat=category(x),a=(statBoards?.[cat]||[]).find(v=>norm(v.name)===norm(x.name));return r?{...a,...x,team:norm(r.team||x.team),position:x.position||r.position,playerID:r.playerId||x.playerID||x.playerId,projection:x.projection??a?.projection,predictiveProjection:x.predictiveProjection??a?.predictiveProjection??a?.projection,perGame:x.perGame??a?.perGame,gamesPlayed:x.gamesPlayed??a?.gamesPlayed,usagePerGame:x.usagePerGame??a?.usagePerGame}:x});const sgpGateDiagnostics={total:enrichedMarketRows.length,missingRole:0,missingCategory:0,missingBook:0,missingRoster:0,injuryBlocked:0,teamMismatch:0,insufficientUsage:0,insufficientOpportunity:0,eligible:0};requestStage='sgp_eligibility';const sgpRows=enrichedMarketRows.filter(x=>{const r=roleFor(roles,x),cat=category(x),hasBook=Boolean(bookFor(x,'DraftKings')||bookFor(x,'FanDuel')),roster=eligibility?.rosterById?.get(String(x.playerID||x.playerId||''))||eligibility?.rosterByName?.get(norm(x.name));if(!r){sgpGateDiagnostics.missingRole++;return false}if(!cat){sgpGateDiagnostics.missingCategory++;return false}if(!hasBook){sgpGateDiagnostics.missingBook++;return false}if(!roster){sgpGateDiagnostics.missingRoster++;return false}if(eligibility?.blockedIds?.has(String(x.playerID||x.playerId||''))||eligibility?.blockedNames?.has(norm(x.name))){sgpGateDiagnostics.injuryBlocked++;return false}if(x.team&&norm(roster.team)!==norm(x.team)){sgpGateDiagnostics.teamMismatch++;return false}const pairedTd=(categories.td||[]).find(td=>
  String(td.playerID||td.playerId||'')===String(x.playerID||x.playerId||'')&&
  nflCanonTeam(td.team)===nflCanonTeam(x.team))||null;
 if(!nflMeaningfulOpportunity(x,r,{pairedTd})){
  sgpGateDiagnostics.insufficientOpportunity++;return false;
 }
 if(cat!=='td'&&!analyticsUsageEligible(x,r,cat)){
  sgpGateDiagnostics.insufficientUsage++;return false;
 }
 sgpGateDiagnostics.eligible++;return true});requestStage='book_sgp_build';const quoteSourceRows=nflAuthorizedBookSgpRows(sgpRows,{authorizedChange,signedSelectionRows:signedPropLineRows.length});oddsDebug.providerNativeRows=signedPropLineRows.length;const bookSgps=gameId?{DraftKings:buildBookSgp(quoteSourceRows,'DraftKings',ctx),FanDuel:buildBookSgp(quoteSourceRows,'FanDuel',ctx)}:{};const hasCompleteBookLegCandidate=Boolean(gameId&&Object.values(bookSgps).some(v=>(v||[]).some(s=>(s.legs||[]).length===s.requiredLegs)));requestStage='analytics_sgp_build';const analyticsSgps=gameId?buildAnalyticsSgp(categories,ctx,roles,{gameId,home,away,rosterChecked:eligibility?.checked===true,rosterById:eligibility?.rosterById,rosterByName:eligibility?.rosterByName,normalizeName:norm}).map(card=>({...card,legs:(card.legs||[]).map(leg=>({...leg,hitChance:estimateNflHitChance(leg,leg.cat,{target:leg.analyticsThreshold})}))})):[];const sgpEngineDiagnostics=(analyticsSgps||[]).map(c=>({tier:c.risk,complete:c.tierAssessment?.compositionOk===true,legs:c.legs?.length||0,required:c.requiredLegs||0,marketMix:c.marketMix||[],blocker:String(c.reason||'').slice(0,300),pool:c.poolDiagnostics||null}));oddsDebug.sgpEngineDiagnostics=sgpEngineDiagnostics;requestStage='sgp_tier_assembly';
 // Respond before legacy malformed/commented response tail; all candidates are unquoted.
 const unquoted=(rows,book)=>(rows||[]).map(s=>({...s,bookVerificationPending:true,combinedBookQuoteVerified:false,actualSgpOdds:null,publishable:false,displayLabel:book+' individual-prop candidate (unquoted)'}));
 const quoteReady=(rows,book)=>(rows||[]).map(s=>{
  const now=Date.now(),preflight=evaluateNflBookQuoteReadiness(s,{book,gameId,now});
  const lineup=evaluateSportBookSgpLineup(s.legs,{
   sport:'nfl',gameId,book,now,roleForLeg:leg=>roleFor(roles,leg)});
  const safeQuote=preflight.eligible&&lineup.ready?preflight.quoteRequest:null;
  return {...s,estimatedOdds:null,bookVerificationPending:true,
   combinedBookQuoteVerified:false,actualSgpOdds:null,publishable:false,
   quoteEligibility:!preflight.eligible?preflight.reason:
    lineup.ready?'READY_FOR_AUTHORIZED_QUOTE':'LINEUP_'+lineup.reason,
   lineupVerificationStatus:lineup.status,
   lineupVerificationReason:lineup.reason,
   quoteSelectionCount:preflight.eligible&&lineup.ready?preflight.selectionCount:0,
   // Server preflight authenticates every same-game, same-book, fresh PropLine
   // selection before signed change authorization can spend a quote credit.
   quoteRequest:safeQuote,
   displayLabel:book+' individual-prop candidate (unquoted)'};
 });
 const sgpResponse={DraftKings:quoteReady(bookSgps.DraftKings,'DraftKings'),FanDuel:quoteReady(bookSgps.FanDuel,'FanDuel'),Analytics:(analyticsSgps||[]).map(s=>({...s,publishable:false})),mode:'UNQUOTED_CANDIDATES',combinedBookQuoteVerified:false};
 // At most Small, Medium, Nuke for each book per verified material change:
 // max six distinct signed, single-use quote attempts. Ordinary reads spend zero.
 // Quote jobs run concurrently to stay inside the 45-second NFL market deadline.
 // A valid bookmaker-correlated price (not multiplied individual-leg odds)
 // is required before any tier can be published as book-priced.
 if(authorizedChange&&gameId&&!DIRECT_PUBLIC_ODDS_ONLY){
  const candidates=[];
  for(const [book,bookmaker] of [['DraftKings','draftkings'],['FanDuel','fanduel']]){
   for(const risk of ['Small','Medium','Nuke']){
    const candidate=(sgpResponse[book]||[]).find(s=>s.risk===risk&&
      s.quoteEligibility==='READY_FOR_AUTHORIZED_QUOTE'&&s.quoteRequest);
    if(candidate)candidates.push({book,bookmaker,risk,candidate});
   }
  }
  oddsDebug.authorizedQuoteCandidates=candidates.length;
  // Internal quote requests must remain in the current deployment.
  // Never route a preview's authorized token or quote spend into production.
  const deploymentHost=String(process.env.VERCEL_URL||'').toLowerCase();
  const productionHost=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'').toLowerCase();
  const trustedHost=/^momentum-radar-live-[a-z0-9-]+\.vercel\.app$/.test(deploymentHost)||
   deploymentHost==='momentum-radar-live.vercel.app'?deploymentHost:
   process.env.VERCEL_ENV==='production'&&productionHost==='momentum-radar-live.vercel.app'?productionHost:'';
  const origin=trustedHost?'https://'+trustedHost:null;
  // No more than 3 correlated quote requests in a scheduled checkpoint
  // (plus at most two market lookups). Material injury changes retain six.
  const quoteCandidates=changeType==='scheduled_checkpoint'?
   chooseNflCheckpointQuotes(candidates,{gameId,
    stage:String(req.query.checkpointStage||''),max:3}):
   candidates.slice(0,6);
  // Candidate eligibility is not actual provider spend: signed checkpoints
  // deliberately cap attempts at three across both sportsbooks.
  if(!origin){
   oddsDebug.quoteOriginStatus='NO_TRUSTED_SAME_DEPLOYMENT_ORIGIN';
   quoteCandidates.length=0;
  }
  oddsDebug.authorizedQuoteAttempts=quoteCandidates.length;
  await Promise.all(quoteCandidates.map(async({book,bookmaker,risk,candidate})=>{
   const key=bookmaker+'_'+risk+'QuoteStatus';
   try{
    const quoteRes=await timedFetch(origin+'/api/prop-line-sgp-quote',{
     method:'POST',cache:'no-store',
     headers:{'Content-Type':'application/json',
      Authorization:'Bearer '+process.env.CRON_SECRET,'x-momentum-change-token':verifiedToken},
     body:JSON.stringify(candidate.quoteRequest),signal:AbortSignal.timeout(13000)
    });
    const quote=await quoteRes.json().catch(()=>null);
    oddsDebug[key]=quote?.status||quote?.error||'invalid_provider_response';
    if(quote?.reason)oddsDebug[key+'Reason']=String(quote.reason).slice(0,100);
    const pricedAt=Date.parse(quote?.pricedAt||''),now=Date.now();
    if(quoteRes.ok&&quote?.quoted===true&&quote?.status==='PROVIDER_BOOK_COMBINED_QUOTE'&&
      quote?.bookmaker===bookmaker&&
      String(quote?.eventId)===String(candidate.quoteRequest.eventId)&&
      Number(quote?.legsAccepted)===candidate.quoteRequest.legs.length&&
      Number.isFinite(pricedAt)&&pricedAt<=now&&now-pricedAt<=15*60000&&
      sgpOddsInBand(risk,quote.americanOdds)){
     candidate.actualSgpOdds=Number(quote.americanOdds);
     candidate.combinedBookQuoteVerified=true;
     candidate.bookVerificationPending=false;
     candidate.publishable=true;
     candidate.displayLabel=book+' bookmaker-priced '+risk+' SGP';
     candidate.quotedAt=quote.pricedAt;
    }else if(quote?.quoted===true){
     oddsDebug[key]='QUOTE_NOT_IN_REQUESTED_TIER_OR_INVALID';
    }
   }catch(e){oddsDebug[key]='quote_unavailable'}
  }));
  sgpResponse.combinedBookQuoteVerified=['DraftKings','FanDuel']
   .some(book=>sgpResponse[book].some(s=>s.combinedBookQuoteVerified===true));
  if(sgpResponse.combinedBookQuoteVerified)sgpResponse.mode='BOOK_QUOTED_PARTIAL';
 }
 // Source and injury evidence must accompany the ACTIVE response path,
 // not only the unreachable legacy response below. Collector snapshots and
 // the match-up view read these exact fields to distinguish ready vs pending.
 const activeBookMarketCounts=Object.fromEntries(['DraftKings','FanDuel'].map(book=>[
  book,sgpRows.filter(m=>bookFor(m,book)).length
 ]));
 const professionalReview=nflProfessionalBilateralReview({
  gameId,home,away,dvp:ctx.dvp,
  modelCards:sgpResponse.Analytics,
  injuryChecked:eligibility.checked===true,
  blockedPlayerCount:Math.max(eligibility.blockedIds.size,eligibility.blockedNames.size)
 });
 const response={ok:true,gameId,date,scope:'game',home,away,kickoff,provider,categories,
  matchupEvidence:professionalReview,
  sgps:sgpResponse,marketRows:(directRows||[]).length,
  degraded:!hasCompleteBookLegCandidate,
  analyticsAvailable:Object.values(categories).some(v=>Array.isArray(v)&&v.length>0),
  pregameVerification:sportResearchVerificationStatus({
   sport:'nfl',gameId,now:Date.now(),
   injuryCheckedAt:eligibility.injuryCheckedAt,
   injurySourceAvailable:eligibility.injuryChecked===true,
   officialInactivesVerified:eligibility.officialInactivesVerified===true,
   startersConfirmed:false,bookOffers:[]
  }),
  sportsbookIntegration:{
   state:sgpGateDiagnostics.eligible?'VERIFIED_INDIVIDUAL_PROPS':'NO_VERIFIED_PLAYER_PROPS',
   reason:sgpGateDiagnostics.eligible?'Individual bookmaker props observed; combined pricing is verified separately.':
    'No eligible current-book player prop rows; the ESPN analytics model remains independent.',
   bookMarketCounts:activeBookMarketCounts,combinedSgpQuoteAvailable:sgpResponse.combinedBookQuoteVerified
  },
  validation:{
   sgpEligibleMarketRows:sgpGateDiagnostics.eligible,
   sgpGateDiagnostics,bookLegCandidateComplete:hasCompleteBookLegCandidate,
   combinedBookSgpQuoteAvailable:sgpResponse.combinedBookQuoteVerified,
   injuryEligibilityChecked:eligibility.checked===true,
   injuryEvidence:eligibility.checked===true?
    (Array.isArray(eligibility.injuryEvidence)?eligibility.injuryEvidence:[]):[],
   injuryEvidenceSource:eligibility.checked===true?
    String(eligibility.source||'ESPN_AND_OFFICIAL_WEEKLY_EVIDENCE').slice(0,200):
    'NOT_VERIFIED',
   injuryReportCheckedAt:eligibility.checked===true?
    eligibility.injuryCheckedAt||null:null,
   officialInactivesVerified:eligibility.officialInactivesVerified===true,
   blockedPlayerCount:Math.max(eligibility.blockedIds.size,eligibility.blockedNames.size),
   dayAheadRoleSource:dayAheadRoles?.source||'NOT_APPLICABLE',
   dayAheadRoleChecks:dayAheadRoles?.counters||null,
   conditionalRoleCount:(dayAheadRoles?.counters?.projectedHighUsageRoles||0)+
    (dayAheadRoles?.counters?.projectedDepthChartQb1||0),
   depthChartQb1Count:dayAheadRoles?.counters?.projectedDepthChartQb1||0,
   conditionalRolesNotConfirmedStarters:true,
   gameScopedStarterSource:roles.gameScopedStarters?.checked===true?
    'ESPN_CORE_GAME_ROSTER':'UNAVAILABLE',
   gameScopedStarterCounts:roles.gameScopedStarters?.checked===true?
    roles.gameScopedStarters.starterCounts||{}:{},
   currentRosterRequired:true,wrongTeamRowsBlocked:true,
   finalPregameCheckMinutes:30
  },oddsDebug,fetchedAt:new Date().toISOString()};
 // Signed quotes above need exact provider outcome IDs. The public response
 // and read-only Blob snapshot must never include those internal instructions.
 // Never publish speculative analytics thresholds or unquoted book candidates
 // as a bettable Small/Medium/Nuke parlay. Internal quote preflight above
 // still evaluates all candidates; this is a response-boundary safety gate.
 // A bookmaker-priced card must have the exact accepted correlated quote.
 for(const book of ['DraftKings','FanDuel']){
  response.sgps[book]=(response.sgps[book]||[]).filter(card=>
   card.publishable===true&&card.combinedBookQuoteVerified===true&&
   Number.isFinite(Number(card.actualSgpOdds))&&
   sgpOddsInBand(card.risk,card.actualSgpOdds));
 }
 // Keep complete, game-scoped MODEL_ONLY tiers visible for research.
 // Never represent them as sportsbook-priced or ready-to-bet selections.
 const safeTeams=new Set([String(home||'').toUpperCase(),String(away||'').toUpperCase()]);
 response.sgps.Analytics=(analyticsSgps||[]).filter(c=>
  c.tierAssessment?.compositionOk===true&&Array.isArray(c.legs)&&
  c.legs.length>0&&eligibility.checked===true&&c.legs.every(l=>
   String(l.eventID||l.gameId||'')===String(gameId)&&
   safeTeams.has(String(l.team||'').toUpperCase())&&
   (()=>{const id=String(l.playerID||l.playerId||'');
    const roster=id&&eligibility.rosterById?.get(id)||eligibility.rosterByName?.get(norm(l.name));
    return roster&&nflCanonTeam(roster.team)===nflCanonTeam(l.team)&&
     !eligibility.blockedIds.has(id)&&!eligibility.blockedNames.has(norm(l.name));})()&&
   !/\\b(OUT|INACTIVE|IR|DOUBTFUL|QUESTIONABLE|SUSPENDED)\\b/i.test(
    [l.injuryStatus,l.availability,l.starterStatus].join(' '))
  )).map(publishedNflModelTier).filter(Boolean);
 response.sgps.mode=response.sgps.DraftKings.length||response.sgps.FanDuel.length?
  'VERIFIED_BOOK_SGPS_WITH_MODEL_RESEARCH':response.sgps.Analytics.length?'MODEL_ONLY_RESEARCH':'NO_VERIFIED_BOOK_SGPS';
 response.sgps.rule='Analytics tiers are unpriced model research, not sportsbook offers. Only verified bookmaker quotes can be presented as bettable parlays.';
 const publicResponse=nflPublicMarketResponse(response);
 res.setHeader('Cache-Control','private, no-store');
 // Both owner and public read this one persisted snapshot. Fail closed
 // instead of claiming that an unpublished refresh is current.
 requestStage='snapshot_publish';
 const publishedAt=await writeResponseSnapshot(responseKey,publicResponse,date,gameId,requestStarted);
 if(!publishedAt)return res.status(503).json({
  ok:false,error:'shared_snapshot_publish_failed',
  retryable:true,degraded:true,fetchedAt:new Date().toISOString()});
 // Do not send this invocation's result if a newer independently
 // generated game version has already committed in shared storage.
 const newest=await readResponseSnapshot(responseKey,date,gameId,true);
 if(!newest?.body?.ok)return res.status(503).json({
  ok:false,error:'shared_snapshot_readback_failed',retryable:true});
 res.setHeader('X-Momentum-Snapshot-Version',String(newest.at));
 return res.status(200).json(nflVerifiedOnlySgpResponse(newest.body));
 }catch(e){console.error('nfl_markets_refresh_failed',JSON.stringify({stage:requestStage,gameId:String(req.query?.gameId||'').slice(0,24),errorType:String(e?.name||'Error').slice(0,60),elapsedMs:Date.now()-requestStarted}));const msg=String(e?.message||e),rate=msg.includes('sportsbook_rate_limited');if(rate)res.setHeader('Retry-After',String(e.retryAfterSeconds||900));return res.status(rate?503:502).json({ok:false,error:msg,refreshFailureStage:requestStage,retryable:rate||/upstream_(429|5\d\d)/.test(msg),degraded:rate,fetchedAt:new Date().toISOString()})}}