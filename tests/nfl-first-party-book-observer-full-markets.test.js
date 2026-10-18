import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflPublicBookTrustedOrigin} from '../api/nfl-public-book-research.js';
import {
 parseFanDuelVisibleNflPlayerProps,publicBookResearchReport,
 FANDUEL_NFL_PUBLIC_URL
} from '../lib/nfl-public-sportsbook-observer.js';

const args={date:'2026-10-18',homeName:'Jacksonville Jaguars',
 awayName:'Houston Texans',now:Date.parse('2026-10-18T03:00:00Z')};
const html='<main><h2>Houston Texans @ Jacksonville Jaguars Passing Props Odds</h2>'+
 '<p>C.J. Stroud 255+ Yards -115</p>'+
 '<h2>Houston Texans @ Jacksonville Jaguars Receiving Props Odds</h2>'+
 '<p>Parker Washington 65+ Yards +125</p>'+
 '<h2>Houston Texans @ Jacksonville Jaguars Receptions Props Odds</h2>'+
 '<p>Parker Washington 5+ Receptions +135</p>'+
 '<h2>Houston Texans @ Jacksonville Jaguars Rushing Props Odds</h2>'+
 '<p>Woody Marks 65+ Yards -110</p>'+
 '<h2>Houston Texans @ Jacksonville Jaguars Anytime Touchdown Odds</h2>'+
 '<p>Parker Washington Anytime TD +165</p>'+
 '<h2>Baltimore Ravens @ Cleveland Browns Passing Props Odds</h2>'+
 '<p>Lamar Jackson 225+ Yards -115</p></main>';
test('read visible first-party FanDuel lines for five distinct NFL markets',()=>{
 const offers=parseFanDuelVisibleNflPlayerProps(html,args);
 assert.deepEqual(offers.map(x=>x.category).sort(),
  ['passing','receiving','receptions','rushing','td']);
 assert.equal(offers.find(x=>x.category==='passing').line,255);
 assert.equal(offers.find(x=>x.category==='td').odds,165);
 assert.equal(offers.find(x=>x.category==='td').line,null);
 assert.ok(offers.every(x=>x.book==='FanDuel'&&x.sourceUrl===FANDUEL_NFL_PUBLIC_URL));
 assert.ok(offers.every(x=>x.verification==='PUBLIC_PAGE_OBSERVATION_ONLY'));
 assert.ok(offers.every(x=>x.player!=='Lamar Jackson'));
});
test('FanDuel JS app-shell odds and different games cannot masquerade as offers',()=>{
 const onlyJs='<html><script>'+html+'</script><div>Please enable JavaScript</div></html>';
 assert.deepEqual(parseFanDuelVisibleNflPlayerProps(onlyJs,args),[]);
 assert.deepEqual(parseFanDuelVisibleNflPlayerProps(html,
  {...args,awayName:'Baltimore Ravens'}),[]);
});
test('public book report never upgrades visible individual lines to SGP odds',()=>{
 const report=publicBookResearchReport({
  fdHtml:html,fdStatus:'FETCH_OK',dkStatus:'SOURCE_UNAVAILABLE',
  date:args.date,home:'JAX',away:'HOU',
  homeName:args.homeName,awayName:args.awayName,now:args.now
 });
 assert.equal(report.offers.length,5);
 assert.equal(report.verifiedBettableOffers,0);
 assert.equal(report.combinedSgpQuoteVerified,false);
 assert.ok(report.offers.every(o=>!('combinedSgpOdds' in o)));
});
test('game research uses its exact trusted deployment; previews never borrow main',()=>{
 assert.equal(nflPublicBookTrustedOrigin({
  VERCEL_URL:'momentum-radar-live-abcdef-team.vercel.app',
  VERCEL_ENV:'preview'
 }), 'https://momentum-radar-live-abcdef-team.vercel.app');
 assert.equal(nflPublicBookTrustedOrigin({
  VERCEL_URL:'evil.example.com',VERCEL_ENV:'preview',
  VERCEL_PROJECT_PRODUCTION_URL:'momentum-radar-live.vercel.app'
 }),null);
 assert.equal(nflPublicBookTrustedOrigin({
  VERCEL_ENV:'production',VERCEL_PROJECT_PRODUCTION_URL:'momentum-radar-live.vercel.app'
 }), 'https://momentum-radar-live.vercel.app');
 assert.equal(nflPublicBookTrustedOrigin({
  VERCEL_URL:'momentum-radar-live-abcdef-team.vercel.app.evil.com',
  VERCEL_ENV:'preview'
 }),null);
});
test('public sportsbook research disables CDN caching of dynamic prices',()=>{
 const api=readFileSync(new URL('../api/nfl-public-book-research.js',import.meta.url),'utf8');
 assert.match(api,/private,no-store,max-age=0/);
 assert.doesNotMatch(api,/s-maxage=300/);
 assert.doesNotMatch(api,/const BASE='https:\/\/momentum-radar-live.vercel.app'/);
 assert.match(api,/fetch\(origin\+'\/api\/public-nfl-game/);
});
