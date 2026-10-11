import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNflPlayerBookCatalog} from '../lib/nfl-player-book-catalog.js';
const id='401872981',name='Player X';
const template={
 eventID:id,playerID:'123',name,team:'JAX',
 cat:'rushing',statID:'rushing yards',periodID:'game',
 betTypeID:'ou',sideID:'over'
};
const row=(line,odds,book,rest={})=>({...template,
 books:[{book,line,odds,available:true,...rest}]});
test('one NFL player retains multiple independent +/- priced lines at BOTH sportsbooks',()=>{
 const lines=[
  row('49.5',-110,'DraftKings'),
  row('69.5',+130,'DraftKings',{deeplink:'https://sportsbook.draftkings.com/events/123'}),
  row('49.5',-105,'FanDuel'),
  row('79.5',+220,'FanDuel'),
  row('49.5',-105,'FanDuel'), // exact duplicate
  row('89.5',+210,'BetMGM')];
 const item=buildNflPlayerBookCatalog(lines,{eventID:id}).get('123|rushing');
 assert.equal(item.DraftKings.length,2);
 assert.equal(item.FanDuel.length,2);
 assert.equal(item.DraftKings[1].odds,130);
 assert.equal(item.FanDuel[1].odds,220);
 assert.equal(item.DraftKings[1].deeplink,'https://sportsbook.draftkings.com/events/123');
 assert.ok(item.DraftKings.every(x=>x.combinedQuoteVerified===false));
});
test('a 50-yard OVER is not converted to a 50+ winning threshold without source settlement metadata',()=>{
 const lines=buildNflPlayerBookCatalog([row('50',-110,'DraftKings'),
  row('49.5',-110,'DraftKings')]).get('123|rushing').DraftKings;
 assert.deepEqual(lines.map(x=>x.line),['49.5','50']);
});
test('wrong-game, under, false availability, null price, or wrong side is ignored',()=>{
 const input=[row('49.5',-110,'FanDuel'),
  {...row('99.5',+100,'FanDuel'),eventID:'401872982'},
  {...row('99.5',+100,'FanDuel'),sideID:'under'},
  {...row('99.5',+100,'FanDuel'),periodID:'quarter_1'},
  row('89.5',null,'DraftKings'),row('79.5',0,'DraftKings'),
  row('84.5',+225,'DraftKings',{available:false})];
 const item=buildNflPlayerBookCatalog(input,{eventID:id}).get('123|rushing');
 assert.equal(item.FanDuel.length,1);
 assert.equal(item.DraftKings.length,0);
});
test('anytime TD only accepts full-game YES with separately quoted prices',()=>{
 const td={...template,cat:'td',statID:'touchdowns',betTypeID:'yn',
  sideID:'yes',books:[{book:'FanDuel',line:null,odds:+155,available:true}]};
 const result=buildNflPlayerBookCatalog([td]).get('123|td');
 assert.equal(result.FanDuel[0].line,'Anytime TD');
 const wrong=buildNflPlayerBookCatalog([{...td,sideID:'no'}]);
 assert.equal(wrong.size,0);
});
test('both ranked player cards and the SGP cards render independently quoted DK/FD +/- from the source catalog',()=>{
 const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(api,/bookLineCatalog:/);
 assert.match(page,/function nflPlayerPropPricesUi\(x\)/);
 assert.match(page,/nflPlayerPropPricesUi\(x\)/);
 assert.match(page,/rows\.slice\(0,10\)\.map\(x=>/);
 assert.match(page,/function nflIndividualBookOddsUi\(leg,expectedBook\)/);
 assert.match(page,/nflIndividualBookOddsUi\(x,book\)/);
});
