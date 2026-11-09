import test from 'node:test';
import assert from 'node:assert/strict';
import {prioritizeOpponentEvents} from '../lib/nfl-opponent-event-priority.js';
const event=(id,teams)=>({id,competitions:[{competitors:teams.map(team=>({team:{id:team}}))}]});
test('selects opponent games ahead of unrelated games without losing order',()=>{
 const events=[...Array.from({length:20},(_,i)=>event(String(i),['1','2'])),event('20',['7','8']),event('21',['7','9'])];
 const x=prioritizeOpponentEvents(events,'7',16);
 assert.deepEqual(x.events.slice(0,2).map(e=>e.id),['20','21']);
 assert.equal(x.opponentGamesSelected,2);
 assert.equal(x.eventsOmitted,6);
 assert.equal(x.events.length,16);
});
test('deduplicates events and safely handles absent competitor data',()=>{
 const x=prioritizeOpponentEvents([event('1',['7']),event('1',['7']),{id:'2'},null],'7',16);
 assert.deepEqual(x.events.map(e=>e.id),['1','2']);
 assert.equal(x.eventsOmitted,0);
});
