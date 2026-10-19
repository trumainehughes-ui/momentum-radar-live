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
