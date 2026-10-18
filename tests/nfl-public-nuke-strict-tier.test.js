import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {NFL_SGP_TIERS,classifyNflSgpOdds,tenDollarSgpPayout}
 from '../lib/ai-mechanics/nfl-sgp-tiers.js';
import {publicNflGameView} from '../lib/public-nfl-view.js';

const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const start=script.indexOf('function sgpSelectionDisplay(l){');
const end=script.indexOf('function offerHtml(',start);
assert.ok(start>=0&&end>start,'SGP public renderer found');

function publicFunctions(){
 const context={state:{currentBookSgpModel:null,recheckLoading:false},
  window:{},esc:x=>String(x??''),fmtStamp:()=> 'Updated',
  renderOdds:()=>'',renderPublicBookResearch:()=>'',renderLocalBookParity:()=>'',renderAutoRecheckStatus:()=>'Scheduled',
  URL};
 vm.runInNewContext(script.slice(start,end)+
  ';this.lineupOk=nflPublicTierMarketMixReady;this.priceOk=nflPublicTierPriceReady;this.render=renderParlays;',context);
 return context;
}
const legs=[
 {player:'Starting QB',team:'ATL',category:'passing',target:250},
 {player:'Starting RB',team:'ATL',category:'rushing',target:90},
 {player:'Starting WR',team:'CHI',category:'receiving',target:70},
 {player:'Starting WR',team:'CHI',category:'receptions',target:5},
 {player:'Second RB',team:'CHI',category:'td',target:'Anytime TD'}];

test('Nuke: only five to seven mixed markets qualify; two picks never count as Nuke',()=>{
 const {lineupOk,priceOk}=publicFunctions();
 assert.equal(lineupOk('Nuke',legs.slice(0,2)),false);
 assert.equal(lineupOk('Nuke',legs),true);
 assert.equal(lineupOk('Nuke',[...legs,...legs.slice(0,3)]),false);
 assert.equal(lineupOk('Nuke',[
  {player:'a',category:'td'},{player:'b',category:'td'},
  {player:'c',category:'td'},{player:'d',category:'td'},
  {player:'e',category:'td'}]),false);
 assert.equal(priceOk('Nuke',9999),false);
 assert.equal(priceOk('Nuke',10000),true);
 assert.equal(priceOk('Nuke',25000),true);
 assert.equal(priceOk('Nuke',-110),false);
 assert.equal(priceOk('Medium',10000),false);
 assert.equal(priceOk('Small',10000),false);
});
test('Nuke classification starts at actual +10000, $1000 net profit on $10',()=>{
 assert.equal(NFL_SGP_TIERS.Nuke.minLegs,5);
 assert.equal(NFL_SGP_TIERS.Nuke.maxLegs,7);
 assert.equal(NFL_SGP_TIERS.Nuke.minOdds,10000);
 assert.equal(classifyNflSgpOdds(9999),'OUTSIDE_TIER_BANDS');
 assert.equal(classifyNflSgpOdds(10000),'Nuke');
 assert.deepEqual(tenDollarSgpPayout(10000),{
  stake:10,netProfit:1000,totalReturn:1010,oddsCategory:'Nuke'});
});
test('two research selections show Nuke NOT READY, never two-leg customer SGP slip',()=>{
 const view=publicFunctions().render({
  home:'ATL',away:'CHI',status:'CURRENT',updatedDataCurrent:true,
  categories:{},inactivesVerified:true,verifiedBookParlays:[],verifiedQuotes:[],
  modelResearchTiers:[{
   risk:'Nuke',mode:'MODEL_RESEARCH',requiredLegs:5,complete:false,
   legs:legs.slice(0,2).map(l=>({...l,projection:100}))
  }]
 });
 assert.match(view,/Nuke · NOT READY/);
 assert.match(view,/2 eligible research selections/);
 assert.doesNotMatch(view,/\+10000 combined/);
 assert.doesNotMatch(view,/<ol class="sgp-leg-list">/);
});
test('public sportsbook section rejects wrong payout and short Nuke despite quote-like metadata',()=>{
 const base={home:'ATL',away:'CHI',status:'CURRENT',updatedDataCurrent:true,
  inactivesVerified:true,modelResearchTiers:[],verifiedQuotes:[],
  verifiedBookParlays:[],categories:{}};
 const fake=legs.map((leg,i)=>({...leg,bookOffer:{
  available:true,attested:true,book:'DraftKings',odds:-110,line:leg.target}}));
 const r=publicFunctions().render({...base,verifiedBookParlays:[
  {book:'DraftKings',risk:'Nuke',mode:'VERIFIED_BOOK_SGP',
   combinedOddsVerified:true,americanOdds:25000,legs:fake.slice(0,2)},
  {book:'DraftKings',risk:'Nuke',mode:'VERIFIED_BOOK_SGP',
   combinedOddsVerified:true,americanOdds:9500,legs:fake}
 ]});
 assert.doesNotMatch(r,/\+25000 combined/);
 assert.doesNotMatch(r,/\+9500 combined/);
 assert.match(r,/No complete DraftKings lineup/);
});
test('research guard prevents two market rows appearing as a completed Nuke in the owner app',()=>{
 assert.match(index,/NOT READY — incomplete; no verified combined odds/);
 assert.match(index,/c\.matched\.length>=c\.needed\?c\.matched:\[\]/);
 assert.match(page,/!nflPublicTierMarketMixReady\(c\.risk,c\.legs\)/);
 assert.match(page,/!nflPublicTierPriceReady\(c\.risk,c\.americanOdds\)/);
});
test('server marks partial Nuke model as incomplete even if cached tier claims success',()=>{
 const date='2026-10-18',gameId='401872996',at=Date.parse('2026-10-18T10:00:00Z');
 const mk=(name,id,category,team,projection)=>({
  name,playerID:id,eventID:gameId,team,projection,gamesPlayed:5,position:'RB'});
 const categories={td:[],passing:[],rushing:[
  mk('Starting RB','a','rushing','ATL',89)],receiving:[
  mk('Starting WR','b','receiving','CHI',75)],receptions:[]};
 const snap={at,body:{ok:true,date,gameId,home:'ATL',away:'CHI',
  validation:{injuryEligibilityChecked:true,officialInactivesVerified:false},
  categories,sgps:{Analytics:[{risk:'Nuke',requiredLegs:5,
   tierAssessment:{compositionOk:true},legs:[
    {name:'Starting RB',playerID:'a',eventID:gameId,team:'ATL',cat:'rushing'},
    {name:'Starting WR',playerID:'b',eventID:gameId,team:'CHI',cat:'receiving'}]}]}}};
 const view=publicNflGameView(snap,{date,gameId,now:at+1000});
 const nuke=view.modelResearchTiers?.find(t=>t.risk==='Nuke');
 assert.equal(nuke?.complete,false);
 assert.deepEqual(view.verifiedBookParlays||[],[]);
});
