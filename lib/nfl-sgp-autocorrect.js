// Research-only compatibility layer for proposed NFL SGP autocorrection.
// Does not alter live tiers, sportsbook verification, or publication.
import {calibratedTierThreshold as researchThreshold,assessSlipCorrelation} from './sgp-calibration-research.js';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const category=x=>String(x?.cat??x?.category??'').toLowerCase();
export function calibratedTierThreshold(player,cat,risk,calibration=null){
 return researchThreshold(player,cat,risk,calibration);
}
export function scoreCandidateForTier(player,cat,risk,calibration=null){
 const target=calibratedTierThreshold(player,cat,risk,calibration);
 if(!finite(target)||target<=0||player?.starterVerified!==true||player?.matchupVerified!==true)return null;
 const recent=player.recentFive;
 if(!Array.isArray(recent)||recent.length<5)return null;
 const hits=recent.filter(v=>finite(v)&&v>target).length;
 const rank=player.matchupRankMost;
 if(!Number.isInteger(rank)||rank<1||rank>32)return null;
 // Ranking heuristic only; never present as a calibrated probability.
 return Number((hits/recent.length*70+(33-rank)/32*30).toFixed(2));
}
export function isCorrelatedWithSlip(candidate,existingLegs=[],risk='Small'){
 // Conservative compatibility: warnings are NOT empirical correlation estimates.
 return assessSlipCorrelation(candidate,existingLegs,risk).warnings.length===0;
}
export function rankVerifiedNflSgpCandidates(pool=[],cat,risk,calibration=null){
 if(!Array.isArray(pool))return [];
 return pool.map(candidate=>({candidate,score:scoreCandidateForTier(candidate,cat??category(candidate),risk,calibration)}))
  .filter(x=>x.score!==null).sort((a,b)=>b.score-a.score);
}
