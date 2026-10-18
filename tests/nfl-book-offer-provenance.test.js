import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflBookOfferEligible} from '../lib/nfl-book-offer-provenance.js';

const now=Date.parse('2026-10-17T12:00:00Z');
const row={eventID:'401872999',playerID:'athlete-12',
 marketName:'player_rush_yds',line:65.5};
const book={book:'DraftKings',available:true,odds:-115,line:65.5,
 offerId:'selection-1001',gameId:'401872999',playerId:'athlete-12',
 category:'rushing',checkedAt:new Date(now-20_000).toISOString(),
 sourceUrl:'https://sportsbook.draftkings.com/event/401872999',sourceProvider:'DIRECT_OFFICIAL_SPORTSBOOK'};

test('timestamped official-book individual market remains eligible',()=>{
 assert.equal(nflBookOfferEligible(row,book,'DraftKings',now),true);
 assert.equal(nflBookOfferEligible(row,{...book,book:'FanDuel',
  sourceUrl:'https://co.sportsbook.fanduel.com/football/nfl'},'FanDuel',now),true);
 assert.equal(nflBookOfferEligible(row,book,'FanDuel',now),false);
});
test('SportsGameOdds conversion without observed quote time and source is never verified',()=>{
 const sgo={eventID:'401872999',playerID:'athlete-12',
  marketName:'player_rush_yds',books:[{book:'DraftKings',available:true,odds:135,line:65.5}]};
 assert.equal(nflBookOfferEligible(sgo,sgo.books[0],'DraftKings',now),false);
 assert.equal(nflBookOfferEligible(row,{...book,sourceUrl:undefined},'DraftKings',now),false);
 assert.equal(nflBookOfferEligible(row,{...book,checkedAt:undefined},'DraftKings',now),false);
});
test('source link alone never verifies an undated or stale offer',()=>{
 for(const checkedAt of [null,'2026-10-17T11:44:59Z','not-a-date','2026-10-17T12:01:01Z'])
  assert.equal(nflBookOfferEligible(row,{...book,checkedAt},'DraftKings',now),false);
});
test('third-party odds API can never attest an official sportsbook selection',()=>{
 const odds={...book,sourceProvider:'The Odds API',sourceUrl:null};
 assert.equal(nflBookOfferEligible({...row,provider:'The Odds API'},odds,'DraftKings',now),false);
 assert.equal(nflBookOfferEligible({...row,provider:'SportsGameOdds'},odds,'DraftKings',now),false);
 assert.equal(nflBookOfferEligible(row,odds,'DraftKings',now),false);
});
test('mismatched player/game/market, invalid odds and unavailable books fail closed',()=>{
 for(const x of [{...row,eventID:null},{...row,playerID:null},{...row,marketName:null}])
  assert.equal(nflBookOfferEligible(x,book,'DraftKings',now),false);
 for(const x of [{...book,odds:null},{...book,odds:0},{...book,odds:'oops'},
  {...book,available:false},{...book,sourceUrl:'http://example.com/props'}])
  assert.equal(nflBookOfferEligible(row,x,'DraftKings',now),false);
});
test('active market builder has no provenance-bypassing default',()=>{
 const code=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(code,/nflBookOfferEligible\(m,offer,name\)/);
 assert.doesNotMatch(code,/if\(!checkedAt\|\|!sourceUrl\)return true/);
});

test('Odds API cannot substitute its sportsbook line or provenance',()=>{
 const native={...book,sourceProvider:'The Odds API',sourceUrl:null};
 const oddsRow={...row,provider:'The Odds API',line:135};
 assert.equal(nflBookOfferEligible(oddsRow,{...native,line:undefined},'DraftKings',now),false);
 assert.equal(nflBookOfferEligible(oddsRow,{...native,line:null},'DraftKings',now),false);
 assert.equal(nflBookOfferEligible(oddsRow,{...native,line:125},'DraftKings',now),false);
});
test('all book paths reject absent and nonnumeric threshold',()=>{
 for(const line of [null,undefined,'', 'not-a-line']){
  assert.equal(nflBookOfferEligible(row,{...book,line},'DraftKings',now),false);
 }
});

test('HTTPS on another company, a fake subdomain, or wrong book is never official provenance',()=>{
 const urls=[
  'https://prop-line.com/football',
  'https://dknetwork.draftkings.com/draftkings-sportsbook-player-props/',
  'https://sportsbook.draftkings.com.evil.example/football',
  'https://evil.example/sportsbook.draftkings.com',
  'https://sportsbook.draftkings.com:8443/football',
  'https://admin@sportsbook.draftkings.com/event/1'
 ];
 for(const sourceUrl of urls)
  assert.equal(nflBookOfferEligible(row,{...book,sourceUrl},'DraftKings',now),false,sourceUrl);
 assert.equal(nflBookOfferEligible(row,{
  ...book,sourceUrl:'https://co.sportsbook.fanduel.com/football/nfl'
 },'DraftKings',now),false);
 assert.equal(nflBookOfferEligible(row,{
  ...book,sourceProvider:'SportsGameOdds'
 },'DraftKings',now),false);
});

test('wrong athlete, game, market or missing official selection ID is not bookable',()=>{
 const changes=[
  {offerId:null},{gameId:'401872996'},{playerId:'another-athlete'},
  {category:'receiving'},{market:'player_reception_yds',category:null},
  {category:'td'}
 ];
 for(const change of changes)
  assert.equal(nflBookOfferEligible(row,{...book,...change},'DraftKings',now),false,
   JSON.stringify(change));
 assert.equal(nflBookOfferEligible(row,{
  ...book,offerId:null,selectionId:'auth-selection-1001'
 },'DraftKings',now),true);
});

test('model timestamp cannot freshen an undated bookmaker price',()=>{
 assert.equal(nflBookOfferEligible({...row,checkedAt:book.checkedAt},{
  ...book,checkedAt:null
 },'DraftKings',now),false);
 for(const line of [0,-65,NaN])
  assert.equal(nflBookOfferEligible(row,{...book,line},'DraftKings',now),false);
 for(const odds of [1,-1,110.5,100001,-100001])
  assert.equal(nflBookOfferEligible(row,{...book,odds},'DraftKings',now),false);
});
