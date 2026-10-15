// AI is a reviewer of source-bound evidence, never an authoritative sportsbook or injury source.
import {pregameAiEvidence} from './pregame-ai-review.js';
import {pregameEvidenceParts} from './pregame-revalidation.js';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function manualAiEvidencePacket({sport,game,snapshot}) {
 const league=String(sport).toLowerCase();
 if(!['nfl','nba'].includes(league)||!game||!snapshot||
   String(game.gameId)!==String(snapshot.gameId))throw Error('game_identity_unverified');
 const evidence=pregameAiEvidence(league,game,snapshot);
 const parts=pregameEvidenceParts(snapshot,league);
 const digest=hash(parts);
 return {sport:league,gameId:String(game.gameId),digest,evidence,parts,
  sourceTimestamp:snapshot.checkedAt||snapshot.lockedAt||null,
  publicationBlocked:true};
}
export function validateManualAiReview({packet,response}) {
 if(!packet||!response||typeof response!=='object')return{ok:false,reason:'missing_review'};
 if(String(response.gameId)!==packet.gameId||response.evidenceDigest!==packet.digest)
  return{ok:false,reason:'evidence_digest_mismatch'};
 if(response.playerChanges?.length||response.oddsChanges?.length||response.thresholdChanges?.length)
  return{ok:false,reason:'ai_attempted_authoritative_mutation'};
 const validIds=new Set((packet.evidence.sgps||[]).flatMap(s=>s.legs||[])
  .map(l=>String(l.playerId||'')).filter(Boolean));
 const cited=Array.isArray(response.flaggedPlayerIds)?response.flaggedPlayerIds:[];
 if(cited.some(id=>!validIds.has(String(id))))return{ok:false,reason:'unrecognized_player_reference'};
 return {ok:true,advisoryOnly:true,canPublish:false,flaggedPlayerIds:cited,
  evidenceDigest:packet.digest,summary:String(response.summary||'').slice(0,1200)};
}
