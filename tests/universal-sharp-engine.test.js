import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHARP_DECISIONS,SHARP_GLOBAL_POLICY,SHARP_ENGINE_VERSION,
 sharpOdds,evaluateSharpSlate,evaluateSharpCandidate}
 from '../lib/ai-mechanics/sharp-engine.js';
import {generateAdvisory,ADVISORY_MODES} from '../lib/ai-mechanics/ai-advisors.js';
import handler from '../api/ai-analysis.js';

const now=Date.parse('2026-10-12T20:00:00Z'),
 stamp=new Date(now-2*60_000).toISOString();
const sport='nfl',gameId='401872994';
function offer(book='DraftKings',price='+150'){
 return{sport,gameId,playerId:'player42',market:'anytime_touchdown',line:'yes',
  side:'YES',book,americanOdds:price,checkedAt:stamp,available:true,
  sourceUrl:book==='DraftKings'?'https://sportsbook.draftkings.com/markets':
   'https://sportsbook.fanduel.com/markets',offerId:book+'-42'};
}
function candidate(){
 return{id:'42',name:'Example Player',playerId:'player42',
  market:'anytime_touchdown',side:'YES',line:'yes',
  bookOffer:offer(),consensusOffers:[offer('FanDuel','+145')],
  eligibility:{status:'CLEARED',verifiedByServer:true,checkedAt:stamp},
  probability:{estimate:0.54,lower95:0.47,upper95:0.59,
   calibration:{status:'OUT_OF_SAMPLE_VERIFIED',
    certifiedBy:'MOMENTUM_MODEL_VALIDATOR',modelVersion:'nfl-td-v5',
    auditedAt:stamp,sampleSize:1200,brierScore:0.16}},
  movement:{opening:{americanOdds:'+175',checkedAt:stamp},
   bettingSplits:{publicBetPct:99,publicMoneyPct:97,checkedAt:stamp}}
 };
}
function data(){
 return{sport,gameId,
  sources:[{sourceId:'espn-roster',verifiedByServer:true,checkedAt:stamp},
   {sourceId:'bookmaker-direct',verifiedByServer:true,checkedAt:stamp}],
  situational:{checkedByServer:true,weatherApplicable:false},candidates:[candidate()]};
}
test('American prices are converted to decimal and break-even implied probabilities correctly',()=>{
 assert.equal(sharpOdds('+150').decimalOdds,2.5);
 assert.equal(sharpOdds('+150').impliedProbability,0.4);
 assert.equal(sharpOdds('-110').impliedProbability,0.52381);
 assert.equal(sharpOdds('+100').impliedProbability,0.5);
 for(const invalid of ['+0','-0','+50','-99','+7.5','100','-NaN','+Infinity',110,null])
  assert.equal(sharpOdds(invalid),null,String(invalid));
});
test('independent two-book + source validation and calibrated lower bound yield capped EV candidate',()=>{
 const review=evaluateSharpSlate(data(),{now,trustedServerEvidence:true});
 assert.equal(review.version,SHARP_ENGINE_VERSION);
 assert.deepEqual(review.process,['DATA_GATHERING','MULTI_SOURCE_CROSS_VERIFICATION','CALIBRATED_EV_EVALUATION']);
 const pick=review.selections[0];
 assert.equal(pick.decision,'EV_CANDIDATE');
 assert.equal(pick.marketContext.book,'DraftKings');
 assert.equal(pick.marketContext.impliedProbabilityPct,40);
 assert.equal(pick.quantitativeAngle.consensusStatus,'TWO_BOOKS_CONFIRMED');
 assert.equal(pick.quantitativeAngle.crossVerification,'CROSS_VERIFIED');
 assert.equal(pick.quantitativeAngle.calibrationStatus,'OUT_OF_SAMPLE_VERIFIED');
 assert.equal(pick.expectedValue.calibratedProbabilityPct,54);
 assert.equal(pick.expectedValue.lower95Pct,47);
 assert.equal(pick.expectedValue.estimatedRoiPct,35);
 assert.equal(pick.expectedValue.conservativeRoiPct,17.5);
 assert.ok(pick.bankroll.units>0&&pick.bankroll.units<=0.5);
 assert.equal(pick.canPlaceWagers,undefined);
 assert.equal(review.cannotPlaceBets,true);
 assert.equal(review.cannotAlterBookOdds,true);
 assert.equal(review.counts.EV_CANDIDATE,1);
 // Report only describes supported price movement, NOT inferred sharp money.
 assert.equal(pick.marketMovement.sharpVsPublic.sourceStatus,'UNAVAILABLE');
 assert.equal(pick.marketMovement.closingLineValuePercentagePoints,null);
 assert.equal(pick.marketMovement.clvStatus,'NO_MATCHED_VERIFIED_ENTRY_AND_CLOSING_PRICE');
});
test('weaker lower confidence probability, even with central positive EV, becomes PASS with zero stake',()=>{
 const x=data();x.candidates[0].probability.lower95=.39;
 const r=evaluateSharpSlate(x,{now,trustedServerEvidence:true}).selections[0];
 assert.equal(r.decision,'PASS');
 assert.equal(r.bankroll.units,0);
 assert.equal(r.expectedValue.estimatedRoiPct,35);
 assert.ok(r.expectedValue.conservativeRoiPct<0);
});
test('all sports share exactly the same quantitative validation and limit rules',()=>{
 for(const league of ['nfl','nba','mlb','nhl','soccer','cricket']){
  const x=data();x.sport=league;
  x.candidates[0].bookOffer.sport=league;
  x.candidates[0].consensusOffers[0].sport=league;
  const r=evaluateSharpSlate(x,{now,trustedServerEvidence:true});
  assert.equal(r.sport,league);
  assert.equal(r.selections[0].decision,'EV_CANDIDATE',league);
  assert.ok(r.selections[0].bankroll.units<=.5);
 }
});
test('missing/stale price, missing consensus or weak independent sources fail closed',()=>{
 for(const change of [
  x=>{x.candidates[0].bookOffer.checkedAt=new Date(now-20*60_000).toISOString()},
  x=>{x.candidates[0].bookOffer.americanOdds='+99'},
  x=>{x.candidates[0].consensusOffers=[]},
  x=>{x.sources[1].sourceId=x.sources[0].sourceId},
  x=>{x.candidates[0].bookOffer.gameId='WRONG_GAME'},
  x=>{x.candidates[0].consensusOffers[0].side='NO'},
  x=>{x.candidates[0].eligibility.status='QUESTIONABLE'},
  x=>{x.candidates[0].eligibility.checkedAt='2026-09-02T00:00:00Z'},
  x=>{x.candidates[0].probability.calibration.sampleSize=30},
  x=>{x.candidates[0].probability.lower95=null},
  x=>{x.candidates[0].probability.calibration.auditedAt='2025-01-01T00:00:00Z'}
 ]){
  const d=data();change(d);
  const r=evaluateSharpSlate(d,{now,trustedServerEvidence:true}).selections[0];
  assert.notEqual(r.decision,'EV_CANDIDATE',r.reasons.join('; '));
  assert.equal(r.bankroll.units,0);
 }
});
test('untrusted input, even if spoofed as verified, cannot qualify odds, EV or stake',()=>{
 const r=evaluateSharpSlate(data(),{now,trustedServerEvidence:false}).selections[0];
 assert.equal(r.decision,'WAIT');
 assert.equal(r.marketContext.status,'PRICE_UNVERIFIED');
 assert.equal(r.expectedValue.estimatedRoiPct,null);
 assert.equal(r.bankroll.units,0);
 assert.ok(r.reasons.includes('SERVER_CALIBRATION_NOT_ESTABLISHED'));
 const mechanics=generateAdvisory('sharp',data(),{now});
 assert.equal(mechanics.mode,'sharp');
 assert.equal(mechanics.selections[0].decision,'WAIT');
 assert.ok(ADVISORY_MODES.includes('sharp'));
});
test('CLV requires actual verified matched entry and final closing records, not opening lines',()=>{
 const x=data();const m=x.candidates[0].movement;
 m.closing={americanOdds:'+120',book:'DraftKings',line:'yes',side:'YES',
  checkedAt:stamp,verifiedByServer:true,isClosingPrice:true};
 let result=evaluateSharpCandidate(x.candidates[0],x,{now,trustedServerEvidence:true});
 assert.equal(result.marketMovement.closingLineValuePercentagePoints,null);
 m.entry={americanOdds:'+150',book:'DraftKings',line:'yes',side:'YES',
  checkedAt:new Date(now-4*60_000).toISOString(),verifiedByServer:true};
 result=evaluateSharpCandidate(x.candidates[0],x,{now,trustedServerEvidence:true});
 assert.equal(result.marketMovement.clvStatus,'ENTRY_VS_CLOSE_VERIFIED');
 assert.equal(result.marketMovement.closingLineValuePercentagePoints,5.45);
 m.closing.side='NO';
 result=evaluateSharpCandidate(x.candidates[0],x,{now,trustedServerEvidence:true});
 assert.equal(result.marketMovement.closingLineValuePercentagePoints,null);
});
test('client sharp mode is deterministic, has zero paid AI calls, and never accepts forged price proof',async()=>{
 const previous=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('MUST_NOT_FETCH')};
 try{
  const req={method:'POST',body:{mode:'sharp',data:data()},headers:{}};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},
   status(v){this.statusCode=v;return this},json(body){this.body=body;return this}};
  await handler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.ok,true);
  assert.equal(calls,0);
  assert.equal(res.body.mechanics.selections[0].decision,'WAIT');
  assert.equal(res.body.mechanics.selections[0].bankroll.units,0);
  assert.equal(res.body.canPlaceWagers,false);
  assert.match(res.body.analysis,/Market Context:/);
  assert.match(res.body.analysis,/Bankroll Strategy: 0 units/);
 }finally{globalThis.fetch=previous}
});
test('global professional probability and bankroll rules apply to all AI game prompts',()=>{
 const code=readFileSync(new URL('../api/ai-analysis.js',import.meta.url),'utf8');
 assert.ok(code.includes('const system = SHARP_GLOBAL_POLICY'));
 assert.ok(code.includes('const nbaPregameSystem = SHARP_GLOBAL_POLICY'));
 for(const text of ['Data Gathering','Cross-Verification','probability','risk','Closing']){
  assert.ok(SHARP_GLOBAL_POLICY.toLowerCase().includes(text.toLowerCase()),text);
 }
 assert.ok(code.includes("if(mode==='sharp')"));
 assert.ok(!SHARP_DECISIONS.includes('LOCK'));
});
