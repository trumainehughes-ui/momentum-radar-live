import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseVisibleBookCapture,currentLocalBookOffers,validateBookPageUrl} from '../lib/public-book-text-capture.js';

const base={book:'FanDuel',sourceUrl:'https://co.sportsbook.fanduel.com/',
 date:'2026-10-18',gameId:'401872999',homeName:'Atlanta Falcons',
 awayName:'Chicago Bears',players:['Bijan Robinson','Drake London'],
 observedAt:new Date().toISOString()};
const fixture=[
 'Football / NFL / Chicago Bears @ Atlanta Falcons / Rushing Props',
 'Chicago Bears @ Atlanta Falcons Rushing Props Odds',
 'Sun, Oct 18',
 'Bijan Robinson 50+ Yards','-1100',
 'Bijan Robinson 60+ Yards','-500',
 'Bijan Robinson 70+ Yards','-300',
 'Bijan Robinson 80+ Yards','-188',
 'Bijan Robinson 90+ Yards','-122',
 'Bijan Robinson 100+ Yards','+124',
 'Bijan Robinson 110+ Yards','+182',
 'Bijan Robinson 125+ Yards','+300'].join('\n');

test('reads all eight exact odds in actual first-party FanDuel screenshot text',()=>{
 const x=parseVisibleBookCapture({...base,text:fixture});
 assert.equal(x.ok,true);
 assert.equal(x.offers.length,8);
 assert.deepEqual(x.offers.map(v=>[v.player,v.category,v.line,v.odds]),
  [[50,-1100],[60,-500],[70,-300],[80,-188],[90,-122],
   [100,124],[110,182],[125,300]].map(([line,odds])=>['Bijan Robinson','rushing',line,odds]));
 assert.ok(x.offers.every(o=>o.verification==='VISIBLE_BOOK_PAGE_USER_OBSERVATION_ONLY'));
 assert.equal(x.offers.some(x=>x.line===135),false);
 assert.equal(x.offers.some(x=>x.actualSgpOdds),false);
});
test('rejects wrong sportsbook domain, wrong matchup, missing game and spoofed player',()=>{
 assert.equal(validateBookPageUrl('https://co.sportsbook.fanduel.com.attacker.net/','FanDuel'),false);
 assert.equal(validateBookPageUrl('http://co.sportsbook.fanduel.com/','FanDuel'),false);
 assert.equal(parseVisibleBookCapture({...base,sourceUrl:'https://example.com/',text:fixture}).ok,false);
 assert.equal(parseVisibleBookCapture({...base,homeName:'Kansas City Chiefs',text:fixture}).ok,false);
 assert.equal(parseVisibleBookCapture({...base,gameId:'INVALID',text:fixture}).ok,false);
 const y=parseVisibleBookCapture({...base,players:['Fake Sports Athlete'],text:fixture});
 assert.equal(y.offers.length,0);
});
test('no inferred alternate thresholds and no arbitrary odds when source only shows fragments',()=>{
 const source='Chicago Bears @ Atlanta Falcons Rushing Props Odds Bijan Robinson 125+ Yards +300';
 const x=parseVisibleBookCapture({...base,text:source});
 assert.deepEqual(x.offers.map(o=>[o.line,o.odds]),[[125,300]]);
 const garbage=parseVisibleBookCapture({...base,text:'Chicago Bears @ Atlanta Falcons Rushing Props Odds Bijan Robinson 135+ Yards +unknown'});
 assert.equal(garbage.offers.length,0);
});
test('does not treat stale imports as a real-time public sportsbook price',()=>{
 const old=new Date(Date.now()-30*60000).toISOString();
 const x=parseVisibleBookCapture({...base,observedAt:old,text:fixture});
 assert.equal(x.ok,false);
 const fresh=parseVisibleBookCapture({...base,text:fixture});
 assert.equal(currentLocalBookOffers(fresh.offers,base.gameId).length,8);
 assert.equal(currentLocalBookOffers(fresh.offers,base.gameId,Date.now()+21*60000).length,0);
});
test('the main matchup UI exposes manual DOM capture without reclassifying it as bookmaker SGP quote',()=>{
 const main=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const html=readFileSync(new URL('../odds-capture.html',import.meta.url),'utf8');
 assert.ok(main.includes("momentum-radar-public-book-observations-v1"));
 assert.ok(main.includes('bookCaptureHtml'));
 assert.ok(main.includes('Capture exact publicly visible sportsbook odds'));
 assert.ok(main.includes('Not server-verified'));
 assert.ok(html.includes('MOMENTUM_PUBLIC_SPORTSBOOK_CAPTURE'));
 assert.ok(html.includes("event.origin"));
 assert.ok(html.includes("validateBookPageUrl(event.data.url,book)"));
 assert.ok(html.includes("localStorage.setItem(CAPTURE_STORAGE_KEY,JSON.stringify(all))"));
 assert.ok(!html.includes('THE_ODDS_API_KEY'));
 assert.ok(!html.includes('CRON_SECRET'));
});
