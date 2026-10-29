import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNbaScoreboard,parseNbaGame,validateNbaSgp,NBA_TIERS,nbaNotReadyTiers} from '../lib/nba-data-model.js';
import slate from '../api/nba-slate.js';
import game from '../api/nba-game.js';
const originalFetch=globalThis.fetch;
const event=(id='401900101',status='pre')=>({
 id,date:'2026-10-10T23:00:00Z',season:{type:1},
 status:{type:{state:status}},
 competitions:[{id,status:{type:{state:status}},competitors:[
  {homeAway:'away',team:{id:'2',abbreviation:'BOS',displayName:'Boston Celtics'},score:'108'},
  {homeAway:'home',team:{id:'16',abbreviation:'MIA',displayName:'Miami Heat'},score:'110'}
 ]}]
});
const summary=(state='post')=>({
 header:{competitions:[{
  id:'401900101',status:{type:{state}},
  competitors:[{homeAway:'home',team:{abbreviation:'MIA',displayName:'Miami Heat'}},
   {homeAway:'away',team:{abbreviation:'BOS',displayName:'Boston Celtics'}}]
 }]},
 boxscore:{players:[
 {team:{abbreviation:'BOS'},statistics:[{names:['minutes','fieldGoals','threePointFieldGoals','freeThrows','rebounds','assists','points'],
 athletes:[{athlete:{id:'1234',displayName:'Test Guard',position:{abbreviation:'PG'}},
   stats:['35','12-20','4-9','3-3','5','8','31']},
 {athlete:{id:'4321',displayName:'No Result',position:{abbreviation:'PG'}},stats:[]}]
 }]},
 {team:{abbreviation:'MIA'},statistics:[{labels:['MIN','PTS','REB','AST','3PT'],
 athletes:[{athlete:{id:'5678',displayName:'Test Forward'},stats:['30','20','10','3','2-5']}]
 }]},
 {team:{abbreviation:'NYK'},statistics:[{labels:['PTS','REB','AST','3PT'],
 athletes:[{athlete:{id:'9999',displayName:'Wrong Game'},stats:['100','30','20','10-10']}]
 }]}
 ]},
 injuries:[{team:{abbreviation:'BOS'},injuries:[
  {athlete:{displayName:'Injured Player'},status:'Questionable'}]},
 {team:{abbreviation:'NYK'},injuries:[
  {athlete:{displayName:'Other Game Injury'},status:'Out'}]}]
});
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},
 status(n){this.code=n;return this},json(x){this.body=x;return this}});
