import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {officialSportsbookPublicPage,officialSportsbookUrl}
 from '../lib/sportsbook-public-links.js';
import {parsePublishedSportsbookHtml,inspectPublishedSportsbookPage}
 from '../lib/public-sportsbook-reader.js';
const fd='https://sportsbook.fanduel.com/teams/nfl/san-francisco-49ers/odds',
 dk='https://sportsbook.draftkings.com/page/nfl-player-props';
const html=`<!doctype html><h2>Will Brock Purdy...</h2>
 <p>have at least 228.5 passing yards?</p><div>Yes-113</div><div>No-113</div>
 <p>have at least 23.5 rushing yards?</p><div>Yes-113</div>
 <p>score a touchdown?</p><div>+550</div>
 <p>score the last touchdown?</p><div>+2500</div>
 <h2>Will Christian McCaffrey...</h2>
 <p>have at least 49.5 rushing yards?</p><div>Yes-113</div><div>No-113</div>
 <p>have at least 35.5 receiving yards?</p><div>Yes-113</div>
 <p>have at least 4.5 receptions?</p><div>Yes-125</div><div>No-106</div>
 <p>score a touchdown?</p><div>-135</div>`;
test('only official exact public bookmaker pages/links accepted, not malicious/lookalike or local addresses',()=>{
 assert.equal(officialSportsbookPublicPage(fd).book,'FanDuel');
 assert.equal(officialSportsbookPublicPage(dk).book,'DraftKings');
 assert.equal(officialSportsbookPublicPage('https://sportsbook.draftkings.com@evil.test/page/nfl-player-props'),null);
 assert.equal(officialSportsbookPublicPage('https://127.0.0.1/teams/nfl/team/odds'),null);
 assert.equal(officialSportsbookPublicPage('http://sportsbook.fanduel.com/teams/nfl/test/odds'),null);
 assert.equal(officialSportsbookPublicPage('https://sportsbook.fanduel.com/private/api/foo'),null);
 assert.equal(officialSportsbookPublicPage('https://sportsbook.draftkings.com/page/nfl-player-props/../../../login'),null);
 assert.equal(officialSportsbookUrl('https://sportsbook.draftkings.com/events/123','DraftKings'),'https://sportsbook.draftkings.com/events/123');
 assert.equal(officialSportsbookUrl('https://sportsbook.fanduel.com/events/123','DraftKings'),null);
});
test('FanDuel public displayed YES plus/minus prices are attributed only to exact player/stat/line, not NO or first TD',()=>{
 const rows=parsePublishedSportsbookHtml(fd,html);
 assert.equal(rows.length,7);
 const purdy=rows.filter(x=>x.player==='Brock Purdy');
 assert.deepEqual(purdy.map(x=>[x.market,x.rawLine,x.americanOdds]),[
  ['passing','228.5','-113'],['rushing','23.5','-113'],['td','Anytime TD','+550']
 ]);
 assert.equal(purdy[0].winningMinimum,229);
 assert.equal(rows.find(x=>x.player==='Christian McCaffrey'&&x.market==='rushing').winningMinimum,50);
 assert.equal(rows.find(x=>x.player==='Christian McCaffrey'&&x.market==='td').americanOdds,'-135');
 assert.ok(rows.every(x=>x.scope==='PUBLIC_WEBPAGE_UNMATCHED_EVENT'&&
  x.modelEligible===false&&x.combinedSgpQuoteVerified===false));
});
test('Public HTML data cannot turn independently priced player offers into verified game or SGP quotes',async()=>{
 let calls=0;
 const fetchImpl=async(url,options)=>{
  calls++;
  assert.equal(url,fd);
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  return{ok:true,headers:{get:()=> 'text/html'},body:null,text:async()=>html};
 };
 const p=await inspectPublishedSportsbookPage(fd,{fetchImpl});
 assert.equal(calls,1);
 assert.equal(p.ok,true);
 assert.equal(p.status,'PUBLIC_PAGE_QUOTES_OBSERVED_UNTIMED');
 assert.equal(p.quotes.length,7);
 assert.equal(p.sourceOddsTimestamp,null);
 assert.equal(p.eventIdentityVerified,false);
 assert.equal(p.canUpdateSgpLegs,false);
 assert.equal(p.combinedSgpQuoteVerified,false);
 let attempted=false;
 const block=await inspectPublishedSportsbookPage('https://evil.example/quote',
  {fetchImpl:async()=>{attempted=true;throw Error('SSRF')}});
 assert.equal(block.status,'UNSUPPORTED_OR_UNSAFE_URL');
 assert.equal(attempted,false);
});
test('DraftKings generic interactive page alone does not establish an unobserved exact individual price',()=>{
 const quote=parsePublishedSportsbookHtml(dk,
  '<title>NFL Player Props</title><div>Quarterback rushing yards +220 -110</div>');
 assert.deepEqual(quote,[]);
});
test('API on-demand public check is read-only, and the current SGO feed actually requests altLines=true',()=>{
 const endpoint=readFileSync(new URL('../api/sportsbook-public-odds.js',import.meta.url),'utf8');
 const nfl=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(endpoint,/inspectPublishedSportsbookPage/);
 assert.match(endpoint,/officialSportsbookPublicPage/);
 assert.match(endpoint,/GET_ONLY/);
 assert.match(nfl,/baseUrl\.searchParams\.set\('includeAltLines','true'\)/);
 assert.match(nfl,/expandSgoPlayerMarket\(o,e\.eventID\|\|e\.id,market\)/);
});
