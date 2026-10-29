import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyPropLineSgpResponse} from '../lib/prop-line-sgp-quote-verification.js';

const now=Date.parse('2026-10-11T15:00:00Z');
const req={
 league:'nfl',gameId:'401872990',eventId:'872990',bookmaker:'fanduel',
 legs:[
  {market:'player_pass_yds',book_outcome_id:'fd-p-225'},
  {market:'player_rush_yds',book_outcome_id:'fd-r-75'},
  {market:'player_reception_yds',book_outcome_id:'fd-w-70'},
  {market:'player_anytime_td',book_outcome_id:'fd-td-1'},
  {market:'player_receptions',book_outcome_id:'fd-recs-5'}
 ]
};
const good=()=>({
 quoted:true,redacted:false,bookmaker:'fanduel',id:'872990',
 sport_key:'football_nfl',sgp_price:10001,
 priced_at:new Date(now-5000).toISOString(),
 legs:req.legs.map(x=>({...x,accepted:true})).reverse()
});
const check=(data,request=req)=>verifyPropLineSgpResponse(request,data,{now});
test('exact, fresh provider-reported combined odds survive despite reordered legs',()=>{
 const r=check(good());
 assert.equal(r.quoted,true);
 assert.equal(r.americanOdds,10001);
 assert.equal(r.legsAccepted,5);
 assert.equal(r.reason,'PROVIDER_BOOK_COMBINED_PRICE_VALIDATED');
});
test('documented PropLine top-level id validates and conflicting aliases never override it',()=>{
 assert.equal(check(good()).quoted,true);
 const legacy={...good(),id:undefined,event_id:'872990'};
 assert.equal(check(legacy).quoted,true);
 for(const collision of [
  {...good(),event_id:'987'},
  {...good(),event:{id:'987'}},
  {...good(),id:undefined,event_id:'987'},
  {...good(),id:null,event_id:undefined}
 ]){
  assert.equal(check(collision).quoted,false);
  assert.equal(check(collision).reason,'QUOTE_EVENT_MISMATCH');
 }
});
test('no unverified source may return a positive combined quote',()=>{
 const variants=[
  {bookmaker:'draftkings'}, {bookmaker:undefined},{id:123},
  {event_id:123},{event:{id:987654}},
  {id:null},{sport_key:'basketball_nba'},
  {priced_at:null},{priced_at:new Date(now-900001).toISOString()},
  {priced_at:new Date(now+1000).toISOString()},
  {sgp_price:10000.5},{sgp_price:'10001'},{sgp_price:-110},
  {redacted:true},{quoted:false},{legs:req.legs.slice(1)},
  {legs:req.legs.map(x=>({...x,accepted:true,book_outcome_id:x.book_outcome_id+'wrong'}))},
  {legs:req.legs.map(x=>({...x,accepted:true,market:'player_receptions'}))},
  {legs:req.legs.map((x,i)=>({...x,accepted:i!==2}))},
  {legs:req.legs.map(x=>({...x,accepted:true,event_id:'wrong'}))},
  {legs:req.legs.map(x=>({...x,accepted:true,bookmaker:'draftkings'}))}
 ];
 for(const changed of variants){
  const outcome=check({...good(),...changed});
  assert.equal(outcome.quoted,false,JSON.stringify(changed).slice(0,200));
  assert.equal(outcome.americanOdds,null);
  assert.equal(outcome.legsAccepted,0);
 }
});
test('duplicate request selections and event changes cannot be quoted',()=>{
 const duplicated={...req,legs:[req.legs[0],req.legs[0]]};
 assert.equal(check(good(),duplicated).quoted,false);
 assert.equal(check(good(),{...req,eventId:'987'}).quoted,false);
 assert.equal(check(good(),{...req,bookmaker:'draftkings'}).quoted,false);
});
test('production calls strict quote validator and preserves unquoted status on weak evidence',()=>{
 const source=readFileSync(new URL('../api/prop-line-sgp-quote.js',import.meta.url),'utf8');
 assert.ok(source.includes('verifyPropLineSgpResponse({league,gameId,eventId,bookmaker,legs},data)'));
 assert.ok(!source.includes('data.legs.every(l=>l.accepted===true)'));
 const markets=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(markets.includes("findTier('Small',0),findTier('Medium',1),findTier('Large',2),findTier('Nuke',3)"));
 assert.ok(markets.includes('for(let count=3;count<=maxCount;count++)'));
 assert.ok(!markets.includes("for(let n=3;n<=Math.min(8,nukePool.length);n++)"));
 assert.ok(markets.includes('return {...s,estimatedOdds:null,bookVerificationPending:true'));
 assert.ok(markets.includes('quote?.bookmaker===bookmaker'));
 assert.ok(markets.includes('quote?.pricedAt'));
 assert.ok(markets.includes('sgpOddsInBand(risk,quote.americanOdds)'));
 assert.ok(markets.includes("for(const risk of ['Small','Medium','Nuke'])"));
});
