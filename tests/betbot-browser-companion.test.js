import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 collectVisibleBookObservations,officialBrowserTab,
 validateLoopbackChromeAddress,challengeDetected
} from '../lib/betbot-browser-companion.js';
import {selectBestListedBookAlternate} from '../lib/sportsbook-listed-alternate-selector.js';
const game={date:'2026-10-18',gameId:'401872999',
 homeName:'Atlanta Falcons',awayName:'Chicago Bears',
 homeAbbr:'ATL',awayAbbr:'CHI'};
const players=[{name:'Bijan Robinson',team:'ATL'},{name:'Rome Odunze',team:'CHI'}];
const source='https://co.sportsbook.fanduel.com/football/nfl';
const ladder='Player Props Bijan Robinson ATL #7 RB Rushing Yds vs CHI SUN 11:01AM MT Alt Rushing Yds 110+ +182 125+ +300 150+ +640 175+ +1280 Betslip';
const page=(url,text)=>({url:()=>url,evaluate:async()=>text});

test('only manually opened exact official sportsbook hosts qualify',()=>{
 assert.equal(officialBrowserTab(source).book,'FanDuel');
 assert.equal(officialBrowserTab('https://sportsbook.draftkings.com/leagues/football/nfl').book,'DraftKings');
 for(const url of [
  'https://sportsbook.draftkings.com.evil.com/football',
  'http://sportsbook.draftkings.com/',
  'https://dknetwork.draftkings.com/',
  'https://example.com/',
  'https://sportsbook.fanduel.com:3333/'
 ])assert.equal(officialBrowserTab(url),null);
});
test('chrome connection cannot leave the local computer',()=>{
 assert.equal(validateLoopbackChromeAddress('http://127.0.0.1:9222'),'http://127.0.0.1:9222');
 assert.equal(validateLoopbackChromeAddress('http://localhost:9222'),'http://localhost:9222');
 for(const url of [
  'http://0.0.0.0:9222','http://192.168.1.10:9222',
  'http://evil.com:9222','https://127.0.0.1:9222',
  'http://127.0.0.1:9222/payload','http://127.0.0.1:9222/?token=secret',
  'http://localhost:0','http://localhost:99999'
 ])assert.equal(validateLoopbackChromeAddress(url),null,url);
});
test('read only the visible official page and preserve exact 125+,150+ odds',async()=>{
 const report=await collectVisibleBookObservations({
  pages:[page('https://example.com/','Bijan Robinson 135+ Yards +250'),
   page(source,ladder)],game,players
 });
 assert.equal(report.ok,true);
 assert.equal(report.offers.length,4);
 assert.deepEqual(report.offers.map(x=>[x.line,x.odds]),
  [[110,182],[125,300],[150,640],[175,1280]]);
 assert.equal(report.offers.some(x=>x.line===135),false);
 assert.ok(report.offers.every(x=>x.sourceUrl===source&&
  x.captureMethod==='USER_BROWSER_DOM_OBSERVATION'));
 assert.equal(report.bookmakerSgpQuoteVerified,false);
 const chosen=selectBestListedBookAlternate({offers:report.offers,book:'FanDuel',
  gameId:game.gameId,player:'Bijan Robinson',category:'rushing',
  projection:135,desiredTarget:135,risk:'Nuke'});
 assert.equal(chosen.ok,true);
 assert.ok([125,150].includes(chosen.offer.line));
 assert.deepEqual(chosen.candidateOffers.map(x=>x.line),[125,150]);
});
test('do not read past a verification challenge or use synthetic screen data',async()=>{
 assert.equal(challengeDetected('Press & Hold to confirm you are human'),true);
 const report=await collectVisibleBookObservations({pages:[
  page(source,'Access Denied — verify you are human'),
  page('https://sportsbook.draftkings.com/','Please complete captcha challenge')
 ],game,players});
 assert.equal(report.offers.length,0);
 assert.equal(report.states.every(x=>x.state==='HUMAN_VERIFICATION_OR_ACCESS_DENIED'),true);
});
test('wrong opponent, unrelated player, and altered game identity are not accepted',async()=>{
 const report=await collectVisibleBookObservations({pages:[
  page(source,ladder.replace('vs CHI','vs MIN')),
  page(source,ladder.replace('ATL #7 RB','MIN #7 RB'))
 ],game,players:[{name:'Bijan Robinson',team:'ATL'}]});
 assert.equal(report.offers.length,0);
 assert.ok(report.states.every(x=>x.state==='game_header_not_found_in_page_text'));
});
test('cross-tab price conflicts withhold both rather than guessing freshness',async()=>{
 const r=await collectVisibleBookObservations({pages:[
  page(source,ladder),page(source,ladder.replace('125+ +300','125+ +375'))
 ],game,players});
 assert.equal(r.offers.some(x=>x.line===125),false);
 assert.equal(r.states.some(x=>x.state==='CONFLICTING_PRICES_WITHHELD'),true);
 assert.equal(r.offers.length,3);
});
test('default CLI is dry-run, publication requires dedicated key, never grabs cookies',()=>{
 const cli=readFileSync(new URL('../tools/browser-companion/companion.mjs',import.meta.url),'utf8');
 const pkg=JSON.parse(readFileSync(new URL('../tools/browser-companion/package.json',import.meta.url),'utf8'));
 assert.ok(cli.includes("const publish=flags.has('publish')"));
 assert.ok(cli.includes('MOMENTUM_BOOK_PUBLISH_KEY'));
 assert.ok(cli.includes('puppeteer.connect'));
 assert.ok(cli.includes("browser.disconnect()"));
 assert.ok(cli.includes('collectVisibleBookObservations'));
 assert.ok(!cli.includes('getCookies(')&&!cli.includes('.cookies('));
 assert.ok(!cli.includes('chrome.launch'));
 assert.ok(!cli.includes('page.goto('));
 assert.ok(!cli.includes('CRON_SECRET'));
 assert.ok(pkg.dependencies['puppeteer-core']);
});
