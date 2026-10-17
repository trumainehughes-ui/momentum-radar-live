import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDraftKingsNetworkNflProps,publicBookResearchReport,
 DKN_NFL_PROPS_URL,matchPublicOffersToEligibleGamePlayers,publicNflOfferParticipationSignals} from '../lib/nfl-public-sportsbook-observer.js';

const now=Date.parse('2026-10-17T00:50:00Z'),date='2026-10-18';
const html=(rows)=>'<html><table><thead><tr><th>Event</th><th>Event Date</th>'+
 '<th>Market</th><th>Betslip Line</th><th>Odds</th></tr></thead><tbody>'+
 rows.map(cells=>'<tr>'+cells.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+
 '</tbody></table></html>';
test('reads Sunday-specific DraftKings NFL touchdown offers with published odds',()=>{
 const page=html([
 ['CHI Bears @ ATL Falcons','10/18, 01:00PM','Anytime TD Scorer','Bijan Robinson','−290'],
 ['CHI Bears @ ATL Falcons','10/18, 01:00PM','Drake London Receiving Yards','65+','+115'],
 ['NY Jets @ NE Patriots','10/18, 01:00PM','Anytime TD Scorer','Rhamondre Stevenson','-175'],
 ['CHI Bears @ ATL Falcons','10/15, 01:00PM','Anytime TD Scorer','Bijan Robinson','+185']
 ]);
 const x=parseDraftKingsNetworkNflProps(page,{date,home:'ATL',away:'CHI',now});
 assert.equal(x.length,2);
 assert.equal(x[0].book,'DraftKings');
 assert.equal(x[0].player,'Bijan Robinson');
 assert.equal(x[0].odds,-290);
 assert.equal(x[0].category,'td');
 assert.equal(x[0].sourceUrl,DKN_NFL_PROPS_URL);
 assert.equal(x[0].verification,'PUBLIC_PAGE_OBSERVATION_ONLY');
 assert.equal(x[1].category,'receiving');
 assert.equal(x[1].line,65);
 assert.equal(x[1].odds,115);
});
test('source-only research never claims a sportsbook-confirmed parlay or a verified bettable selection',()=>{
 const page=html([['HOU Texans @ JAX Jaguars','10/18, 09:30AM',
  'Anytime TD Scorer','Parker Washington','+155']]);
 const report=publicBookResearchReport({dkHtml:page,dkStatus:'FETCH_OK',
  fdStatus:'NO_MACHINE_READABLE_MARKETS',date,home:'JAX',away:'HOU',now});
 assert.equal(report.status,'PUBLIC_OFFERS_OBSERVED');
 assert.equal(report.offers.length,1);
 assert.equal(report.offers[0].odds,155);
 assert.equal(report.verifiedBettableOffers,0);
 assert.equal(report.combinedSgpQuoteVerified,false);
 assert.equal(report.books.find(x=>x.book==='FanDuel').observedOffers,0);
});
test('rejects other events, prior dates, forged prices, injection and script snippets',()=>{
 const page=html([
 ['HOU Texans @ JAX Jaguars','10/15, 09:30AM','Anytime TD Scorer','Player A','+130'],
 ['HOU Texans @ JAX Jaguars','10/18, 09:30AM','Anytime TD Scorer','Player B','−999999'],
 ['HOU Texans @ JAX Jaguars','10/18, 09:30AM','Anytime TD Scorer','<script>alert(1)</script>','-120'],
 ['NO Saints @ NY Giants','10/18, 01:00PM','Anytime TD Scorer','Player C','+150'],
 ['HOU Texans @ JAX Jaguars','10/18, 09:30AM','Anytime TD Scorer','Correct Player','+180'],
 ]);
 assert.deepEqual(parseDraftKingsNetworkNflProps(page,{date,home:'JAX',away:'HOU',now})
 .map(x=>x.player),['Correct Player']);
});
test('network source not readable yields explicit warning with no fabricated prices',()=>{
 const report=publicBookResearchReport({dkStatus:'HTTP_403',
  fdStatus:'HTTP_403',date,home:'ATL',away:'CHI',now});
 assert.equal(report.status,'PUBLIC_PAGE_UNAVAILABLE');
 assert.equal(report.offers.length,0);
 assert.equal(report.books[0].status,'HTTP_403');
 assert.equal(report.books[1].status,'HTTP_403');
});
test('public UI checks only signed scoped game source and retains verified SGP safeguards',()=>{
 const api=readFileSync(new URL('../api/nfl-public-book-research.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(api.includes("String(g.gameId)===gameId"));
 assert.ok(api.includes("FANDUEL_NFL_PUBLIC_URL"));
 assert.ok(api.includes("DKN_NFL_PROPS_URL"));
 assert.ok(!api.includes('THE_ODDS_API_KEY'));
 assert.ok(!api.includes('PLAYER_PROPS_API_KEY'));
 assert.ok(!api.includes('CRON_SECRET'));
 assert.ok(!api.includes('fetch(req.query'));
 assert.ok(ui.includes("loadPublicBookResearch(state.date,state.selected)"));
 assert.ok(ui.includes('return intro+staleNote+slips+verification+research'));
 assert.ok(ui.includes('<section class="sgp-research-details" aria-label="Public sportsbook player odds">'));
 assert.ok(ui.includes('Combined sportsbook odds and player lines are not verified'));
 assert.ok(ui.includes('not authenticated current sportsbook selections'));
});

test('game/player identity gate drops other-team prices even when public listing mislabeled the matchup',()=>{
 const offers=[
 {book:'DraftKings',player:'Parker Washington',category:'td',odds:155},
 {book:'DraftKings',player:'Nico Collins',category:'td',odds:160},
 {book:'DraftKings',player:'Marvin Harrison Jr.',category:'td',odds:450}
 ];
 const game={ok:true,status:'CURRENT',date:'2026-10-18',gameId:'401872996',
  categories:{td:[
   {name:'Parker Washington',team:'JAX'},
   {name:'Nico Collins',team:'HOU'},
   {name:'Marvin Harrison Jr.',team:'ARI'}
  ]}};
 assert.deepEqual(matchPublicOffersToEligibleGamePlayers(offers,game,{home:'JAX',away:'HOU'})
  .map(x=>x.player),['Parker Washington','Nico Collins']);
 assert.deepEqual(matchPublicOffersToEligibleGamePlayers(offers,
  {...game,status:'STALE'},{home:'JAX',away:'HOU'}),[]);
});

test('sportsbook participation signals require current game-scoped vetted prices',()=>{
 const now=Date.parse('2026-10-17T14:00:00Z');
 const base={gameId:'401872996',rosterMatched:true,book:'DraftKings',
  player:'Parker Washington',team:'JAX',category:'td',odds:155,
  observedAt:'2026-10-17T13:50:00Z'};
 const signals=publicNflOfferParticipationSignals([base,
  {...base,book:'FanDuel',category:'receiving'},
  {...base,gameId:'other',player:'Wrong Game'},
  {...base,player:'Stale Player',observedAt:'2026-10-17T12:00:00Z'},
  {...base,player:'Unvetted',rosterMatched:false}],
  {gameId:'401872996',now});
 assert.equal(signals.length,1);
 assert.deepEqual(signals[0].sportsbookSources,['DraftKings','FanDuel']);
 assert.equal(signals[0].officialStatusVerified,false);
 assert.equal(signals[0].participationEvidence,'PUBLIC_PROP_LISTED_NOT_OFFICIAL_ACTIVE');
});
