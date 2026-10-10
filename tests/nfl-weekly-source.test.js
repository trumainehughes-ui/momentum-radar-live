import test from 'node:test';
import assert from 'node:assert/strict';
import {nflPublishedWeeklyGameReport} from '../lib/nfl-weekly-source.js';
const query={gameId:'401872981',date:'2026-10-11',teams:['JAX','PHI']};
test('NFL Week 5 JAX/PHI includes missing confirmed OUT players and provenance',()=>{
 const d=nflPublishedWeeklyGameReport(query);
 assert.ok(d);
 assert.equal(d.entries.find(x=>x.name==='Saquon Barkley').status,'OUT');
 assert.equal(d.entries.find(x=>x.name==='Jaylon Jones').status,'OUT');
 assert.equal(d.entries.find(x=>x.name==='Jonathan Greenard').status,'QUESTIONABLE');
 assert.equal(d.entries.find(x=>x.name==='Eric Murray').status,'DOUBTFUL');
 assert.equal(d.entries.length,8);
 assert.match(d.url,/nfl\.com/);
 assert.ok(Number.isFinite(Date.parse(d.publishedAt)));
});
test('published snapshot never leaks to other games, teams or dates',()=>{
 assert.equal(nflPublishedWeeklyGameReport({...query,gameId:'401872987'}),null);
 assert.equal(nflPublishedWeeklyGameReport({...query,teams:['PHI','NO']}),null);
 assert.equal(nflPublishedWeeklyGameReport({...query,date:'2026-10-18'}),null);
});
