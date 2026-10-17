import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseVisibleBookCapture} from '../lib/public-book-text-capture.js';
import {selectBestListedBookAlternate} from '../lib/sportsbook-listed-alternate-selector.js';

const observedAt=new Date().toISOString();
const base={book:'FanDuel',sourceUrl:'https://co.sportsbook.fanduel.com/',
 date:'2026-10-18',gameId:'401872999',homeName:'Atlanta Falcons',
 awayName:'Chicago Bears',homeAbbr:'ATL',awayAbbr:'CHI',
 players:[{name:'Bijan Robinson',team:'ATL'}],observedAt};
const playerModal=[
 'Player Props','Bijan Robinson','ATL #7 RB','2026 SEASON STATS',
 'Rushing Yds vs CHI SUN 11:01AM MT','O 90.5 -113 U 90.5 -113',
 'Alt Rushing Yds',
 '50+ -1100','60+ -500','70+ -300','80+ -188','90+ -122',
 '100+ +124','110+ +182','125+ +300','150+ +640','175+ +1280',
 'Betslip'
].join('\n');

test('reads the screenshot-style FanDuel player modal with 125 and 150 but never 135',()=>{
 const result=parseVisibleBookCapture({...base,text:playerModal});
 assert.equal(result.ok,true);
 assert.deepEqual(result.offers.map(x=>[x.line,x.odds]),[
  [50,-1100],[60,-500],[70,-300],[80,-188],[90,-122],
  [100,124],[110,182],[125,300],[150,640],[175,1280]
 ]);
 assert.ok(!result.offers.some(x=>x.line===135));
});
test('rejects unrelated player modals without official matchup and roster identity',()=>{
 for(const params of [
  {awayAbbr:'DEN'}, {players:[{name:'Bijan Robinson',team:'CHI'}]},
  {text:playerModal.replace('vs CHI','vs DEN')},
  {text:playerModal.replace('ATL #7 RB','DEN #7 RB')}
 ]){
  const res=parseVisibleBookCapture({...base,text:playerModal,...params});
  assert.equal(res.offers.length,0);
 }
});
test('Nuke picks only a real adjacent 125 or 150 depending on modeled performance and quoted price',()=>{
 const offers=parseVisibleBookCapture({...base,text:playerModal}).offers;
 const small=selectBestListedBookAlternate({offers,book:'FanDuel',gameId:base.gameId,
  player:'Bijan Robinson',category:'rushing',desiredTarget:135,projection:135,risk:'Small'});
 const nuke=selectBestListedBookAlternate({offers,book:'FanDuel',gameId:base.gameId,
  player:'Bijan Robinson',category:'rushing',desiredTarget:135,projection:135,risk:'Nuke'});
 assert.equal(small.ok,true);
 assert.equal(small.offer.line,125);
 assert.equal(small.offer.odds,300);
 assert.equal(nuke.ok,true);
 assert.equal(nuke.offer.line,150);
 assert.equal(nuke.offer.odds,640);
 assert.deepEqual(nuke.candidateOffers.map(x=>x.line),[125,150]);
 assert.equal(nuke.rule,'NEAREST_ACTUALLY_LISTED_BOOK_OPTIONS_ONLY');
 assert.ok(![small.offer.line,nuke.offer.line].includes(135));
});
test('does not always choose the largest line: avoid unjustified Nuke jump',()=>{
 const offers=parseVisibleBookCapture({...base,text:playerModal}).offers;
 const result=selectBestListedBookAlternate({offers,book:'FanDuel',gameId:base.gameId,
  player:'Bijan Robinson',category:'rushing',desiredTarget:135,projection:80,risk:'Nuke'});
 assert.equal(result.offer.line,125);
});
test('never copies an offer from another player, game, bookmaker or stale observation',()=>{
 const offers=parseVisibleBookCapture({...base,text:playerModal}).offers;
 for(const altered of [
  {...offers[7],book:'DraftKings'},
  {...offers[7],gameId:'401000001'},
  {...offers[7],player:'Other Player'},
  {...offers[7],observedAt:new Date(Date.now()-30*60000).toISOString()},
  {...offers[7],sourceUrl:'https://evil.example'},
  {...offers[7],odds:0}
 ]){
  const r=selectBestListedBookAlternate({offers:[altered],book:'FanDuel',
   gameId:base.gameId,player:'Bijan Robinson',category:'rushing',projection:135});
  assert.equal(r.ok,false);
 }
});
test('passing, receiving and reception markets all select only actual adjacent thresholds',()=>{
 const baseOffer={book:'FanDuel',gameId:base.gameId,player:'Sample QB',
  observedAt,sourceUrl:base.sourceUrl,
  verification:'VISIBLE_BOOK_PAGE_USER_OBSERVATION_ONLY'};
 for(const [category,projection,low,high] of [
  ['passing',280,275,300],['receiving',88,80,100],['receptions',6.3,6,7]
 ]){
  const offers=[{...baseOffer,category,line:low,odds:-115},
   {...baseOffer,category,line:high,odds:350}];
  const r=selectBestListedBookAlternate({offers,book:'FanDuel',
   gameId:base.gameId,player:'Sample QB',category,projection,desiredTarget:projection,risk:'Small'});
  assert.equal(r.ok,true);
  assert.equal(r.offer.line,low);
  assert.ok(r.candidateOffers.every(x=>[low,high].includes(x.line)));
 }
});
test('actual sportsbook selection remains exact and browser UI calls shared judgment function',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(html.includes("window.momentumSelectBookAlternate=selectBestListedBookAlternate"));
 assert.ok(html.includes("const choice=window.momentumSelectBookAlternate?.({"));
 assert.ok(html.includes("d.categories?.[cat]"));
 assert.ok(html.includes("matched.push({...choice.offer"));
 assert.ok(html.includes('No unlisted threshold substituted.'));
 assert.ok(!html.includes("Math.abs(Number(a.line||0)-target)"));
});

test('actual matchup card assembly selects only real prices from captured FanDuel offers',()=>{
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const start=home.indexOf('const capturedMatchupCandidates=(()=>{');
 const end=home.indexOf('const capturedDraftHtml=',start);
 assert.ok(start>0&&end>start);
 const offers=parseVisibleBookCapture({...base,text:playerModal}).offers;
 const d={sgps:{Analytics:[{
  risk:'Nuke',legs:[{player:'Bijan Robinson',team:'ATL',
   category:'rushing',gameId:'401872999',target:null}]
 }]},categories:{rushing:[{name:'Bijan Robinson',team:'ATL',
  projection:117.4,recentGameValues:[83,72,194,145,86]}]}};
 const g={gameId:'401872999',home:{abbr:'ATL'},away:{abbr:'CHI'}};
 const snippet=home.slice(start,end);
 const cards=vm.runInNewContext('(function(){'+snippet+'return capturedMatchupCandidates})()',
  {d,g,observedBookRows:offers,window:{momentumSelectBookAlternate:selectBestListedBookAlternate}});
 assert.equal(cards.length,1);
 assert.equal(cards[0].matched.length,1);
 const pick=cards[0].matched[0];
 assert.ok([125,150].includes(pick.line));
 assert.equal(pick.odds,pick.line===125?300:640);
 assert.notEqual(pick.line,135);
 assert.deepEqual([...pick.adjacentListed].map(x=>x.line),[125,150]);
});
