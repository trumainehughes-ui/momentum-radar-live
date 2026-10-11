import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sportsbookCoverageAudit} from '../lib/sportsbook-coverage-audit.js';
const id='401872981';
const mk=(cat,book,line,odds,overrides={})=>({
 eventID:id,playerID:overrides.playerID||'player-A',name:'Athlete',
 cat,periodID:'game',betTypeID:cat==='td'?'yn':'ou',
 sideID:cat==='td'?'yes':'over',
 books:[{book,line,odds,available:true,...overrides.bookOffer}],
 ...Object.fromEntries(Object.entries(overrides).filter(([k])=>k!=='bookOffer'))
});
test('both sportsbook markets independently checked with real-priced alternatives and explicit per-category gaps',()=>{
 const rows=[
  mk('rushing','DraftKings','49.5',-110),
  mk('rushing','DraftKings','69.5',+165),
  mk('rushing','FanDuel','49.5',-105),
  mk('receiving','DraftKings','64.5',-115,{playerID:'player-B'}),
  mk('td','FanDuel',null,+135,{playerID:'player-B'}),
  mk('receptions','DraftKings','4.5',-120,{playerID:'player-C'}),
  mk('passing','FanDuel','229.5',-112,{playerID:'player-D'})
 ];
 const report=sportsbookCoverageAudit(rows,{gameId:id,source:'Test'});
 assert.equal(report.bothBooksAudited,true);
 assert.equal(report.bothBooksObservedPriced,true);
 assert.equal(report.completeAllPublicStatsCoverage,false);
 assert.equal(report.books.DraftKings.pricedSelections,4);
 assert.equal(report.books.FanDuel.pricedSelections,3);
 assert.equal(report.books.DraftKings.categories.rushing,2);
 assert.equal(report.books.FanDuel.categories.td,1);
 assert.ok(report.books.FanDuel.missingCategories.includes('receiving'));
 assert.equal(report.books.DraftKings.bookCombinedSgpQuoteVerified,false);
});
test('book absent, suspended, unpriced or wrong-game cannot be counted, including zero/null odds',()=>{
 const report=sportsbookCoverageAudit([
  mk('rushing','DraftKings','49.5',-110),
  mk('receiving','FanDuel','79.5',+200,{eventID:'401872982'}),
  mk('passing','FanDuel','249.5',null),
  mk('rushing','FanDuel','69.5',+200,{bookOffer:{available:false}}),
  mk('td','FanDuel',null,0)
 ],{gameId:id,source:'The Odds API'});
 assert.equal(report.books.DraftKings.pricedSelections,1);
 assert.equal(report.books.FanDuel.pricedSelections,0);
 assert.equal(report.bothBooksObservedPriced,false);
 assert.equal(report.books.FanDuel.status,'BOOK_PRICES_NOT_OBSERVED');
});
test('both-book coverage is visible in NFL matchup UI and stored on event response',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(src,/sportsbookCoverage=gameId\?sportsbookCoverageAudit/);
 assert.match(src,/sgpRebuildReport,sportsbookCoverage,sportsbookAiGuard/);
 assert.match(html,/function nflSportsbookCoverageUi\(data,gameId\)/);
 assert.match(html,/nflSportsbookCoverageUi\(d,id\)/);
 assert.match(html,/Required sportsbook check • both books/);
});
