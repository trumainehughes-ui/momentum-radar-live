// Measured offensive opportunity is required before a player can enter an
// NFL SGP. Roster presence and a past-game projection are not playing time.
// Verified starters remain eligible; meaningful rotational players require
// actual completed-game targets/carries and current-game role screening.
import {nflProjectedDepthChartQbEligible} from './nfl-depthchart-qb1.js';

const pos=x=>String(x||'').toUpperCase();
const finiteNonnegative=x=>x===null||x===undefined||x===''?null:
 Number.isFinite(Number(x))&&Number(x)>=0?Number(x):null;
const injured=/\b(?:OUT|INACTIVE|INJURED RESERVE|IR|DOUBTFUL|QUESTIONABLE|SUSPENDED|PUP|NFI)\b/i;
export function nflMeaningfulOpportunity(profile,role,{pairedTd=null}={}){
 const x=profile||{},r=role||{};
 const position=pos(x.position||r.position);
 if(!['QB','RB','WR','TE'].includes(position)||
  r.recommendationEligible!==true||
  injured.test([r.availability,r.starterStatus,r.status,
   x.injuryStatus,x.availability].join(' ')))return false;
 const officialStarter=r.starterVerified===true&&
  r.verification?.role?.verified===true;
 if(position==='QB'){
  return officialStarter||
   nflProjectedDepthChartQbEligible(r);
 }
 if(officialStarter)return true;
 const games=finiteNonnegative(x.gamesPlayed??pairedTd?.gamesPlayed);
 if(games===null||games<3)return false;
 const usage=x.usagePerGame||{},tdUsage=pairedTd?.usagePerGame||{};
 const targets=finiteNonnegative(usage.targets)??
  finiteNonnegative(tdUsage.targets)??
  (finiteNonnegative(x.targets??pairedTd?.targets)===null?null:
   Number(x.targets??pairedTd?.targets)/games);
 if(position==='WR'||position==='TE')return targets!==null&&targets>=4;
 const attempts=finiteNonnegative(x.carriesPerGame??usage.carries??
  usage.rushAttempts??usage.rushingAttempts)??
  ((finiteNonnegative(x.rushingAttempts??pairedTd?.rushingAttempts)===null)?
    null:Number(x.rushingAttempts??pairedTd?.rushingAttempts)/games);
 return attempts!==null&&attempts>=6||targets!==null&&targets>=4;
}
