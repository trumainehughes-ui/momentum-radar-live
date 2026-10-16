// Manual refresh orchestration for NFL and NBA. All dependencies are injected.
// No paid sports-data provider is imported or called by this module.
const lastRun = new Map();
export async function manualAiRefresh({sport,gameId,actorId,loadCached,runAnalysis,validateMarket,now=Date.now(),cooldownMs=60000}) {
  if (!['NFL','NBA'].includes(sport)) throw new Error('Unsupported sport');
  if (!gameId || !actorId) throw new Error('Game and user required');
  if (![loadCached,runAnalysis,validateMarket].every(f=>typeof f==='function')) throw new Error('Missing refresh dependency');
  const key=`${actorId}:${sport}:${gameId}`;
  const previous=lastRun.get(key);
  if (previous && now-previous<cooldownMs) return {status:'cooldown',retryAfterMs:cooldownMs-(now-previous),paidSportsApiCalls:0};
  lastRun.set(key,now);
  try {
    const cached=await loadCached({sport,gameId,allowPaidApi:false});
    if (!cached || cached.gameId!==gameId || cached.sport!==sport) throw new Error('Missing game cache');
    const proposal=await runAnalysis({sport,gameId,cached,allowPaidApi:false});
    const accepted=[],held=[];
    for (const leg of proposal?.legs??[]) {
      const player=cached.players?.find(p=>p.id===leg.playerId);
      if (!player || player.status==='OUT' || player.status==='IR' || player.active===false || player.starter!==true) {
        held.push({leg,reason:'Player eligibility unverified'}); continue;
      }
      if (['passing_yards','rushing_yards','receiving_yards'].includes(leg.market) && (!Number.isInteger(leg.threshold)||leg.threshold%5!==0)) {
        held.push({leg,reason:'Yardage must be in increments of five'});continue;
      }
      const verified=await validateMarket({sport,gameId,leg,cached,allowPaidApi:false});
      if (!verified?.available || !verified?.oddsVerified || !verified?.sourceTimestamp) {
        held.push({leg,reason:'Cached sportsbook market not verified'});continue;
      }
      accepted.push({...leg,marketVerifiedAt:verified.sourceTimestamp});
    }
    // Proposals are deliberately not published: combined odds, sport-specific
    // payout bands, and cross-leg sportsbook compatibility need final validation.
    return {status:'review_required',sport,gameId,paidSportsApiCalls:0,accepted,held,
      sourceTimestamp:cached.updatedAt??null,publicationBlocked:true};
  } catch(error) {
    lastRun.delete(key);
    throw error;
  }
}
