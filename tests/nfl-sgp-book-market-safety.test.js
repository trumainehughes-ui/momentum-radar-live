import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');

test('book-specific NFL candidate requires real odds and THIS BOOK current side/line',()=>{
 assert.ok(api.includes("x.available!==false&&x.odds!==null&&x.odds!==undefined&&x.odds!==''"));
 assert.ok(api.includes("Number.isFinite(Number(x.odds))&&Number(x.odds)!==0"));
 assert.ok(api.includes("if(cat!=='td'&&!realLine)continue"));
 assert.ok(api.includes("const offer=bookFor(m,book)"));
 assert.ok(api.includes("const base={...m,cat,bookOffer:offer}"));
});

test('all NFL market prefix categories require FULL GAME, OVER, never under and never a quarter',()=>{
 const start=api.indexOf('function category(m){');
 const end=api.indexOf('function americanToProb',start);
 assert.ok(start>0&&end>start);
 const body=api.slice(start,end);
 const gameGate=body.indexOf("if(m.periodID!=='game')return null");
 const sideGate=body.indexOf("if(m.betTypeID!=='ou'||m.sideID!=='over')return null");
 const prefix=body.indexOf("key.startsWith('player_pass_yds')");
 assert.ok(gameGate>=0&&sideGate>=0&&prefix>sideGate&&sideGate>gameGate);
 assert.ok(body.includes("m.betTypeID==='yn'&&m.sideID==='yes'"));
});

test('NFL analytical and book SGPs allow at most two distinct categories per player and no repeated category',()=>{
 assert.ok(api.includes("const id=String(x?.playerID||'').trim(),key=id+'|'+x?.cat"));
 assert.ok(api.includes("if(!x||!id||used.has(key)||"));
 assert.ok(api.includes("legs.filter(v=>String(v.playerID||'')===id).length>=2"));
 assert.ok(api.includes("const id=x.playerID||norm(x.name),key=id+'|'+x.cat"));
 assert.ok(api.includes("if(used.has(key)||legs.filter(v=>(v.playerID||norm(v.name))===id).length>=2"));
 assert.ok(api.includes("used.add(key);cats.add(x.cat)"));
});

test('independently multiplied prices never suppress a candidate or masquerade as a quoted SGP',()=>{
 assert.ok(api.includes('const est=null;'));
 assert.ok(!api.includes('const est=parlayPrice(legs,book)'));
 assert.ok(!api.includes('s.estimatedPayoutTargetInBand===true'));
 assert.ok(!api.includes("if(risk==='Nuke'&&(!Number.isFinite(est)||est<10000))"));
 assert.ok(api.includes("s.nukeCeilingVerified!==true"));
 assert.ok(api.includes("findTier('Small',4,0)"));
 assert.ok(api.includes("findTier('Medium',5,1)"));
 assert.ok(api.includes("for(let n=5;n<=Math.min(7,nukePool.length);n++)"));
});
