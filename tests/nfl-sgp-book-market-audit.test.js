import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditNflBookSgpMarkets,exactNflBookThreshold} from '../lib/nfl-sgp-book-market-audit.js';
import {assessNflSgpTier} from '../lib/ai-mechanics/nfl-sgp-tiers.js';

const eventID='game-philadelphia-jacksonville';
const legs=[
 {name:'Bhayshul Tuten',playerID:'1',team:'JAX',eventID,cat:'rushing',analyticsThreshold:55},
 {name:'Parker Washington',playerID:'2',team:'JAX',eventID,cat:'receiving',analyticsThreshold:40},
 {name:'Trevor Lawrence',playerID:'3',team:'JAX',eventID,cat:'passing',analyticsThreshold:150},
 {name:'Chris Rodriguez Jr.',playerID:'4',team:'JAX',eventID,cat:'rushing',analyticsThreshold:15}
];
const market=(leg,line,book='FanDuel')=>({
 name:leg.name,playerID:leg.playerID,team:leg.team,eventID,cat:leg.cat,
 sideID:'over',books:[{book,line,odds:-120,available:true}]
});
const markets=[
 market(legs[0],'60+'),
 market(legs[1],'40+'),
 market(legs[2],'150+'),
 market(legs[3],'15+')
];
test('PHI-JAX model 55+ does not match FanDuel offered 60+; 3/4 is NOT sportsbook-ready',()=>{
 const a=auditNflBookSgpMarkets({sgp:{risk:'Small',legs},book:'FanDuel',gameId:eventID,markets});
 assert.equal(a.matchedLegs,3);
 assert.equal(a.totalLegs,4);
 assert.equal(a.status,'MODEL_LINES_NOT_FULLY_LISTED');
 assert.equal(a.missingLegs.length,1);
 assert.equal(a.missingLegs[0].requested,55);
 assert.deepEqual(a.missingLegs[0].listed,[60]);
 assert.deepEqual(a.missingLegs[0].listedOffers,[{display:'60+',minimumToWin:60}]);
 assert.equal(a.allLegsMatched,false);
 assert.equal(a.combinedBookQuoteVerified,false);
 assert.equal(a.actualCombinedOdds,null);
});
test('a 60+ model threshold matches 60+ offer and over 59.5 but not over 60.0',()=>{
 const adjusted={...legs[0],analyticsThreshold:60};
 for(const line of ['60+',59.5]){
  const a=auditNflBookSgpMarkets({sgp:{risk:'Small',legs:[adjusted]},
   book:'FanDuel',gameId:eventID,markets:[market(legs[0],line)]});
  assert.equal(a.matchedLegs,1,String(line));
 }
 assert.equal(exactNflBookThreshold({line:60,odds:-120},{cat:'rushing',sideID:'over'}),null);
 assert.equal(exactNflBookThreshold({line:59.5,odds:-120},{cat:'rushing',sideID:'over'}),60);
});
test('no alternate inferred from an untyped numeric threshold; cannot claim a listed market',()=>{
 const a=auditNflBookSgpMarkets({sgp:{risk:'Small',legs:[legs[0]]},
  book:'FanDuel',gameId:eventID,markets:[market(legs[0],55)]});
 assert.equal(a.matchedLegs,0);
 assert.equal(a.status,'MODEL_LINES_NOT_FULLY_LISTED');
});
test('wrong team, athlete ID or different ESPN game cannot fill a model bet slip',()=>{
 const mismatches=[
  [{...market(legs[0],'55+'),team:'PHI'}],
  [{...market(legs[0],'55+'),playerID:'99'}],
  [{...market(legs[0],'55+'),eventID:'another-game'}],
  [market(legs[0],'55+','DraftKings')]
 ];
 for(const marketRows of mismatches){
  const a=auditNflBookSgpMarkets({sgp:{risk:'Small',legs:[legs[0]]},
   book:'FanDuel',gameId:eventID,markets:marketRows});
  assert.equal(a.matchedLegs,0);
 }
});
test('no live markets is not a verified bookmaker selection',()=>{
 const a=auditNflBookSgpMarkets({sgp:{risk:'Small',legs},book:'FanDuel',
  gameId:eventID,markets:[]});
 assert.equal(a.status,'NO_LIVE_MARKETS');
 assert.equal(a.bookPriceTierVerified,false);
});
test('screenshot FanDuel combined +182 cannot qualify as model Small +2000 to +3000',()=>{
 const a=assessNflSgpTier({risk:'Small',legs,requiredLegs:4,combinedBookOdds:182});
 assert.equal(a.status,'ACTUAL_BOOK_PRICE_OUTSIDE_TIER');
 assert.equal(a.compositionOk,true);
 assert.equal(a.tierVerified,false);
});
test('production attaches both exact book selection audits and displays missing lines',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(api,/auditNflBookSgpMarkets/);
 assert.match(api,/bookMarketAudits:Object\.fromEntries/);
 assert.match(html,/Sportsbook selection audit \(NOT an SGP quote\)/);
 assert.match(html,/FanDuel lines not confirmed/);
 assert.match(html,/Combined odds still unverified/);
});
