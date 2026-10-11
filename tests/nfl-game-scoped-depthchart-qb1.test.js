import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflCurrentGameDepthChartQbs,nflDepthChartQb1,
 nflProjectedDepthChartQbEligible} from '../lib/nfl-depthchart-qb1.js';
import {nflDayAheadRoleEvidence} from '../lib/nfl-day-ahead-roles.js';
import {nflLegMatchesGameRoster} from '../lib/ai-mechanics/nfl-sgp-tiers.js';
const gameId='401872981',home='JAX',away='PHI';
const clean=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const players=[
 {id:'1001',team:'JAX',name:'JAX QB1',position:'QB',category:'passing',usagePerGame:{rushYards:3},perGame:225},
 {id:'1002',team:'JAX',name:'JAX RB1',position:'RB',category:'rushing',usagePerGame:{rushYards:76,recYards:8},perGame:76},
 {id:'1003',team:'JAX',name:'JAX WR1',position:'WR',category:'receiving',usagePerGame:{recYards:65,targets:7,receptions:4},perGame:65},
 {id:'1004',team:'JAX',name:'JAX WR2',position:'WR',category:'receptions',usagePerGame:{recYards:32,targets:4,receptions:3},perGame:3},
 {id:'2001',team:'PHI',name:'PHI QB1',position:'QB',category:'passing',usagePerGame:{rushYards:8},perGame:230},
 {id:'2002',team:'PHI',name:'PHI RB1',position:'RB',category:'rushing',usagePerGame:{rushYards:80},perGame:80},
 {id:'2003',team:'PHI',name:'PHI WR1',position:'WR',category:'receiving',usagePerGame:{recYards:60,targets:8,receptions:5},perGame:60},
 {id:'2004',team:'PHI',name:'PHI TE1',position:'TE',category:'receptions',usagePerGame:{recYards:40,targets:4,receptions:3},perGame:3}
];
const row=x=>({playerID:x.id,team:x.team,name:x.name,position:x.position,
  eventID:gameId,opponent:x.team===home?away:home,
  gamesPlayed:4,usagePerGame:x.usagePerGame,perGame:x.perGame,projection:x.perGame});
const eligibility=()=>({
 checked:true,injuryChecked:true,
 rosterById:new Map(players.map(p=>[p.id,{id:p.id,name:p.name,team:p.team,pos:p.position}])),
 rosterByName:new Map(players.map(p=>[clean(p.name),{id:p.id,name:p.name,team:p.team,pos:p.position}])),
 blockedIds:new Set(),blockedNames:new Set()
});
const roleMap=()=>new Map(players.filter(x=>['1001','1002','2001','2002','2003','2004'].includes(x.id))
 .flatMap(p=>{
  const v={playerId:p.id,name:p.name,team:p.team,position:p.position,
   availability:'UNREPORTED',starterVerified:false,
   starterStatus:'HIGH_USAGE_ROLE',recommendationEligible:p.position==='QB',
   verification:{availability:{verified:true},role:{verified:true,status:'HIGH_USAGE_ROLE'}}};
  return[[p.id,v],['name:'+clean(p.name),v]];
 }));
