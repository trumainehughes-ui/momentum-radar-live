// Pure OpticOdds crosswalk from documented v3 /fixtures/active and
// /fixtures/odds response shapes. No provider calls, secrets, or assumptions
// about ESPN and OpticOdds fixture/player IDs.
const norm=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toUpperCase().replace(/[^A-Z0-9]/g,'');
const str=x=>String(x??'').trim();
const LEAGUE_SPORT={nfl:'football',nba:'basketball'};
const MAX_EVENT_DELTA_MS=15*60*1000;
const MAX_MARKET_AGE_MS=15*60*1000;
const parsedTime=s=>{const t=Date.parse(String(s||''));return Number.isFinite(t)?t:null};
const teamToken=(x)=>norm(x?.abbreviation||x?.abbr);
const asRows=source=>Array.isArray(source?.data)?source.data:[];
const status=x=>str(x||'').toLowerCase();

export function matchOpticOddsFixture({league,game,fixtures,now=Date.now()}={}){
 const fail=reason=>({ready:false,reason});
 if(!LEAGUE_SPORT[league]||!/^\d{7,12}$/.test(str(game?.gameId)))
  return fail('INVALID_ESPN_GAME');
 const start=parsedTime(game?.kickoff),home=teamToken(game?.home),away=teamToken(game?.away);
 if(start===null||!home||!away||home===away||start<=now)
  return fail('ESPN_GAME_IDENTITY_INCOMPLETE_OR_CLOSED');
 if(!Array.isArray(fixtures?.data)||fixtures?.total_pages>1)
  return fail('INCOMPLETE_PROVIDER_FIXTURE_PAGE');
 const candidates=asRows(fixtures).filter(f=>{
  if(!f?.id||str(f?.league?.id).toLowerCase()!==league||
   str(f?.sport?.id).toLowerCase()!==LEAGUE_SPORT[league]||
   status(f.status)!=='unplayed'||f.is_live!==false)return false;
  const h=Array.isArray(f.home_competitors)?f.home_competitors:[],
   a=Array.isArray(f.away_competitors)?f.away_competitors:[];
  if(h.length!==1||a.length!==1||!str(h[0].id)||!str(a[0].id))return false;
  if(teamToken(h[0])!==home||teamToken(a[0])!==away)return false;
  const when=parsedTime(f.start_date);
  return when!==null&&Math.abs(when-start)<=MAX_EVENT_DELTA_MS;
 });
 if(candidates.length!==1)return fail(candidates.length?'AMBIGUOUS_PROVIDER_FIXTURE':
  'NO_EXACT_PROVIDER_FIXTURE_MATCH');
 const f=candidates[0];
 return{ready:true,league,espnGameId:str(game.gameId),fixtureId:str(f.id),
  homeTeamId:str(f.home_competitors[0].id),awayTeamId:str(f.away_competitors[0].id),
  homeAbbr:home,awayAbbr:away,
  kickoff:new Date(start).toISOString(),verifiedAt:new Date(now).toISOString(),
  source:'OpticOdds /fixtures/active (exact teams and kickoff)'};
}
const threshold=leg=>{
 if((leg.cat||leg.category)==='td')return 'Anytime TD';
 const n=Number(leg.analyticsThreshold??leg.threshold);
 return Number.isFinite(n)&&n>0?n:null;
};
const offeredPlayer=(name,cat)=>{
 const value=str(name);
 if(cat==='td')return{name:value,threshold:'Anytime TD'};
 const match=value.match(/^(.+?)\s+(Over)\s+(\d+(?:\.\d+)?)$/i);
 if(match){
  const line=Number(match[3]);
  // Over N.5 means N+1 or more. Over a whole N is excluded: pushes may
  // settle differently and it does not describe N+.
  return{ name:match[1],threshold:line%1===0.5?Math.ceil(line):null};
 }
 const alt=value.match(/^(.+?)\s+(\d+)\+$/);
 return alt?{name:alt[1],threshold:Number(alt[2])}:null;
};

