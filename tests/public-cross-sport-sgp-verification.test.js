import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {evaluateSportStarterReadiness,evaluateSportBookSgpLineup,
 sportResearchVerificationStatus} from '../lib/sport-sgp-verification-gate.js';
import {publicNflGameView} from '../lib/public-nfl-view.js';

const now=Date.parse('2026-10-13T16:00:00Z');
const checkedAt=new Date(now-120000).toISOString();
const gameId='401872995';
const player=(i=1)=>({
 playerID:String(1234000+i),eventID:gameId,team:'DEN',name:'Test Player '+i,
 position:'RB',cat:'rushing',analyticsThreshold:65
});
const role=(i=1)=>({
 playerId:String(1234000+i),team:'DEN',recommendationEligible:true,
 starterStatus:'CONFIRMED_STARTER',starterVerified:true,availability:'ACTIVE',
 verification:{
  role:{verified:true,checkedAt},
  availability:{verified:true,checkedAt,officialInactivesVerified:true}
 }});
test('NFL: confirmed current starter AND separately verified official inactives are needed',()=>{
 const a=player(),r=role();
 assert.equal(evaluateSportStarterReadiness(a,r,{sport:'nfl',gameId,now}).ready,true);
 for(const edit of [
  x=>{x.starterStatus='PROJECTED_HIGH_USAGE_ROLE'},
  x=>{x.starterStatus='EXPECTED_STARTER'},
  x=>{x.starterVerified=false},
  x=>{x.verification.role.verified=false},
  x=>{x.verification.availability.officialInactivesVerified=false},
  x=>{x.verification.availability.verified=false},
  x=>{x.verification.availability.checkedAt=new Date(now-60*60_000).toISOString()},
  x=>{x.verification.role.checkedAt=new Date(now-60*60_000).toISOString()},
  x=>{x.availability='QUESTIONABLE'},
  x=>{x.availability='IR'},
  x=>{x.team='SEA'},
  x=>{x.playerId='WRONG'}
 ]){
  const b=structuredClone(r);edit(b);
  const g=evaluateSportStarterReadiness(a,b,{sport:'nfl',gameId,now});
  assert.notEqual(g.ready,true,g.reason);
 }
 const wrong=evaluateSportStarterReadiness({...a,eventID:'401872999'},r,{sport:'nfl',gameId,now});
 assert.equal(wrong.reason,'CROSS_GAME_PLAYER_IDENTITY');
});
test('an entire selected-book SGP is held if any one leg is ineligible',()=>{
 const legs=[player(1),player(2),player(3),player(4)];
 const roles=new Map(legs.map((x,i)=>[x.playerID,role(i+1)]));
 const args={sport:'nfl',gameId,book:'FanDuel',now,
  roleForLeg:leg=>roles.get(leg.playerID)};
 const good=evaluateSportBookSgpLineup(legs,args);
 assert.equal(good.ready,true);
 assert.equal(good.checkedCount,4);
 const ir=roles.get(player(3).playerID);ir.availability='OUT';
 const rejected=evaluateSportBookSgpLineup(legs,args);
 assert.equal(rejected.ready,false);
 assert.equal(rejected.reason,'INJURY_OR_AVAILABILITY_HOLD');
 assert.equal(rejected.checkedCount,2);
 assert.equal(evaluateSportBookSgpLineup(legs,{...args,book:'Unknown'}).ready,false);
});
test('NBA and future sport adapter require the same actual confirmation, not usage projections',()=>{
 for(const sport of ['nba','nfl','mlb','nhl','soccer','cricket']){
  const a=player(),r=role();
  r.starterStatus='PROJECTED_HIGH_USAGE_ROLE';
  const x=evaluateSportStarterReadiness(a,r,{sport,gameId,now});
  assert.equal(x.ready,false,sport);
  assert.equal(x.reason,'STARTER_NOT_CONFIRMED');
 }
});
test('independent DraftKings/FanDuel evidence is per book, per game and time bound',()=>{
 const base={sport:'nba',gameId,injuryCheckedAt:checkedAt,
  injurySourceAvailable:true,officialInactivesVerified:false,startersConfirmed:false,now};
 const info=sportResearchVerificationStatus(base);
 assert.equal(info.injuryReportStatus,'RECENT');
 assert.equal(info.starterStatus,'UNCONFIRMED');
 assert.equal(info.books.DraftKings.status,'NO_VERIFIED_GAME_PROP');
 assert.equal(info.books.FanDuel.status,'NO_VERIFIED_GAME_PROP');
 assert.equal(info.playableSgp,false);
 const offer={sport:'nba',gameId,playerId:'player-id',market:'points',line:'25.5',
  side:'OVER',book:'DraftKings',americanOdds:'+115',
  checkedAt,offerId:'dk-224',sourceUrl:'https://sportsbook.draftkings.com',
  available:true,verifiedByServer:true};
 const checked=sportResearchVerificationStatus({...base,bookOffers:[offer]});
 assert.equal(checked.books.DraftKings.status,'INDIVIDUAL_PROP_EVIDENCE_ONLY');
 assert.equal(checked.books.FanDuel.status,'NO_VERIFIED_GAME_PROP');
 assert.equal(checked.playableSgp,false);
 for(const change of [
  x=>{x.checkedAt=new Date(now-31*60_000).toISOString()},
  x=>{x.gameId='another-game'},
  x=>{x.verifiedByServer=false},
  x=>{x.market=''},
  x=>{x.americanOdds=''},
  x=>{x.offerId=''}
 ]){
  const bad={...offer};change(bad);
  const v=sportResearchVerificationStatus({...base,bookOffers:[bad]});
  assert.equal(v.books.DraftKings.status,'NO_VERIFIED_GAME_PROP');
 }
});
test('existing NFL live quote path now refuses projection-only/old lineup despite exact book selections',()=>{
 const markets=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const game=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
 assert.ok(markets.includes('evaluateSportBookSgpLineup(s.legs'));
 assert.ok(markets.includes('const safeQuote=preflight.eligible&&lineup.ready?preflight.quoteRequest:null'));
 assert.ok(markets.includes('quoteRequest:safeQuote'));
 assert.ok(markets.includes('lineup.reason'));
 assert.ok(markets.includes("s.quoteEligibility==='READY_FOR_AUTHORIZED_QUOTE'&&s.quoteRequest"));
 assert.ok(game.includes("starterVerified:x._roleSignal?.status==='CONFIRMED_STARTER'"));
 assert.ok(game.includes("status:'HIGH_USAGE_ROLE'"));
});
test('NBA collector persists explicit not-confirmed starting five and book availability',()=>{
 const nba=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 const model=readFileSync(new URL('../lib/nba-pregame-model.js',import.meta.url),'utf8');
 assert.match(nba,/result\.pregameVerification=sportResearchVerificationStatus/);
 assert.match(nba,/injurySourceAvailable:injurySectionPresent/);
 assert.match(nba,/startersConfirmed:eventStarters.startersConfirmed===true/);
 assert.match(model,/starterVerificationStatus:'UNCONFIRMED'/);
 assert.match(model,/FanDuel:'NO_VERIFIED_GAME_PROP'/);
 assert.match(model,/DraftKings:'NO_VERIFIED_GAME_PROP'/);
 assert.ok(model.includes('publishable:false'));
});
test('read-only public page reports same injury, starter and sportsbook gate without provider IDs',()=>{
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const api=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');
 assert.ok(html.includes('Pregame roster & sportsbook checks'));
 assert.ok(html.includes('checks.startingLineups'));
 assert.ok(html.includes('checks.DraftKings'));
 assert.ok(html.includes('checks.FanDuel'));
 assert.ok(api.includes('pregameChecks:{'));
 assert.ok(!html.includes('bookOutcomeId'));
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 assert.doesNotThrow(()=>new vm.Script(script));
});
