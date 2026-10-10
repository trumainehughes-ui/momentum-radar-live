import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public-nfl-impact.js',import.meta.url),'utf8');
const context=vm.createContext({module:{exports:{}},globalThis:{}});
vm.runInContext(source,context);
const m=context.module.exports;
const leg=(id,name,team,cat,line)=>({playerID:id,name,team,cat,analyticsThreshold:line});
const candidate={risk:'Small',requiredLegs:3,tierAssessment:{compositionOk:true},legs:[
 leg('100','Starting QB','MIN','passing',240),leg('200','Runner','NO','rushing',65),leg('300','Receiver','MIN','receiving',75)]};
const game={gameId:'401872987',home:{abbr:'NO'},away:{abbr:'MIN'}};
const report=(injuries=[])=>({ok:true,reportAvailable:true,injuries,rosterSignals:[]});
test('inactive or out player is excluded from MODEL only; no real sportsbook void or odds fabricated',()=>{
 const watch=m.makeWatch(game,candidate,'one');
 const result=m.classifyWatch(watch,report([{playerId:'200',name:'Runner',team:'NO',status:'OUT'}]));
 assert.equal(result.status,'MODEL_REBUILD_REQUIRED');
 assert.equal(result.activeLegs.length,2);
 assert.equal(result.removedLegs[0].name,'Runner');
 assert.equal(result.actualCombinedOdds,null);
 assert.notEqual(result.bookSettlement,'VOID');
});
test('an injury midgame never itself grades a placed book ticket lost',()=>{
 const result=m.classifyWatch(m.makeWatch(game,candidate,'two'),report([{playerId:'100',team:'MIN',name:'Starting QB',status:'INACTIVE'}]));
 assert.equal(result.status,'MODEL_REBUILD_REQUIRED');
 assert.equal(result.bookSettlement,'AWAITING_AUTHENTICATED_BOOK_RULES');
});
test('questionable player requires review but does not get auto-voided',()=>{
 const r=m.classifyWatch(m.makeWatch(game,candidate,'q'),report([{playerId:'300',name:'Receiver',team:'MIN',status:'QUESTIONABLE'}]));
 assert.equal(r.status,'PLAYER_REVIEW_REQUIRED');
 assert.equal(r.activeLegs.length,3);
});
test('missing injury feed yields source unavailable, not a safe model',()=>{
 const r=m.classifyWatch(m.makeWatch(game,candidate,'offline'),{ok:false});
 assert.equal(r.status,'INJURY_SOURCE_UNAVAILABLE');
});
test('model can auto rebuild with a qualified injury-free replacement, retaining history',()=>{
 const watch=m.makeWatch(game,candidate,'three');
 const injury=report([{playerId:'200',name:'Runner',team:'NO',status:'IR'}]);
 const replacement={...candidate,legs:[candidate.legs[0],leg('400','Fresh Runner','NO','rushing',60),candidate.legs[2]]};
 const r=m.rebuildWatch(watch,replacement,injury);
 assert.equal(r.status,'MODEL_AUTO_REBUILT');
 assert.equal(r.legs[1].name,'Fresh Runner');
 assert.equal(r.revisions.length,1);
 assert.equal(r.revisions[0].priorLegs[1].name,'Runner');
 assert.equal(r.actualCombinedOdds,null);
});
test('when no qualified replacement exists the model never fabricates a completed parlay',()=>{
 const watch=m.makeWatch(game,candidate,'four');
 const injury=report([{playerId:'200',name:'Runner',team:'NO',status:'OUT'}]);
 assert.equal(m.rebuildWatch(watch,null,injury).status,'MODEL_REBUILD_REQUIRED');
 assert.equal(m.rebuildWatch(watch,{...candidate,requiredLegs:4},injury).status,'MODEL_REBUILD_REQUIRED');
});
test('defensive and QB roster/injury fingerprint changes trigger model refresh',()=>{
 const baseline=report([{playerId:'33',name:'CB',team:'MIN',status:'QUESTIONABLE'}]);
 const changed=report([{playerId:'33',name:'CB',team:'MIN',status:'OUT'}]);
 assert.notEqual(m.signature(baseline),m.signature(changed));
 const depth={...baseline,rosterSignals:[{playerId:'1',name:'QB',team:'NO',position:'QB',starterReported:true}]};
 assert.notEqual(m.signature(baseline),m.signature(depth));
});
test('model candidate refuses incomplete or unqualified same-game parlays',()=>{
 assert.equal(m.makeWatch(game,{...candidate,requiredLegs:4},'x'),null);
 assert.equal(m.makeWatch(game,{...candidate,tierAssessment:{compositionOk:false}},'x'),null);
});
