import test from 'node:test';
import assert from 'node:assert/strict';
import {nflGameInjuryEvidence,nflInjuryBlocks} from '../lib/nfl-injury-evidence.js';
import {nflPublishedWeeklyGameReport} from '../lib/nfl-weekly-source.js';
const gameId='401872981',date='2026-10-11';
const teams=[{team:{id:'21',abbreviation:'PHI'}},{team:{id:'30',abbreviation:'JAX'}}];
const group=(team,injuries)=>({team:{id:team==='PHI'?'21':'30',abbreviation:team},injuries:injuries.map(x=>({athlete:{id:x.id||'',displayName:x.name,position:{abbreviation:x.pos||'WR'}},status:x.status,details:{type:x.injury||'Unknown'}}))});
const weekly=nflPublishedWeeklyGameReport({gameId,date,teams});
const evidence=(summary=null,league=null,report=weekly)=>nflGameInjuryEvidence({competitors:teams,summary,league,weekly:report,checkedAt:'2026-10-10T19:30:00Z'});
test('official weekly report recovers critical OUTs missing from ESPN and marks known pending player',()=>{
 const summary={injuries:[group('PHI',[{id:'17',name:'DeVonta Smith',status:'OUT'}]),group('JAX',[{id:'9',name:'Eric Murray',status:'DOUBTFUL'}])]};
 const r=evidence(summary,{injuries:[]});
 assert.equal(r.weeklyCoverage,true);
 assert.equal(r.reportAvailable,true);
 assert.equal(r.weeklyItems.length,8);
 for(const name of ['Saquon Barkley','Jaylon Jones','Marquise Brown','DeVonta Smith','Drew Kendall','Marcus Epps'])
  assert.ok(r.blockers.some(x=>x.name===name&&x.status==='OUT'&&x.section==='WEEKLY'),name);
 assert.equal(r.weeklyItems.find(x=>x.name==='Jonathan Greenard').status,'QUESTIONABLE');
 assert.equal(r.weeklyItems.find(x=>x.name==='Eric Murray').status,'DOUBTFUL');
 assert.equal(r.officialInactivesVerified,false);
 assert.equal(r.weeklyPublishedAt,'2026-10-09T20:49:00.000Z');
});
test('NFL weekly game OUT outranks ESPN stale questionable, retaining ID for blocked parlay legs',()=>{
 const summary={injuries:[group('PHI',[{id:'123',name:'Saquon Barkley',status:'QUESTIONABLE',pos:'RB'}])]};
 const r=evidence(summary);
 const barkley=r.injuries.find(x=>x.name==='Saquon Barkley');
 assert.equal(barkley.playerId,'123');
 assert.equal(barkley.status,'OUT');
 assert.equal(barkley.gameDesignationVerified,true);
 assert.ok(r.discrepancies.some(x=>x.includes('ESPN_DISAGREES_WITH_OFFICIAL:PHI:Saquon Barkley')));
});
test('Hollywood/Marquise Brown aliases create one official OUT, not two inconsistent player rows',()=>{
 const summary={injuries:[group('PHI',[{id:'987',name:'Hollywood Brown',status:'OUT',pos:'WR'}])]};
 const r=evidence(summary);
 const rows=r.injuries.filter(x=>/brown/i.test(x.name));
 assert.equal(rows.length,1);
 assert.equal(rows[0].name,'Marquise Brown');
 assert.equal(rows[0].playerId,'987');
 assert.ok(rows[0].aliases.includes('Hollywood Brown'));
});
test('reserve status entries are visually and logically separated from weekly game designations',()=>{
 const summary={injuries:[group('JAX',[{id:'86',name:'B.J. Green II',status:'IR',pos:'DE',injury:'Elbow'}])]};
 const r=evidence(summary);
 assert.equal(r.reserveItems.length,1);
 assert.equal(r.reserveItems[0].section,'RESERVE');
 assert.ok(nflInjuryBlocks(r.reserveItems[0].status));
 assert.equal(r.weeklyItems.length,8);
});
test('without dated official game cross-check ESPN-only status stays explicitly incomplete',()=>{
 const summary={injuries:[group('JAX',[{id:'50',name:'Eric Murray',status:'DOUBTFUL'}])]};
 const r=evidence(summary,null,null);
 assert.equal(r.weeklyCoverage,false);
 assert.equal(r.weeklyPublishedAt,null);
 assert.equal(r.status,'ESPN_REPORT_AVAILABLE');
 assert.ok(/may omit current weekly OUT/i.test(r.caveat));
 assert.equal(r.officialInactivesVerified,false);
});
test('wrong game does not inherit published cross-check and cannot mislabel inactives',()=>{
 const wrong=nflPublishedWeeklyGameReport({gameId:'401872987',date,teams});
 const r=evidence({injuries:[]},null,wrong);
 assert.equal(r.weeklyCoverage,false);
 assert.equal(r.reportAvailable,false);
});
