// Shared NFL/NBA research provenance. This module never certifies an offer,
// lineup, injury clearance, or sportsbook SGP based on third-party projections.
const SPORTS=new Set(['nfl','nba']);
export function normalizeProjectionEvidence(input={}){
 const sport=String(input.sport||'').toLowerCase();
 if(!SPORTS.has(sport))throw new TypeError('Unsupported sport');
 const asOf=typeof input.asOf==='string'&&!Number.isNaN(Date.parse(input.asOf))?input.asOf:null;
 const source=typeof input.source==='string'&&input.source.trim()?input.source.trim():'UNATTRIBUTED';
 const stats=input.stats&&typeof input.stats==='object'&&!Array.isArray(input.stats)?input.stats:{};
 const projected={};
 for(const [name,value] of Object.entries(stats)){
  if(!/^[a-z][a-z0-9_]*$/i.test(name))continue;
  if(typeof value==='number'&&Number.isFinite(value)&&value>=0)projected[name]=value;
 }
 return Object.freeze({sport,source,asOf,playerId:String(input.playerId||''),
  team:String(input.team||''),opponent:String(input.opponent||''),
  stats:Object.freeze(projected),kind:'MODEL_RESEARCH',bookVerified:false,
  starterVerified:false,sgpVerified:false});
}
export function projectionEvidenceComparable(a,b){
 return a?.sport===b?.sport&&a?.playerId&&a.playerId===b?.playerId&&
  a.team===b.team&&a.opponent===b.opponent;
}
export function projectionEvidenceLabel(e){
 return e?.kind==='MODEL_RESEARCH'?'RESEARCH PROJECTION — NOT A SPORTSBOOK OFFER':'UNVERIFIED DATA';
}
