import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflBookOfferEligible} from '../lib/nfl-book-offer-provenance.js';

const now=Date.parse('2026-10-17T12:00:00Z');
const row={eventID:'401872999',playerID:'athlete-12',
 marketName:'player_rush_yds',line:65.5};
const book={book:'DraftKings',available:true,odds:-115,line:65.5,
 checkedAt:new Date(now-20_000).toISOString(),
 sourceUrl:'https://prop-line.com',sourceProvider:'PropLine'};

test('authenticated and dated provider-native individual market remains eligible',()=>{
 assert.equal(nflBookOfferEligible(row,book,'DraftKings',now),true);
 assert.equal(nflBookOfferEligible(row,{...book,book:'FanDuel'},'FanDuel',now),true);
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
test('The Odds API server-native time is accepted only with matching adapter identity',()=>{
 const odds={...book,sourceProvider:'The Odds API',sourceUrl:null};
 assert.equal(nflBookOfferEligible({...row,provider:'The Odds API'},odds,'DraftKings',now),true);
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

test('Odds API offer without its own line cannot inherit enclosing row threshold',()=>{
 const native={...book,sourceProvider:'The Odds API',sourceUrl:null};
 const oddsRow={...row,provider:'The Odds API',line:135};
 assert.equal(nflBookOfferEligible(oddsRow,{...native,line:undefined},'DraftKings',now),false);
 assert.equal(nflBookOfferEligible(oddsRow,{...native,line:null},'DraftKings',now),false);
 assert.equal(nflBookOfferEligible(oddsRow,{...native,line:125},'DraftKings',now),true);
});
test('all book paths reject absent and nonnumeric threshold',()=>{
 for(const line of [null,undefined,'', 'not-a-line']){
  assert.equal(nflBookOfferEligible(row,{...book,line},'DraftKings',now),false);
 }
});
