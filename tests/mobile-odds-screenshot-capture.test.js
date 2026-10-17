import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseVisibleBookCapture} from '../lib/public-book-text-capture.js';

const html=readFileSync(new URL('../odds-capture.html',import.meta.url),'utf8');
test('mobile workflow needs no computer or Chrome debugging',()=>{
 assert.ok(html.includes('Works on your Android phone'));
 assert.ok(html.includes('no computer or Chrome companion required'));
 assert.ok(html.includes('Screenshot selected.'));
 assert.ok(html.includes('Read screenshot on this phone'));
 assert.ok(html.includes('View public picks'));
 assert.ok(html.includes('View Momentum Radar production'));
 assert.ok(html.includes('<details class="card">'));
});
test('screenshot stays local, preview uses an object URL revoked after use',()=>{
 assert.ok(html.includes('URL.createObjectURL(file)'));
 assert.ok(html.includes('URL.revokeObjectURL(screenshotObjectUrl)'));
 assert.ok(html.includes('Screenshot reading runs locally in your browser'));
 assert.ok(html.includes("worker.recognize(file)"));
 assert.ok(!html.includes('fetch(\'/api/ocr'));
});
test('mobile site requires reviewed exact markets, game roster and 20-minute TTL',()=>{
 assert.ok(html.includes('Save reviewed exact sportsbook odds'));
 assert.ok(html.includes('No unvetted names can be imported'));
 assert.ok(html.includes('CAPTURE_STORAGE_KEY'));
 assert.ok(html.includes('20*60000'));
 assert.ok(html.includes('No lines were inferred'));
});
test('mobile screenshot fixture returns real listed 125+ or 150+, never creates 135+',()=>{
 const text='Player Props Bijan Robinson ATL #7 RB Rushing Yds vs CHI SUN 11:01AM MT Alt Rushing Yds 110+ +182 125+ +300 150+ +640 Betslip';
 const r=parseVisibleBookCapture({
  book:'FanDuel',sourceUrl:'https://co.sportsbook.fanduel.com/',
  text,date:'2026-10-18',gameId:'401872999',
  homeName:'Atlanta Falcons',awayName:'Chicago Bears',
  homeAbbr:'ATL',awayAbbr:'CHI',players:[{name:'Bijan Robinson',team:'ATL'}],
  captureMethod:'USER_SCREENSHOT_OCR'
 });
 assert.equal(r.ok,true);
 assert.deepEqual(r.offers.map(x=>[x.line,x.odds]),[[110,182],[125,300],[150,640]]);
 assert.equal(r.offers.some(x=>x.line===135),false);
});
