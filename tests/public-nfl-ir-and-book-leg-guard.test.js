import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflCurrentRosterAthletes} from '../lib/nfl-roster-evidence.js';
import {nflOfficialTransactionHolds,nflRosterReserveHold}
 from '../lib/nfl-official-transaction-holds.js';
import {publicNflGameView} from '../lib/public-nfl-view.js';
import {evaluateNflBookQuoteReadiness} from '../lib/nfl-book-quote-readiness.js';

const now=Date.parse('2026-10-12T23:38:00Z'),date='2026-10-12',gameId='401872994';
const ir={playerID:'4570037',name:'Terrance Ferguson',team:'LAR',
 position:'TE',eventID:gameId,projection:2.4,category:'receptions',
 gamesPlayed:3,perGame:2.3};
const active={playerID:'3333333',name:'Eligible Receiver',team:'LAR',
 position:'WR',eventID:gameId,projection:4.6,category:'receptions',
 gamesPlayed:4,perGame:4.8};
function snapshot(){
 const card=(risk,legs)=>({risk,requiredLegs:legs.length,
   tierAssessment:{compositionOk:true},legs,
   explanation:{summary:'Prior model parlay, no bookmaker tickets'}});
 const r={ok:true,date,gameId,home:'LAR',away:'BUF',
   categories:{passing:[],rushing:[],receiving:[],receptions:[ir,active],td:[]},
   validation:{injuryEligibilityChecked:true,injuryEvidence:[]},
   sgps:{Analytics:[
     card('Small',[{...ir,cat:'receptions',analyticsThreshold:4},
       {playerID:'11',name:'Other QB',team:'BUF',eventID:gameId,
         position:'QB',cat:'passing',analyticsThreshold:225},
       {playerID:'12',name:'Other RB',team:'BUF',eventID:gameId,
         position:'RB',cat:'rushing',analyticsThreshold:65},
       {playerID:'13',name:'Other WR',team:'LAR',eventID:gameId,
         position:'WR',cat:'receiving',analyticsThreshold:50}]),
     card('Medium',[
       {...active,cat:'receptions',analyticsThreshold:4},
       {playerID:'11',name:'Other QB',team:'BUF',eventID:gameId,
        position:'QB',cat:'passing',analyticsThreshold:230},
       {playerID:'12',name:'Other RB',team:'BUF',eventID:gameId,
        position:'RB',cat:'rushing',analyticsThreshold:70},
       {playerID:'13',name:'Other WR',team:'LAR',eventID:gameId,
        position:'WR',cat:'receiving',analyticsThreshold:55},
       {playerID:'15',name:'Other TE',team:'BUF',eventID:gameId,
        position:'TE',cat:'td',analyticsThreshold:'Anytime TD'}])
   ],DraftKings:[],FanDuel:[]}};
 return{at:now-60_000,body:r};
}
test('official Rams IR transaction continues across later games and is scoped by team and date',()=>{
 const holds=nflOfficialTransactionHolds({gameId,date,home:'LAR',away:'BUF'});
 assert.equal(holds.length,1);
 assert.equal(holds[0].playerId,'4570037');
 assert.equal(holds[0].name,'Terrance Ferguson');
 assert.equal(holds[0].status,'IR');
 assert.match(holds[0].sourceUrl,/therams\.com\/team\/transactions/);
 for(const changed of [
  {gameId,date:'2026-10-19',home:'LAR',away:'BUF'},
  {gameId:'401873004',date:'2026-10-18',home:'LAR',away:'ARI'}
 ])assert.ok(nflOfficialTransactionHolds(changed).some(x=>x.name==='Terrance Ferguson'));
 for(const changed of [
  {gameId,date,home:'NYJ',away:'BUF'},
  {gameId,date:'2026-10-01',home:'LAR',away:'BUF'}
 ])assert.deepEqual(nflOfficialTransactionHolds(changed),[]);
});
test('ESPN roster groups and athlete status retain reserve information',()=>{
 const raw={athletes:[
  {name:'Tight Ends',items:[{id:'1111111',displayName:'Active TE',
    position:{abbreviation:'TE'}}]},
  {name:'Injured Reserve',items:[{id:'4570037',displayName:'Terrance Ferguson',
    position:{abbreviation:'TE'},status:{description:'Reserve/Injured'}}]}
 ]};
 const roster=nflCurrentRosterAthletes(raw);
 assert.equal(roster.length,2);
 assert.equal(nflRosterReserveHold(roster[0]),false);
 assert.equal(roster[1].rosterGroup,'Injured Reserve');
 assert.equal(nflRosterReserveHold(roster[1]),true);
 assert.equal(nflRosterReserveHold({rosterStatus:'ACTIVE'}),false);
 assert.equal(nflRosterReserveHold({rosterStatus:'IR'}),true);
 assert.equal(nflRosterReserveHold({rosterStatus:'Reserve/Injured'}),true);
});
test('old saved public player cards and entire impacted tier are rejected even if ESPN injury feed omitted IR',()=>{
 const s=snapshot();
 const result=publicNflGameView(s,{date,gameId,now});
 assert.equal(result.status,'CURRENT');
 assert.ok(!result.categories.receptions.some(x=>/Ferguson/i.test(x.name)));
 assert.deepEqual(result.parlays.map(x=>x.risk),['Medium']);
 assert.equal(result.parlays[0].legs[0].player,'Eligible Receiver');
 const asText=JSON.stringify(result);
 assert.ok(result.injuries.some(x=>x.name==='Terrance Ferguson'&&x.status==='IR'));
 assert.ok(!JSON.stringify(result.parlays).includes('Terrance Ferguson'));
 const stale=publicNflGameView(s,{date,gameId,now:now+25*60000,
  includeLastSaved:true});
 assert.equal(stale.status,'LAST_SAVED');
 assert.ok(!JSON.stringify(stale.parlays).includes('Terrance Ferguson'));
 assert.ok(stale.injuries.some(x=>x.name==='Terrance Ferguson'&&x.status==='IR'));
});
test('FanDuel lacks exact Ferguson receptions offer, so model statistics cannot qualify a book-specific SGP',()=>{
 const card={risk:'Small',tierAssessment:{compositionOk:true},
  requiredLegs:4,legs:[
    {eventID:gameId,name:'Terrance Ferguson',playerID:'4570037',
      cat:'receptions',bookOffer:null},
    {eventID:gameId,bookOffer:null},
    {eventID:gameId,bookOffer:null},
    {eventID:gameId,bookOffer:null}
  ]};
 const d=evaluateNflBookQuoteReadiness(card,{book:'FanDuel',gameId,now});
 assert.equal(d.eligible,false);
 assert.equal(d.reason,'MISSING_PROPLINE_BOOK_OFFER');
 assert.equal(d.quoteRequest,null);
 assert.equal(d.selectionCount,0);
 const code=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(code.includes('const quoteSourceRows=nflAuthorizedBookSgpRows'));
 assert.ok(code.includes("if(candidate)candidates.push({book,bookmaker,risk,candidate})"));
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(html.includes('Model picks only · Combined sportsbook odds and player lines are not verified'));
 assert.ok(html.includes('Confirm every selection at the sportsbook'));
 assert.ok(!html.includes('MODEL RESEARCH ONLY — NOT A VERIFIED SPORTSBOOK PARLAY'));
});
test('market and game-role routes both block official reserve transactions before publication',()=>{
 const markets=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const game=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
 assert.ok(markets.includes('nflOfficialTransactionHolds({gameId,date,home,away})'));
 assert.ok(markets.includes('blockedIds.add(hold.playerId)'));
 assert.ok(markets.includes('blockedNames.add(norm(hold.name))'));
 assert.ok(markets.includes('nflRosterReserveHold(a)'));
 assert.ok(markets.includes('injuryEvidence:[...(injury.injuries||[]),...rosterHoldEvidence'));
 assert.ok(game.includes('nflOfficialTransactionHolds({gameId,date:localDate'));
 assert.ok(game.includes('scopedInjuries.push({...hold'));
 assert.ok(game.includes('nflRosterReserveHold(a)'));
});
