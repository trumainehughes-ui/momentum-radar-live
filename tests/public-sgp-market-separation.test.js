import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('public SGP uniqueness is per player, team, market and target',()=>{
 assert.match(page,/const key=\[name,team,market,target\]\.join\('\|'\)/);
 assert.match(page,/names\.has\(key\)/);
 assert.doesNotMatch(page,/names\.has\(name\)/);
});
test('public SGP shows individual market rationale without adding an unverified price',()=>{
 assert.match(page,/class="sgp-leg-why">Why: /);
 assert.match(page,/\.sgp-leg-why\{color:/);
 assert.match(page,/publicWhy\(l,String\(l\.category\|\|''\)\.toLowerCase\(\)\)/);
 assert.match(page,/Combined sportsbook odds and player lines are not verified/);
});

test('separate TD and receiving selections render as independent public legs when evidence is verified',()=>{
 const source=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
 const first=source.indexOf('function sgpSelectionDisplay(l){');
 const last=source.indexOf('function offerHtml(x){',first);
 assert.ok(first>0&&last>first);
 const context={
  URL,
  state:{selected:null,currentBookSgpModel:null,recheckLoading:false,recheckStatus:null},
  fmtStamp:()=> 'Updated now',
  esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  renderPublicBookResearch:()=>'',renderOdds:()=>'',renderLocalBookParity:()=>'',
  publicWhy:(_leg,cat)=>cat==='td'?'Touchdown scoring opportunities.':'Recent yardage and matchup.',
  window:undefined
 };
 vm.runInNewContext(source.slice(first,last)+';this.render=renderParlays;',context);
 const bookOffer=(category,line)=>({
  available:true,book:'DraftKings',line,odds:-110,
  checkedAt:new Date().toISOString(),sourceUrl:'https://sportsbook.draftkings.com/'
 });
 const data={home:'JAX',away:'HOU',status:'CURRENT',updatedDataCurrent:true,
  researchParlays:[{risk:'Small',mode:'MODEL_ONLY',researchFromCurrentMarkets:true,
   legs:[
    {player:'Example Receiver',team:'JAX',category:'td',target:'Anytime TD',
     bookOffer:bookOffer('td',null)},
    {player:'Example Receiver',team:'JAX',category:'receiving',target:45,
     bookOffer:bookOffer('receiving',45)},
    {player:'Example Quarterback',team:'HOU',category:'passing',target:205,
     bookOffer:bookOffer('passing',205)}
   ]}]};
 const html=context.render(data);
 assert.equal((html.match(/class="sgp-leg"/g)||[]).length,3);
 assert.equal((html.match(/Example Receiver/g)||[]).length,2);
 assert.match(html,/Anytime touchdown/);
 assert.match(html,/Receiving yards/);
 assert.equal((html.match(/class="sgp-leg-why"/g)||[]).length,3);
});
