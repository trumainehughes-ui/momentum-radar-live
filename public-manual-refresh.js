// Safe, zero-paid-sports-API cached review control for both leagues.
(()=>{
 const idFor=sport=>sport==='NFL'?window.momentumSelectedNflGame?.():window.momentumSelectedNbaGame?.();
 const button=document.createElement('button');
 button.type='button';button.textContent='↻ Review cached game data (0 sports API credits)';
 button.style.cssText='padding:10px 14px;border:1px solid #6ca7c7;border-radius:9px;background:#183749;color:white;font-weight:800;cursor:pointer';
 const status=document.createElement('div');status.setAttribute('role','status');
 status.style.cssText='margin-top:6px;color:#b7c5d0;font-size:12px';
 const root=document.createElement('div');root.style.cssText='margin:12px 0';
 root.append(button,status);
 const mount=()=>{const target=document.querySelector('.wrap .top');if(target&&!root.isConnected)target.insertAdjacentElement('afterend',root)};
 let previous=0;
 button.addEventListener('click',async()=>{
  const nfl=document.querySelector('#nfl'),nba=document.querySelector('#nba');
  const sport=nfl&&getComputedStyle(nfl).display!=='none'?'NFL':nba&&getComputedStyle(nba).display!=='none'?'NBA':null;
  if(!sport){status.textContent='Choose NFL or NBA first.';return}
  const gameId=idFor(sport);
  if(!gameId){status.textContent='Open a specific game before reviewing its cached data.';return}
  if(Date.now()-previous<60000){status.textContent='Please wait 60 seconds before reviewing again.';return}
  previous=Date.now();button.disabled=true;status.textContent='Reading saved '+sport+' game snapshot…';
  try{
   const response=await fetch('/api/manual-refresh-preview?'+new URLSearchParams({sport,gameId}),{cache:'no-store'});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'cached_review_failed');
   status.textContent='Cached '+sport+' review: '+(result.updatedAt||'timestamp unavailable')+
    '. '+result.tiers.length+' stored SGP tier(s). No AI rebuild, new injury check, odds refresh or paid sports API call.';
  }catch(e){status.textContent='Cached review unavailable: '+String(e.message||e)+'. Existing selections unchanged.'}
  finally{button.disabled=false}
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
