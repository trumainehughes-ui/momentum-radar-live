// NFL prediction-first experience. Sportsbook odds and model forecasts are
// separate. Only model-screened, game-roster-aligned player forecasts appear.
// Unconfirmed starters are labelled unconfirmed; no synthetic bet lines.
const CATEGORIES=['passing','rushing','receiving','receptions'];
const BLOCKED_INJURIES=new Set(['OUT','IR','INACTIVE','INJURED RESERVE','SUSPENDED','DOUBTFUL','QUESTIONABLE']);
const CLEAN_NAME=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const categoryLabel={passing:'Passing yards',rushing:'Rushing yards',
 receiving:'Receiving yards',receptions:'Receptions'};
const validNum=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export function buildNflModelChoiceBoard({
 market,gameId,date,home,away,maxRows=12
}={}){
 const scope=String(gameId||''),teamSet=new Set([home,away].map(t=>String(t||'').toUpperCase()));
 if(!market||market.ok!==true||market.scope!=='game'||
  String(market.gameId)!==scope||date&&market.date!==date||
  !/^\d{7,12}$/.test(scope)||teamSet.size!==2||teamSet.has(''))
  return {status:'MODEL_NOT_CURRENT',rows:[],starterConfirmed:0,updatedAt:null};
 const excluded=new Set();
 for(const injury of market.validation?.injuryEvidence||[]){
  if(!BLOCKED_INJURIES.has(String(injury.status||'').toUpperCase()))continue;
  excluded.add(CLEAN_NAME(injury.name)+'|'+String(injury.team||'').toUpperCase());
 }
 const candidates=new Set();
 for(const tier of market.sgps?.Analytics||[]){
  if(!['Small','Medium','Nuke'].includes(tier.risk))continue;
  for(const leg of tier.legs||[]){
   const team=String(leg.team||'').toUpperCase(),cat=leg.category||leg.cat;
   if(!teamSet.has(team)||!CATEGORIES.includes(cat)||
    String(leg.gameId||scope)!==scope||!leg.player&&!leg.name)continue;
   candidates.add(CLEAN_NAME(leg.player||leg.name)+'|'+team+'|'+cat);
  }
 }
 const rows=[];
 for(const cat of CATEGORIES){
  for(const profile of market.categories?.[cat]||[]){
   const team=String(profile.team||'').toUpperCase(),name=String(profile.name||profile.player||'');
   const key=CLEAN_NAME(name)+'|'+team+'|'+cat;
   if(!candidates.has(key)||!teamSet.has(team)||
    excluded.has(CLEAN_NAME(name)+'|'+team))continue;
   const status=String(profile.availability||profile.injuryStatus||profile.status||'').toUpperCase();
   if(BLOCKED_INJURIES.has(status))continue;
   const projection=Number(profile.projection);
   if(!validNum(profile.projection)||projection<=0||projection>850)continue;
   const position=String(profile.position||'').toUpperCase();
   if(position==='QB'&&profile.starterVerified!==true){
    // Without confirmed QB1 evidence, a passer is NOT a safe starter pick.
    continue;
   }
   const starterConfirmed=profile.starterVerified===true&&
    profile.recommendationEligible!==false;
   const usage=validNum(profile.perGame)?Number(profile.perGame):null;
   const recent=Array.isArray(profile.recentForm?.last5)?
    profile.recentForm.last5.filter(validNum).map(Number).slice(0,5):[];
   const step=cat==='receptions'?1:5;
   const initial=Math.max(step,Math.round(projection/step)*step);
   const reason=String(profile.reason||profile.projectionNote||'').trim();
   rows.push({key,name,team,position,category:cat,projection,
    target:initial,step,usage,recent,reason,
    starterConfirmed,starterStatus:starterConfirmed?'CONFIRMED_STARTER':'ROLE_PROJECTION_NOT_CONFIRMED',
    gamesPlayed:Number(profile.gamesPlayed)||0});
  }
 }
 // Prioritize stronger per-game samples; preserve a mix of stat categories.
 rows.sort((a,b)=>Number(b.starterConfirmed)-Number(a.starterConfirmed)||
  Math.min(b.gamesPlayed,6)-Math.min(a.gamesPlayed,6)||
  CATEGORIES.indexOf(a.category)-CATEGORIES.indexOf(b.category)||
  b.projection-a.projection);
 return {status:rows.length?'MODEL_PREDICTIONS_AVAILABLE':'NO_ELIGIBLE_MODEL_ROLE_PROJECTIONS',
  rows:rows.slice(0,Math.max(1,Math.min(25,Number(maxRows)||12))),
  starterConfirmed:rows.filter(r=>r.starterConfirmed).length,
  updatedAt:market.fetchedAt||null,
  sportsbookOddsVerified:false,combinedSgpQuoteVerified:false,
  note:'These are statistical forecasts for players screened by the model, not sportsbook bets. Official game-day starter confirmation may remain pending.'};
}
function fmt(n){return Number.isInteger(n)?String(n):n.toFixed(1)}
export function renderNflModelChoiceBoard(board){
 if(!board||board.status!=='MODEL_PREDICTIONS_AVAILABLE')return '<div class="mr-prediction-empty">Current game-scoped role-screened predictions are not available. We do not fill gaps with made-up lines.</div>';
 const styles='<style>'+
 '.mr-prediction-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:11px;margin:10px 0 14px}'+
 '.mr-projection-choice{border:1px solid #32546a;background:#0b1d2a;border-radius:12px;padding:13px;min-width:0}'+
 '.mr-projection-choice h4{margin:0 0 4px;font-size:17px;color:#f4faff}'+
 '.mr-projection-value{font-size:23px;font-weight:850;color:#5beab2;margin:9px 0}'+
 '.mr-prediction-note{font-size:12px;line-height:1.5;color:#c1d6e5;margin:6px 0}'+
 '.mr-prediction-controls{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0}'+
 '.mr-prediction-controls button{min-height:38px;border-radius:8px;padding:8px 11px;background:#173a4a;color:#f5faff;border:1px solid #456d82;font-weight:750;cursor:pointer}'+
 '.mr-prediction-controls button[aria-pressed=true]{background:#135c47;border-color:#66e7b2}'+
 '.mr-user-choice{font-size:13px;color:#c8eef0;min-height:23px;font-weight:650}'+
 '</style>';
 const cards=board.rows.map(x=>{
  const unit=x.category==='receptions'?'catches':'yards';
  const avg=x.usage!==null?'Season per-game avg: '+fmt(x.usage)+' '+unit:'Season average not available';
  const recent=x.recent.length?'Recent games: '+x.recent.map(fmt).join(', '):'Recent game sample not available';
  const role=x.starterConfirmed?'Starter confirmed in model evidence':'Projected contributor • official starter not confirmed';
  const why=x.reason?x.reason.slice(0,230):'Weighted recent performance, season production and opponent matchup.';
  return '<article class="mr-projection-choice" data-mr-target="'+x.target+'" data-mr-step="'+x.step+'" data-mr-projection="'+x.projection+'" data-mr-unit="'+escape(unit)+'">'+
   '<h4>'+escape(x.name)+'</h4><div class="mr-prediction-note">'+escape(x.team)+' • '+escape(x.position||'Role pending')+
    ' • '+escape(categoryLabel[x.category])+'</div>'+
   '<div class="mr-projection-value">AI forecast: '+fmt(x.projection)+' '+unit+'</div>'+
   '<div class="mr-prediction-note">'+escape(role)+'</div>'+
   '<div class="mr-prediction-note">'+escape(avg)+' • '+escape(recent)+'</div>'+
   '<div class="mr-prediction-note">'+escape(why)+'</div>'+
   '<div class="mr-prediction-note"><b>Your comparison target: <span data-mr-target-label>'+fmt(x.target)+'</span> '+unit+'</b></div>'+
   '<div class="mr-prediction-controls"><button type="button" data-mr-adjust="-1">−'+x.step+' '+unit+'</button>'+
   '<button type="button" data-mr-adjust="1">+'+x.step+' '+unit+'</button></div>'+
   '<div class="mr-prediction-controls"><button type="button" data-mr-direction="higher" aria-pressed="false">I favor higher</button>'+
   '<button type="button" data-mr-direction="lower" aria-pressed="false">I favor lower</button></div>'+
   '<div class="mr-user-choice" aria-live="polite">Select higher or lower to compare your view with the AI forecast.</div>'+
   '</article>';
 }).join('');
 return styles+'<section class="mr-model-choice" data-mr-board="1" aria-label="Model NFL yardage predictions and your personal higher lower selections">'+
  '<h3 style="margin:0 0 5px;color:#f0faff">AI Player Yardage Forecasts — Your Choice</h3>'+
  '<p class="mr-prediction-note">AI projections use recent form, per-game production, and opponent matchup. Adjust the comparison target and decide higher or lower yourself. '+
  'A comparison target is NOT a sportsbook-offered line, and no odds or payouts are implied.</p>'+
  (board.starterConfirmed===0?
   '<p class="mr-prediction-note" style="color:#ffdca0">Official starters are not confirmed in this feed. These players are model-screened projected contributors; recheck the lineup and injury report before making a decision.</p>':'')+
  '<div class="mr-prediction-grid">'+cards+'</div></section>';
}
const installed=new WeakSet();
export function installNflModelChoiceInteractions(root){
 if(!root||installed.has(root))return;
 installed.add(root);
 root.addEventListener('click',event=>{
  const button=event.target?.closest?.('button[data-mr-adjust],button[data-mr-direction]');
  if(!button)return;
  const card=button.closest('.mr-projection-choice');
  if(!card||!button.closest('[data-mr-board]'))return;
  const step=Number(card.dataset.mrStep),projection=Number(card.dataset.mrProjection),
   unit=card.dataset.mrUnit;
  let target=Number(card.dataset.mrTarget);
  if(!Number.isFinite(target)||!Number.isFinite(step)||step<=0)return;
  if(button.hasAttribute('data-mr-adjust')){
   target=Math.max(step,Math.min(850,target+step*Number(button.dataset.mrAdjust)));
   card.dataset.mrTarget=String(target);
   card.querySelector('[data-mr-target-label]').textContent=fmt(target);
  }else{
   card.dataset.mrDirection=button.dataset.mrDirection;
  }
  for(const choice of card.querySelectorAll('[data-mr-direction]'))
   choice.setAttribute('aria-pressed',String(choice.dataset.mrDirection===card.dataset.mrDirection));
  const direction=card.dataset.mrDirection;
  if(direction){
   const delta=target-projection,comparison=delta===0?'equal to':
    (delta>0?'above':'below');
   card.querySelector('.mr-user-choice').textContent=
    'Your view: '+(direction==='higher'?'HIGHER than ':'LOWER than ')+fmt(target)+' '+unit+
    ' (target is '+fmt(Math.abs(delta))+' '+unit+' '+comparison+' the AI forecast). '+
    'Personal comparison only — sportsbook market not confirmed.';
  }
 });
}
