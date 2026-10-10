// Vercel Blob accepts both the legacy long-lived token and modern OIDC.
// OIDC is issued by Vercel functions at runtime and needs BLOB_STORE_ID,
// not BLOB_READ_WRITE_TOKEN (which may correctly be absent).
// This checks plausible runtime configuration only. The Blob SDK must still
// complete an actual list()/put() before we claim credentials were validated.
export function blobCredentialMode(env={}){
 if(env.BLOB_STORE_ID&&(env.VERCEL_OIDC_TOKEN||env.VERCEL==='1'||env.VERCEL==='true'))
  return 'OIDC';
 if(env.BLOB_READ_WRITE_TOKEN)return 'READ_WRITE_TOKEN';
 return 'NOT_CONFIGURED';
}
export function blobStorageReadiness(env={}){
 const mode=blobCredentialMode(env);
 return {configured:mode!=='NOT_CONFIGURED',mode,validated:false,
  note:mode==='OIDC'?
   'Store ID and Vercel runtime support automatic short-lived Blob OIDC authentication; an actual Blob operation must still pass.':
   mode==='READ_WRITE_TOKEN'?
    'Legacy Blob token configured; a successful Blob operation is still required to verify access.':
    'No usable Blob credential configuration detected. Connect the existing store to the Vercel project.'};
}
