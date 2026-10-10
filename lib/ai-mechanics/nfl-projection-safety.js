// Fail-closed helpers for NFL SGP model targets. An absent rank is not #0,
// and Medium must not quietly become a ceiling wager above the displayed model.
export function validNflDvpRank(value){
 if(value===null||value===undefined||value==="")return null;
 const num=Number(value);
 return Number.isInteger(num)&&num>=1&&num<=32?num:null;
}
export function capNflTierYardTarget({category,tier,target,projection}={}){
 if(!["passing","rushing","receiving"].includes(category)||
    !["Small","Medium","Nuke"].includes(tier))return target;
 const t=Number(target),p=Number(projection);
 if(!Number.isFinite(t)||t<=0)return null;
 // If no baseline exists, source cannot justify a purported
 // conservative/expected threshold. Ceiling targets are separately gated.
 if(tier==="Nuke")return Math.ceil(t/5)*5;
 if(!Number.isFinite(p)||p<=0)return null;
 const cap=Math.floor(p/5)*5;
 if(cap<5)return null;
 return Math.floor(Math.min(t,cap)/5)*5;
}
export function isNflConfirmedGameQb({position,role}={}){
 if(String(position||"").toUpperCase()!=="QB")return true;
 return role?.starterVerified===true&&role?.recommendationEligible===true&&
   role?.verification?.role?.verified===true;
}
