// Browser-side model watchlist only. This file never submits wagers or settles book tickets.
(function(root){
 'use strict';
 const STORAGE_KEY='momentum-nfl-model-watchlist/v1';
 const BLOCK=new Set(['OUT','IR','INACTIVE','DOUBTFUL']);
 const REVIEW=new Set(['QUESTIONABLE','UNKNOWN','REPORTED_OTHER']);
 const key=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const safeStorage=()=>{
  try {return root.localStorage||null;}catch{return null;}
 };
 const clone=x=>JSON.parse(JSON.stringify(x));
 const modelLeg=leg=>({
  playerID:String(leg?.playerID||leg?.playerId||''),name:String(leg?.name||''),
  team:String(leg?.team||'').toUpperCase(),cat:String(leg?.cat||leg?.category||''),
  line:leg?.analyticsThreshold??leg?.threshold??leg?.line??null,
  opponent:leg?.opponent||null
 });
 const legKey=x=>[key(x.playerID),key(x.name),key(x.team),key(x.cat),String(x.line??'')].join('|');
 const samePlayer=(leg,inj)=>{
  if(key(leg.team)&&key(inj.team)&&key(leg.team)!==key(inj.team))return false;
  const id=key(leg.playerID),other=key(inj.playerId||inj.playerID);
  if(id&&other&&/^\d+$/.test(id)&&/^\d+$/.test(other))return id===other;
  return !!key(leg.name)&&key(leg.name)===key(inj.name);
 };
 const normalizeWatch=w=>{
  if(!w||w.kind!=='MODEL_WATCH'||!/^\d{7,12}$/.test(String(w.gameId||'')))return null;
  const legs=Array.isArray(w.legs)?w.legs.slice(0,12).map(modelLeg):[];
  if(!legs.length||!['Small','Medium','Nuke'].includes(w.risk))return null;
  return {id:String(w.id||''),kind:'MODEL_WATCH',gameId:String(w.gameId),risk:w.risk,date:/^\d{4}-\d{2}-\d{2}$/.test(String(w.date||''))?String(w.date):null,
    home:String(w.home||''),away:String(w.away||''),legs,
    activeLegs:Array.isArray(w.activeLegs)?w.activeLegs.slice(0,12).map(modelLeg):legs,
    removedLegs:Array.isArray(w.removedLegs)?w.removedLegs.slice(0,12):[],
    status:String(w.status||'MODEL_TRACKED'),updatedAt:w.updatedAt||null,
    revisions:Array.isArray(w.revisions)?w.revisions.slice(-12):[],
    actualCombinedOdds:null,bookSettlement:'NOT_CONNECTED'};
 };
 function classifyWatch(watch,report){
  const w=normalizeWatch(watch);if(!w)return null;
  if(!report?.ok||report.reportAvailable!==true)return {...w,status:'INJURY_SOURCE_UNAVAILABLE',actualCombinedOdds:null,bookSettlement:'NOT_CONNECTED'};
  const injuries=Array.isArray(report.injuries)?report.injuries:[];
  const affected=[],review=[];
  for(const leg of w.legs){
   const injury=injuries.find(x=>samePlayer(leg,x));
   if(!injury)continue;
   if(BLOCK.has(injury.status))affected.push({leg:legKey(leg),name:leg.name,status:injury.status,team:leg.team});
   if(REVIEW.has(injury.status))review.push({leg:legKey(leg),name:leg.name,status:injury.status,team:leg.team});
  }
  const removed=new Set(affected.map(x=>x.leg));
  const activeLegs=w.legs.filter(x=>!removed.has(legKey(x)));
  return {...w,activeLegs,removedLegs:affected,
    status:affected.length?'MODEL_REBUILD_REQUIRED':review.length?'PLAYER_REVIEW_REQUIRED':'MODEL_TRACKED',
    reviewLegs:review,actualCombinedOdds:null,bookSettlement:'AWAITING_AUTHENTICATED_BOOK_RULES'};
 }
 function signature(report){
  if(!report?.ok||report.reportAvailable!==true)return 'SOURCE_UNAVAILABLE';
  const injuries=(report.injuries||[]).map(x=>[key(x.team),key(x.playerId||x.name),x.status].join('|')).sort();
  const roster=(report.rosterSignals||[]).map(x=>[key(x.team),key(x.playerId||x.name),key(x.position),x.starterReported===true?'STARTER':'ROLE_UNVERIFIED'].join('|')).sort();
  return JSON.stringify({injuries,roster,rosterSource:!!report.rosterSignalsAvailable});
 }
 function makeWatch(game,candidate,nonce){
  if(!game||!candidate||!['Small','Medium','Nuke'].includes(candidate.risk)||
     candidate.tierAssessment?.compositionOk===false||
     !Array.isArray(candidate.legs)||candidate.legs.length!==candidate.requiredLegs||
     !candidate.legs.length)return null;
  const id=String(game.gameId||'');if(!/^\d{7,12}$/.test(id))return null;
  return normalizeWatch({kind:'MODEL_WATCH',id:id+':'+candidate.risk+':'+String(nonce||Date.now()),
    gameId:id,date:game.date||null,home:game.home?.abbr||'',away:game.away?.abbr||'',
    risk:candidate.risk,legs:candidate.legs,activeLegs:candidate.legs,
    updatedAt:new Date().toISOString(),status:'MODEL_TRACKED'});
 }
 function rebuildWatch(watch,candidate,report){
  const classified=classifyWatch(watch,report);if(!classified)return null;
  if(classified.status!=='MODEL_REBUILD_REQUIRED')return classified;
  const newWatch=makeWatch({gameId:watch.gameId,home:{abbr:watch.home},away:{abbr:watch.away}},candidate,watch.id);
  if(!newWatch)return classified; // Not enough eligible model legs: do not pad with TDs or invent prices.
  if(newWatch.legs.some(x=>(report.injuries||[]).some(i=>BLOCK.has(i.status)&&samePlayer(x,i))))
   return classified;
  return {...classified,legs:newWatch.legs,activeLegs:newWatch.legs,removedLegs:classified.removedLegs,
    status:'MODEL_AUTO_REBUILT',updatedAt:new Date().toISOString(),
    revisions:[...(watch.revisions||[]),{at:new Date().toISOString(),reason:'injury_or_roster_change',
      priorLegs:clone(watch.legs),removed:clone(classified.removedLegs)}].slice(-12),
    actualCombinedOdds:null,bookSettlement:'NOT_CONNECTED'};
 }
 const api={BLOCK,REVIEW,modelLeg,legKey,samePlayer,normalizeWatch,classifyWatch,signature,makeWatch,rebuildWatch};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.momentumParlayImpactRules=api;
 if(!root.document)return;
 const reportCache=new Map(),lastSignatures=new Map();
 const storage=safeStorage();
 let watches=[];
 try{const stored=JSON.parse(storage?.getItem(STORAGE_KEY)||'[]');watches=Array.isArray(stored)?stored.map(normalizeWatch).filter(Boolean).slice(0,36):[];}catch{watches=[];}
 const persist=()=>{try{storage?.setItem(STORAGE_KEY,JSON.stringify(watches.slice(0,36)));}catch{}};
 const element=()=>root.document.getElementById('nflParlayWatch');
 const title=(txt,css)=>{const div=root.document.createElement('div');div.textContent=txt;if(css)div.className=css;return div;};
 function render(){
  const box=element();if(!box)return;box.textContent='';
  box.appendChild(title('Tracked model parlays — not placed sportsbook tickets','rank'));
  box.appendChild(title('Automatic ESPN injury checks update these selections while Momentum Radar is open. A blocked model leg is excluded and a safe replacement is requested. Actual void/loss rulings and book-adjusted odds require sportsbook confirmation.','note'));
  if(!watches.length){box.appendChild(title('No model parlays tracked yet. Choose Track model parlay on Small, Medium, or Nuke.','meta'));return;}
  for(const w of watches.slice().reverse()){
   const card=root.document.createElement('div');card.className='nflSgpMini';
   card.appendChild(title((w.away||'?')+' @ '+(w.home||'?')+' • '+w.risk,'rank'));
   const labels={
    MODEL_TRACKED:'Model monitored • book price unverified',
    MODEL_AUTO_REBUILT:'Model automatically rebuilt • review new legs before betting',
    MODEL_REBUILD_REQUIRED:'Injury impacted model • valid replacement unavailable',
    MODEL_RECHECK_REQUIRED:'Roster or depth change • refreshing this model',
    PLAYER_REVIEW_REQUIRED:'Questionable/uncertain player • hold for review',
    INJURY_SOURCE_UNAVAILABLE:'Injury feed unavailable • model status unverified'
   };
   card.appendChild(title(labels[w.status]||w.status,'meta'));
   card.appendChild(title(w.legs.map(x=>x.name+' — '+(x.cat==='td'?'Anytime TD':String(x.line??'Model line')+' '+x.cat)).join(' | '),'note'));
   if(w.removedLegs?.length)card.appendChild(title('Excluded from the prior model: '+w.removedLegs.map(x=>x.name+' ('+x.status+')').join(', '),'note'));
   card.appendChild(title('Book settlement: not connected. Verified adjusted SGP odds: unavailable.','refresh'));
   const remove=root.document.createElement('button');remove.type='button';remove.textContent='Stop tracking';remove.onclick=()=>{watches=watches.filter(x=>x.id!==w.id);persist();render();};
   card.appendChild(remove);box.appendChild(card);
  }
 }
 function addWatch(game,candidate){
  const watch=makeWatch({...game,date:root.momentumSelectedNflDate?.()||game.date||null},candidate);if(!watch)return;
  watches=watches.filter(x=>!(x.gameId===watch.gameId&&x.risk===watch.risk)).concat(watch).slice(-36);
  const snapshot=reportCache.get(watch.gameId);
  if(snapshot)watches=watches.map(w=>w.id===watch.id?classifyWatch(w,snapshot):w);
  persist();render();pollTracked();
 }
 function onSnapshot(gameId,report){
  const id=String(gameId),before=lastSignatures.get(id),after=signature(report);
  lastSignatures.set(id,after);reportCache.set(id,report);
  let changed=false;
  watches=watches.map(w=>{
   if(w.gameId!==id)return w;
   const next=classifyWatch(w,report);
   if(!next)return w;
   const evidenceChanged=before!==undefined&&before!==after;
   if(evidenceChanged&&next.status==='MODEL_TRACKED')next.status='MODEL_RECHECK_REQUIRED';
   if(next.status!==w.status||next.activeLegs.length!==w.activeLegs.length||JSON.stringify(next.removedLegs)!==JSON.stringify(w.removedLegs))changed=true;
   return {...next,updatedAt:changed?new Date().toISOString():w.updatedAt};
  });
  if(changed){persist();render();}
  return before!==undefined&&before!==after;
 }
 function updateWatchesWithCandidates(gameId,tiers,report){
  let revised=false;
  watches=watches.map(w=>{
   if(w.gameId!==String(gameId)||!['MODEL_REBUILD_REQUIRED','MODEL_RECHECK_REQUIRED'].includes(w.status))return w;
   const candidate=tiers.find(x=>x.risk===w.risk);
   if(w.status==='MODEL_REBUILD_REQUIRED'){
    const replacement=rebuildWatch(w,candidate,report);
    if(replacement?.status==='MODEL_AUTO_REBUILT'){revised=true;return replacement;}
    return w;
   }
   const qualified=candidate?.tierAssessment?.compositionOk!==false&&
       candidate?.legs?.length===candidate?.requiredLegs;
   if(!qualified)return w;
   const fresh=candidate.legs.map(modelLeg);
   if(fresh.some(x=>(report?.injuries||[]).some(i=>BLOCK.has(i.status)&&samePlayer(x,i))))return w;
   const priorKeys=w.legs.map(legKey).join(';'),nextKeys=fresh.map(legKey).join(';');
   revised=true;
   if(priorKeys===nextKeys)return {...w,status:'MODEL_TRACKED',updatedAt:new Date().toISOString()};
   return {...w,legs:fresh,activeLegs:fresh,status:'MODEL_AUTO_REBUILT',updatedAt:new Date().toISOString(),
     actualCombinedOdds:null,bookSettlement:'NOT_CONNECTED',
     revisions:[...(w.revisions||[]),{at:new Date().toISOString(),reason:'reported_roster_or_lineup_change',
        priorLegs:clone(w.legs),removed:[]}].slice(-12)};
  });
  if(revised){persist();render();}
 }

 function decorate(game,data){
  const panel=root.document.getElementById('nflSGP');
  if(!panel||!game)return;
  const tiers=data?.sgps?.Analytics||[];
  for(const node of panel.querySelectorAll('.nflSgpMini[data-risk]')){
   const risk=node.dataset.risk,candidate=tiers.find(x=>x.risk===risk),valid=candidate?.tierAssessment?.compositionOk!==false&&candidate?.legs?.length===candidate?.requiredLegs;
   if(!valid||node.querySelector('[data-model-track]'))continue;
   const btn=root.document.createElement('button');btn.type='button';btn.dataset.modelTrack=risk;btn.textContent='Track '+risk+' model parlay';btn.onclick=()=>addWatch(game,candidate);node.appendChild(btn);
  }
  updateWatchesWithCandidates(String(game.gameId),tiers,reportCache.get(String(game.gameId)));
  render();
 }
 // Only on material roster/injury changes, attempt a fresh model rebuild for
 // other tracked matchups. This may be unavailable when model/data providers are degraded.
 async function rebuildBackgroundGame(id,report){
  const entry=watches.find(w=>w.gameId===id&&w.date);
  if(!entry)return;
  const query=new URLSearchParams({date:entry.date,gameId:id,finalCheck:'1'});
  try{
   const response=await root.fetch('/api/nfl-markets?'+query,{cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();
   if(data.ok)updateWatchesWithCandidates(id,data.sgps?.Analytics||[],report);
  }catch{}
 }
 // Other tracked matchups get lightweight ESPN-only polling, with one model
 // recomputation on material change. Sportsbook quotes are never synthesized.
 const lastPoll=new Map(),inflight=new Set();
 async function pollTracked(){
  if(root.document.hidden)return;
  const ids=[...new Set(watches.map(w=>w.gameId))];
  for(const id of ids){
   if(inflight.has(id)||String(root.momentumSelectedNflGame?.()||'')===id)continue;
   const last=lastPoll.get(id)||0;
   if(Date.now()-last<60*1000)continue;
   lastPoll.set(id,Date.now());inflight.add(id);
   try{
    const r=await root.fetch('/api/nfl-injuries?'+new URLSearchParams({gameId:id,ts:Date.now()}),{cache:'no-store'});
    const report=await r.json(),usable={...report,ok:r.ok&&report.ok};const changed=onSnapshot(id,usable);if(changed&&usable.ok)await rebuildBackgroundGame(id,usable);
   }catch{onSnapshot(id,{ok:false,reportAvailable:false});}
   finally{inflight.delete(id);}
  }
 }
 if(typeof root.setInterval==='function')root.setInterval(pollTracked,60*1000);
 root.momentumParlayWatch={decorate,onSnapshot,render,getWatches:()=>clone(watches),pollTracked};
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',render);else render();
})(typeof window!=='undefined'?window:globalThis);
