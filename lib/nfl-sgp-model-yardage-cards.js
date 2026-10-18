// Read-only AI projected yardage in Small/Medium/Nuke research cards.
// A model forecast/target is NOT an actual DraftKings or FanDuel betting line.
import {assessNflSgpTier} from './ai-mechanics/nfl-sgp-tiers.js';
const METRICS=['passing','rushing','receiving','receptions'];
const TITLE={passing:'Passing',rushing:'Rushing',receiving:'Receiving',receptions:'Receptions'};
const HELD=new Set(['OUT','INACTIVE','IR','INJURED RESERVE','SUSPENDED','DOUBTFUL','QUESTIONABLE']);
const N=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const label=n=>Number.isInteger(n)?String(n):n.toFixed(1);
function suggestedTarget(category,forecast,risk){
 const factor={Small:.8,Medium:1,Nuke:1.2}[risk];
 if(!factor||!num(forecast)||Number(forecast)<=0)return null;
 const step=category==='receptions'?1:5;
 const rounded=Math.round(Number(forecast)*factor/step)*step;
 return Math.max(step,rounded);
}
function statusOf(p){return String(p?.injuryStatus||p?.availability||p?.status||'').toUpperCase()}
function injuryHold(m,name,team){
 return (m.validation?.injuryEvidence||[]).some(x=>
  HELD.has(String(x.status||'').toUpperCase())&&
  N(x.name)===N(name)&&String(x.team||'').toUpperCase()===team);
}
function metricForPlayer(m,name,team,category){
 const items=Array.isArray(m.categories?.[category])?m.categories[category]:[];
 return items.find(p=>N(p.name||p.player)===N(name)&&
  String(p.team||'').toUpperCase()===team&&
  !HELD.has(statusOf(p))&&num(p.projection)&&Number(p.projection)>0&&
  Number(p.projection)<850);
}
export function buildNflProjectedSgpTierDetails({market,gameId,date,home,away}={}){
 const g=String(gameId||''),homeCode=String(home||'').toUpperCase(),
  awayCode=String(away||'').toUpperCase(),teams=new Set([homeCode,awayCode]);
 if(!market||market.ok!==true||market.scope!=='game'||String(market.gameId)!==g||
   (date&&market.date!==date)||!/^\d{7,12}$/.test(g)||
   teams.size!==2||teams.has('')){
  return {status:'INVALID_GAME',tiers:[],bookmakerSgpQuoteVerified:false};
 }
 const tiers=(market.sgps?.Analytics||[]).filter(x=>['Small','Medium','Nuke'].includes(x?.risk)).map(tier=>{
  const legs=[],held=[],seen=new Set();
  for(const leg of Array.isArray(tier.legs)?tier.legs:[]){
   const name=String(leg.player||leg.name||''),team=String(leg.team||'').toUpperCase(),
    category=String(leg.category||leg.cat||'');
   const key=N(name)+'|'+team+'|'+category;
   if(!name||!teams.has(team)||!['td',...METRICS].includes(category)||
      String(leg.gameId||g)!==g||seen.has(key))continue;
   if(injuryHold(market,name,team)){
    held.push({name,team,reason:'Official injury designation blocks this player'});
    continue;
   }
   const projections=[];
   for(const metric of METRICS){
    const p=metricForPlayer(market,name,team,metric);
    if(!p)continue;
    if(p.position==='QB'&&p.starterVerified!==true)continue;
    projections.push({category:metric,projection:Number(p.projection),
     gamesPlayed:Number(p.gamesPlayed)||0,starterConfirmed:p.starterVerified===true,
     position:p.position||''});
   }
   const main=projections.find(x=>x.category===category);
   if(category!=='td'&&!main){
    held.push({name,team,reason:'No eligible current-game '+category+' forecast'});
    continue;
   }
   if(category==='td'&&!projections.length){
    held.push({name,team,reason:'No usable current-game yardage forecast for TD candidate'});
    continue;
   }
   const position=main?.position||projections[0]?.position||'';
   if(position==='QB'&&projections.every(x=>!x.starterConfirmed)){
    held.push({name,team,reason:'Starting quarterback not confirmed'});
    continue;
   }
   const mainTarget=main?suggestedTarget(category,main.projection,tier.risk):null;
   legs.push({name,team,category,position,mainProjection:main?.projection??null,
    mainTarget,projections,starterConfirmed:projections.some(x=>x.starterConfirmed),
    tdModelCandidate:category==='td'});
   seen.add(key);
  }
  const sourceLegCount=Array.isArray(tier.legs)?tier.legs.length:0;
  const compositionComplete=legs.length===sourceLegCount&&
   assessNflSgpTier({risk:tier.risk,legs:legs.map(leg=>({
    name:leg.name,playerID:N(leg.name)+'|'+leg.team,cat:leg.category
   })),requiredLegs:sourceLegCount}).compositionOk===true;
  return {risk:tier.risk,legs,held,sourceLegCount,compositionComplete,
   modelOnly:true,bookmakerSgpQuoteVerified:false};
 });
 return {status:tiers.length?'MODEL_PROJECTED_TIERS':'NO_MODEL_TIERS',tiers,
   bookmakerSgpQuoteVerified:false,updatedAt:market.fetchedAt||null};
}
export function renderNflProjectedSgpTierDetails({tiers=[],status}={}){
 if(status!=='MODEL_PROJECTED_TIERS')return '';
 const style='<style>.mr-model-sgp-tier{background:#0d222f;border:1px solid #265d65;padding:14px;border-radius:13px;margin:10px 0}'+
  '.mr-model-sgp-tier[data-risk=Medium]{border-color:#3972b8}'+
  '.mr-model-sgp-tier[data-risk=Nuke]{border-color:#9e51bc}'+
  '.mr-model-sgp-tier h4{color:#8de5ca;margin:0 0 6px;font-size:17px}'+
  '.mr-model-sgp-leg{background:#091b26;padding:11px;border:1px solid #253f4c;border-radius:9px;margin:8px 0}'+
  '.mr-model-sgp-leg strong{color:#5beab2;font-size:16px}'+
  '.mr-model-sgp-numeric{color:#f3faff;font-weight:800;font-size:15px;margin:5px 0}'+
  '.mr-model-sgp-muted{color:#b3ccd9;font-size:12px;line-height:1.5;margin:4px 0}</style>';
 const cards=tiers.map(tier=>
  tier.risk==='Nuke'&&tier.compositionComplete!==true?
   '<section class="mr-model-sgp-tier" data-risk="Nuke" aria-label="Nuke NOT READY">'+
   '<h4>Nuke • NOT READY</h4>'+
   '<p class="mr-model-sgp-muted">'+Math.min(7,Math.max(0,tier.legs.length))+
   ' eligible model selections. Nuke requires 5–7 fully eligible selections, '+
   '3+ passing/rushing/receiving yardage legs across 2+ yardage categories, '+
   'and 3+ prop categories. No completed Nuke is available for this game.</p>'+
   '<p class="mr-model-sgp-muted">No DraftKings or FanDuel combined SGP '+
   'quote of +10000 or higher has been verified here.</p></section>':
  '<section class="mr-model-sgp-tier" data-risk="'+esc(tier.risk)+'" aria-label="'+esc(tier.risk)+' model projection candidates">'+
  '<h4>'+esc(tier.risk)+' • AI yardage projection candidates</h4>'+
  '<p class="mr-model-sgp-muted">'+tier.legs.length+' eligible model candidates • yardage forecasts below are NOT sportsbook odds or guaranteed bettable thresholds.</p>'+
  (tier.legs.length?tier.legs.map(leg=>
   '<div class="mr-model-sgp-leg"><strong>'+esc(leg.name)+'</strong>'+
   '<div class="mr-model-sgp-muted">'+esc(leg.team)+' • '+esc(leg.category==='td'?'Anytime TD model candidate':TITLE[leg.category]+' model candidate')+
    ' • '+(leg.starterConfirmed?'Starter confirmed by available model evidence':'Starter unconfirmed — verify game-day lineup')+'</div>'+
   (leg.mainProjection!==null?
    '<div class="mr-model-sgp-numeric">AI '+esc(TITLE[leg.category])+' forecast: '+label(leg.mainProjection)+
     (leg.category==='receptions'?' receptions':' yards')+'</div>'+
    '<div class="mr-model-sgp-muted">'+esc(tier.risk)+' suggested comparison target: <b>'+
     label(leg.mainTarget)+(leg.category==='receptions'?' receptions':' yards')+
     '</b> (illustrative model target, NOT a listed betting line)</div>':
    '<div class="mr-model-sgp-numeric">Anytime touchdown • model candidate only</div>')+
   '<div class="mr-model-sgp-muted"><b>Player yardage outlook:</b> '+
    leg.projections.filter(x=>['passing','rushing','receiving'].includes(x.category)).
    map(x=>esc(TITLE[x.category])+' '+label(x.projection)+' yards').join(' · ')+
    (leg.projections.some(x=>x.category==='receptions')?
      ' · Receptions '+label(leg.projections.find(x=>x.category==='receptions').projection):'')+
   '</div>'+
   (leg.tdModelCandidate?'<div class="mr-model-sgp-muted">TD chance is separate from yardage; no sportsbook TD odds or TD probability is implied.</div>':'')+
   '</div>').join(''):'<div class="mr-model-sgp-muted">No eligible projected players after injury and role checks.</div>')+
   (tier.held.length?'<p class="mr-model-sgp-muted">'+tier.held.length+
    ' player(s) withheld for unavailable forecasts or injury/starting-role checks.</p>':'')+
   '<p class="mr-model-sgp-muted">Predictions for comparison only • Combined sportsbook SGP price not verified</p></section>'
 ).join('');
 return style+'<div class="mr-model-sgp-sets" aria-label="Small Medium Nuke AI statistical projections">'+cards+'</div>';
}
