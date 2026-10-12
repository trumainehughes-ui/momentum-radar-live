import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNflAnytimeTdCandidates} from '../lib/nfl-anytime-td-model.js';
import {pregameAiEvidence} from '../lib/pregame-ai-review.js';
const gameId='401872990';
const rb={playerID:'1001',name:'Current RB',team:'BUF',opponent:'LAR',position:'RB',
 eventID:gameId,gamesPlayed:5,rushingAttempts:82,targets:14,
 rushTouchdowns:4,receivingTouchdowns:1,last5Touchdowns:[1,0,2,1,1],
 usagePerGame:{rushYards:82,targets:2.8}};
const wr={playerID:'1002',name:'Current WR',team:'LAR',opponent:'BUF',position:'WR',
 eventID:gameId,gamesPlayed:5,rushingAttempts:0,targets:42,
 rushTouchdowns:0,receivingTouchdowns:3,last5Touchdowns:[0,1,1,0,1],
 usagePerGame:{targets:8.4}};
const dvp={completedGames:5,defenseRanks:{
 RB:{LAR:{rushTD:{rankMost:4}}},
 WR:{BUF:{recTD:{rankMost:25}}}
},offenseRanks:{RB:{BUF:{rushTD:{rankMost:6}}},WR:{LAR:{recTD:{rankMost:10}}}}};
const make=(rows,extra={})=>buildNflAnytimeTdCandidates(rows,{
 gameId,home:'LAR',away:'BUF',dvp,...extra});
test('per-game TD model ranks real rush/target volume and scored touchdowns with DVP and no bookmaker quote',()=>{
 const out=make([wr,rb]);
 assert.equal(out.length,2);
 assert.equal(out[0].name,'Current RB');
 assert.ok(out[0].modelTdPercent>out[1].modelTdPercent);
 assert.ok(out[0].modelTdPercent>=3&&out[0].modelTdPercent<=73);
 assert.equal(out[0].projection,'Anytime TD');
 assert.equal(out[0].tdModelStatus,'ESPN_MATCHUP_MODEL');
 assert.equal(out[0].evidence.opportunities,96);
 assert.equal(out[0].evidence.touchdowns,5);
 assert.equal(out[0].evidence.defenseRank,4);
 assert.ok(out[0].reason.includes('LAR defense #4 most rushing TD'));
 assert.equal(out[0].books.length,0);
 assert.equal(out[0].bestBook,null);
 assert.equal(out[0].sportsbookVerified,false);
 assert.equal(out[0].combinedBookQuoteVerified,false);
});
test('DVP changes conservative TD estimates but never supplies missing opponent ranks',()=>{
 const matchup=make([rb])[0];
 const neutral=make([rb],{dvp:null})[0];
 assert.ok(matchup.modelTdPercent>=neutral.modelTdPercent);
 assert.equal(neutral.evidence.defenseRank,null);
 assert.ok(!neutral.reason.includes('defense #'));
 const hard=make([rb],{dvp:{completedGames:5,defenseRanks:{
  RB:{LAR:{rushTD:{rankMost:31}}}
 }}})[0];
 assert.ok(hard.modelTdPercent<neutral.modelTdPercent);
});
test('wrong matchup, sparse usage and unsafe player identities fail closed',()=>{
 const out=make([
  rb,{...wr,team:'NYJ'}, {...wr,eventID:'401872980'},
  {...wr,gamesPlayed:1},{...wr,playerID:''},
  {...wr,playerID:'1003',name:''},
  {...wr,playerID:'1004',targets:0,rushingAttempts:0},
  {...wr,playerID:'1005',rushTouchdowns:null},
  {...rb,playerID:'1001',name:'Duplicate athlete'}
 ]);
 assert.deepEqual(out.map(x=>x.playerID),['1001']);
 assert.deepEqual(make([rb],{home:'BUF',away:'BUF'}),[]);
 assert.deepEqual(make([rb],{gameId:'invalid'}),[]);
});
test('pregame AI reviewer receives only same-game model TD evidence, not prices',()=>{
 const game={gameId,home:{abbr:'LAR'},away:{abbr:'BUF'}};
 const picks=[{...rb,category:'td',tdModelStatus:'ESPN_MATCHUP_MODEL',
  modelTdPercent:49,evidence:{games:5,opportunitiesPerGame:19.2,
   touchdowns:5,defenseRank:4},bookOutcomeId:'PRIVATE-OUTCOME-ID'},
  {...wr,category:'td',tdModelStatus:'UNVERIFIED',modelTdPercent:65}];
 const r=pregameAiEvidence('nfl',game,{picks,sgps:[],injuryEvidence:[],
  injuryChecks:{rosterAndInjuryEligibilityChecked:true}});
 assert.equal(r.anytimeTdModel.length,1);
 assert.equal(r.anytimeTdModel[0].modelEstimatedPercent,49);
 assert.equal(r.anytimeTdModel[0].opponentDefenseTdRank,4);
 assert.equal(r.anytimeTdModel[0].sportsbookPriceVerified,false);
 assert.ok(!JSON.stringify(r).includes('PRIVATE-OUTCOME-ID'));
});
test('active NFL game handler declares public references outside a line comment before reading them',()=>{
 const code=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const declaration=code.match(/^const publicRefs=gameId\?/m);
 assert.ok(declaration,'game-specific public refs must have a live declaration');
 assert.ok(code.indexOf('const publicRefs=')<code.indexOf('for(const r of publicRefs)'));
 assert.ok(!code.includes('box scores.const publicRefs='));
});
test('active NFL matchup uses same ESPN stats, DVP and injury gates for TD, not a second paid provider',()=>{
 const code=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(!code.includes('const tdAnalytics=[];'));
 assert.ok(code.includes('out.td.push({...base,gamesPlayed:gp,perGame:Number(((u.rushingAttempts+u.targets)/gp).toFixed(1))'));
 assert.ok(code.includes('buildNflAnytimeTdCandidates(statBoards.td,'));
 assert.ok(code.includes('gameId,home,away,dvp:ctx.dvp'));
 assert.ok(code.includes('roleFilter(eligibilityFilter(categories[cat]||[],eligibility),roles,cat)'));
 assert.ok(code.includes("cat==='td'&&!slateFallback&&r.recommendationEligible!==true"));
 assert.ok(html.includes('nflAnytimeTdRadarHtml(d)'));
 assert.ok(html.includes('id="nflTdRadar"'));
 assert.ok(html.includes('Model-estimated Anytime TD chance: '));
 assert.ok(html.includes('Percentages are model estimates, not bookmaker odds or guarantees.'));
});
