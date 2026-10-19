// Shared public read-only NBA positional evidence view. Historical context
// never verifies a player prop, current defender, or sportsbook SGP quote.
export function publicNbaPositionContext(snapshot,{current=false}={}){
 const x=snapshot?.nbaPositionEvidence;
 if(!current||!x||x.status!=='HISTORICAL_EVIDENCE')return null;
 return {status:x.status,asOf:x.asOf,source:x.source,
  limitation:x.limitation,teams:x.teams};
}
