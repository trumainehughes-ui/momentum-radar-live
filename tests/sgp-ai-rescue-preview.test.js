import test from 'node:test';
import assert from 'node:assert/strict';
import {nflSgpRescuePreview} from '../lib/sgp-ai-rescue-preview.js';
import {auditNflBookSgpMarkets} from '../lib/nfl-sgp-book-market-audit.js';
const gameId='401872981',book='FanDuel';
const legs=[
 {name:'Quarterback A',team:'JAX',eventID:gameId,playerID:'11',
  cat:'passing',analyticsThreshold:225,predictiveProjection:255,
  range:{ceiling:315}},
 {name:'Runner B',team:'JAX',eventID:gameId,playerID:'12',
  cat:'rushing',analyticsThreshold:50,predictiveProjection:65,
  range:{ceiling:100}},
 {name:'Receiver C',team:'PHI',eventID:gameId,playerID:'13',
  cat:'receiving',analyticsThreshold:60,predictiveProjection:80,
  range:{ceiling:140}},
 {name:'Tight End D',team:'PHI',eventID:gameId,playerID:'14',
  cat:'receptions',analyticsThreshold:3,predictiveProjection:5,
  range:{ceiling:8}}
];
function audited(rushingLine='55+'){
 const market=legs.map((l,i)=>({
  name:l.name,team:l.team,playerID:l.playerID,eventID:gameId,
  cat:l.cat,sideID:'over',
  books:[{book,line:i===1?rushingLine:(l.analyticsThreshold+'+'),
   odds:-110,available:true}]
 }));
 return auditNflBookSgpMarkets({gameId,book,sgp:{risk:'Small',legs},markets:market});
}
test('observed correct-book 55+ offer produces a full Small rebuild PREVIEW, but neither changes model legs nor verifies ticket',()=>{
 const before=structuredClone(legs),audit=audited('55+');
 assert.equal(audit.allLegsMatched,false);
 assert.equal(audit.matchedLegs,3);
 assert.equal(audit.missingLegs.length,1);
 const p=nflSgpRescuePreview({gameId,risk:'Small',book,legs,
  missingLegs:audit.missingLegs});
 assert.equal(p.status,'PROVISIONAL_BOOK_LINE_REBUILD');
 assert.equal(p.proposals.length,1);
 assert.equal(p.proposals[0].observedAlternates[0].threshold,55);
 assert.equal(p.rebuildPreview.legs[1].threshold,55);
 assert.equal(p.rebuildPreview.modelTierCompositionChecked,true);
 assert.equal(p.rebuildPreview.readyToPublish,false);
 assert.equal(p.rebuildPreview.bookQuoteVerified,false);
 assert.equal(p.autoApplied,false);
 assert.equal(p.needsUpdatedModel,true);
 assert.deepEqual(legs,before,'original sportsbook/model picks are immutable');
});
test('Over 54.5 is a 55+ outcome; unsupported display, wrong player or Nuke without empirical ceiling is held',()=>{
 const actual=audited('54.5'); // audit represents an Over 54.5 threshold, not raw 55+
 assert.equal(actual.missingLegs[0].listedOffers[0].minimumToWin,55);
 const plus=structuredClone(actual.missingLegs);
 plus[0].listedOffers=[{display:'Over 54.5',minimumToWin:55}];
 const p=nflSgpRescuePreview({gameId,risk:'Small',book,legs,missingLegs:plus});
 assert.equal(p.status,'PROVISIONAL_BOOK_LINE_REBUILD');
 const invalid=structuredClone(plus);
 invalid[0].listedOffers=[{display:'Over 55',minimumToWin:55}];
 assert.equal(nflSgpRescuePreview({gameId,risk:'Small',book,legs,
  missingLegs:invalid}).status,'RECHECK_REQUIRED');
 invalid[0].listedOffers=plus[0].listedOffers;
 invalid[0].playerID='someone-else';
 assert.equal(nflSgpRescuePreview({gameId,risk:'Small',book,legs,
  missingLegs:invalid}).reason,'MISSING_LEG_IDENTITY_MISMATCH');
 const nukeLegs=legs.map((l,i)=>({...l,
  analyticsThreshold:i===1?105:l.analyticsThreshold}));
 const nukeMissing=[{...plus[0],requested:105,listedOffers:[{
  display:'110+',minimumToWin:110
 }]}];
 assert.equal(nflSgpRescuePreview({gameId,risk:'Nuke',book,
  legs:nukeLegs.map(l=>({...l,range:undefined})),
  missingLegs:nukeMissing}).reason,'AT_LEAST_ONE_LEG_HAS_NO_SUPPORTED_OFFER');
});
test('no sportsbook or AI may revive a different-event, suspended, mismatched or non-5-yard NFL alternate',()=>{
 for(const mutation of [
  m=>m.eventID='401872982',
  m=>m.team='PHI',
  m=>m.name='Different Player',
  m=>m.listedOffers=[{display:'57+',minimumToWin:57}],
  m=>m.listedOffers=[{display:'Over 54',minimumToWin:55}],
  m=>m.listedOffers=[],
  m=>m.listedOffers=[{display:'55+',minimumToWin:60}]
 ]){
  const miss=structuredClone(audited().missingLegs);mutation(miss[0]);
  const p=nflSgpRescuePreview({gameId,risk:'Small',book,legs,
   missingLegs:miss});
  assert.equal(p.status,'RECHECK_REQUIRED');
  assert.equal(p.rebuildPreview,null);
  assert.equal(p.autoApplied,false);
 }
 const no=audited('55+');
 assert.equal(nflSgpRescuePreview({gameId:'../fake',risk:'Small',book,legs,
  missingLegs:no.missingLegs}).status,'RECHECK_REQUIRED');
});
test('a quoted individual alternate is not automatically allowed when it exceeds the model-supported Small floor',()=>{
 const observed=audited('90+').missingLegs;
 const p=nflSgpRescuePreview({gameId,risk:'Small',book,legs,missingLegs:observed});
 assert.equal(p.reason,'AT_LEAST_ONE_LEG_HAS_NO_SUPPORTED_OFFER');
 assert.equal(p.proposals[0].status,'NO_MODEL_SUPPORTED_ALTERNATE');
});
