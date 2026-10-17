import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeNflDirectPublicMarkets,draftKingsVisibleOffersToMarkets}
 from '../lib/nfl-direct-public-markets.js';
import {nflBookOfferEligible} from '../lib/nfl-book-offer-provenance.js';

const date='2026-10-18',gameId='401872999';
const page='<html><table><thead><tr>'+
 '<th>Event</th><th>Event Date</th><th>Market</th>'+
 '<th>Betslip Line</th><th>Odds</th></tr></thead><tbody>'+
 '<tr><td>CHI Bears @ ATL Falcons</td><td>10/18, 01:00PM</td>'+
 '<td>Anytime TD Scorer</td><td>Bijan Robinson</td><td>-300</td></tr>'+
 '<tr><td>CHI Bears @ ATL Falcons</td><td>10/18, 01:00PM</td>'+
 '<td>Drake London Receiving Yards</td><td>65+</td><td>+115</td></tr>'+
 '<tr><td>CHI Bears @ ATL Falcons</td><td>10/18, 01:00PM</td>'+
 '<td>Bijan Robinson Rushing Yards</td><td>135+</td><td>not listed</td></tr>'+
 '<tr><td>HOU Texans @ JAX Jaguars</td><td>10/18, 09:30AM</td>'+
 '<td>Anytime TD Scorer</td><td>Nico Collins</td><td>+160</td></tr>'+
 '</tbody></table></html>';
const htmlResponse=(html,status=200)=>({ok:status===200,status,
 headers:{get:()=> 'text/html'},text:async()=>html});
test('uses only matching DraftKings public page offers and preserves exact line and odds',async()=>{
 const requested=[];
 const fetchImpl=async url=>{
  requested.push(url);
  return htmlResponse(url.includes('dknetwork.')?page:'<html>enable javascript</html>');
 };
 const now=Date.parse('2026-10-17T16:10:00Z');
 const observed=await observeNflDirectPublicMarkets({
  date,gameId,home:'ATL',away:'CHI',fetchImpl,now
 });
 assert.equal(requested.length,2);
 assert.ok(requested.every(x=>/draftkings\.com|fanduel\.com/.test(x)));
 assert.equal(observed.rows.length,2);
 assert.deepEqual(observed.rows.map(x=>x.name),
  ['Bijan Robinson','Drake London']);
 assert.equal(observed.rows[0].books[0].odds,-300);
 assert.equal(observed.rows[0].statID,'touchdowns');
 assert.equal(observed.rows[1].books[0].line,65);
 assert.equal(observed.rows[1].books[0].odds,115);
 assert.equal(observed.rows[1].books[0].sourceProvider,'DraftKings public web');
 assert.equal(observed.sources.FanDuel.exactObservedOffers,0);
 assert.equal(observed.sources.FanDuel.state,'JAVASCRIPT_RENDERED');
 assert.equal(observed.combinedSgpQuoteVerified,false);
 assert.equal(nflBookOfferEligible(observed.rows[1],observed.rows[1].books[0],
  'DraftKings',now),true);
});
test('do not silently invent prices for a JavaScript-only FanDuel storefront',async()=>{
 const observed=await observeNflDirectPublicMarkets({
  date,gameId,home:'ATL',away:'CHI',
  fetchImpl:async url=>htmlResponse(url.includes('dknetwork.')?
   '<html><table></table></html>':'<html>JavaScript is required</html>')
 });
 assert.equal(observed.rows.length,0);
 assert.equal(observed.sources.FanDuel.exactObservedOffers,0);
 assert.equal(observed.sources.FanDuel.state,'JAVASCRIPT_RENDERED');
});
test('API-free sportsbook sourcing is active in the NFL production route',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(src.includes('observeNflDirectPublicMarkets({date,home,away,gameId,fetchImpl:timedFetch})'));
 assert.ok(src.includes('const sgoEnabled=false'));
 assert.ok(src.includes('if(false&&process.env.PLAYER_PROPS_API_KEY&&authorizedChange)'));
 assert.ok(!src.includes('const alt=await oddsApiFallback(date,home,away,gameId)'));
});
test('invalid game identity never yields book selections',()=>{
 assert.deepEqual(draftKingsVisibleOffersToMarkets([
  {book:'DraftKings',player:'Test Player',category:'rushing',
   line:99,odds:115,observedAt:new Date().toISOString()}
 ],{gameId:'wrong-game'}),[]);
});
