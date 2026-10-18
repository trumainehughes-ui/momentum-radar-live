import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseVisibleBookCapture} from '../lib/public-book-text-capture.js';
import {buildBrowserObservedSgpReviews,observedMatchupBookSnapshot,LOCAL_BOOK_KEY}
 from '../lib/public-sgp-browser-parity.js';

const now=Date.now(),timestamp=new Date(now).toISOString();
const config={book:'FanDuel',sourceUrl:'https://co.sportsbook.fanduel.com/',
 date:'2026-10-18',gameId:'401872999',homeName:'Atlanta Falcons',
 awayName:'Chicago Bears',homeAbbr:'ATL',awayAbbr:'CHI',
 players:[{name:'Bijan Robinson',team:'ATL'}],observedAt:timestamp};
const capturedText=[
 'Player Props Bijan Robinson ATL #7 RB',
 '2026 SEASON STATS','Rushing Yds vs CHI SUN 11:01AM MT',
 'O 90.5 -113 U 90.5 -113','Alt Rushing Yds',
 '100+ +124','110+ +182','125+ +300','150+ +640','175+ +1280',
 'Betslip'
].join('\n');
const offers=parseVisibleBookCapture({...config,text:capturedText}).offers;
const model={sgps:{Analytics:[
 {risk:'Small',legs:[{player:'Bijan Robinson',team:'ATL',category:'rushing',gameId:config.gameId,target:null}]},
 {risk:'Medium',legs:[{player:'Bijan Robinson',team:'ATL',category:'rushing',gameId:config.gameId,target:null}]},
 {risk:'Nuke',legs:[{player:'Bijan Robinson',team:'ATL',category:'rushing',gameId:config.gameId,target:null}]}
]},categories:{rushing:[{name:'Bijan Robinson',team:'ATL',projection:117.4,
 recentGameValues:[83,72,194,145,86]}]}};

test('public and production read the same captured official-book observation storage key',()=>{
 const picks=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const capture=readFileSync(new URL('../odds-capture.html',import.meta.url),'utf8');
 assert.equal(LOCAL_BOOK_KEY,'momentum-radar-public-book-observations-v1');
 assert.ok(picks.includes(LOCAL_BOOK_KEY));
 assert.ok(home.includes(LOCAL_BOOK_KEY));
 assert.ok(capture.includes('CAPTURE_STORAGE_KEY'));
 assert.ok(picks.includes('src="/public-sgp-browser-bootstrap.js"'));
 assert.ok(picks.includes('state.currentBookSgpModel=null;'));
 assert.ok(picks.includes('state.publishedBookObservations=published?.ok?published:null;'));
 assert.ok(picks.includes("'/api/nfl-published-book-observations?'"));
 assert.ok(!picks.includes('state.currentBookSgpModel=m;'));
 assert.ok(picks.includes('const bookSlips=book=>{'));
 assert.ok(picks.includes('const syncedHtml='));
 assert.ok(picks.includes('const snapshotFresh=d?.ok===true'));
 assert.ok(picks.includes("event.key==='momentum-radar-public-book-observations-v1'"));
});
test('public matchups evaluate only listed 125+ or 150+ instead of inventing 135',()=>{
 const report=buildBrowserObservedSgpReviews({
  entries:offers,model,date:config.date,gameId:config.gameId,
  teams:['CHI','ATL'],now
 });
 assert.equal(report.observed.length,5);
 assert.equal(report.tiers.length,3);
 for(const tier of report.tiers){
  assert.equal(tier.legs.length,1);
  const pick=tier.legs[0].offer;
  assert.ok([100,110,125,150,175].includes(pick.line));
  assert.notEqual(pick.line,135);
  assert.equal(pick.odds,offers.find(x=>x.line===pick.line).odds);
  assert.equal(tier.combinedBookQuoteVerified,false);
  assert.equal(tier.completeCandidate,false);
 }
 const nuke=report.tiers.find(t=>t.risk==='Nuke');
 assert.deepEqual(nuke.legs[0].comparison.map(x=>x.line),[125,150]);
});
test('book observations are strictly scoped by current game and do not combine two books',()=>{
 const valid=observedMatchupBookSnapshot({
  entries:offers,gameId:config.gameId,date:config.date,teams:['ATL','CHI'],now
 });
 assert.equal(valid.length,5);
 assert.equal(observedMatchupBookSnapshot({
  entries:offers,gameId:'401000001',date:config.date,teams:['ATL','CHI'],now}).length,0);
 assert.equal(observedMatchupBookSnapshot({
  entries:offers,gameId:config.gameId,date:'2026-10-19',teams:['ATL','CHI'],now}).length,0);
 assert.equal(observedMatchupBookSnapshot({
  entries:offers,gameId:config.gameId,date:config.date,teams:['ATL'],now}).length,0);
 const oneDK={...offers[0],book:'DraftKings',sourceUrl:'https://sportsbook.draftkings.com/'};
 const report=buildBrowserObservedSgpReviews({
  entries:[...offers,oneDK],model,date:config.date,gameId:config.gameId,
  teams:['ATL','CHI'],now
 });
 const dk=report.tiers.filter(t=>t.book==='DraftKings');
 assert.equal(dk.length,3);
 assert.ok(dk.every(t=>t.legs.every(l=>l.offer.book==='DraftKings')));
});
test('old or forged observations are rejected and never displayed as current sportsbook prices',()=>{
 const stale={...offers[0],observedAt:new Date(now-21*60*1000).toISOString()};
 const fake={...offers[0],sourceUrl:'https://example.org/'};
 const projected={...offers[0],captureMethod:'MODEL_SYNTHETIC'};
 const wrongPrice={...offers[0],odds:0};
 assert.equal(observedMatchupBookSnapshot({
  entries:[stale,fake,projected,wrongPrice],gameId:config.gameId,
  date:config.date,teams:['CHI','ATL'],now}).length,0);
});
