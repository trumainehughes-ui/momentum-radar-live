// Postgame calibration: strictly use graded, pregame probability records.
export function calibrationByBucket(records = [], bucketCount = 10) {
  if (!Array.isArray(records) || !Number.isInteger(bucketCount) || bucketCount < 2 || bucketCount > 20) return null;
  const buckets = Array.from({length:bucketCount}, (_,i)=>({low:i/bucketCount,high:(i+1)/bucketCount,count:0,predictedTotal:0,hits:0}));
  for (const row of records) {
    if (!row || !Number.isFinite(row.probability) || row.probability < 0 || row.probability > 1 || typeof row.hit !== "boolean" || row.wasPregame !== true || row.final === false) continue;
    const i = Math.min(bucketCount-1,Math.floor(row.probability*bucketCount));
    const bucket=buckets[i];bucket.count++;bucket.predictedTotal+=row.probability;bucket.hits+=Number(row.hit);
  }
  return buckets.map(({low,high,count,predictedTotal,hits})=>({low,high,count,meanPredicted:count?predictedTotal/count:null,observedHitRate:count?hits/count:null}));
}
export function projectionError(records = []) {
  if (!Array.isArray(records)) return null;
  const valid=records.filter(r=>r && r.wasPregame===true && r.final===true && Number.isFinite(r.projection) && Number.isFinite(r.actual));
  if (!valid.length) return {count:0,meanError:null,meanAbsoluteError:null};
  const errors=valid.map(r=>r.projection-r.actual);
  return {count:errors.length,meanError:errors.reduce((a,b)=>a+b,0)/errors.length,meanAbsoluteError:errors.reduce((a,b)=>a+Math.abs(b),0)/errors.length};
}
