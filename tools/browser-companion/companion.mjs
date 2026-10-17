#!/usr/bin/env node
// Local, read-only companion inspired by BetBot. Does not bypass sportsbook
// access controls, manage sessions, place bets or publish without approval.
import puppeteer from 'puppeteer-core';
import {collectVisibleBookObservations,validateLoopbackChromeAddress} from '../../lib/betbot-browser-companion.js';

const usage=[
 'Momentum Radar — official sportsbook browser observer',
 'Run with a SEPARATE, manually opened Chrome debugging profile on 127.0.0.1.',
 'npm --prefix tools/browser-companion install',
 'node tools/browser-companion/companion.mjs --date=2026-10-18 --game=401872999',
 'Options: --chrome=http://127.0.0.1:9222 --book=FanDuel|DraftKings',
 '         --poll-seconds=300 --publish --help',
 'For --publish, set the dedicated MOMENTUM_BOOK_PUBLISH_KEY environment variable.',
 'Use only already-visible first-party markets. Never bypass human challenges.'
].join('\n');
const flags=new Map();
for(const arg of process.argv.slice(2)){
 const match=String(arg).match(/^--([a-z-]+)(?:=(.*))?$/);
 if(!match||flags.has(match[1]))throw Error('Invalid or repeated option');
 flags.set(match[1],match[2]??true);
}
if(flags.has('help')){console.log(usage);process.exit(0)}
const date=String(flags.get('date')||''),gameId=String(flags.get('game')||'');
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{7,12}$/.test(gameId))
 throw Error('Required --date=YYYY-MM-DD and --game=NFL-game-id');
const chrome=validateLoopbackChromeAddress(flags.get('chrome')||'http://127.0.0.1:9222');
if(!chrome)throw Error('Chrome debugging must use loopback http://127.0.0.1:PORT');
const site='https://momentum-radar-live.vercel.app';
const book=flags.get('book')||null;
if(book&&!['FanDuel','DraftKings'].includes(book))throw Error('Unrecognized sportsbook filter');
const publish=flags.has('publish');
const secret=process.env.MOMENTUM_BOOK_PUBLISH_KEY;
if(publish&&(!secret||secret.length<24))throw Error('Dedicated publishing key required via environment variable');
const every=flags.get('poll-seconds');
const pollSeconds=every===undefined?null:Number(every);
if(pollSeconds!==null&&(!Number.isInteger(pollSeconds)||pollSeconds<60||pollSeconds>3600))
 throw Error('Poll interval must be between 60 and 3600 seconds');
const json=async path=>{
 const r=await fetch(site+path,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Momentum Radar data source HTTP '+r.status);
 return r.json();
};
const canon=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
async function getGameAndPlayers(){
 const query=new URLSearchParams({date,gameId});
 const slate=await json('/api/nfl-schedule?'+new URLSearchParams({date}));
 const g=(slate.games||[]).find(x=>String(x.gameId)===gameId);
 if(!g?.home?.name||!g?.away?.name||!g?.home?.abbr||!g?.away?.abbr)
  throw Error('Selected game not found in official schedule');
 const game={date,gameId,homeName:g.home.name,awayName:g.away.name,
  homeAbbr:g.home.abbr,awayAbbr:g.away.abbr};
 const teams=new Set([g.home.abbr,g.away.abbr]),roster=new Map();
 const responses=await Promise.allSettled([
  json('/api/public-nfl-game?'+query),json('/api/nfl-markets?'+query)
 ]);
 for(const response of responses){
  if(response.status!=='fulfilled')continue;
  for(const entries of Object.values(response.value.categories||{})){
   for(const p of Array.isArray(entries)?entries:[]){
    const name=String(p.name||''),team=String(p.team||'').toUpperCase();
    const injury=String(p.injuryStatus||p.injury?.status||p.status||'').toUpperCase();
    if(name.length<5||!teams.has(team)||
      /\b(OUT|INACTIVE|INJURED RESERVE|IR|SUSPENDED)\b/.test(injury))continue;
    roster.set(canon(name)+'|'+team,{name,team});
   }
  }
 }
 if(roster.size===0)throw Error('No screened game roster available; no odds imported');
 return {game,players:[...roster.values()]};
}
async function publishObserved(report,game){
 for(const which of ['DraftKings','FanDuel']){
  const offers=report.offers.filter(x=>x.book===which);
  if(!offers.length)continue;
  const result=await fetch(site+'/api/nfl-published-book-observations',{
   method:'POST',signal:AbortSignal.timeout(20000),
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+secret},
   body:JSON.stringify({date:game.date,gameId:game.gameId,book:which,offers})
  });
  const info=await result.json().catch(()=>({error:'unexpected_server_response'}));
  console.log('PUBLISH',JSON.stringify({
   book:which,http:result.status,published:info.published||0,
   state:result.ok?info.status:'REJECTED_'+String(info.error||'unknown')
  }));
 }
}
const browser=await puppeteer.connect({browserURL:chrome,defaultViewport:null});
let stop=false;
process.once('SIGINT',()=>{stop=true});
process.once('SIGTERM',()=>{stop=true});
try{
 do{
  try{
   const {game,players}=await getGameAndPlayers();
   const pages=await browser.pages();
   const report=await collectVisibleBookObservations({pages,game,players,book});
   console.log(JSON.stringify({
    checkedAt:new Date().toISOString(),gameId,
    status:report.status,playersScreened:players.length,
    collectedOffers:report.offers.length,states:report.states,
    offers:report.offers.map(x=>({book:x.book,player:x.player,
     category:x.category,line:x.line,odds:x.odds,observedAt:x.observedAt}))
   },null,2));
   if(publish&&report.offers.length)await publishObserved(report,game);
  }catch(error){console.error('COLLECTION_NOT_COMPLETED',String(error?.message||error))}
  if(stop||pollSeconds===null)break;
  await new Promise(resolve=>setTimeout(resolve,pollSeconds*1000));
 }while(!stop);
}finally{await browser.disconnect()}
