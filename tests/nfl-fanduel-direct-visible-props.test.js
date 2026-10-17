import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFanDuelVisibleNflRushingProps,publicBookResearchReport} from '../lib/nfl-public-sportsbook-observer.js';
import {ODDS_SOURCE_POLICY,DIRECT_PUBLIC_SPORTSBOOK_SOURCES} from '../lib/sportsbook-source-policy.js';

const scope={date:'2026-10-18',homeName:'Atlanta Falcons',awayName:'Chicago Bears',
 now:Date.parse('2026-10-17T15:00:00Z')};
const lines=[
 ['50', '-1100'],['60','-500'],['70','-300'],['80','-188'],
 ['90','-122'],['100','+124'],['110','+182'],['125','+300']
];
const fixture='<html><head><script>const fake="Bijan Robinson 135+ Yards +999"</script></head><body>'+
 '<h1>Chicago Bears @ Atlanta Falcons Rushing Props Odds</h1>'+
 lines.map(([yards,odds])=>'<div>Bijan Robinson '+yards+'+ Yards</div><span>'+odds+'</span>').join('')+
 '</body></html>';

test('parses the exact sportsbook-visible FanDuel alternate rushing ladder, never 135+',()=>{
 const rows=parseFanDuelVisibleNflRushingProps(fixture,scope);
 assert.deepEqual(rows.map(r=>[r.line,r.odds]),lines.map(([l,o])=>[Number(l),Number(o)]));
 assert.ok(rows.every(r=>r.book==='FanDuel'&&
   r.sourceUrl==='https://co.sportsbook.fanduel.com/football/nfl'&&
   r.verification==='PUBLIC_PAGE_OBSERVATION_ONLY'&&r.category==='rushing'));
 assert.ok(!rows.some(r=>r.line===135));
});
test('refuses to use any differently-scoped game, script-only data or app shell',()=>{
 assert.deepEqual(parseFanDuelVisibleNflRushingProps(fixture,{
  ...scope,awayName:'Green Bay Packers'}),[]);
 assert.deepEqual(parseFanDuelVisibleNflRushingProps(
  '<html><script>Chicago Bears @ Atlanta Falcons Rushing Props Odds Bijan Robinson 125+ Yards +300</script></html>',scope),[]);
 assert.deepEqual(parseFanDuelVisibleNflRushingProps(
  '<html><title>FanDuel Sportsbook</title><div id="root"></div></html>',scope),[]);
});
test('rejects malformed prices, duplicate offers and imaginary alternates',()=>{
 const fixture='<h1>Chicago Bears @ Atlanta Falcons Rushing Props Odds</h1>'+
  'Bijan Robinson 125+ Yards +300 '+
  'Bijan Robinson 125+ Yards +300 '+
  'Bijan Robinson 135+ Yards +invalid '+
  'Bijan Robinson 140+ Yards +0 ';
 const rows=parseFanDuelVisibleNflRushingProps(fixture,scope);
 assert.deepEqual(rows.map(x=>x.line),[125]);
});
test('combined public evidence never becomes a claimed bookmaker-correlated SGP quote',()=>{
 const x=publicBookResearchReport({...scope,fdHtml:fixture,fdStatus:'FETCH_OK'});
 assert.equal(x.offers.length,8);
 assert.equal(x.books.find(b=>b.book==='FanDuel').observedOffers,8);
 assert.equal(x.combinedSgpQuoteVerified,false);
 assert.equal(x.verifiedBettableOffers,0);
});
test('public-site endpoint does not depend on odds APIs and checks both primary storefronts',()=>{
 const api=readFileSync(new URL('../api/nfl-public-book-research.js',import.meta.url),'utf8');
 assert.ok(api.includes('read(DRAFTKINGS_DIRECT_URL)'));
 assert.ok(api.includes('read(FANDUEL_NFL_PUBLIC_URL)'));
 assert.ok(api.includes('fdHtml:fd.html'));
 assert.ok(!api.includes('THE_ODDS_API_KEY'));
 assert.ok(!api.includes('PLAYER_PROPS_API_KEY'));
 assert.equal(ODDS_SOURCE_POLICY.thirdPartyOddsApisPermitted,false);
 assert.equal(DIRECT_PUBLIC_SPORTSBOOK_SOURCES.FanDuel,'https://co.sportsbook.fanduel.com/');
});

test('NFL market route refuses third-party odds API use and reads only confirmed official-site offers',()=>{
 const market=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(market.includes('const DIRECT_PUBLIC_ODDS_ONLY=true'));
 assert.ok(market.includes('if(!modelOnlyPrimer&&!DIRECT_PUBLIC_ODDS_ONLY)try{'));
 assert.ok(market.includes('if(process.env.PLAYER_PROPS_API_KEY&&authorizedChange&&!DIRECT_PUBLIC_ODDS_ONLY)'));
 assert.ok(market.includes("const sgoEnabled=Boolean(process.env.SPORTSGAMEODDS_API_KEY)&&sgoFlag!=='false'&&!modelOnlyPrimer&&!DIRECT_PUBLIC_ODDS_ONLY"));
 assert.ok(market.includes("'/api/nfl-public-book-research?date='"));
 assert.ok(market.includes('const exactSiteOffers='));
 assert.ok(market.includes('^https:\\/\\/co\\.sportsbook\\.fanduel\\.com'));
 assert.ok(market.includes('^https:\\/\\/sportsbook\\.draftkings\\.com'));
 assert.ok(market.includes('oddsDebug.directPublicSources=research.directSources||{}'));
});
