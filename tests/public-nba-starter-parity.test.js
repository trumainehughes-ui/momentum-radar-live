import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('public NBA research card labels each game starter evidence honestly',()=>{
 const js=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.match(js,/l\.starterVerified===true\?'GAME STARTER VERIFIED':'STARTER UNCONFIRMED'/);
 assert.match(js,/Combined sportsbook odds NOT VERIFIED/);
});
test('NBA collector marks a candidate tier not ready when observed starter evidence excludes a leg',()=>{
 const js=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 assert.match(js,/selectedStarters\.checked===true&&!startersReady\?'NOT_READY'/);
});

test('shared public guard never promotes roster membership to verified starter or a playable SGP',async()=>{
 const {publicNbaStarterStatus,publicNbaParlayPlayable}=await import('../lib/public-nba-starter-status.js');
 assert.equal(publicNbaStarterStatus({starterVerified:true,starterStatus:'UNCONFIRMED'}),'STARTER UNCONFIRMED');
 assert.equal(publicNbaParlayPlayable({publishable:true,combinedBookOddsVerified:true,legs:[{starterVerified:false,marketVerified:true}]}),false);
 assert.equal(publicNbaParlayPlayable({publishable:true,combinedBookOddsVerified:true,legs:[{starterVerified:true,starterStatus:'CONFIRMED_STARTER',marketVerified:true}]}),true);
});
