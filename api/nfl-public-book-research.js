// Read-only public-market research for one scheduled NFL game.
// Never fetch user-provided URLs, never place bets, never create a book quote.
import {
 DKN_NFL_PROPS_URL,DRAFTKINGS_DIRECT_URL,FANDUEL_NFL_PUBLIC_URL,publicBookResearchReport,
 matchPublicOffersToEligibleGamePlayers,publicNflOfferParticipationSignals
} from '../lib/nfl-public-sportsbook-observer.js';

const PUBLIC_SOURCE_TIMEOUT=6500;
// Fetch roster/schedule evidence from this exact deployment. A Vercel
// preview must never silently join its public sportsbook observations to
// a different version of the production game snapshot.
export function nflPublicBookTrustedOrigin(env=process.env){
 const deployment=String(env.VERCEL_URL||'').toLowerCase().trim();
 if(/^momentum-radar-live-[a-z0-9-]+[.]vercel[.]app$/.test(deployment))
  return 'https://'+deployment;
 if(env.VERCEL_ENV==='production'){
  const production=String(env.VERCEL_PROJECT_PRODUCTION_URL||'').toLowerCase();
  if(production==='momentum-radar-live.vercel.app')
   return 'https://'+production;
 }
 return null;
}
const read=async(url,timeout=PUBLIC_SOURCE_TIMEOUT)=>{
 const r=await fetch(url,{cache:'no-store',
  headers:{Accept:'text/html,application/xhtml+xml'},
  signal:AbortSignal.timeout(timeout)});
 if(!r.ok)return{status:'HTTP_'+r.status,html:null};
 const type=r.headers.get('content-type')||'';
 if(!/text\/html|application\/xhtml/i.test(type))
  return{status:'NON_HTML_RESPONSE',html:null};
 const text=await r.text();
 return{status:'FETCH_OK',html:text.slice(0,2_000_000)};
};
export default async function handler(req,res){
 // Observed sportsbook prices are time-sensitive. CDN caching for five
 // minutes would contradict the 30-second game page refresh contract.
 res.setHeader('Cache-Control','private,no-store,max-age=0');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const date=String(req.query?.date||''),gameId=String(req.query?.gameId||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||
  !/^\d{7,12}$/.test(gameId))
  return res.status(400).json({ok:false,error:'date_and_game_required'});
 const dateTime=Date.parse(date+'T12:00:00Z'),now=Date.now();
 if(dateTime<now-86400_000||dateTime>now+14*86400_000)
  return res.status(400).json({ok:false,error:'outside_active_schedule'});
 try{
  const origin=nflPublicBookTrustedOrigin();
  if(!origin)return res.status(503).json({
   ok:false,error:'sportsbook_observer_deployment_identity_unverified'});
  const resp=await fetch(origin+'/api/nfl-schedule?date='+encodeURIComponent(date),{
   cache:'no-store',signal:AbortSignal.timeout(8500)});
  if(!resp.ok)throw Error('schedule_http_'+resp.status);
  const slate=await resp.json();
  const game=slate?.games?.find(g=>String(g.gameId)===gameId);
  if(slate?.ok!==true||slate.date!==date||!game)
   return res.status(404).json({ok:false,error:'game_not_on_verified_slate'});
  const home=String(game.home?.abbr||''),away=String(game.away?.abbr||'');
  if(!/^[A-Z]{2,4}$/.test(home)||!/^[A-Z]{2,4}$/.test(away))
   return res.status(503).json({ok:false,error:'team_identity_missing'});
  // Use the separately sanitized matchup player list for game/player identity
  // to prevent public-index listings attributed to the wrong team from leaking.
  const saved=await fetch(origin+'/api/public-nfl-game?date='+
   encodeURIComponent(date)+'&gameId='+encodeURIComponent(gameId),{
    cache:'no-store',signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null)
   .catch(()=>null);
  const rosterEvidenceReady=saved?.ok===true&&
   ['CURRENT','LAST_SAVED'].includes(saved?.status)&&
   String(saved?.gameId)===gameId&&saved?.date===date;
  // Open the actual first-party sportsbook sites before consulting the
  // DraftKings-published popular-props listing (limited secondary research).
  // NO odds API is called, including when a sportsbook refuses automation.
  const [dkDirect,fd,dk]=await Promise.all([
   read(DRAFTKINGS_DIRECT_URL).catch(()=>({status:'FETCH_FAILED',html:null})),
   read(FANDUEL_NFL_PUBLIC_URL).catch(()=>({status:'FETCH_FAILED',html:null})),
   read(DKN_NFL_PROPS_URL).catch(()=>({status:'FETCH_FAILED',html:null}))
  ]);
  // The FanDuel public website often renders odds through client-side
  // interfaces. Don't promote arbitrary page text to a current priced prop.
  const fdStatus=fd.status==='FETCH_OK'?
   (/enable javascript|javascript is required|please enable javascript|requires javascript/i.test(fd.html||'')?
    'JAVASCRIPT_RENDERED_STOREFRONT':'NO_MACHINE_READABLE_MARKETS'):fd.status;
  const report=publicBookResearchReport({dkHtml:dk.html,dkStatus:dk.status,
   fdHtml:fd.html,fdStatus,date,home,away,
   homeName:game.home?.name,awayName:game.away?.name,now:Date.now()});
  report.directSources={
   DraftKings:{url:DRAFTKINGS_DIRECT_URL,fetchStatus:dkDirect.status,
    role:'FIRST_PARTY_PUBLIC_STOREFRONT'},
   FanDuel:{url:FANDUEL_NFL_PUBLIC_URL,fetchStatus:fd.status,
    role:'FIRST_PARTY_PUBLIC_STOREFRONT'},
   DraftKingsPublishedListing:{url:DKN_NFL_PROPS_URL,fetchStatus:dk.status,
    role:'LIMITED_FIRST_PARTY_PUBLISHED_MARKETS'}
  };
  const observed=report.offers.length;
  const observedByBook=Object.fromEntries(report.books.map(book=>[
   book.book,report.offers.filter(x=>x.book===book.book).length
  ]));
  report.offers=rosterEvidenceReady?
   matchPublicOffersToEligibleGamePlayers(report.offers,saved,{home,away}):[];
  for(const book of report.books){
   const count=report.offers.filter(x=>x.book===book.book).length;
   book.observedOffers=count;
   book.status=!rosterEvidenceReady?'PLAYER_EVIDENCE_UNAVAILABLE':
    count?'PUBLIC_LISTINGS_MATCHED':
    observedByBook[book.book]>0?'NO_VETTED_GAME_PLAYER_MATCH':book.status;
  }
  report.status=!rosterEvidenceReady?'VETTED_GAME_DATA_UNAVAILABLE':
   report.offers.length?'PUBLIC_OFFERS_MATCHED':
   'NO_MATCHING_VETTED_PUBLIC_PROPS';
  report.excludedUnmatchedPublicRows=Math.max(0,observed-report.offers.length);
  report.playerIdentityScreened=rosterEvidenceReady;
  report.participationSignals=publicNflOfferParticipationSignals(report.offers,{gameId,now:Date.now()});
  report.participationPolicy='SUPPORTING_SIGNAL_ONLY_OFFICIAL_ROSTER_AND_INJURY_RULES_OVERRIDE';
  report.sourceHealth={
   DraftKings:{state:report.books[0].status,
    directStorefrontStatus:dkDirect.status,
    directStorefrontPropsParsed:false,
    publishedListingStatus:dk.status,
    observedPropRows:report.offers.filter(x=>x.book==='DraftKings').length,
    verifiedPropRows:0,sourceUrl:DKN_NFL_PROPS_URL},
   FanDuel:{state:report.books[1].status,
    directStorefrontStatus:fd.status,
    directStorefrontPropsParsed:false,
    observedPropRows:report.offers.filter(x=>x.book==='FanDuel').length,
    verifiedPropRows:0,sourceUrl:FANDUEL_NFL_PUBLIC_URL,
    requiresMachineReadableMarketFeed:fdStatus==='JAVASCRIPT_RENDERED_STOREFRONT',
    noPriceInference:true}
  };
  report.coverage={scope:'SELECTED_GAME',gameId,observedRows:observed,
   vettedRows:report.offers.length,excludedRows:report.excludedUnmatchedPublicRows,
   categories:[...new Set(report.offers.map(x=>x.category))].sort(),
   booksWithVettedRows:[...new Set(report.offers.map(x=>x.book))].sort(),
   completeSportsbookMarketCoverage:false,combinedSgpQuoteVerified:false,
   directStorefrontOfferIngestion:false,
   blocker:'FIRST_PARTY_STOREFRONTS_FETCHED_BUT_NO_VERIFIED_DIRECT_PROP_EXTRACTION'};
  res.setHeader('X-Momentum-Public-Market-Source',report.status);
  return res.status(200).json({...report,gameId,checkedAt:new Date().toISOString()});
 }catch{
  res.setHeader('Cache-Control','private,no-store');
  return res.status(503).json({ok:false,error:'public_market_schedule_unavailable',
   note:'Saved matchup and sportsbook verification continue independently.'});
 }
}
