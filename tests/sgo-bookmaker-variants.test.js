import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sgoBookmakerVariants,expandSgoPlayerMarket}
 from '../lib/sgo-bookmaker-variants.js';
const original={
 oddID:'passing-yard-test',statID:'passing yards',
 periodID:'game',betTypeID:'ou',sideID:'over',
 playerID:'PLAYER_123_NFL',statEntityName:'Quarterback Name',
 marketName:'player_pass_yds',
 byBookmaker:{
  draftkings:{odds:'-115',overUnder:'234.5',available:true,
   deeplink:'https://sportsbook.draftkings.com/events/98765',
   altLines:[
    {odds:'+120',overUnder:'259.5',available:true,
     deeplink:'https://sportsbook.draftkings.com/events/98765/259'},
    {odds:'+200',overUnder:'299.5',available:true},
    {odds:'+140',overUnder:'279.5',available:false},
    {odds:null,overUnder:'319.5',available:true}
   ]},
  fanduel:{odds:'-108',overUnder:'229.5',available:true,
   deeplink:'https://sportsbook.fanduel.com/event/98765',
   altLines:[{odds:'+150',overUnder:'259.5',available:true}]},
  betmgm:{odds:'-105',overUnder:'224.5',available:true,
   altLines:[{odds:'+215',overUnder:'279.5',available:true}]}
 }
};
test('v2 SGO keeps real DK and FD base and alternate +/- prices separately without adding the wrong bookmaker',()=>{
 const rows=sgoBookmakerVariants(original);
 assert.equal(rows.length,5);
 assert.equal(rows.filter(x=>x.book==='DraftKings').length,3);
 assert.equal(rows.filter(x=>x.book==='FanDuel').length,2);
 assert.equal(rows.filter(x=>x.book==='BetMGM').length,0);
 assert.equal(rows.find(x=>x.book==='DraftKings'&&x.line==='299.5').odds,200);
 assert.equal(rows.find(x=>x.book==='FanDuel'&&x.line==='259.5').odds,150);
 assert.equal(rows.find(x=>x.book==='DraftKings'&&x.line==='259.5').deeplink,
  'https://sportsbook.draftkings.com/events/98765/259');
 assert.ok(rows.every(x=>x.available===true&&Number.isFinite(x.odds)));
 const expanded=expandSgoPlayerMarket(original,'401872981',
  (o,eventID)=>({eventID,name:o.statEntityName,playerID:o.playerID,
   marketName:o.marketName,periodID:o.periodID,betTypeID:o.betTypeID,
   sideID:o.sideID,statID:o.statID}));
 assert.equal(expanded.length,5);
 assert.ok(expanded.every(x=>x.eventID==='401872981'&&
  x.books.length===1&&x.sourceBook===x.books[0].book));
 assert.equal(expanded.find(x=>x.books[0].line==='299.5').books[0].odds,200);
});
test('unavailable/zero-priced, under, first-quarter or wrong-domain sportsbook links fail closed',()=>{
 for(const bad of [
  {...original,sideID:'under'},
  {...original,periodID:'quarter_1'},
  {...original,betTypeID:'spread'},
  {...original,statID:'touchdowns',betTypeID:'yn',sideID:'no'}
 ])assert.deepEqual(sgoBookmakerVariants(bad),[]);
 const fake=structuredClone(original);
 fake.byBookmaker.draftkings.deeplink='https://sportsbook.draftkings.com.attacker.test/path';
 fake.byBookmaker.draftkings.altLines[0].deeplink='javascript:alert(1)';
 fake.byBookmaker.fanduel.available=false;
 const rows=sgoBookmakerVariants(fake);
 assert.ok(rows.every(x=>x.book==='DraftKings'));
 assert.ok(rows.every(x=>x.deeplink===null||x.deeplink.startsWith('https://sportsbook.draftkings.com/')));
 const missing=structuredClone(original);
 missing.byBookmaker.draftkings.odds=null;
 missing.byBookmaker.fanduel.odds='0';
 missing.byBookmaker.draftkings.altLines=[];
 missing.byBookmaker.fanduel.altLines=[];
 assert.deepEqual(sgoBookmakerVariants(missing),[]);
});
test('source handler reads one budgeted event page, with includeAltLines=true not a separate expensive API call',()=>{
 const handler=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.match(handler,/baseUrl\.searchParams\.set\('includeAltLines','true'\)/);
 assert.match(handler,/flatMap\(o=>expandSgoPlayerMarket\(o,e\.eventID\|\|e\.id,market\)\)/);
 assert.match(handler,/function shouldUseSgoBackup|shouldUseSgoBackup/);
 assert.ok(!handler.includes('api.sportsgameodds.com/v1'));
});
