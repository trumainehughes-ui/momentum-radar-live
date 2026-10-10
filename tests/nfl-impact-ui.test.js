import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../public-nfl-impact.js',import.meta.url),'utf8');
function harness(){
 const stored=new Map(),children=[];
 const storage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
 const createElement=()=>({textContent:'',appendChild(child){this.children??=[];this.children.push(child)},dataset:{},onclick:null});
 const modelCard={dataset:{risk:'Small'},children:[],querySelector:()=>null,appendChild(child){this.children.push(child)}};
 const sgpPanel={querySelectorAll:()=>[modelCard]};
 const watchPanel={textContent:'',appendChild(child){children.push(child)}};
 const document={hidden:false,readyState:'complete',getElementById(id){return id==='nflSGP'?sgpPanel:id==='nflParlayWatch'?watchPanel:null},createElement};
 const window={document,localStorage:storage,setInterval:()=>0,fetch:async()=>{throw Error('not expected')},momentumSelectedNflGame:()=>null,momentumSelectedNflDate:()=>'2026-10-11'};
 vm.runInNewContext(script,{window,console,Date,Intl,URLSearchParams});
 return {window,modelCard,children,storage};
}
const leg=(id,name,cat,team='MIN')=>({playerID:id,name,cat,team,analyticsThreshold:cat==='passing'?245:cat==='rushing'?65:70});
const base={risk:'Small',tierAssessment:{compositionOk:true},requiredLegs:3,legs:[leg('11','Quarterback','passing'),leg('22','Runner','rushing','NO'),leg('33','Receiver','receiving')]};
const game={gameId:'401872987',home:{abbr:'NO'},away:{abbr:'MIN'}};
test('watch button creates a durable device-local MODEL watch rather than bookmaker ticket',()=>{
 const h=harness(),api=h.window.momentumParlayWatch;
 api.decorate(game,{sgps:{Analytics:[base]}});
 assert.equal(h.modelCard.children.length,1);
 h.modelCard.children[0].onclick();
 const watches=api.getWatches();
 assert.equal(watches.length,1);assert.equal(watches[0].kind,'MODEL_WATCH');
 assert.equal(watches[0].date,'2026-10-11');
 assert.equal(watches[0].actualCombinedOdds,null);
 assert.equal(watches[0].bookSettlement,'AWAITING_AUTHENTICATED_BOOK_RULES');
 assert.ok([...h.storage.values()][0].includes('MODEL_WATCH'));
});
test('injury report pushes model watch into rebuild then replaces unavailable player after safe new model',()=>{
 const h=harness(),api=h.window.momentumParlayWatch;
 api.decorate(game,{sgps:{Analytics:[base]}});
 h.modelCard.children[0].onclick();
 api.onSnapshot(game.gameId,{ok:true,reportAvailable:true,injuries:[{playerId:'22',name:'Runner',team:'NO',status:'IR'}]});
 assert.equal(api.getWatches()[0].status,'MODEL_REBUILD_REQUIRED');
 assert.equal(api.getWatches()[0].activeLegs.length,2);
 const replacement={...base,legs:[base.legs[0],leg('44','Backup Runner','rushing','NO'),base.legs[2]]};
 api.decorate(game,{sgps:{Analytics:[replacement]}});
 const next=api.getWatches()[0];
 assert.equal(next.status,'MODEL_AUTO_REBUILT');
 assert.equal(next.legs[1].name,'Backup Runner');
 assert.equal(next.revisions.length,1);
 assert.equal(next.actualCombinedOdds,null);
});
test('source failure never labels a tracked model as healthy or sportsbook settled',()=>{
 const h=harness(),api=h.window.momentumParlayWatch;
 api.decorate(game,{sgps:{Analytics:[base]}});
 h.modelCard.children[0].onclick();
 api.onSnapshot(game.gameId,{ok:false,reportAvailable:false});
 assert.equal(api.getWatches()[0].status,'INJURY_SOURCE_UNAVAILABLE');
 assert.equal(api.getWatches()[0].actualCombinedOdds,null);
});
