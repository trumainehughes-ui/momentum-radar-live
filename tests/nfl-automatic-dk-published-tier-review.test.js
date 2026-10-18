import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {automaticPublishedDKReview} from '../lib/nfl-automatic-published-book-review.js';
const date='2026-10-18',gameId='401872999',now=Date.parse('2026-10-17T20:00:00Z');
const row=(player,category,line,odds,team='ATL')=>({
 player,category,line,odds,team,book:'DraftKings',
 publisher:'DraftKings Network',sourceUrl:'https://dknetwork.draftkings.com/draftkings-sportsbook-player-props/?tb_view=2',
 verification:'PUBLIC_PAGE_OBSERVATION_ONLY',rosterMatched:true,
 date,gameId,observedAt:new Date(now).toISOString()
});
const model={sgps:{Analytics:[
 {risk:'Small',legs:[
  {player:'Bijan Robinson',team:'ATL',category:'td'},
  {player:'Drake London',team:'ATL',category:'receiving'}]},
 {risk:'Medium',legs:[
  {player:'Bijan Robinson',team:'ATL',category:'td'},
  {player:'Drake London',team:'ATL',category:'receiving'}]},
 {risk:'Nuke',legs:[
  {player:'Bijan Robinson',team:'ATL',category:'td'},
  {player:'Drake London',team:'ATL',category:'receiving'}]}
]},categories:{receiving:[{name:'Drake London',team:'ATL',projection:73}]}};
const context={model,date,gameId,teams:['CHI','ATL'],now};
test('automatically published DKN real individual props match game and model tiers without any screenshot',()=>{
 const offers=[row('Bijan Robinson','td',null,-295),row('Drake London','receiving',65,115)];
 const r=automaticPublishedDKReview({...context,report:{offers}});
 assert.equal(r.status,'AUTOMATIC_FIRST_PARTY_POPULAR_PROPS_RESEARCH_ONLY');
 assert.deepEqual(r.offers.map(x=>x.odds),[-295,115]);
 assert.equal(r.tiers.length,3);
 for(const tier of r.tiers){
  assert.equal(tier.offers.length,2);
  assert.equal(tier.complete,false);
  assert.equal(tier.bookmakerSgpQuoteVerified,false);
  assert.deepEqual(tier.offers.map(x=>x.category),['td','receiving']);
 }
 assert.equal(r.bookmakerSgpQuoteVerified,false);
});
test('never invent the model-desired 135 yard line from 125+ and 150+ published prices',()=>{
 const m={sgps:{Analytics:[{risk:'Nuke',legs:[{name:'Bijan Robinson',team:'ATL',cat:'rushing'}]}]},
  categories:{rushing:[{name:'Bijan Robinson',team:'ATL',projection:117.4}]}};
 const offers=[row('Bijan Robinson','rushing',125,300),row('Bijan Robinson','rushing',150,640)];
 const r=automaticPublishedDKReview({...context,model:m,report:{offers}});
 assert.equal(r.tiers.length,1);
 assert.ok([125,150].includes(r.tiers[0].offers[0].line));
 assert.equal(r.tiers[0].offers.some(x=>x.line===135),false);
 assert.equal(r.tiers[0].offers[0].odds,
  offers.find(x=>x.line===r.tiers[0].offers[0].line).odds);
});
test('rejects fabricated URL, stale, wrong game, missing roster or other sportsbook',()=>{
 const ok=row('Bijan Robinson','td',null,-295);
 const report={offers:[
  {...ok,book:'FanDuel'},
  {...ok,sourceUrl:'https://dknetwork.draftkings.com.evil.net/draftkings-sportsbook-player-props/'},
  {...ok,sourceUrl:'https://sportsbook.draftkings.com/'},
  {...ok,publisher:'Unknown publisher'},
  {...ok,rosterMatched:false},
  {...ok,gameId:'401872998'},
  {...ok,team:'NYG'},
  {...ok,observedAt:new Date(now-21*60*1000).toISOString()},
  {...ok,odds:0},
  ok
 ]};
 const r=automaticPublishedDKReview({...context,report});
 assert.equal(r.offers.length,1);
 assert.deepEqual(r.offers[0],ok);
});
test('only current exact real offers, never provider-made SGP prices or incomplete claims',()=>{
 const r=automaticPublishedDKReview({...context,report:{offers:[]}});
 assert.equal(r.offers.length,0);
 assert.equal(r.status,'NO_FRESH_AUTOMATIC_PUBLISHED_MARKETS');
 assert.ok(r.tiers.every(t=>!t.complete&&t.offers.length===0));
 assert.equal(r.bookmakerSgpQuoteVerified,false);
});
test('both production and public pages load automatic first-party data without manual screenshot capture',()=>{
 const homepage=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const picks=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const bootstrap=readFileSync(new URL('../public-automatic-dk-book-bootstrap.js',import.meta.url),'utf8');
 assert.ok(homepage.includes("'/api/nfl-public-book-research?'"));
 assert.ok(homepage.includes('d.automaticPublishedBookResearch=autoDK?.ok?autoDK:null'));
 assert.ok(homepage.includes('autoDkHtml+bookCaptureHtml+capturedDraftHtml'));
 assert.ok(homepage.includes('Not a complete sportsbook market board')||
  homepage.includes('not the full sportsbook board'));
 assert.ok(picks.includes('window.momentumAutomaticPublishedDKReview?.({'));
 assert.ok(picks.includes('automaticTiers+coverageNote'));
 assert.ok(homepage.includes('src="/public-automatic-dk-book-bootstrap.js"'));
 assert.ok(picks.includes('src="/public-automatic-dk-book-bootstrap.js"'));
 assert.ok(bootstrap.includes('automaticPublishedDKReview'));
});

