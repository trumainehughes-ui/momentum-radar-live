import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeAuthorizedPropLineRows,nflAuthorizedBookSgpRows}
 from '../lib/nfl-propline-authorized-merge.js';
const item=(provider,book='DraftKings')=>({
 provider,eventID:'401872992',playerID:'athlete-1',name:'Test Athlete',
 marketName:'player_rush_yds',books:[{book,
  sourceProvider:provider,bookOutcomeId:provider==='PropLine'?'pl-native-selection':null}]
});
test('authorized PropLine native selection IDs coexist with primary book odds',()=>{
 const ordinary=item('The Odds API'),native=item('PropLine');
 const rows=mergeAuthorizedPropLineRows([ordinary],[native]);
 assert.deepEqual(rows,[native,ordinary]);
 assert.equal(rows.length,2);
 assert.equal(rows[0].books[0].bookOutcomeId,'pl-native-selection');
 assert.deepEqual(nflAuthorizedBookSgpRows(rows,{
  authorizedChange:true,signedSelectionRows:1}),[native]);
});
test('reserve sportsbook replacement cannot erase actual authenticated PropLine book IDs',()=>{
 const native=item('PropLine','FanDuel'),reserve=item('SportsGameOdds');
 const rows=mergeAuthorizedPropLineRows([reserve],[native]);
 assert.deepEqual(nflAuthorizedBookSgpRows(rows,{
  authorizedChange:true,signedSelectionRows:1}),[native]);
 assert.deepEqual(nflAuthorizedBookSgpRows(rows,{
  authorizedChange:false,signedSelectionRows:1}),rows);
});
test('routine and exhausted-credit paths retain the current zero-PropLine output',()=>{
 const normal=[item('The Odds API'),item('SportsGameOdds')];
 assert.deepEqual(mergeAuthorizedPropLineRows(normal,[]),normal);
 assert.deepEqual(nflAuthorizedBookSgpRows(normal,{
  authorizedChange:false,signedSelectionRows:0}),normal);
 assert.deepEqual(nflAuthorizedBookSgpRows(normal,{
  authorizedChange:true,signedSelectionRows:0}),normal);
 assert.deepEqual(mergeAuthorizedPropLineRows(null,null),[]);
});
test('provider-native-only quote gate never accepts a generic odds identity',()=>{
 const real=item('PropLine'),spoofed={...item('The Odds API'),
  books:[{book:'DraftKings',sourceProvider:'The Odds API',
   bookOutcomeId:'fake-book-id'}]};
 const malformed={provider:'PropLine',books:[
  {book:'Caesars',sourceProvider:'PropLine',bookOutcomeId:'xyz'}]};
 assert.deepEqual(mergeAuthorizedPropLineRows([spoofed],[malformed,real]),
  [real,spoofed]);
 assert.deepEqual(nflAuthorizedBookSgpRows([real,spoofed],{
  authorizedChange:true,signedSelectionRows:1}),[real]);
});
test('production eligible changed-event pulls native book IDs regardless of Odds API availability',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(src.includes('if(process.env.PLAYER_PROPS_API_KEY&&authorizedChange&&!DIRECT_PUBLIC_ODDS_ONLY){'));
 assert.ok(!src.includes('if(!directRows?.length&&process.env.PLAYER_PROPS_API_KEY&&authorizedChange)'));
 assert.ok(src.includes('signedPropLineRows.push(...offers)'));
 assert.ok(src.includes('mergeAuthorizedPropLineRows(directRows,offers)'));
 assert.ok(src.includes('mergeAuthorizedPropLineRows(rows.map('));
 assert.ok(src.includes('signedSelectionRows:signedPropLineRows.length'));
 assert.ok(src.includes("buildBookSgp(quoteSourceRows,'DraftKings',ctx)"));
 assert.ok(src.includes("buildBookSgp(quoteSourceRows,'FanDuel',ctx)"));
 assert.ok(src.includes("if(authorizedChange&&gameId&&!DIRECT_PUBLIC_ODDS_ONLY)"));
 // No provider spend on public reads or automatic every-15-minute collector.
 assert.ok(src.includes("authorizedChange=Boolean(process.env.CRON_SECRET)"));
 assert.ok(src.includes('authorizedQuoteCandidates=candidates.length'));
 assert.ok(src.includes('candidates.slice(0,8)'));
});
