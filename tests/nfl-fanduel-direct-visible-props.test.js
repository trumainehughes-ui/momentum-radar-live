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

test('NFL market route defaults to official-site offers and supports opt-in verified book feeds',()=>{
 const market=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(market.includes('const DIRECT_PUBLIC_ODDS_ONLY=String(process.env.MOMENTUM_VERIFIED_BOOK_FEEDS||'').toLowerCase()!=='enabled''));
 assert.ok(market.includes('if(!modelOnlyPrimer&&!DIRECT_PUBLIC_ODDS_ONLY)try{'));
 assert.ok(market.includes('if(process.env.PLAYER_PROPS_API_KEY&&authorizedChange&&!DIRECT_PUBLIC_ODDS_ONLY)'));
 assert.ok(market.includes("const sgoEnabled=Boolean(process.env.SPORTSGAMEODDS_API_KEY)&&sgoFlag!=='false'&&!modelOnlyPrimer&&!DIRECT_PUBLIC_ODDS_ONLY"));
 assert.ok(market.includes("'/api/nfl-public-book-research?date='"));
 assert.ok(market.includes('const exactSiteOffers='));
 assert.ok(market.includes('^https:\\/\\/co\\.sportsbook\\.fanduel\\.com'));
 assert.ok(market.includes('^https:\\/\\/sportsbook\\.draftkings\\.com'));
 assert.ok(market.includes('oddsDebug.directPublicSources=research.directSources||{}'));
});

test('production public research does not claim FanDuel roster mismatch when only DK supplied odds',async()=>{
 const {default:handler}=await import('../api/nfl-public-book-research.js');
 const savedFetch=globalThis.fetch;
 const savedDateNow=Date.now;
 Date.now=()=>Date.parse('2026-10-17T15:00:00Z');
 const savedDeployment=process.env.VERCEL_URL;
 const savedEnv=process.env.VERCEL_ENV;
 process.env.VERCEL_URL='momentum-radar-live-integration123.vercel.app';
 process.env.VERCEL_ENV='preview';
 const html='<table><tr><td>CHI Bears @ ATL Falcons</td><td>10/18, 01:00PM</td>'+
  '<td>Anytime TD Scorer</td><td>Bijan Robinson</td><td>−290</td></tr></table>';
 const mock=(body,contentType='application/json')=>({
  ok:true,status:200,headers:{get:x=>x==='content-type'?contentType:null},
  json:async()=>body,text:async()=>body
 });
 globalThis.fetch=async url=>{
  const u=String(url);
  if(u.includes('/api/nfl-schedule?'))return mock({
   ok:true,date:'2026-10-18',games:[{gameId:'401872999',
    home:{abbr:'ATL',name:'Atlanta Falcons'},away:{abbr:'CHI',name:'Chicago Bears'}}]});
  if(u.includes('/api/public-nfl-game?'))return mock({
   ok:true,status:'CURRENT',date:'2026-10-18',gameId:'401872999',
   categories:{td:[{name:'Bijan Robinson',playerID:'4429',team:'ATL'}]}});
  if(u.includes('dknetwork.draftkings.com'))return mock(html,'text/html');
  if(u.includes('co.sportsbook.fanduel.com'))return mock(
   '<html><body><div id="app">Please enable JavaScript</div></body></html>','text/html');
  if(u.includes('sportsbook.draftkings.com'))return mock(
   '<html><body>DraftKings public storefront</body></html>','text/html');
  throw Error('unexpected URL '+u);
 };
 const res={headers:{},setHeader(k,v){this.headers[k]=v;return this},
  status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};
 try{
  await handler({method:'GET',query:{date:'2026-10-18',gameId:'401872999'}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.sourceHealth.DraftKings.observedPropRows,1);
  assert.equal(res.body.sourceHealth.FanDuel.observedPropRows,0);
  assert.equal(res.body.sourceHealth.FanDuel.state,'JAVASCRIPT_RENDERED_STOREFRONT');
  assert.equal(res.body.sourceHealth.FanDuel.requiresMachineReadableMarketFeed,true);
 }finally{
  Date.now=savedDateNow;
  globalThis.fetch=savedFetch;
  if(savedDeployment===undefined)delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL=savedDeployment;
  if(savedEnv===undefined)delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV=savedEnv;
 }
});
