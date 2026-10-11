import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exactPropLineSgpLeg,propLineSgpLegsMatch,propLineSgpLegSignature}
 from '../lib/prop-line-sgp-leg-identity.js';
import {evaluateNflBookQuoteReadiness}
 from '../lib/nfl-book-quote-readiness.js';
import {verifyPropLineSgpResponse}
 from '../lib/prop-line-sgp-quote-verification.js';

const now=Date.parse('2026-10-11T15:00:00Z'),gameId='401872990',eventId='872990';
const source=[
 {market:'player_pass_yds',name:'Over',description:'Quarterback One',point:234.5},
 {market:'player_rush_yds',name:'Over',description:'Runner Two',point:69.5},
 {market:'player_reception_yds',name:'Over',description:'Receiver Three',point:74.5},
 {market:'player_receptions',name:'Over',description:'Receiver Four',point:5.5},
 {market:'player_anytime_td',name:'Receiver Five',description:'',point:null}
];
const book='DraftKings',bookmaker='draftkings';
const make=(size=5)=>{
 const legs=source.slice(0,size).map((o,i)=>({
  eventID:gameId,providerEventId:eventId,playerID:'player-'+i,
  cat:['passing','rushing','receiving','receptions','td'][i],
  bookOffer:{book,sourceProvider:'PropLine',available:true,
   checkedAt:new Date(now-3000).toISOString(),odds:i%2===0?125:-115,
   marketKey:o.market,bookOutcomeId:i===0?'dk-native-1':null,
   outcomeName:o.name,outcomeDescription:o.description,line:o.point}
 }));
 return{risk:size===4?'Small':'Medium',requiredLegs:size,
  tierAssessment:{compositionOk:true},legs};
};
const check=card=>evaluateNflBookQuoteReadiness(card,{book,gameId,now});
const request=()=>check(make()).quoteRequest;
const quoted=()=>{
 const r=request();
 return{quoted:true,redacted:false,id:eventId,bookmaker,
  sport_key:'football_nfl',sgp_price:4200,
  priced_at:new Date(now-3000).toISOString(),
  legs:r.legs.map(l=>({...l,accepted:true})).reverse()};
};
test('source-issued sportsbook ID is preferred, otherwise full exact named leg is used',()=>{
 const r=check(make());
 assert.equal(r.eligible,true);
 assert.equal(r.reason,'READY_FOR_AUTHORIZED_QUOTE');
 assert.equal(r.selectionCount,5);
 assert.deepEqual(r.quoteRequest.legs[0],{
  market:'player_pass_yds',book_outcome_id:'dk-native-1'});
 assert.deepEqual(r.quoteRequest.legs[1],source[1]);
 assert.deepEqual(r.quoteRequest.legs[4],source[4]);
 assert.equal(r.quoteRequest.bookmaker,bookmaker);
 assert.equal(r.quoteRequest.eventId,eventId);
});
test('provider-correlated SGP quote validates reordered mixed ID and named legs exactly',()=>{
 const r=verifyPropLineSgpResponse(request(),quoted(),{now});
 assert.equal(r.quoted,true);
 assert.equal(r.americanOdds,4200);
 assert.equal(r.legsAccepted,5);
});
test('book-issued ID and a named leg must not become interchangeable without exact identity',()=>{
 const r=request(),body=quoted();
 const bad=[
  {legs:body.legs.map(l=>l.market==='player_rush_yds'?{...l,description:'Other Runner'}:l)},
  {legs:body.legs.map(l=>l.market==='player_rush_yds'?{...l,point:70.5}:l)},
  {legs:body.legs.map(l=>l.market==='player_rush_yds'?{...l,name:'Under'}:l)},
  {legs:body.legs.map(l=>l.market==='player_pass_yds'?{...l,book_outcome_id:'dk-wrong'}:l)},
  {legs:body.legs.map(l=>l.market==='player_anytime_td'?{...l,name:'Receiver Other'}:l)},
  {legs:body.legs.map(l=>l.market==='player_anytime_td'?{...l,accepted:false}:l)},
  {legs:body.legs.slice(1)},
  {bookmaker:'fanduel'},{id:'872999'},
  {sgp_price:null},{quoted:false}
 ];
 for(const changed of bad){
  const x=verifyPropLineSgpResponse(r,{...body,...changed},{now});
  assert.equal(x.quoted,false,JSON.stringify(changed).slice(0,180));
 }
});
test('fuzzy matching, absent player, absent point and wrong side fail before any provider spend',()=>{
 const examples=[
  {market:'player_rush_yds',name:'Over',description:'Runner Two',point:null},
  {market:'player_rush_yds',name:'Over',description:'Runner Two',point:''},
  {market:'player_rush_yds',name:'Over',description:'Runner Two',point:0},
  {market:'player_rush_yds',name:'Under',description:'Runner Two',point:69.5},
  {market:'player_rush_yds',name:'Over',description:'',point:69.5},
  {market:'player_anytime_td',name:'Yes',description:'',point:null},
  {market:'player_anytime_td',name:'No',description:'Receiver Five',point:null},
  {market:'player_anytime_td',name:'Receiver Five',description:'',point:0},
  {market:'unknown_market',name:'Over',description:'Runner Two',point:69.5}
 ];
 for(const e of examples)assert.equal(exactPropLineSgpLeg(e),null,JSON.stringify(e));
 const missing=make();missing.legs[1].bookOffer.outcomeDescription='';
 assert.equal(check(missing).reason,'MISSING_VERIFIED_BOOK_SELECTIONS');
 assert.equal(check(missing).quoteRequest,null);
});
test('duplicate full outcome identity cannot create a paid quote request',()=>{
 const c=make(),duplicate=c.legs[1].bookOffer;
 c.legs[2].bookOffer={...duplicate};
 assert.equal(check(c).reason,'DUPLICATE_BOOK_SELECTION');
 assert.equal(propLineSgpLegSignature(source[1]),
  propLineSgpLegSignature({...source[1]}));
 assert.equal(propLineSgpLegsMatch(source[1],{...source[1],point:69.6}),false);
 assert.equal(propLineSgpLegsMatch(source[1],{...source[1],point:69.5}),true);
});
test('backend uses full exact league-filtered provider legs and preserves single-use credit protections',()=>{
 const markets=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const provider=readFileSync(new URL('../api/prop-line-markets.js',import.meta.url),'utf8');
 const quote=readFileSync(new URL('../api/prop-line-sgp-quote.js',import.meta.url),'utf8');
 assert.ok(markets.includes('outcomeName:o.outcomeName||null'));
 assert.ok(markets.includes('outcomeDescription:o.outcomeDescription??null'));
 assert.ok(provider.includes('normalizePropLinePlayerOffer(book,market,outcome)'));
 assert.ok(quote.includes("league==='nfl'?!exactPropLineSgpLeg(l)"));
 assert.ok(quote.includes("league==='nfl'?exactPropLineSgpLeg(l)"));
 assert.ok(quote.includes("if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)"));
 assert.ok(quote.includes('allowOverwrite:false'));
});
