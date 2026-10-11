// The provider's documented /sgp route accepts either native outcome IDs
// or a full exact market/name/description/point tuple. A named fallback
// must be source-native (never generated from projection or ESPN metadata).
const PROPS=new Set(['player_pass_yds','player_rush_yds',
 'player_reception_yds','player_receptions','player_anytime_td']);
const str=x=>typeof x==='string'?x.trim():'';
export function exactPropLineSgpLeg(leg){
 if(!leg||!PROPS.has(leg.market))return null;
 const id=str(leg.book_outcome_id);
 if(id.length>=3&&id.length<=160)return{
  market:leg.market,book_outcome_id:id
 };
 const name=str(leg.name),description=str(leg.description);
 if(!name||name.length>130||description.length>130)return null;
 const td=leg.market==='player_anytime_td';
 if(td){
  if(/^no$/i.test(name)||(/^(?:yes|over)$/i.test(name)&&!description))
   return null;
  if(leg.point!==null&&leg.point!==undefined&&leg.point!=='')return null;
  return{market:leg.market,name,description,point:null};
 }
 // Never guess a player or line: the exact name, description and point
 // came from this bookmaker's original authorized /odds outcome.
 if(!/^over$/i.test(name)||!description||/^(?:over|under|yes|no)$/i.test(description))
  return null;
 const point=leg.point;
 if(point===null||point===undefined||String(point).trim()===''||
   !Number.isFinite(Number(point))||Number(point)<=0)return null;
 return{market:leg.market,name,description,point:Number(point)};
}
export function propLineSgpLegsMatch(requestLeg,providerLeg){
 const requested=exactPropLineSgpLeg(requestLeg);
 if(!requested||!providerLeg||providerLeg.market!==requested.market)return false;
 if(requested.book_outcome_id!==undefined)
  return str(providerLeg.book_outcome_id)===requested.book_outcome_id;
 // A provider-returned native id is optional on named-leg lookup; it
 // does not replace the exact outcome tuple used to authenticate this leg.
 const incoming=exactPropLineSgpLeg({
  market:providerLeg.market,name:providerLeg.name,
  description:providerLeg.description,point:providerLeg.point,
  book_outcome_id:null
 });
 return Boolean(incoming&&incoming.name===requested.name&&
  incoming.description===requested.description&&
  incoming.point===requested.point);
}
export function propLineSgpLegSignature(leg){
 const item=exactPropLineSgpLeg(leg);
 if(!item)return null;
 return item.book_outcome_id!==undefined?
  'ID|'+item.market+'|'+item.book_outcome_id:
  'NAMED|'+JSON.stringify([item.market,item.name,item.description,item.point]);
}
