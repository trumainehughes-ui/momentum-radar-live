import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
function renderHarness(){
 const start=script.indexOf('function renderGames(){');
 const end=script.indexOf('const views=',start);
 assert.ok(start>0&&end>start);
 const src=script.slice(start,end);
 const box={innerHTML:''},panel={hidden:true,removed:false,at:'',
  remove(){this.removed=true;this.at='detached';}};
 const home={appendChild(node){node.at='home';}};
 const inline={appendChild(node){node.at='inline';}};
 const state={
  league:'nfl',selected:'402222222',games:[
   {gameId:'401111111',week:6,kickoff:'2026-10-18T17:00:00Z',
    away:{name:'Away A',abbr:'A'},home:{name:'Home A',abbr:'B'}},
   {gameId:'402222222',week:6,kickoff:'2026-10-18T20:00:00Z',
    away:{name:'Away B',abbr:'C'},home:{name:'Home B',abbr:'D'}},
   {gameId:'403333333',week:6,kickoff:'2026-10-19T00:20:00Z',
    away:{name:'Away C',abbr:'E'},home:{name:'Home C',abbr:'F'}}
  ]
 };
 const context={
  state,$:sel=>sel==='#games'?box:sel==='#game-section'?panel:
   sel==='#game-panel-home'?home:sel==='#game-inline-slot'&&
    box.innerHTML.includes('id="game-inline-slot"')?inline:null,
  esc:v=>String(v??''),teamLine:x=>'<span>'+x.name+'</span>',
  fmtTime:()=> 'Sun 11 AM',statusLabel:()=> 'Pregame',
  noData:(a,b)=>a+b
 };
 vm.runInNewContext(src+';this.renderGames=renderGames;',context);
 return{state,box,panel,home,inline,render:context.renderGames};
}
test('selected game expands full-width directly below its card, before the next matchup',()=>{
 const h=renderHarness();h.render();
 assert.equal(h.panel.at,'inline');
 assert.equal(h.panel.hidden,false);
 assert.ok(h.box.innerHTML.includes('class="game-expand-slot"'));
 assert.ok(h.box.innerHTML.includes('aria-expanded="true"'));
 assert.equal((h.box.innerHTML.match(/id="game-inline-slot"/g)||[]).length,1);
 assert.ok(h.box.innerHTML.indexOf('data-game="402222222"')<
   h.box.innerHTML.indexOf('id="game-inline-slot"'));
 assert.ok(h.box.innerHTML.indexOf('id="game-inline-slot"')<
   h.box.innerHTML.indexOf('data-game="403333333"'));
 assert.ok(h.box.innerHTML.includes('Hide game analytics'));
});
test('switching games reuses same detail DOM instead of creating duplicate reports',()=>{
 const h=renderHarness();h.render();
 h.state.selected='401111111';h.render();
 assert.equal(h.panel.at,'inline');
 assert.ok(h.box.innerHTML.indexOf('id="game-inline-slot"')<
   h.box.innerHTML.indexOf('data-game="402222222"'));
 h.state.selected='';h.render();
 assert.equal(h.panel.at,'home');
 assert.equal(h.panel.hidden,true);
 assert.equal((h.box.innerHTML.match(/id="game-inline-slot"/g)||[]).length,0);
});
test('public accordion retains all game analytics and auto refresh without extra APIs',()=>{
 assert.ok(html.includes('aria-controls="game-section"'));
 assert.ok(html.includes('scrollIntoView?.({behavior:\'smooth\',block:\'start\'})'));
 assert.ok(html.includes("if(String(state.selected)===String(id))"));
 assert.ok(html.includes('game-expand-slot{grid-column:1/-1'));
 assert.ok(html.includes('game-expand-slot{scroll-margin-top:72px'));
 assert.ok(html.includes("$('#match-content').addEventListener('click'"));
 assert.ok(html.includes('setInterval(refreshReadOnlyPredictions,5*60*1000)'));
 assert.ok(!html.includes('if(state.games.length)openGame(String(state.games[0].gameId))'));
 assert.equal((html.match(/id="game-section"/g)||[]).length,1);
 for(const name of ['Overview','Anytime TD','Player Props','Matchup Edge',
  'Injuries','SGPs','AI Game Analyzer','Sharp +EV Audit','Live TD Tracker'])
  assert.ok(html.includes(name),name);
 assert.doesNotThrow(()=>new vm.Script(script));
});