test('NBA slate reads ALL ESPN events, not just popular games',()=>{
 const parsed=parseNbaScoreboard({events:[event(),event('401900102')]},'2026-10-10');
 assert.equal(parsed.games.length,2);
 assert.equal(parsed.games[0].status,'SCHEDULED');
 assert.equal(parsed.games[0].home.score,null);
 assert.equal(parsed.games[0].stage,'PRESEASON');
 assert.equal(parsed.coverage.marketVerified,false);
});
test('completed/live scores are observed, invalid matchups excluded',()=>{
 const data=parseNbaScoreboard({events:[event('401900101','post'),
  {...event('401900103'),competitions:[{competitors:[{homeAway:'home',team:{abbreviation:'MIA'}}]}]}]},'2026-10-10');
 assert.equal(data.games.length,1);
 assert.equal(data.games[0].away.score,108);
 assert.equal(data.games[0].status,'FINAL');
});
test('game parser reports only real NBA teams and observed points/rebounds/assists/3PM/PRA',()=>{
 const d=parseNbaGame(summary(),'401900101');
 assert.equal(d.ok,true);
 assert.equal(d.status,'FINAL');
 assert.equal(d.players.length,2);
 const guard=d.players.find(x=>x.name==='Test Guard');
 assert.equal(guard.points,31);
 assert.equal(guard.rebounds,5);
 assert.equal(guard.assists,8);
 assert.equal(guard.threes,4);
 assert.equal(guard.pra,44);
 const forward=d.players.find(x=>x.name==='Test Forward');
 assert.equal(forward.pra,33);
 assert.equal(forward.threes,2);
 assert.ok(d.players.every(x=>['MIA','BOS'].includes(x.team)));
 assert.equal(d.injuries.length,1);
 assert.equal(d.injuries[0].status,'Questionable');
 assert.equal(d.validation.pregameProjectionsAvailable,false);
 assert.equal(d.validation.sportsbookMarketsVerified,false);
});
test('pregame boxscore is never presented as projections',()=>{
 const d=parseNbaGame(summary('pre'),'401900101');
 assert.equal(d.status,'SCHEDULED');
 assert.deepEqual(d.players,[]);
 assert.equal(d.sgps.length,3);
 assert.ok(d.sgps.every(x=>x.status==='NOT_READY'&&x.legs.length===0&&x.combinedBookOdds===null));
});
test('wrong-game ESPN summary is blocked before displaying player stats',()=>{
 const d=parseNbaGame(summary(),'401900109');
 assert.equal(d.ok,false);
 assert.equal(d.error,'nba_game_id_mismatch');
});
test('Small/Medium/Nuke enforce tier mix, roster, team identity and book eligibility',()=>{
 const names=['Small','Medium','Large','Nuke'];
 assert.deepEqual(Object.keys(NBA_TIERS),names);
 assert.deepEqual(nbaNotReadyTiers('Waiting').map(x=>x.risk),names);
 const ids=Array.from({length:7},(_,i)=>String(i+101));
 const roles=new Map(ids.map((id,i)=>[id,{team:i%2?'BOS':'MIA',status:'ACTIVE'}]));
 const input=ids.map((id,i)=>({playerId:id,team:i%2?'BOS':'MIA',gameId:'401900101',
  category:['points','rebounds','assists','threes','pra','points','rebounds'][i],
  projection:20,threshold:30,verifiedMarket:true}));
 const opts={gameId:'401900101',home:'MIA',away:'BOS',verifiedPlayers:roles};
 assert.equal(validateNbaSgp('Small',input.slice(0,4),opts).publishable,true);
 assert.equal(validateNbaSgp('Medium',input.slice(0,5),opts).publishable,true);
 assert.equal(validateNbaSgp('Nuke',input.slice(0,7),opts).publishable,true);
 assert.ok(validateNbaSgp('Small',input.slice(0,2),opts).reasons.includes('invalid_leg_count'));
 assert.ok(validateNbaSgp('Medium',input.slice(0,4),opts).reasons.includes('invalid_leg_count'));

 assert.ok(validateNbaSgp('Nuke',input.slice(0,4),opts).reasons.includes('invalid_leg_count'));
 assert.ok(validateNbaSgp('Nuke',input.slice(0,5).map(x=>({...x,threshold:20})),opts).reasons.includes('nuke_target_not_elevated'));
 assert.ok(validateNbaSgp('Nuke',input.slice(0,5).map(x=>({...x,verifiedMarket:false})),opts).reasons.includes('market_not_verified'));
 assert.ok(validateNbaSgp('Small',[...input.slice(0,3),{...input[0]}],opts).reasons.includes('duplicated_player_market'));
 assert.ok(validateNbaSgp('Small',[...input.slice(0,3),{...input[3],team:'NYK'}],opts).reasons.includes('unverified_game_roster_availability'));
});
test('NBA API requires dates or ESPN IDs and returns fail-closed structured responses',async()=>{
 const bad=response();await game({method:'GET',query:{gameId:'nba-fake'}},bad);
 assert.equal(bad.code,400);
 const invalid=response();await slate({method:'GET',query:{date:'tomorrow'}},invalid);
 assert.equal(invalid.code,400);
 globalThis.fetch=async url=>({
  ok:true,json:async()=>url.includes('scoreboard')?{events:[event()]}:summary()
 });
 try{
  const p=response();await slate({method:'GET',query:{date:'2026-10-10'}},p);
  assert.equal(p.code,200);assert.equal(p.body.games.length,1);
  const q=response();await game({method:'GET',query:{gameId:'401900101'}},q);
  assert.equal(q.code,200);assert.equal(q.body.players.length,2);
 }finally{globalThis.fetch=originalFetch}
});
test('NBA UI is separate, interactive, sourced and does not show fake pregame lines',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
 assert.ok(html.includes('id="nbaNav"'));
 assert.ok(html.includes('id="nbaDetail"'));
 assert.ok(html.includes('src="/public-nba.js"'));
 for(const k of ['points','rebounds','assists','threes','pra','sgp'])
  assert.ok(html.includes('data-nbatab="'+k+'"'),k);
 assert.ok(ui.includes('/api/nba-slate?date='));
 assert.ok(ui.includes('/api/nba-game?gameId='));
 assert.ok(ui.includes("if(league==='nba'")===false,'NBA UI must not couple to NFL script');
 assert.match(ui,/Observed box-score result, not a projected betting line/);
 assert.match(ui,/window\.momentumNbaOpen/);
});
