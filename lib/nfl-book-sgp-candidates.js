// Market-offer coverage is not guaranteed. A missing bookmaker candidate
// must never crash the NFL game response or create a fake priced SGP.
export function filterCompleteNflBookSgps(candidates){
 return (Array.isArray(candidates)?candidates:[]).filter(s=>
  Boolean(s&&Array.isArray(s.legs)&&Number.isSafeInteger(s.requiredLegs)&&
   s.requiredLegs>0&&s.legs.length===s.requiredLegs&&
   s.tierAssessment?.compositionOk===true));
}
