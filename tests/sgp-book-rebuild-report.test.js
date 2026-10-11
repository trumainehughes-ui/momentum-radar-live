import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sgpBookRebuildReport} from '../lib/sgp-book-rebuild-report.js';
const gameId='401872981';
const markets=['passing','rushing','receiving','receptions','rushing','receiving'];
const target=[225,50,65,3,80,105],center=[280,70,85,5,100,130];
const make=(risk,book,n)=>({risk,book,requiredLegs:n,
 tierGeneration:risk==='Small'?'BOOK_LISTED_FLOOR':risk==='Medium'?'BOOK_LISTED_ELEVATED':'BOOK_LISTED_CEILING',
 legs:Array.from({length:n},(_,i)=>({
  name:'Player '+i,playerID:String(111+i),team:'JAX',eventID:gameId,
  position:markets[i]==='passing'?'QB':'RB',cat:markets[i],
  analyticsThreshold:target[i]+(risk==='Nuke'?(markets[i]==='passing'?60:markets[i]==='receptions'?2:25):0),
  predictiveProjection:risk==='Nuke'?center[i]:
   center[i]+40,
  bookOffer:{book,odds:-110,available:true,
   line:String(target[i]+(risk==='Nuke'?(markets[i]==='passing'?60:markets[i]==='receptions'?2:25):0))+'+'}
 }))});
test('every event gets six book/tier rows with honest $10 target bands and no combined prices invented',()=>{
 const result=sgpBookRebuildReport({league:'nfl',gameId,
  sgps:{DraftKings:[make('Small','DraftKings',4),make('Medium','DraftKings',5),
   make('Nuke','DraftKings',6)],FanDuel:[]}});
 assert.equal(result.bookTierCount,6);
 assert.equal(result.individuallyListedTierCount,2); // Nuke projection/price unverified if lift unsupported
 assert.equal(result.bookQuoteVerifiedTierCount,0);
 assert.equal(result.allTierTargetsReached,false);
 assert.equal(result.tiers[0].targets.minimum,2000);
 assert.equal(result.tiers[1].targets.minimum,3001);
 assert.equal(result.tiers[2].targets.minimum,10000);
 const small=result.tiers[0].books.find(x=>x.book==='DraftKings');
 assert.equal(small.marketSourceStatus,'BOOK_LISTED_MODEL_CANDIDATE');
 assert.equal(small.actualCombinedOdds,null);
 assert.equal(small.combinedBookQuoteVerified,false);
 assert.equal(small.quotedPayoutWithinTier,false);
 assert.equal(small.nextAction,'REQUEST_AUTHENTIC_CORRELATED_SGP_QUOTE');
 const unavailable=result.tiers[0].books.find(x=>x.book==='FanDuel');
 assert.equal(unavailable.bookListedLegsVerified,false);
 assert.equal(unavailable.nextAction,'BUILD_COMPLETE_BOOK_MODEL');
});
test('unrelated sportsbook offers, wrong event, bad yardage and unpriced markets fail independently for each tier',()=>{
 const original=make('Small','DraftKings',4);
 for(const transform of [
  x=>x.legs[0].bookOffer.book='FanDuel',
  x=>x.legs[0].bookOffer.odds=null,
  x=>x.legs[0].bookOffer.available=false,
  x=>x.legs[0].eventID='401111111',
  x=>x.legs[0].analyticsThreshold=227,
  x=>x.legs[0].bookOffer.line='227+'
 ]){
  const changed=structuredClone(original);transform(changed);
  const got=sgpBookRebuildReport({league:'nfl',gameId,
   sgps:{DraftKings:[changed]}});
  assert.equal(got.tiers[0].books[0].bookListedLegsVerified,false);
  assert.notEqual(got.tiers[0].books[0].nextAction,
   'REQUEST_AUTHENTIC_CORRELATED_SGP_QUOTE');
 }
});
test('NBA model-only candidates are never mislabeled DraftKings or FanDuel priced SGPs',()=>{
 const model=[{risk:'Small',legs:[{playerID:'1',team:'LAL',eventID:'401917234',
  cat:'points',analyticsThreshold:15}],status:'MODEL_CANDIDATE'}];
 const result=sgpBookRebuildReport({league:'nba',gameId:'401917234',
  sgps:{Analytics:model}});
 assert.equal(result.bookTierCount,6);
 assert.equal(result.individuallyListedTierCount,0);
 assert.ok(result.tiers.every(t=>t.books.every(b=>!b.combinedBookQuoteVerified)));
});
test('NFL and NBA model API, UI and collector expose the new six-cell rebuild status',()=>{
 for(const [path,marker] of [
  ['api/nfl-markets.js','sgpRebuildReport=gameId?sgpBookRebuildReport('],
  ['api/nfl-health.js','sgpRebuildReport:m.sgpRebuildReport?.gameId===g.gameId'],
  ['api/nba-health.js','result.sgpRebuildReport=sgpBookRebuildReport('],
  ['api/nba-game.js','data.sgpRebuildReport=snapshot.sgpRebuildReport?'],
  ['index.html','nflSgpRebuildUi(d,id)'],
  ['public-nba.js','sgpRebuildStatus(d)']
 ]){
  const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.ok(src.includes(marker),path+': '+marker);
 }
});