test('published research keeps same athlete separate touchdown and rushing markets, never duplicate same market',()=>{
 const model={sgps:{Analytics:[{risk:'Small',legs:[
  {name:'Bijan Robinson',team:'ATL',cat:'td'},
  {name:'Bijan Robinson',team:'ATL',cat:'rushing'},
  {name:'Bijan Robinson',team:'ATL',cat:'rushing'},
  {name:'Drake London',team:'ATL',cat:'receiving'}
 ]}]},categories:{
  rushing:[{name:'Bijan Robinson',team:'ATL',projection:105}],
  receiving:[{name:'Drake London',team:'ATL',projection:74}]
 }};
 const report={offers:[
  row('Bijan Robinson','td',null,+145),
  row('Bijan Robinson','rushing',90,-115),
  row('Bijan Robinson','rushing',90,-115),
  row('Drake London','receiving',65,-110)
 ]};
 const r=automaticPublishedDKReview({...context,model,report});
 assert.deepEqual(r.tiers[0].offers.map(x=>x.category),['td','rushing','receiving']);
 assert.deepEqual(r.tiers[0].offers.map(x=>x.line),[null,90,65]);
 assert.equal(r.offers.length,3);
 assert.equal(r.tiers[0].bookmakerSgpQuoteVerified,false);
});
test('published offers preserve distinct matchup team identities',()=>{
 const one=row('Jordan Smith','receiving',45,-110,'ATL');
 const two=row('Jordan Smith','receiving',45,-115,'CHI');
 const model={sgps:{Analytics:[{risk:'Small',legs:[
   {player:'Jordan Smith',team:'ATL',category:'receiving'},
   {player:'Jordan Smith',team:'CHI',category:'receiving'}
  ]}]},categories:{receiving:[
   {name:'Jordan Smith',team:'ATL',projection:52},
   {name:'Jordan Smith',team:'CHI',projection:60}
  ]}};
 const r=automaticPublishedDKReview({...context,model,report:{offers:[one,two]}});
 assert.equal(r.offers.length,2);
 assert.deepEqual(r.tiers[0].offers.map(x=>x.team),['ATL','CHI']);
 assert.equal(r.tiers[0].complete,false);
});

test('same exact bookmaker line keeps latest observed price regardless of incoming order',()=>{
 const original=row('Drake London','receiving',65,+110);
 const newer={...original,odds:+125,observedAt:new Date(now-30_000).toISOString()};
 const older={...original,odds:+115,observedAt:new Date(now-15*60_000).toISOString()};
 const model={sgps:{Analytics:[{risk:'Small',legs:[{
  player:'Drake London',team:'ATL',category:'receiving'
 }]}]},categories:{receiving:[{name:'Drake London',team:'ATL',projection:73}]}};
 for(const order of [[older,newer],[newer,older]]){
  const r=automaticPublishedDKReview({...context,model,report:{offers:order}});
  assert.equal(r.offers.length,1);
  assert.equal(r.offers[0].odds,+125);
  assert.equal(r.tiers[0].offers[0].odds,+125);
  assert.equal(r.tiers[0].bookmakerSgpQuoteVerified,false);
 }
});
