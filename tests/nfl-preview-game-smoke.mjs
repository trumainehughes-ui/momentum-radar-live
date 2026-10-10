import assert from 'node:assert/strict';

const endpoint=new URL('/api/nfl-markets','https://momentum-radar-live-1pv1vcqdk-trumainehughes-6743.vercel.app');
endpoint.searchParams.set('date','2026-10-11');
endpoint.searchParams.set('gameId','401872987');
const rsp=await fetch(endpoint,{signal:AbortSignal.timeout(180000),headers:{accept:'application/json'}});
if(rsp.status===401||rsp.status===403)throw Error('PREVIEW_AUTH_REQUIRED: GitHub runner cannot access this Vercel preview');
assert.equal(rsp.status,200,'preview game API returned HTTP '+rsp.status);
const contentType=rsp.headers.get('content-type')||'';
assert.match(contentType,/application\/json/,'preview did not return JSON');
const d=await rsp.json();
assert.equal(d.ok,true);
assert.equal(d.scope,'game');
assert.equal(String(d.gameId),'401872987');
assert.equal(d.date,'2026-10-11');
assert.equal(d.sgps?.mode,'MODEL_FIRST_BOOK_UNQUOTED');
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
let complete=0,notReady=0;
for(const book of ['Analytics','DraftKings','FanDuel']){
 for(const card of d.sgps?.[book]||[]){
  assert.ok(['Small','Medium','Nuke'].includes(card.risk),book+': bad tier');
  assert.notEqual(card.combinedBookQuoteVerified,true,'unverified combined quote shown as verified');
  assert.ok(card.actualSgpOdds===null||card.actualSgpOdds===undefined,'unsupported actual combined price');
  const legs=card.legs||[];
  if(!legs.length){notReady++;continue;}
  assert.equal(legs.length,card.requiredLegs,book+' '+card.risk+': incomplete card');
  assert.equal(card.tierAssessment?.compositionOk,true,book+' '+card.risk+': composition rejected');
  const yardCats=new Set(),names=new Set();
  let yards=0,td=0;
  for(const leg of legs){
   assert.equal(String(leg.eventID||leg.gameId),'401872987','wrong game');
   assert.ok(['MIN','NO'].includes(norm(leg.team)),'wrong team: '+leg.name);
   if(leg.opponent)assert.equal(norm(leg.opponent),norm(leg.team)==='MIN'?'NO':'MIN');
   const cat=leg.cat||leg.category;
   assert.ok(!names.has(norm(leg.name)),'duplicate player');
   names.add(norm(leg.name));
   if(cat==='td')td++;
   if(['passing','rushing','receiving'].includes(cat)){
    yards++;yardCats.add(cat);
    if(book==='Analytics')assert.equal(Number(leg.analyticsThreshold)%5,0,'model yards must be 5-yard steps');
   }
  }
  assert.ok(td<=(card.risk==='Nuke'?2:1),'too many TD legs');
  assert.ok(yards>=(card.risk==='Small'?2:3),'not enough yardage legs');
  assert.ok(yardCats.size>=2,'not enough different yardage types');
  complete++;
 }
}
console.log(JSON.stringify({game:'MIN at NO',date:d.date,gameId:d.gameId,provider:d.provider,degraded:d.degraded,marketRows:d.marketRows,completeCards:complete,notReadyCards:notReady,combinedPriceVerified:false},null,2));
assert.ok(complete>0,'NO_COMPLETE_SGP_CARDS: game remains model NOT READY; inspect provider and identity evidence');
