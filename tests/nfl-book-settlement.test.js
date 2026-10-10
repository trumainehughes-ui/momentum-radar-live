import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileNflBookTicket as reconcile} from '../lib/nfl-book-settlement.js';
const ticket={kind:'PLACED_BOOK',book:'FanDuel',gameId:'401872987',ticketId:'user-original-book-slip-id',stake:10,
 legs:[{providerLegId:'leg-a',name:'Player A'},{providerLegId:'leg-b',name:'Player B'},{providerLegId:'leg-c',name:'Player C'}]};
const event=(a='VOID',quote)=>({sourceType:'BOOK_ISSUED_SETTLEMENT',book:'FanDuel',gameId:ticket.gameId,ticketId:ticket.ticketId,
 legs:[{providerLegId:'leg-a',outcome:a},{providerLegId:'leg-b',outcome:'WON'},{providerLegId:'leg-c',outcome:'WON'}],adjustedQuote:quote});
const quote={sourceType:'BOOK_ISSUED_ADJUSTED_SGP',book:'FanDuel',ticketId:ticket.ticketId,americanOdds:1250,remainingLegIds:['leg-b','leg-c']};
test('ESPN injury designations or unsigned browser settlements NEVER void or grade placed tickets',()=>{
 assert.equal(reconcile(ticket,event()).verified,false);
 assert.equal(reconcile(ticket,{...event(),sourceType:'ESPN_INJURY'}, {providerAuthenticated:true}).verified,false);
});
test('book-issued void awaits adjusted correlated SGP price if provider has not supplied one',()=>{
 const r=reconcile(ticket,event(),{providerAuthenticated:true});
 assert.equal(r.status,'BOOK_ADJUSTED_ODDS_PENDING');assert.equal(r.voidedCount,1);
 assert.equal(r.adjustedAmericanOdds,null);
});
test('book-issued quote for exact remaining legs determines valid settlement and payout',()=>{
 const r=reconcile(ticket,event('VOID',quote),{providerAuthenticated:true});
 assert.equal(r.status,'BOOK_REPRICED_SETTLED');assert.equal(r.adjustedAmericanOdds,1250);
 assert.equal(r.netProfit,125);assert.equal(r.totalReturn,135);
});
test('mismatched book quote or independently multiplied odds cannot masquerade as adjusted SGP price',()=>{
 for(const q of [{...quote,sourceType:'MODEL_INDEPENDENT_MULTIPLICATION'},{...quote,remainingLegIds:['leg-b']},{...quote,book:'DraftKings'}]){
  const r=reconcile(ticket,event('VOID',q),{providerAuthenticated:true});
  assert.equal(r.adjustedAmericanOdds,null);assert.equal(r.status,'BOOK_ADJUSTED_ODDS_PENDING');
 }
});
test('only explicit verified sportsbook LOST outcome can grade a leg lost',()=>{
 const r=reconcile(ticket,event('LOST'),{providerAuthenticated:true});
 assert.equal(r.status,'BOOK_TICKET_LOST');assert.equal(r.netProfit,null);
});
test('nonparticipant vs in-game injured is not inferred without authoritative book event',()=>{
 const injury={playerId:'23',name:'Player A',status:'OUT',checkedAt:'2026-10-10T18:51:00Z'};
 assert.equal(reconcile(ticket,injury,{providerAuthenticated:true}).verified,false);
});
test('invalid book leg outcome, absent or duplicate leg never passes settlement identity',()=>{
 assert.equal(reconcile(ticket,{...event(),legs:[{providerLegId:'leg-a',outcome:'VOID'}]}, {providerAuthenticated:true}).verified,false);
 assert.equal(reconcile(ticket,{...event(),legs:[{providerLegId:'leg-a',outcome:'VOID'},{providerLegId:'leg-a',outcome:'VOID'},{providerLegId:'leg-c',outcome:'WON'}]}, {providerAuthenticated:true}).verified,false);
});
