// Read-only client display for authorized Optimal projection snapshots.
// Never requests Groq credits, runs the sportsbook collector, or changes SGP legs.
import {optimalCrosscheck} from './lib/optimal-projection-crosscheck.js';
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cache=new Map();
const label=p=>p==null?'—':Number(p).toFixed(1).replace(/\.0$/,'');
async function currentReference(league,date,gameId){
 const key=league+'|'+date+'|'+gameId,hit=cache.get(key);
 if(hit&&Date.now()-hit.at<60000)return hit.data;
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),8500);
 try{
  const response=await fetch('/api/optimal-projection-reference?'+
   new URLSearchParams({league,date,gameId}),{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('reference_lookup_unavailable');
  const data=await response.json();
  cache.set(key,{data,at:Date.now()});
  return data;
 }finally{clearTimeout(timeout)}
}
export async function showOptimalCrosscheck({league='nfl',date,gameId,model,target}={}){
 const node=typeof target==='string'?document.querySelector(target):target;
 if(!node||!['nfl','nba'].includes(league)||!/^[0-9]{7,12}$/.test(String(gameId))||
  !/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return;
 const requestKey=league+'|'+date+'|'+gameId;
 node.dataset.optimalKey=requestKey;
 node.innerHTML='<details class="mr-optimal-reference" style="margin:14px 0;padding:12px;border:1px solid #365568;border-radius:12px">'+
  '<summary style="cursor:pointer;font-weight:700">✨ AI projection cross-check · Optimal</summary>'+
  '<p style="font-size:12px">Checking authorized Optimal research snapshot…</p></details>';
 let ref;
 try{ref=await currentReference(league,date,gameId)}
 catch{ref={status:'NO_CURRENT_OPTIMAL_REFERENCE'}}
 if(node.dataset.optimalKey!==requestKey)return;
 const m={...(model||{}),league,date,gameId:String(gameId)};
 const cross=optimalCrosscheck(m,ref);
 const title='<summary style="cursor:pointer;font-weight:700">✨ AI projection cross-check · Optimal Sports Projections</summary>';
 const detail=cross.status==='ADVISORY_OPTIMAL_CROSSCHECK'?
 '<p style="font-size:12px">Independent percentile projections observed '+
 escapeHtml(new Date(cross.observedAt).toLocaleString())+
 '. Existing Momentum AI, injury and sportsbook rules remain authoritative.</p>'+
 cross.tiers.map(t=>'<div style="border-top:1px solid #344c58;padding:9px 0">'+
 '<b>'+escapeHtml(t.risk)+'</b> · '+t.matchedReferenceLegs+'/'+t.eligibleModelLegs+
 ' player-market comparisons'+
 (t.matches.length?'<div>'+t.matches.slice(0,5).map(p=>
 '<div style="font-size:12px;margin:5px 0">'+escapeHtml(p.player)+
 ' · '+escapeHtml(p.category)+' · Optimal p50 '+label(p.p50)+
 ' · p75 '+label(p.p75)+' · p90 '+label(p.p90)+
 (p.medianDelta!=null?' · Difference from Momentum AI median '+
 (p.medianDelta>0?'+':'')+label(p.medianDelta):'')+'</div>').join('')+'</div>':'')+
 '</div>').join('')+
 '<p style="font-size:12px">Statistical comparison only; not verified props, confirmed injuries, or combined sportsbook odds.</p>':
 '<p style="font-size:12px">Optimal projection reference has not been synchronized for this game. '+
 'Momentum AI and existing injury/SGP checks remain active. No substitute betting lines are generated.</p>';
 node.innerHTML='<details class="mr-optimal-reference" style="margin:14px 0;padding:12px;border:1px solid #365568;border-radius:12px">'+
 title+detail+'</details>';
}
if(typeof window!=='undefined')window.momentumOptimalCrosscheck={showOptimalCrosscheck};
