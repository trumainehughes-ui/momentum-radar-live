import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeOfficialBookFeedHandler} from '../api/nfl-published-book-observations.js';
import {sanitizePublishedBookObservations,keepCurrentPublishedBookRows,
 bookObservationPath} from '../lib/central-official-book-observations.js';
const date='2026-10-18',gameId='401872999',now=Date.parse('2026-10-17T19:30:00Z');
const secret='admin-publisher-only-fixed-32chars-long';
const f=(line,odds,book='FanDuel')=>({
 book,gameId,date,player:'Bijan Robinson',category:'rushing',line,odds,
 sourceUrl:book==='FanDuel'?'https://co.sportsbook.fanduel.com/':'https://sportsbook.draftkings.com/',
 observedAt:new Date(now).toISOString(),captureMethod:'USER_SCREENSHOT_OCR',
 verification:'VISIBLE_BOOK_PAGE_USER_OBSERVATION_ONLY'
});
const body={date,gameId,book:'FanDuel',offers:[f(125,300),f(150,640)]};
function harness({key=secret,gameStatus='SCHEDULED',roster=true,writeFails=false}={}){
 const blobs=new Map(),paths=[];
 const schedule={games:[{gameId,status:gameStatus,home:{abbr:'ATL',name:'Atlanta Falcons'},
  away:{abbr:'CHI',name:'Chicago Bears'}}]};
 const game={categories:roster?{rushing:[{name:'Bijan Robinson',team:'ATL'}]}:{}};
 const asResponse=(obj,status=200)=>({ok:status>=200&&status<300,status,
  json:async()=>obj});
 const fakeFetch=async url=>{
  const s=String(url);
  if(s.includes('/api/nfl-schedule?'))return asResponse(schedule);
  if(s.includes('/api/public-nfl-game?'))return asResponse(game);
  if(s.startsWith('https://fake-blob.test/')){
   const path=decodeURIComponent(s.slice('https://fake-blob.test/'.length));
   return blobs.has(path)?asResponse(blobs.get(path)):asResponse({},404);
  }
  throw Error('unexpected_url');
 };
 const handler=makeOfficialBookFeedHandler({
  env:{MOMENTUM_BOOK_PUBLISH_KEY:key,VERCEL_URL:'momentum-radar-live.vercel.app'},
  now:()=>now,fetcher:fakeFetch,
  storageList:async({prefix})=>({blobs:blobs.has(prefix)?[
   {pathname:prefix,url:'https://fake-blob.test/'+encodeURIComponent(prefix)}]:[]}),
  storagePut:async(path,payload,options)=>{
   if(writeFails)throw Error('simulated_storage_outage');
   paths.push({path,options});blobs.set(path,JSON.parse(payload));return {url:'https://fake-blob.test/'+encodeURIComponent(path)}
  }
 });
 const call=async(method,requestBody={},auth=null,query={date,gameId})=>{
  const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;return this},
   status(code){this.statusCode=code;return this},json(val){this.data=val;return this}};
  await handler({method,body:requestBody,query,headers:{authorization:auth}},res);
  return res;
 };
 return {call,blobs,paths};
}
test('a signed upload publishes ONLY the exact real 125+ and 150+ from screenshot capture',async()=>{
 const h=harness();
 const write=await h.call('POST',body,'Bearer '+secret);
 assert.equal(write.statusCode,201);
 assert.equal(write.data.published,2);
 assert.equal(write.data.bookmakerSgpQuoteVerified,false);
 assert.equal(h.paths.length,1);
 assert.equal(h.paths[0].options.allowOverwrite,true);
 assert.equal(h.paths[0].path,bookObservationPath(date,gameId,'FanDuel'));
 const read=await h.call('GET');
 assert.equal(read.statusCode,200);
 assert.equal(read.data.status,'USER_OBSERVED_NOT_BOOK_VERIFIED');
 assert.deepEqual(read.data.offers.map(x=>[x.line,x.odds]),[[125,300],[150,640]]);
 assert.equal(read.data.offers.some(x=>x.line===135),false);
 assert.equal(read.data.automatedSportsbookExtraction,false);
 assert.equal(read.data.bookmakerSgpQuoteVerified,false);
 assert.equal(read.headers['Cache-Control'],'private, no-store, max-age=0');
});
test('public write cannot publish fake sportsbook odds or use the scheduling secret',async()=>{
 const h=harness();
 assert.equal((await h.call('POST',body)).statusCode,401);
 assert.equal((await h.call('POST',body,'Bearer not-the-key')).statusCode,401);
 assert.equal((await h.call('POST',body,'Bearer '+secret)).statusCode,201);
 assert.equal(h.paths.length,1);
});
test('publishing is unavailable without dedicated secret or when Blob fails',async()=>{
 assert.equal((await harness({key:null}).call('POST',body)).statusCode,503);
 assert.equal((await harness({writeFails:true}).call('POST',body,'Bearer '+secret)).statusCode,503);
});
test('requires official game identity and roster before global publication',async()=>{
 assert.equal((await harness({gameStatus:'FINAL'}).call('POST',body,'Bearer '+secret)).statusCode,422);
 assert.equal((await harness({roster:false}).call('POST',body,'Bearer '+secret)).statusCode,422);
 const forged={...body,offers:[{...body.offers[0],player:'Fake Athlete'}]};
 assert.equal((await harness().call('POST',forged,'Bearer '+secret)).statusCode,422);
});
test('never publishes malformed odds, wrong host, cross-book or stale prices',()=>{
 const samples=[
  {...f(135,0)}, {...f(125,300),sourceUrl:'https://example.com/'},
  {...f(125,300),book:'DraftKings'},
  {...f(125,300),observedAt:new Date(now-21*60000).toISOString()},
  {...f(125,300),line:135.3},
  {...f(125,300),gameId:'400000000'}
 ];
 for(const sample of samples){
  const val=sanitizePublishedBookObservations({
   ...body,offers:[sample],now
  });
  assert.equal(val.ok,false,JSON.stringify(sample));
 }
});
test('expires centrally published data even when a Blob snapshot still exists',()=>{
 const stale={schemaVersion:1,date,gameId,book:'FanDuel',
  publisherStatus:'USER_OBSERVED_NOT_BOOK_VERIFIED',
  offers:[f(125,300)]};
 assert.equal(keepCurrentPublishedBookRows(stale,{date,gameId,book:'FanDuel',now}).length,1);
 assert.equal(keepCurrentPublishedBookRows(stale,{date,gameId,book:'FanDuel',now:now+21*60000}).length,0);
});
test('both production and public sites receive central authorized records but do not equate them to SGP quotes',()=>{
 const main=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const publicHtml=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const capture=readFileSync(new URL('../odds-capture.html',import.meta.url),'utf8');
 for(const html of [main,publicHtml])assert.ok(html.includes('/api/nfl-published-book-observations?'));
 assert.ok(main.includes('d.publishedBookObservations?.offers'));
 assert.ok(publicHtml.includes('state.publishedBookObservations.offers'));
 assert.ok(capture.includes("fetch('/api/nfl-published-book-observations',{"));
 assert.ok(capture.includes("finally{$('publishKey').value=''"));
 assert.ok(!capture.includes("localStorage.setItem('publishKey'"));
 assert.ok(capture.includes('CRON_SECRET'));
});