export function buildOpticOddsMarketCrosswalk({
 fixture,game,league,legs,oddsSnapshot,marketCatalog,now=Date.now()
}={}){
 const fail=(reason,extra={})=>({ready:false,reason,...extra});
 if(!fixture?.ready||fixture.league!==league||
  str(fixture.espnGameId)!==str(game?.gameId)||!Array.isArray(legs)||!legs.length)
  return fail('FIXTURE_NOT_VERIFIED');
 const fixtureAt=parsedTime(fixture.verifiedAt);
 if(fixtureAt===null||fixtureAt>now||now-fixtureAt>MAX_MARKET_AGE_MS)
  return fail('FIXTURE_MATCH_STALE');
 if(!Array.isArray(oddsSnapshot?.data)||oddsSnapshot.data.length!==1)
  return fail('SINGLE_ODDS_FIXTURE_SNAPSHOT_REQUIRED');
 const gameOdds=oddsSnapshot.data[0];
 if(str(gameOdds.id)!==fixture.fixtureId||!Array.isArray(gameOdds.odds))
  return fail('ODDS_FIXTURE_MISMATCH');
 const homes=gameOdds.home_competitors||[],aways=gameOdds.away_competitors||[];
 if(homes.length!==1||aways.length!==1||
  str(homes[0].id)!==fixture.homeTeamId||str(aways[0].id)!==fixture.awayTeamId)
  return fail('ODDS_TEAM_IDENTITY_MISMATCH');
 const names=marketCatalog&&typeof marketCatalog==='object'?marketCatalog:null;
 if(!names||names.sourceVerified!==true||
  str(names.league)!==league||
  !Number.isFinite(parsedTime(names.checkedAt))||
  parsedTime(names.checkedAt)>now||now-parsedTime(names.checkedAt)>24*60*60*1000)
  return fail('PROVIDER_MARKET_CATALOG_NOT_VERIFIED');
 const selections=[],usedOdds=new Set(),usedPlayers=new Map();
 for(const leg of legs){
  const cat=str(leg.cat||leg.category),player=str(leg.name),
   leagueGame=str(leg.eventID||leg.gameId),
   team=norm(leg.team),target=threshold(leg);
  if(!player||!str(leg.playerID||leg.playerId)||leagueGame!==fixture.espnGameId||
   !team||![fixture.homeAbbr,fixture.awayAbbr].includes(team)||target===null)
   return fail('MODEL_LEG_IDENTITY_INCOMPLETE');
  const trustedNames=Array.isArray(names[cat])?names[cat].filter(x=>str(x)):[],
   teamId=team===fixture.homeAbbr?fixture.homeTeamId:fixture.awayTeamId;
  if(!trustedNames.length)return fail('CATEGORY_NOT_IN_VERIFIED_MARKET_CATALOG');
  const matching=gameOdds.odds.filter(o=>{
   const t=Number(o.timestamp)*1000,
    parsed=offeredPlayer(o.name,cat);
   if(o.sportsbook!=='DraftKings'||!trustedNames.includes(o.market)||
    !str(o.id)||!str(o.player_id)||str(o.team_id)!==teamId||
    !Number.isFinite(t)||t>now||now-t>MAX_MARKET_AGE_MS||
    !Number.isFinite(Number(o.price))||Number(o.price)===0||
    norm(parsed?.name)!==norm(player)||parsed?.threshold!==target)return false;
   return true;
  });
  if(matching.length!==1)return fail(matching.length?'AMBIGUOUS_PROVIDER_PLAYER_MARKET':
   'EXACT_PROVIDER_PLAYER_MARKET_UNAVAILABLE',{category:cat});
  const market=matching[0],athlete=str(leg.playerID||leg.playerId);
  if(usedOdds.has(market.id))return fail('DUPLICATED_PROVIDER_ODDS');
  usedOdds.add(market.id);
  const prev=usedPlayers.get(athlete);
  if(prev&&prev!==str(market.player_id))return fail('INCONSISTENT_PROVIDER_PLAYER_ID');
  usedPlayers.set(athlete,str(market.player_id));
  selections.push({...leg,fixture_id:fixture.fixtureId,market:market.market,
   selection:market.name,providerPlayerId:str(market.player_id)});
 }
 return{ready:true,league,gameId:fixture.espnGameId,book:'DraftKings',
  fixtureId:fixture.fixtureId,verifiedAt:new Date(now).toISOString(),
  entries:selections,source:'OpticOdds current DraftKings /fixtures/odds',
  currentMarketCount:gameOdds.odds.length};
}

export function verifyOpticOddsMarketCatalog({
 league,providerMarkets,categoryNames,now=Date.now()
}={}){
 const fail=reason=>({sourceVerified:false,reason});
 if(!LEAGUE_SPORT[league]||!Array.isArray(providerMarkets?.data)||
  !categoryNames||typeof categoryNames!=='object')return fail('MARKET_DISCOVERY_UNAVAILABLE');
 const supported=new Set(providerMarkets.data.filter(m=>m&&str(m.name)).filter(m=>
  Array.isArray(m.sports)&&m.sports.some(s=>
   str(s.id).toLowerCase()===LEAGUE_SPORT[league]&&
   Array.isArray(s.leagues)&&s.leagues.some(l=>
    str(l.id).toLowerCase()===league&&Array.isArray(l.sportsbooks)&&
    l.sportsbooks.some(b=>str(b.id).toLowerCase()==='draftkings'))))
  .map(m=>str(m.name)));
 if(!supported.size)return fail('NO_DRAFTKINGS_MARKETS_IN_DISCOVERY');
 const cats=league==='nfl'?['passing','rushing','receiving','receptions','td']:
  ['points','rebounds','assists','threes','pra'];
 const verified={league,sourceVerified:true,checkedAt:new Date(now).toISOString()};
 let approved=0;
 for(const cat of cats){
  const names=Array.isArray(categoryNames[cat])?categoryNames[cat]:[];
  const picked=[...new Set(names.map(str).filter(n=>supported.has(n)))];
  verified[cat]=picked;
  approved+=picked.length;
 }
 if(!approved)return fail('NO_CATEGORY_MARKET_NAMES_VERIFIED');
 return verified;
}
