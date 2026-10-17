// A single, browser-scoped exact sportsbook observation view shared by the
// public site and production's local captures. Never turns model thresholds
// into listed offers or individual American odds into a correlated SGP quote.
import {currentLocalBookOffers,validateBookPageUrl} from './public-book-text-capture.js';
import {selectBestListedBookAlternate} from './sportsbook-listed-alternate-selector.js';
export const LOCAL_BOOK_KEY='momentum-radar-public-book-observations-v1';
const catSet=new Set(['td','passing','rushing','receiving','receptions']);
const canon=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function observedMatchupBookSnapshot({entries,gameId,date,teams=[],now=Date.now()}={}){
 const teamSet=new Set(teams.map(x=>String(x||'').toUpperCase()));
 if(!/^\d{7,12}$/.test(String(gameId||''))||teamSet.size!==2)return [];
 return currentLocalBookOffers(entries,gameId,now).filter(o=>
  o?.date===date&&catSet.has(o.category)&&
  ['FanDuel','DraftKings'].includes(o.book)&&
  (o.verification==='VISIBLE_BOOK_PAGE_USER_OBSERVATION_ONLY'||
   o.verification==='PUBLIC_PAGE_OBSERVATION_ONLY')&&
  validateBookPageUrl(o.sourceUrl,o.book)&&
  o.captureMethod!== 'MODEL_SYNTHETIC'&&
  Number.isFinite(Number(o.odds))&&(Number(o.odds)>=100||Number(o.odds)<=-100)
 );
}
export function buildBrowserObservedSgpReviews({entries,model,gameId,date,teams=[],now=Date.now()}={}){
 const observed=observedMatchupBookSnapshot({entries,gameId,date,teams,now});
 const teamSet=new Set(teams.map(x=>String(x||'').toUpperCase()));
 const tiers=(Array.isArray(model?.sgps?.Analytics)?model.sgps.Analytics:[]);
 const categories=model?.categories||{};
 const reviews=[];
 for(const book of ['DraftKings','FanDuel']){
  const available=observed.filter(x=>x.book===book);
  if(!available.length)continue;
  for(const risk of ['Small','Medium','Nuke']){
   const tier=tiers.find(x=>x?.risk===risk);
   if(!tier||!Array.isArray(tier.legs))continue;
   const selected=[],picked=new Set();
   for(const leg of tier.legs){
    const cat=leg.category||leg.cat;
    const name=leg.player||leg.name;
    const team=String(leg.team||'').toUpperCase();
    if(!catSet.has(cat)||!teamSet.has(team)||!name||
      String(leg.gameId||gameId)!==String(gameId)||picked.has(canon(name)))continue;
    const options=available.filter(x=>canon(x.player)===canon(name)&&x.category===cat);
    if(!options.length)continue;
    if(cat==='td'){
     const td=options.find(x=>x.line===null);
     if(td){selected.push({offer:td,comparison:[],rule:'EXACT_LISTED'});picked.add(canon(name))}
     continue;
    }
    const profile=(Array.isArray(categories[cat])?categories[cat]:[]).find(p=>
     canon(p.name||p.player)===canon(name)&&String(p.team||'').toUpperCase()===team);
    // A matchup projection is internal context, never a proposed bookmaker selection.
    const forecast=Number(profile?.edgeAnalytics?.modelProjection??profile?.projection);
    if(!Number.isFinite(forecast)||forecast<=0)continue;
    const history=Array.isArray(profile.recentGameValues)?profile.recentGameValues:
     Array.isArray(profile.recentYards)?profile.recentYards:[];
    const result=selectBestListedBookAlternate({
     offers:options,book,gameId,player:name,category:cat,
     projection:forecast,risk,recentGameValues:history,now});
    if(result.ok){
     selected.push({offer:result.offer,comparison:result.candidateOffers,rule:result.rule});
     picked.add(canon(name));
    }
   }
   const minLegs={Small:4,Medium:5,Nuke:6}[risk];
   reviews.push({book,risk,legs:selected,minimumLegs:minLegs,
    completeCandidate:selected.length>=minLegs,
    actualSgpOdds:null,combinedBookQuoteVerified:false,
    status:selected.length>=minLegs?'COMPLETE_OBSERVATION_CANDIDATE_NO_BOOK_QUOTE':'PARTIAL_OBSERVED_MARKETS'});
  }
 }
 return {gameId:String(gameId),date,observed,tiers:reviews,
  combinedBookQuoteVerified:false,
  note:'These are first-party sportsbook lines captured in the current browser. Prices can change. No bookmaker-accepted combined SGP quote is available.'};
}
