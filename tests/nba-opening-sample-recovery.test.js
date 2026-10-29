import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nbaCompletedTeamGames} from '../lib/nba-pregame-model.js';
test('opening-night prior-season sample is expanded beyond the last three games',()=>{
 const src=readFileSync(new URL('../lib/nba-pregame-model.js',import.meta.url),'utf8');
 assert.match(src,/nbaCompletedTeamGames\(x,game\.kickoff,20\)\)\)\]\.slice\(0,40\)/);
});
test('NBA schedule selection supports a wider bounded previous-season lookback',()=>{
 const events=Array.from({length:14},(_,i)=>({id:String(401000000+i),date:new Date(Date.UTC(2026,3,i+1)).toISOString(),status:{type:{state:'post'}}}));
 assert.equal(nbaCompletedTeamGames({events},'2026-10-20T23:00:00Z',12).length,12);
});