const board=()=>{
 const out={passing:[],rushing:[],receiving:[],receptions:[]};
 for(const p of players)out[p.category].push(row(p));
 for(let n=0;n<145;n++)out.rushing.push({
  playerID:String(900000+n),name:'Unrelated '+n,team:'DEN',position:'RB',
  eventID:'401872982',opponent:'NYG',gamesPlayed:4,
  usagePerGame:{rushYards:120},projection:120,perGame:120});
 return out;
};
test('ESPN depth-chart QB1 rank=1 is parsed; backups, ambiguity and malformed IDs are not eligible',()=>{
 const raw={depthCharts:[{name:'Offense',positions:{quarterback:{
  position:{abbreviation:'QB'},athletes:[
   {rank:1,athlete:{id:'1001',displayName:'JAX QB1'}},
   {rank:2,athlete:{id:'1005',displayName:'JAX Backup'}}]}}}]};
 assert.deepEqual(nflDepthChartQb1(raw,'JAX'),{
  playerId:'1001',team:'JAX',rank:1,name:'JAX QB1',
  source:'ESPN current team depth chart (expected QB1, NOT an official confirmed starter)'});
 assert.equal(nflDepthChartQb1({depthCharts:[]},'JAX'),null);
 assert.equal(nflDepthChartQb1({depthCharts:[{positions:{quarterback:{athletes:[
  {rank:1,athlete:{id:'1001'}},{rank:1,athlete:{id:'1002'}}]}}}]},'JAX'),null);
 assert.equal(nflDepthChartQb1({depthCharts:[{positions:{quarterback:{athletes:[
  {rank:1,athlete:{id:'unknown'}}]}}}]},'JAX'),null);
});
test('free ESPN QB1 lookup checks only current matchup teams and isolates failed team fetch',async()=>{
 const calls=[];
 const result=nflCurrentGameDepthChartQbs({{home,away,
 teamIdsByAbbr:new Map([['JAX','30'],['PHI','21']]),fetchJson:async url=>{
  calls.push(url);
  if(url.includes('/21/'))throw Error('unavailable');
  return {depthCharts:[{positions:{QB:{position:{abbreviation:'QB'},
   athletes:[{rank:1,athlete:{id:'1001',displayName:'JAX QB1'}}]}}}]};
 }});
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>/\/teams\/(30|21)\/depthcharts$/.test(x)));
 assert.equal(result.length,1);
 assert.equal(result[0].team,'JAX');
});
test('league-wide 145 out-of-matchup players are not identity failures for PHI-JAX',()=>{
 const qbs=[{playerId:'1001',team:'JAX',rank:1},{playerId:'2001',team:'PHI',rank:1}];
 const result=nflDayAheadRoleEvidence({gameId,home,away,eligibility:eligibility(),
  gate:{checked:true,roles:roleMap()},statBoards:board(),depthChartQbs:qbs});
 assert.equal(result.counters.excludedOtherMatchups,145);
 assert.equal(result.counters.sampled,8);
 assert.equal(result.counters.missingRosterOrGameIdentity,0);
 assert.equal(result.counters.roleRebuiltFromRoster,2);
 assert.equal(result.counters.projectedDepthChartQb1,2);
 assert.ok(result.counters.projectedHighUsageRoles>=2);
 for(const id of ['1003','1004']){
  assert.equal(result.roles.get(id).recommendationEligible,true,id);
  assert.equal(result.roles.get(id).starterVerified,false,'recovered from roster is not official starter');
  assert.equal(result.roles.get(id).verification.role.verified,false);
 }
 const qb=result.roles.get('1001');
 assert.equal(qb.starterStatus,'PROJECTED_DEPTHCHART_QB1');
 assert.equal(qb.starterVerified,false);
 assert.equal(qb.verification.role.verified,false);
 assert.equal(nflProjectedDepthChartQbEligible(qb),true);
 assert.equal(nflProjectedDepthChartQbEligible({...qb,qbDepthChartRank:2}),false);
 assert.equal(nflProjectedDepthChartQbEligible({...qb,starterVerified:true}),false);
});
test('unconfirmed high-usage QB cannot be promoted without independent depth-chart rank 1',()=>{
 const result=nflDayAheadRoleEvidence({gameId,home,away,eligibility:eligibility(),
  gate:{checked:true,roles:roleMap()},statBoards:board(),depthChartQbs:[]});
 assert.equal(result.counters.projectedDepthChartQb1,0);
 assert.equal(result.counters.unconfirmedQuarterback,2);
 assert.equal(nflProjectedDepthChartQbEligible(result.roles.get('1001')),false);
});
test('questionable/out or wrong-game QB cannot get conditional model approval',()=>{
 const blocked=eligibility();
 blocked.blockedIds.add('1001');
 const result=nflDayAheadRoleEvidence({gameId,home,away,eligibility:blocked,
  gate:{checked:true,roles:roleMap()},statBoards:board(),
  depthChartQbs:[{playerId:'1001',team:'JAX',rank:1}]});
 assert.equal(result.roles.get('1001').starterStatus,'HIGH_USAGE_ROLE');
 assert.equal(result.counters.blockedInjuryOrQuestionable>=1,true);
 const wrong=board();wrong.passing[0].eventID='999999999';
 const outcome=nflDayAheadRoleEvidence({gameId,home,away,eligibility:eligibility(),
  gate:{checked:true,roles:roleMap()},statBoards:wrong,
  depthChartQbs:[{playerId:'1001',team:'JAX',rank:1}]});
 assert.equal(outcome.roles.get('1001').starterStatus,'HIGH_USAGE_ROLE');
 assert.ok(outcome.counters.missingRosterOrGameIdentity>=1);
 assert.equal(nflLegMatchesGameRoster(wrong.passing[0],{gameId,home,away,
  rosterChecked:true,rosterById:eligibility().rosterById,
  rosterByName:eligibility().rosterByName,normalizeName:clean}),false);
});
test('actual markets API and health report include scoped role counts, cache version and conditional QB source',()=>{
 const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const status=readFileSync(new URL('../lib/nfl-sgp-snapshot-status.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(api.includes('await nflCurrentGameDepthChartQbs('));
 assert.ok(api.includes('teamIdsByAbbr:eligibility.teamIdsByAbbr'));
 assert.ok(api.includes('nflProjectedDepthChartQbEligible(role)'));
 assert.ok(api.includes('day-ahead-roles-v5-teamid-depthchart'));
 assert.ok(status.includes('projectedDepthChartQb1'));
 assert.ok(status.includes('excludedOtherMatchups'));
 assert.ok(ui.includes('other-game players excluded normally'));
 assert.ok(ui.includes('depth-chart QB1 models'));
 assert.ok(!api.includes('combinedBookSgpQuoteAvailable:true'));
});

test('missing ESPN numeric team IDs fail closed; no guessed QB1 and no extra requests',async()=>{
 let fetched=0;
 const rows=await nflCurrentGameDepthChartQbs({home,away,
  teamIdsByAbbr:new Map([['JAX','JAX'],['PHI','undefined']]),
  fetchJson:async()=>{fetched++;throw Error('should not request invalid team ID')}});
 assert.deepEqual(rows,[]);
 assert.equal(fetched,0);
});
test('numeric ESPN site depthchart retains only one rank-one QB per current team',async()=>{
 const requested=[];
 const rows=await nflCurrentGameDepthChartQbs({home,away,
  teamIdsByAbbr:new Map([['JAX','30'],['PHI','21']]),
  fetchJson:async url=>{
   requested.push(url);
   const jax=url.includes('/30/'),
    id=jax?'1001':'2001',
    name=jax?'JAX QB1':'PHI QB1';
   return{depthCharts:[{name:'Offense',positions:{quarterback:{
    position:{abbreviation:'QB'},athletes:[
      {rank:1,athlete:{id,displayName:name}},
      {rank:2,athlete:{id:'9991',displayName:'Backup QB'}}
    ]}}}]};
  }});
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(x=>x.playerId).sort(),['1001','2001']);
 assert.ok(requested.some(x=>x.includes('/teams/30/depthcharts')));
 assert.ok(requested.some(x=>x.includes('/teams/21/depthcharts')));
 assert.ok(requested.every(x=>!x.includes('/teams/JAX/')&&!x.includes('/teams/PHI/')));
});

test('actual ESPN NFL singular depthchart response exposes rank-one QB without official starter inference',()=>{
 const sites=[
  {timestamp:'2026-10-11T00:40:00Z',status:'success',
   season:{year:2026},team:{id:'30',abbreviation:'JAX'},
   depthchart:[{name:'Offense',positions:{quarterback:{
    position:{name:'Quarterback',abbreviation:'QB'},
    athletes:[{rank:1,athlete:{id:'1001',displayName:'JAX QB1'}},
              {rank:2,athlete:{id:'1008',displayName:'JAX Backup'}}]}}}]},
  {depthchart:{positions:{quarterback:{position:{abbreviation:'QB'},
   athletes:[{rank:1,athlete:{id:'1001',displayName:'JAX QB1'}}]}}}},
  {depthchart:{offense:{positions:{quarterback:{position:{abbreviation:'QB'},
   athletes:[{rank:1,athlete:{id:'1001',displayName:'JAX QB1'}}]}}}}}
 ];
 for(const raw of sites){
  const result=nflDepthChartQb1(raw,'JAX');
  assert.equal(result?.playerId,'1001');
  assert.equal(result?.rank,1);
  assert.match(result?.source||'',/NOT an official confirmed starter/);
 }
});

test('live ESPN singular depthchart quarterback positions use ordered direct athlete rows without rank fields',()=>{
 const payload={timestamp:'2026-10-11T00:40:00Z',
  season:{year:2026},team:{id:'30',abbreviation:'JAX'},
  depthchart:[{name:'Base 4-3 D',positions:{mlb:{position:{abbreviation:'MLB'},
   athletes:[{id:'77777',displayName:'Defender'}]}}},
   {name:'Special Teams',positions:{p:{position:{abbreviation:'P'},
    athletes:[{id:'88888',displayName:'Punter'}]}}},
   {name:'3WR 1TE',positions:{qb:{position:{abbreviation:'QB'},
    athletes:[{id:'4360310',displayName:'Trevor Lawrence'},
     {id:'9999999',displayName:'Backup Quarterback'}]}}}]};
 const result=nflDepthChartQb1(payload,'JAX');
 assert.equal(result?.playerId,'4360310');
 assert.equal(result?.rank,1);
 assert.equal(result?.name,'Trevor Lawrence');
 assert.match(result?.source||'',/NOT an official confirmed starter/);
 const wrong={...payload,depthchart:[{name:'3WR 1TE',positions:{qb:{
  position:{abbreviation:'QB'},athletes:[
   {rank:2,id:'4360310',displayName:'Trevor Lawrence'}]}}}]};
 assert.equal(nflDepthChartQb1(wrong,'JAX'),null);
});
