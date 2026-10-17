import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const publicSite=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const begin=api.indexOf('function nflVerifiedOnlySgpResponse(body){');
const end=api.indexOf('async function readResponseSnapshot(',begin);
assert.ok(begin>=0&&end>begin);
const sanitize=vm.runInNewContext('('+api.slice(begin,end).trim()+')',
 {sgpOddsInBand:()=>false});

test('a cached Nuke model card with Bijan 135 never exposes the invented 135-yard SGP selection',()=>{
 const input={scope:'game',sgps:{DraftKings:[],FanDuel:[],Analytics:[{
  mode:'MODEL_ONLY',publishable:false,combinedBookQuoteVerified:false,
  risk:'Nuke',legs:[
   {player:'Bijan Robinson',team:'ATL',category:'rushing',target:135},
   {player:'Rome Odunze',team:'CHI',category:'receiving',target:65},
   {player:"D'Andre Swift",team:'CHI',category:'td',target:'Anytime TD'}
  ]}]}};
 const sanitized=sanitize(input);
 assert.equal(sanitized.sgps.Analytics.length,1);
 assert.equal(sanitized.sgps.Analytics[0].legs.length,3);
 assert.ok(sanitized.sgps.Analytics[0].legs.every(l=>l.target===null&&
  l.marketSelectionStatus==='NO_EXACT_DRAFTKINGS_OR_FANDUEL_OFFER'));
 assert.equal(input.sgps.Analytics[0].legs[0].target,135,
  'read-only cache objects are not mutated');
 assert.ok(!JSON.stringify(sanitized.sgps).includes('"target":135'));
});
test('no live NFL model-only response can expose any line threshold in SGP legs',()=>{
 assert.ok(api.includes("target:null,"));
 assert.ok(api.includes("marketSelectionStatus:'NO_EXACT_DRAFTKINGS_OR_FANDUEL_OFFER'"));
 assert.ok(api.includes("'-strict-no-unlisted-sgp-props-20261017'"));
});
test('game dashboard no longer displays unobserved 135+ or any invented yardage as an SGP selection',()=>{
 const start=main.indexOf('if(analyticsMode&&Number(d.validation?.sgpEligibleMarketRows||0)===0){');
 const end=main.indexOf('}else if(analyticsMode){',start);
 const section=main.slice(start,end);
 assert.ok(section.includes('Exact sportsbook selection pending'));
 assert.ok(!section.includes("String(p.target)+'+ '"));
 assert.ok(!section.includes('Unverified model target:'));
});
test('public picks reject model-only synthetic alternatives and require game-specific first-party exact pricing',()=>{
 assert.ok(publicSite.includes('Never manufacture alternative SGP lines'));
 assert.ok(publicSite.includes("o.book!==firstBook"));
 assert.ok(publicSite.includes("hostname!=='sportsbook.draftkings.com'"));
 assert.ok(publicSite.includes('Number(o.line)===Number(l.target)'));
 assert.ok(publicSite.includes('return {label,target:String(Number(offer.line))'));
 assert.ok(!publicSite.includes("Math.round(base*(risk==='Small'"));
});
