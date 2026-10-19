// Disabled: this endpoint was built for the wrong API provider.
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.status(410).json({ok:false,reason:'wrong_provider_integration_retired',
  provider:'TheRundown',statusEndpoint:'/api/therundown-status',
  requiredVariable:'THERUNDOWN_API_KEY',marketDataUsed:false});
}
