import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAdvisory} from '../lib/ai-mechanics/ai-advisors.js';
import handler from '../api/ai-analysis.js';

const now=Date.parse('2026-10-10T20:00:00.000Z'),gameId='401872981';
const tier=(risk,legCount)=>({
 risk,legCount,modelStatus:'MODEL_CANDIDATE',
 books:{
  FanDuel:{status:'MODEL_LINES_NOT_FULLY_LISTED',
   matchedLegs:legCount-1,requiredLegs:legCount,
   missingLegs:[{name:'Bhayshul Tuten',category:'rushing',requested:55,
    listedOffers:[{display:'60+',minimumToWin:60}]}]},
  DraftKings:{status:'ALL_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED',
   matchedLegs:legCount,requiredLegs:legCount,missingLegs:[]}
 }
});
function evidence(){return{
 gameId,game:{homeAbbr:'JAX',awayAbbr:'PHI'},
 model:{validation:{sportsbookVerificationAvailable:true}},
 sportsbooks:{league:'nfl',gameId,marketFeedAvailable:true,
  sourceCheckedAt:new Date(now-20000).toISOString(),
  tiers:[tier('Small',4),tier('Medium',5),tier('Nuke',6)]}
}}
test('AI scout flags FanDuel mismatch and independent DraftKings listing without inventing correlated payout',()=>{
 const v=generateAdvisory('sportsbook',evidence(),{now});
 assert.equal(v.mode,'sportsbook');
 assert.equal(v.items.length,6);
 assert.equal(v.canChangePicks,false);
 assert.equal(v.canSetOdds,false);
 assert.equal(v.canModifyModel,false);
 const dk=v.items.find(x=>x.risk==='Small'&&x.book==='DraftKings');
 const fd=v.items.find(x=>x.risk==='Medium'&&x.book==='FanDuel');
 assert.equal(dk.marketStatus,'ALL_INDIVIDUAL_LINES_MATCHED_COMBINED_UNQUOTED');
 assert.equal(dk.bookQuoteConfirmed,false);
 assert.equal(dk.sportsbookCombinedOddsVerified,false);
 assert.equal(fd.exactLegs,4);
 assert.equal(fd.requiredLegs,5);
 assert.deepEqual(fd.proposedOfferChecks[0].bookOffers,['60+']);
 assert.equal(fd.proposedOfferChecks[0].requested,55);
 assert.equal(fd.proposedOfferChecks[0].action.includes('Manual recheck'),true);
 assert.ok(v.flags.some(x=>x.code==='BOOK_LEGS_NOT_ALL_MATCHED'));
 assert.ok(v.notes.some(x=>x.includes('not verify')||x.includes('does not prove')));
 assert.ok(!('actualCombinedOdds' in dk));
});
test('missing/wrong-game/stale individual markets never give AI candidate advice',()=>{
 for(const mutate of [
  d=>d.sportsbooks.gameId='401872982',
  d=>d.sportsbooks.marketFeedAvailable=false,
  d=>d.model.validation.sportsbookVerificationAvailable=false,
  d=>d.model.stale=true,
  d=>d.model.degraded=true,
  d=>d.sportsbooks.sourceCheckedAt=new Date(now-16*60000).toISOString(),
  d=>d.sportsbooks.sourceCheckedAt=new Date(now+30000).toISOString()
 ]){
  const d=evidence();mutate(d);
  const out=generateAdvisory('sportsbook',d,{now});
  assert.equal(out.items.length,0);
  assert.ok(out.flags.length>=1);
  assert.equal(out.canSetOdds,false);
 }
});
test('wrong tier leg count and absent audited sportsbook record cannot be treated as matched',()=>{
 const d=evidence();
 d.sportsbooks.tiers[0].legCount=3;
 delete d.sportsbooks.tiers[1].books.FanDuel;
 const result=generateAdvisory('sportsbook',d,{now});
 assert.equal(result.items.length,6);
 assert.ok(result.flags.some(x=>x.code==='SGP_MODEL_NOT_READY'));
 assert.ok(result.flags.some(x=>x.code==='SPORTSBOOK_AUDIT_INCOMPLETE'));
 const missing=result.items.find(x=>x.risk==='Medium'&&x.book==='FanDuel');
 assert.equal(missing.exactLegs,null);
});
test('without verified provider evidence, AI sportsbook route spends zero Groq and OpenRouter credits',async()=>{
 const priorKey=process.env.GROQ_API_KEY,priorBackup=process.env.OPENROUTER_API_KEY,
  previousFetch=globalThis.fetch;
 let calls=0;
 try{
  process.env.GROQ_API_KEY='fake-groq';
  delete process.env.OPENROUTER_API_KEY;
  globalThis.fetch=async()=>{calls++;throw Error('should not reach AI')};
  const d=evidence();d.sportsbooks.marketFeedAvailable=false;
  const req={method:'POST',headers:{},body:{mode:'sportsbook',data:d}};
  const res={code:null,setHeader(){return this},status(n){this.code=n;return this},json(body){this.body=body;return this}};
  await handler(req,res);
  assert.equal(res.code,200);
  assert.equal(res.body.sourceGated,true);
  assert.equal(res.body.mechanics.items.length,0);
  assert.equal(res.body.verified,false);
  assert.equal(calls,0);
 }finally{
  globalThis.fetch=previousFetch;
  if(priorKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=priorKey;
  if(priorBackup===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=priorBackup;
 }
});
test('source-scoped sportsbook evidence reaches existing Groq API only on explicit on-demand action',async()=>{
 const priorKey=process.env.GROQ_API_KEY,priorBackup=process.env.OPENROUTER_API_KEY,
  previousFetch=globalThis.fetch;
 let prompt='',calls=0;
 try{
  process.env.GROQ_API_KEY='fake-groq';
  delete process.env.OPENROUTER_API_KEY;
  globalThis.fetch=async(url,opts)=>{
   calls++;assert.match(url,/api\.groq\.com/);
   prompt=JSON.parse(opts.body).messages[1].content;
   return{ok:true,json:async()=>({choices:[{message:{content:
    'FanDuel Small has 3/4 matching props. DraftKings Small has 4/4 individually listed. Combined SGP quote not verified.'}}]})};
  };
  const current=evidence();
  current.sportsbooks.sourceCheckedAt=new Date().toISOString();
  const req={method:'POST',headers:{'x-forwarded-for':'sportsbook-scout-integration-unique'},
   body:{mode:'sportsbook',data:current}};
  const res={code:null,setHeader(){return this},status(n){this.code=n;return this},json(body){this.body=body;return this}};
  await handler(req,res);
  assert.equal(res.code,200);
  assert.equal(res.body.verified,false);
  assert.equal(calls,1);
  assert.match(prompt,/Bhayshul Tuten/);
  assert.match(prompt,/DraftKings/);
  assert.match(prompt,/sportsbook/i);
  assert.equal(res.body.mechanics.canChangePicks,false);
 }finally{
  globalThis.fetch=previousFetch;
  if(priorKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=priorKey;
  if(priorBackup===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=priorBackup;
 }
});
