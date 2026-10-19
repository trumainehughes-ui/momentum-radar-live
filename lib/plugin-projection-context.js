// Safe projection-only context from authenticated plugin research.
// Never accepts plugin content as bookmaker offers, odds or verified player availability.
const types=new Set(['player_projection','player_history','team_stat','game_projection','schedule','injury_context']);
export function buildPluginProjectionContext(records,{league,gameId,now=Date.now()}={}){
 const normalizedLeague=String(league||'').toUpperCase();
 const game=String(gameId||'');
 const notes=[];
 for(const record of Array.isArray(records)?records.slice(0,50):[]){
  if(!record||record.classification!=='RESEARCH_ONLY_NOT_SPORTSBOOK_OFFER'||
   record.sportsbookVerified!==false||record.combinedSgpOdds!==null||
   record.league!==normalizedLeague||record.gameId!==game||
   !['DraftKings','Optimal Sports Projections'].includes(record.provider))continue;
  const timestamp=Date.parse(record.observedAt||'');
  if(!Number.isFinite(timestamp)||timestamp>now+5*60_000||now-timestamp>48*3600_000)continue;
  for(const item of Array.isArray(record.observations)?record.observations.slice(0,30):[]){
   if(!item||!types.has(item.type))continue;
   if(![item.subject,item.description,item.sourceReference].every(x=>typeof x==='string'))continue;
   notes.push({provider:record.provider,type:item.type,subject:item.subject.slice(0,100),
    description:item.description.slice(0,600),sourceReference:item.sourceReference.slice(0,300),
    observedAt:new Date(timestamp).toISOString(),authority:'RESEARCH_CONTEXT_ONLY'});
   if(notes.length>=100)break;
  }
  if(notes.length>=100)break;
 }
 return {league:normalizedLeague,gameId:game,notes,bookOffers:[],combinedSgpQuotes:[],
  sportsbookVerified:false,readyForAutomaticPublishing:false};
}

/**
 * Attach non-authoritative plugin observations to an existing matchup analysis.
 * Deliberately does not mutate or supply selections, prices, injuries, or starter eligibility.
 * Consumers must use notes only as hypotheses for independently verified analysis.
 */
export function attachPluginResearchToMatchup(matchup,context,{league,gameId,now=Date.now()}={}){
 if(!matchup||typeof matchup!=='object'||Array.isArray(matchup))throw Error('invalid_matchup');
 if(!context||context.league!==String(league||'').toUpperCase()||
  context.gameId!==String(gameId||'')||context.sportsbookVerified!==false||
  context.readyForAutomaticPublishing!==false||
  !Array.isArray(context.notes)||!Array.isArray(context.bookOffers)||
  context.bookOffers.length!==0||!Array.isArray(context.combinedSgpQuotes)||
  context.combinedSgpQuotes.length!==0)throw Error('untrusted_research_context');
 const notes=context.notes.slice(0,100).filter(note=>note&&note.authority==='RESEARCH_CONTEXT_ONLY'&&
  ['DraftKings','Optimal Sports Projections'].includes(note.provider)&&
  types.has(note.type)&&typeof note.subject==='string'&&note.subject.length>=2&&note.subject.length<=100&&
  typeof note.description==='string'&&note.description.length>=2&&note.description.length<=600&&
  typeof note.sourceReference==='string'&&note.sourceReference.length>=3&&note.sourceReference.length<=300&&
  Number.isFinite(Date.parse(note.observedAt||''))&&
  Date.parse(note.observedAt)<=now+5*60_000&&now-Date.parse(note.observedAt)<=48*3600_000)
  .map(note=>({provider:note.provider,type:note.type,subject:note.subject.slice(0,100),
   description:note.description.slice(0,600),sourceReference:note.sourceReference.slice(0,300),
   observedAt:note.observedAt,authority:'RESEARCH_CONTEXT_ONLY'}));
 return {...matchup,pluginResearch:{league:context.league,gameId:context.gameId,notes,
  status:'UNVERIFIED_RESEARCH_CONTEXT',eligibleForBetConstruction:false}};
}
