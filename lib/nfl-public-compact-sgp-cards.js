// Public SGP presentation only: a compact pick and evidence-backed why.
// Uses existing server-generated model candidate tiers; never manufactures
// a sportsbook-listed offer, bettor slip, correlated odds, or lineup approval.
import {buildNflProjectedSgpTierDetails} from './nfl-sgp-model-yardage-cards.js';

const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canon=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const numeric=v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v));
const fmt=v=>Number.isInteger(Number(v))?String(Number(v)):Number(v).toFixed(1);
const measure={passing:'passing',rushing:'rushing',receiving:'receiving',receptions:'receptions'};
const POSITION={QB:'quarterbacks',RB:'running backs',WR:'wide receivers',TE:'tight ends'};
function profileFor(m,p,cat){
 return (m?.categories?.[cat]||[]).find(x=>canon(x.name||x.player)===canon(p.name)&&
  String(x.team||'').toUpperCase()===p.team);
}
function shortWhy(profile,leg,cat,risk,market){
 const parts=[],per=profile?.perGame,games=profile?.gamesPlayed;
 if(numeric(per)&&Number(per)>0){
  const unit=cat==='receptions'?'catches':'yards';
  parts.push(fmt(per)+' '+unit+'/game'+(Number.isInteger(Number(games))&&Number(games)>0?
   ' over '+games+' games':''));
 }
 const recent=Array.isArray(profile?.recentForm?.last5)?profile.recentForm.last5.filter(numeric).map(Number):[];
 if(recent.length&&(!numeric(per)||Math.abs(recent.reduce((a,b)=>a+b,0)/recent.length-Number(per))>2)){
  const avg=recent.reduce((a,b)=>a+b,0)/recent.length;
  parts.push('last '+recent.length+' avg '+fmt(Math.round(avg*10)/10));
 }
 const rank=numeric(profile?.matchupRankMost)?Number(profile.matchupRankMost):null;
 const pos=String(profile?.position||leg.position||'').toUpperCase();
 const opp=String(profile?.opponent||'').toUpperCase();
 if(Number.isInteger(rank)&&rank>=1&&rank<=32&&POSITION[pos]){
  parts.push((opp||'Opponent')+' ranks #'+rank+' most '+cat+' allowed to '+POSITION[pos]);
 }
 if(!parts.length){
  // No unsupported "hot streak" or "favorable" claim without actual evidence.
  return 'Chosen from the available player production and matchup projections.';
 }
 const suffix=risk==='Nuke'&&leg.mainProjection!==null&&leg.mainTarget>leg.mainProjection?
  ' Higher-ceiling target.':'';
 return parts.slice(0,2).join('; ')+'.'+suffix;
}
function tdWhy(m,leg){
 const td=profileFor(m,leg,'td'),evidence=td?.evidence||{};
 const nums=[];
 if(numeric(evidence.touchdowns)&&Number(evidence.touchdowns)>0)
  nums.push(fmt(evidence.touchdowns)+' recorded touchdowns');
 if(numeric(evidence.opportunities)&&Number(evidence.opportunities)>0)
  nums.push(fmt(evidence.opportunities)+' recorded opportunities');
 if(nums.length)return nums.join(' and ')+' in the available sample.';
 const rush=profileFor(m,leg,'rushing');
 if(numeric(rush?.perGame)&&Number(rush.perGame)>0)
  return fmt(rush.perGame)+' rushing yards/game; receiving involvement adds another potential scoring route.';
 const receiving=profileFor(m,leg,'receiving');
 if(numeric(receiving?.perGame)&&Number(receiving.perGame)>0)
  return fmt(receiving.perGame)+' receiving yards/game; selected from available usage and matchup data.';
 return 'Chosen from the available touchdown opportunity and matchup analysis.';
}
function publicPick(leg){
 if(leg.category==='td'){
  const rushing=leg.projections.find(x=>x.category==='rushing');
  const receiving=leg.projections.find(x=>x.category==='receiving');
  const stats=[];
  if(rushing)stats.push(fmt(rushing.projection)+' rushing');
  if(receiving)stats.push(fmt(receiving.projection)+' receiving');
  const receptions=leg.projections.find(x=>x.category==='receptions');
  if(!stats.length&&receptions)stats.push(fmt(receptions.projection)+' receptions');
  return {category:'Anytime TD',amount:stats.length?stats.join(' · '):'Model candidate'};
 }
 return {category:leg.category==='receptions'?'Receptions':
  leg.category[0].toUpperCase()+leg.category.slice(1)+' yards',
  amount:fmt(leg.mainTarget)+' '+(leg.category==='receptions'?'receptions':'yards')};
}
export function buildPublicCompactNflSgpCards({
 market,date,gameId,home,away,saved=false
}={}){
 return {model:buildNflProjectedSgpTierDetails({market,date,gameId,home,away}),
  market,saved};
}
export function renderPublicCompactNflSgpCards(result){
 const {model,market,saved=false}=result||{};
 if(model?.status!=='MODEL_PROJECTED_TIERS'||!model.tiers?.length)
  return '<p class="sgp-brief-status">Player predictions will appear when the matchup model is updated.</p>';
 const previouslyShown=[];
 const cards=model.tiers.map(tier=>{
  const signature=new Set(tier.legs.map(l=>canon(l.name)+'|'+l.category+'|'+String(l.mainTarget??'TD')));
  const overlap=previouslyShown.reduce((max,prior)=>Math.max(max,
   [...signature].filter(key=>prior.has(key)).length),0);
  const maxOverlap=tier.risk==='Medium'?2:tier.risk==='Nuke'?3:Infinity;
  // Even this legacy compact view must never print a partial player lineup
  // that looks like a finished Small / Medium / Nuke research parlay.
  if(tier.compositionComplete!==true)return '<section class="mr-public-sgp-tier" data-risk="'+
   E(tier.risk)+'" aria-label="'+E(tier.risk)+' NOT READY"><h3>'+E(tier.risk)+
   ' • NOT READY</h3><p class="mr-public-sgp-why">'+tier.legs.length+
   ' eligible research selections; no complete mixed-market lineup or verified '+
   'bookmaker-issued combined SGP odds.</p></section>';
  if(overlap>maxOverlap)return '<section class="mr-public-sgp-tier" data-risk="'+E(tier.risk)+'" aria-label="'+E(tier.risk)+' lineup requires differentiation"><h3>'+E(tier.risk)+' • REBUILD REQUIRED</h3><p class="mr-public-sgp-why">This tier repeats too many identical player selections and targets from another tier. It is withheld until the model builds a genuinely distinct combination with eligible sportsbook markets.</p></section>';
  previouslyShown.push(signature);
  // Keep useful model research visible while strictly separating it from
  // book-verified, playable SGPs. Never invent combined sportsbook odds.
  const minOdds={Small:2000,Medium:3000,Nuke:10000}[tier.risk];
  const maxOdds={Small:2999,Medium:8000,Nuke:null}[tier.risk];
  const band=maxOdds===null?'+'+minOdds+' or higher':'+'+minOdds+' to +'+maxOdds;
  const rows=tier.legs.map(leg=>{
   const pick=publicPick(leg);
   const source=profileFor(market,leg,leg.category==='td'?'rushing':leg.category)||
    (leg.category==='td'?profileFor(market,leg,'receiving'):null);
   const why=leg.category==='td'?tdWhy(market,leg):
    shortWhy(source,leg,leg.category,tier.risk,market);
   return '<article class="mr-public-sgp-pick"><div class="mr-public-sgp-name">'+E(leg.name)+'</div>'+
    '<div class="mr-public-sgp-line"><span>'+E(pick.category)+'</span><strong>'+E(pick.amount)+'</strong></div>'+
    '<p class="mr-public-sgp-why"><b>Why:</b> '+E(why)+'</p></article>';
  }).join('');
  return '<section class="mr-public-sgp-tier" data-risk="'+E(tier.risk)+'" aria-label="'+E(tier.risk)+' unverified research picks">'+
   '<h3>'+E(tier.risk)+' • RESEARCH ONLY</h3>'+
   '<p class="mr-public-sgp-why" role="status">Target combined sportsbook odds: '+E(band)+
   '. NO VERIFIED COMBINED QUOTE. These are model projections, not confirmed sportsbook lines or a playable SGP.</p>'+
   (rows||'<p class="mr-public-sgp-why">No eligible player projections yet.</p>')+
   '</section>';
 }).join('');
 return '<style>'+
  '.mr-public-sgp-grid{display:grid;gap:13px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));margin:8px 0 16px}'+
  '.mr-public-sgp-tier{min-width:0;border:1px solid #367462;border-radius:14px;background:#0c2230;padding:14px}'+
  '.mr-public-sgp-tier[data-risk=Medium]{border-color:#4481bb}'+
  '.mr-public-sgp-tier[data-risk=Nuke]{border-color:#a558ca}'+
  '.mr-public-sgp-tier h3{font-size:19px;font-weight:850;color:#b0f5d9;margin:0 0 9px}'+
  '.mr-public-sgp-pick{padding:12px 0;border-top:1px solid #294653}'+
  '.mr-public-sgp-name{font-size:16px;font-weight:850;color:#6eedbd;line-height:1.3}'+
  '.mr-public-sgp-line{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:5px 10px;margin:5px 0 5px;font-size:14px;color:#d7e9f0}'+
  '.mr-public-sgp-line strong{font-size:16px;color:#fff;white-space:normal}'+
  '.mr-public-sgp-why{font-size:12px;line-height:1.45;color:#b8cdd8;margin:5px 0 0}'+
  '.mr-public-sgp-note{font-size:11px;line-height:1.4;color:#9fb8c4;margin:0 0 12px}'+
  '</style><div class="mr-public-sgp-grid" aria-label="Concise NFL player projection picks">'+cards+'</div>'+
  '<p class="mr-public-sgp-note">'+
  (saved?'Previously saved predictions. Refresh player availability before using. ':'')+
  'Model targets, not confirmed sportsbook lines. Check starters and injury status before betting.</p>';
}
