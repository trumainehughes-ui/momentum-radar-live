// Legacy URL: do not send TheRundown credentials to TheOddsAPI.
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.status(410).json({ok:false,reason:'provider_mismatch_retired',
  provider:'TheRundown',statusEndpoint:'/api/therundown-status',
  requiredVariable:'THERUNDOWN_API_KEY',note:'Legacy TheOddsAPI integration retired.'});
}
