import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {draftKingsSportsbookSelectionLink,parseDraftKingsNetworkNflProps}
 from '../lib/nfl-public-sportsbook-observer.js';

const date='2026-10-18';
const oddsCell=(url,odds)=>'<a href="'+url+'">'+odds+'</a>';
const html=cell=>'<table><tbody><tr>'+
 ['HOU Texans @ JAX Jaguars','10/18, 09:30AM','Anytime TD Scorer','Parker Washington']
 .map(x=>'<td>'+x+'</td>').join('')+
 '<td>'+cell+'</td></tr></tbody></table>';
test('extract exact sportsbook event and public outcome ID without inventing a price',()=>{
 const cell=oddsCell('https://sportsbook.draftkings.com/event/34118244?outcomes=0QA378200505','+155');
 const value=draftKingsSportsbookSelectionLink(cell);
 assert.equal(value.bookEventId,'34118244');
 assert.equal(value.bookSelectionId,'0QA378200505');
 assert.equal(value.bookSelectionUrl,'https://sportsbook.draftkings.com/event/34118244?outcomes=0QA378200505');
 const [offer]=parseDraftKingsNetworkNflProps(html(cell),{date,home:'JAX',away:'HOU'});
 assert.equal(offer.player,'Parker Washington');
 assert.equal(offer.bookSelectionId,'0QA378200505');
 assert.equal(offer.odds,155);
 assert.equal(offer.verification,'PUBLIC_PAGE_OBSERVATION_ONLY');
 assert.ok(!offer.combinedBookQuoteVerified);
 assert.ok(!offer.available);
});
test('official slugged event links and encoded query strings are handled safely',()=>{
 const link='https://sportsbook.draftkings.com/event/hou-texans-@-jax-jaguars/34118244?outcomes=0QA378200505&amp;source=dkn';
 const value=draftKingsSportsbookSelectionLink(oddsCell(link,'+155'));
 assert.equal(value.bookEventId,'34118244');
 assert.equal(value.bookSelectionId,'0QA378200505');
});
test('reject sportsbook lookalikes, third parties, path spoofing and unrelated web links',()=>{
 for(const href of [
  'https://sportsbook.draftkings.com.evil.example/event/34118244?outcomes=0QA378200505',
  'https://dknetwork.draftkings.com/draftkings-sportsbook-player-props/',
  'https://co.sportsbook.fanduel.com/event/34118244?outcomes=0QA378200505',
  'http://sportsbook.draftkings.com/event/34118244?outcomes=0QA378200505',
  'javascript:alert(1)',
  'https://sportsbook.draftkings.com/event/34118244',
  'https://sportsbook.draftkings.com/event/34118244?outcomes=<svg>'
 ]){
  assert.equal(draftKingsSportsbookSelectionLink(oddsCell(href,'+155')),null,href);
 }
 const [offer]=parseDraftKingsNetworkNflProps(html(oddsCell('https://evil.example/event/34118244?outcomes=0QA378200505','+155')),
  {date,home:'JAX',away:'HOU'});
 assert.ok(offer);
 assert.equal(offer.bookSelectionUrl,undefined);
 assert.equal(offer.verification,'PUBLIC_PAGE_OBSERVATION_ONLY');
});
test('public displays first-party selection links but never upgrades DKN list to a correlated SGP',()=>{
 const ui=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.match(ui,/Check exact selection at DraftKings Sportsbook/);
 assert.match(ui,/u\.hostname==='sportsbook\.draftkings\.com'/);
 assert.match(ui,/target="_blank" rel="noopener noreferrer"/);
 assert.match(ui,/not authenticated current sportsbook selections or combined parlay odds/);
});
