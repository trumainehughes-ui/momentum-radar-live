import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {publicSharpReview} from '../lib/public-sharp-review.js';
import {SHARP_ENGINE_VERSION} from '../lib/ai-mechanics/sharp-engine.js';
const iso='2026-10-12T20:22:00Z';
function saved(status='CURRENT'){
 return{ok:true,status,gameId:'401872994',
  updatedAt:iso,internalToken:'DO_NOT_EXPOSE',
  categories:{
   td:[{name:'Sample RB',team:'BUF',position:'RB',modelChancePct:56,
    gameSample:6,opportunitiesPerGame:17.2,
    bookOffer:{book:'DraftKings',odds:150,line:1,checkedAt:iso,
      bookOutcomeId:'DO_NOT_EXPOSE'}}],
   passing:[{name:'Sample QB',team:'LAR',position:'QB',
    projection:265,gameSample:5,modelOnly:true}],
   rushing:[],receiving:[],receptions:[]
  }};
}
test('public mirrors exact shared sharp engine while refusing uncalibrated +EV',()=>{
 const r=publicSharpReview(saved(),{sport:'nfl',now:Date.parse(iso)});
 assert.equal(r.version,SHARP_ENGINE_VERSION);
 assert.equal(r.analysisAuthority,'READ_ONLY');
 assert.equal(r.riskPolicy.recommendedUnits,0);
 assert.equal(r.riskPolicy.maximumUnits,0.5);
 assert.deepEqual(r.process,['DATA_GATHERING','CROSS_VERIFICATION','STATISTICAL_EVALUATION']);
 assert.equal(r.candidates.length,2);
 const td=r.candidates[0];
 assert.equal(td.name,'Sample RB');
 assert.equal(td.quantitativeAngle.estimatedTdChancePct,56);
 assert.equal(td.quantitativeAngle.modelChanceStatus,'UNCALIBRATED_MODEL_ESTIMATE');
 assert.equal(td.marketContext.book,'DraftKings');
 assert.equal(td.marketContext.displayOdds,'+150');
 assert.equal(td.marketContext.impliedProbabilityPct,40);
 assert.equal(td.marketContext.pricingStatus,'OBSERVED_INDIVIDUAL_PRICE_NOT_EV_VERIFIED');
 assert.equal(td.status,'WAIT');
 assert.equal(td.expectedValue.estimatedRoiPct,null);
 assert.equal(td.bankroll.units,0);
 assert.equal(td.marketMovement.closingLineValue,'NOT_ESTABLISHED');
 const json=JSON.stringify(r);
 for(const key of ['bookOutcomeId','DO_NOT_EXPOSE','internalToken',
  'sourceUrl','providerId','apiKey','modelVersionCertified'])
  assert.ok(!json.includes(key),key);
});
test('Sharp public model-first view shows estimated hit chance instead of misleading REVIEW banner',()=>{
 const fixture=saved();
 fixture.categories.passing=[{name:'Sample QB',team:'LAR',projection:320,
  hitProbabilityPct:51,hitTarget:320,gameSample:6}];
 const result=publicSharpReview(fixture,{sport:'nfl',now:Date.parse(iso)});
 assert.equal(result.candidates[0].quantitativeAngle.estimatedHitChancePct,56);
 assert.equal(result.candidates[0].quantitativeAngle.hitTarget,'Anytime TD');
 assert.equal(result.candidates[1].quantitativeAngle.estimatedHitChancePct,51);
 assert.equal(result.candidates[1].quantitativeAngle.hitTarget,320);
 assert.equal(result.candidates[1].status,'WAIT');
 assert.equal(result.candidates[1].bankroll.units,0);
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(html.includes('Sharp Insights • Player Chances & Sportsbook Checks'));
 assert.ok(html.includes('Estimated hit chance •'));
 assert.ok(html.includes('Model picks only · Combined sportsbook odds and player lines are not verified'));
 assert.ok(html.includes('Why is this bet not verified?'));
 assert.ok(!html.includes('Market verification status: '));
 assert.ok(!html.includes('>+EV Verdict: '+String.fromCharCode(39)));
});
test('last saved and missing analyses cannot publish a fresh price or +EV',()=>{
 const s=saved('LAST_SAVED');
 const r=publicSharpReview(s,{sport:'nfl'});
 assert.equal(r.candidates[0].marketContext.displayOdds,null);
 assert.equal(r.candidates[0].marketContext.impliedProbabilityPct,null);
 assert.equal(r.candidates[0].status,'WAIT');
 assert.equal(r.riskPolicy.recommendedUnits,0);
 const unavailable=publicSharpReview({ok:true,status:'REVIEW',
  categories:s.categories,gameId:s.gameId});
 assert.equal(unavailable.status,'WAIT');
 assert.equal(unavailable.candidates.length,0);
});
test('shared universal engine works for new sport adapters but does not fake a public league feed',()=>{
 for(const sport of ['nba','mlb','nhl','soccer','cricket']){
  const r=publicSharpReview({...saved(),gameId:'upcoming-game'},{sport});
  assert.equal(r.sport,sport);
  assert.equal(r.version,SHARP_ENGINE_VERSION);
  assert.ok(r.candidates.every(x=>x.status!=='EV_CANDIDATE'));
 }
});
test('public side has developer Sharp +EV audit, current sportsbook and risk labels, no admin call',()=>{
 const owner=readFileSync(new URL('../public-ai.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const route=readFileSync(new URL('../api/public-nfl-game.js',import.meta.url),'utf8');
 assert.ok(owner.includes('Sharp +EV Audit (all sports)'));
 assert.ok(html.includes("['sharp','📈 Sharp +EV Audit']"));
 assert.ok(html.includes('function showSharp(d)'));
 assert.ok(html.includes('Market Context:'));
 assert.ok(html.includes('Quantitative Angle:'));
 assert.ok(html.includes('Market Movement:'));
 assert.ok(html.includes('Expected Value:'));
 assert.ok(html.includes('Bankroll Strategy:'));
 assert.ok(html.includes("if(state.detailTab==='sharp')body=showSharp(d)"));
 assert.ok(html.includes('Open Sharp +EV Audit'));
 assert.ok(route.includes('publicSharpReview(safe,'));
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.ok(!html.includes('/api/nfl-health?cron=1'));
 assert.ok(!html.includes('GROQ_API_KEY'));
 assert.ok(!html.includes('CRON_SECRET'));
 assert.ok(!html.includes('public-ai.js'));
});
test('public parity release policy and PR gate enforce coupled releases',()=>{
 const policy=readFileSync(new URL('../docs/public-release-parity.md',import.meta.url),'utf8');
 const gate=readFileSync(new URL('../scripts/check-public-parity.mjs',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/public-feature-parity.yml',import.meta.url),'utf8');
 const template=readFileSync(new URL('../.github/PULL_REQUEST_TEMPLATE.md',import.meta.url),'utf8');
 assert.match(policy,/Every customer-visible capability/);
 assert.match(policy,/same release/);
 assert.match(gate,/PUBLIC PARITY REQUIRED/);
 assert.match(gate,/picks\\.html/);
 assert.match(workflow,/node scripts\/check-public-parity\.mjs/);
 assert.match(workflow,/node --test tests\/public-\*\.test\.js/);
 assert.match(template,/public feature parity/i);
});
