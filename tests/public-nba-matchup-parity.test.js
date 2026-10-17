import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseNbaDkPublicProps,onlyKnownNbaPlayers,onlyRosterListedNbaOffers} from '../lib/nba-public-book-observer.js';

const game={gameId:'401909088',home:{abbr:'DET',name:'Detroit Pistons'},
 away:{abbr:'BOS',name:'Boston Celtics'},kickoff:'2026-10-20T19:00:00Z'};
const table=rows=>'<table><tr><th>Event</th><th>Date</th><th>Market</th><th>Betslip Line</th><th>Odds</th></tr>'+
 rows.map(x=>'<tr>'+x.map(y=>'<td>'+y+'</td>').join('')+'</tr>').join('')+'</table>';
test('public NBA odds match exact game, date, player, prop category and over side',()=>{
 const r=parseNbaDkPublicProps(table([
  ['BOS Celtics @ DET Pistons','10/20, 07:00PM','Jayson Tatum Points','Over 24.5','+115'],
  ['BOS Celtics @ DET Pistons','10/20, 07:00PM','Jayson Tatum Rebounds','8+','−125'],
  ['BOS Celtics @ DET Pistons','10/20, 07:00PM','Jaylen Brown Assists','Over 3.5','-110'],
  ['BOS Celtics @ DET Pistons','10/20, 07:00PM','Derrick White 3-Pointers','3+','+145'],
  ['BOS Celtics @ DET Pistons','10/20, 07:00PM','Jayson Tatum PRA','40+','+105'],
  ['BOS Celtics @ DET Pistons','10/21, 07:00PM','Jayson Tatum Points','30+','+800'],
  ['PHI 76ers @ NY Knicks','10/20, 07:00PM','Tyrese Maxey Points','25+','-110'],
  ['BOS Celtics @ DET Pistons','10/20, 07:00PM','Jayson Tatum Points','Over 22.5','+999999']
 ]),{date:'2026-10-20',game,now:Date.parse('2026-10-19T01:00:00Z')});
 assert.equal(r.length,5);
 assert.deepEqual(r.map(x=>x.category),['points','rebounds','assists','threes','pra']);
 assert.equal(r[0].player,'Jayson Tatum');
 assert.equal(r[0].line,24.5);assert.equal(r[0].odds,115);assert.equal(r[0].side,'OVER');
 assert.equal(r[1].odds,-125);assert.equal(r[1].side,'AT_LEAST');
 assert.equal(r[0].verification,'PUBLIC_PAGE_OBSERVATION_ONLY');
});
test('NBA public observations are dropped unless screened pregame model identity is current',()=>{
 const offer={player:'Jayson Tatum',category:'points',line:24.5,odds:115};
 const report={ok:true,status:'SCHEDULED',gameId:game.gameId,
  pregameReadiness:{freshness:'CURRENT'},sgps:[{risk:'Small',status:'MODEL_CANDIDATE',
   legs:[{name:'Jayson Tatum',playerId:'100',team:'BOS',
    gameId:game.gameId,category:'points',threshold:25,starterStatus:'UNCONFIRMED'}]}]};
 assert.equal(onlyKnownNbaPlayers([offer],report,game).length,1);
 assert.equal(onlyKnownNbaPlayers([offer],{...report,gameId:'wrong'},game).length,0);
 assert.equal(onlyKnownNbaPlayers([offer],{...report,pregameReadiness:{freshness:'STALE'}},game).length,0);
 assert.equal(onlyKnownNbaPlayers([offer],{...report,sgps:[]},game).length,0);
});
const page=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const js=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
test('NBA navigation mirrors customer NFL layout without mixing NFL TD and weather cards',()=>{
 const menu=page.match(/<nav id="nba-module-tabs"[\s\S]*?<\/nav>/)?.[0]||'';
 assert.deepEqual([...menu.matchAll(/data-nba-module="([^"]+)"/g)].map(x=>x[1]),
  ['overview','points','rebounds','assists','threes','pra','sgps','injuries']);
 assert.ok(page.includes('id="nba-module-panel"'));
 assert.ok(js.includes("$('#nba-module-panel').hidden=nfl"));
 assert.ok(js.includes("$('#public-weather-impact').hidden=state.league==='nba'"));
 assert.ok(js.includes("getJson('/api/nba-game?'"));
 assert.ok(js.includes("getJson('/api/nba-public-book-research?'"));
 assert.ok(js.includes("if(state.league==='nba'){\n   if(!id)return"));
 assert.ok(!page.includes('NBA matchup preview</strong>'));
 assert.doesNotThrow(()=>new vm.Script(js));
});
function ui(){
 const a=js.indexOf('const nbaNames='),b=js.indexOf('function renderGame(d){',a);
 assert.ok(a>0&&b>a);
 const area={'#match-content':{innerHTML:''}},ctx={state:{nbaTab:'sgps',
  nbaBookResearch:{offers:[]},nbaBookLoading:false,league:'nba'},
  $:k=>area[k],esc:x=>String(x??''),fmtStamp:x=>String(x),
  noData:(t,d)=>'<p>'+t+' '+d+'</p>',getJson:async()=>({ok:true})};
 vm.runInNewContext(js.slice(a,b)+';this.render=renderNbaGame;this.offers=nbaObservedPrice;',ctx);
 return{ctx,area};
}
test('NBA Small Medium Nuke display clean player, market, and threshold',()=>{
 const {ctx,area}=ui();
 const data={ok:true,status:'SCHEDULED',sgps:['Small','Medium','Nuke'].map((risk,i)=>({
  risk,status:'MODEL_CANDIDATE',legs:[
   {name:'Jayson Tatum',playerId:'100',team:'BOS',category:'points',
    threshold:25+i*5,gameId:game.gameId},
   {name:'Cade Cunningham',playerId:'200',team:'DET',category:'assists',
    threshold:6+i,gameId:game.gameId}]})),
  pregameReadiness:{freshness:'CURRENT'}};
 ctx.render(data);
 const html=area['#match-content'].innerHTML;
 assert.ok(html.includes('Small'));assert.ok(html.includes('Medium'));assert.ok(html.includes('Nuke'));
 assert.ok(html.includes('Jayson Tatum'));assert.ok(html.includes('25+'));
 assert.ok(html.includes('Cade Cunningham'));assert.ok(html.includes('Assists'));
 assert.ok(!html.includes('sportsbook-issued combined quote confirmed'));
 assert.ok(html.includes('Combined DraftKings/FanDuel SGP prices are not confirmed'));
});
test('No NBA snapshot results in an accurate empty/pending view, not fake 5+ leg bets',()=>{
 const {ctx,area}=ui();ctx.state.nbaTab='sgps';
 ctx.render({ok:true,status:'SCHEDULED',
  pregameReadiness:{status:'PENDING',reason:'No scheduled pregame build has completed.'},
  sgps:['Small','Medium','Nuke'].map(risk=>({risk,status:'NOT_READY',legs:[]}))});
 const html=area['#match-content'].innerHTML;
 assert.ok(html.includes('Awaiting selections'));
 assert.equal((html.match(/Awaiting selections/g)||[]).length,3);
 assert.ok(!html.includes('25+'));
 assert.ok(html.includes('No scheduled pregame build has completed.'));
});
test('NBA observes only the exact matching prop threshold and not another alt-line',()=>{
 const {ctx}=ui();
 ctx.state.nbaBookResearch={offers:[
  {player:'Jayson Tatum',category:'points',line:24.5,side:'OVER',
   odds:115,book:'DraftKings',verification:'PUBLIC_PAGE_OBSERVATION_ONLY',
   observedAt:'2026-10-19T01:00:00Z'}]};
 assert.equal(ctx.offers({name:'Jayson Tatum',category:'points',threshold:25}).odds,115);
 assert.equal(ctx.offers({name:'Jayson Tatum',category:'points',threshold:30}),null);
 assert.equal(ctx.offers({name:'Jaylen Brown',category:'points',threshold:25}),null);
});

test('NBA public odds can display for roster-checked players before AI pregame model builds',()=>{
 const gameReport={injuries:[{name:'Suspended Player',status:'OUT'}]};
 const rosters=[{team:'BOS',data:{athletes:[{items:[
  {id:'1',displayName:'Jayson Tatum',status:{name:'active'}},
  {id:'2',displayName:'Suspended Player',status:{name:'active'}}
 ]}]}},{team:'DET',data:{athletes:[{items:[
  {id:'3',displayName:'Cade Cunningham',status:{name:'active'}}]}]}}];
 const observations=[
  {player:'Jayson Tatum',category:'points',line:24.5,side:'OVER',odds:115},
  {player:'Suspended Player',category:'points',line:14.5,side:'OVER',odds:115},
  {player:'Unrelated Player',category:'points',line:24.5,side:'OVER',odds:115}
 ];
 assert.deepEqual(onlyRosterListedNbaOffers(observations,{...game,rosters,
  injuries:gameReport.injuries}).map(x=>x.player),['Jayson Tatum']);
});
