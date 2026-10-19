import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import {unsealResearch} from '../api/plugin-research-read.js';
const secret='test-secret-not-production';
function seal(data){const key=createHash('sha256').update('momentum-plugin-research-v1:').update(secret).digest();const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',key,iv);const ciphertext=Buffer.concat([c.update(JSON.stringify(data),'utf8'),c.final()]);return {format:'AES-256-GCM',version:1,iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};}
const valid={league:'NFL',gameId:'401873006',classification:'RESEARCH_ONLY_NOT_SPORTSBOOK_OFFER',sportsbookVerified:false,combinedSgpOdds:null,observations:[{type:'player_projection',subject:'Example',description:'Projection only',sourceReference:'Provider'}]};
test('encrypted plugin research decrypts without becoming sportsbook verification',()=>{assert.deepEqual(unsealResearch(seal(valid),secret),valid);});
test('tampered encrypted payload fails authentication',()=>{const data=seal(valid);data.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>unsealResearch(data,secret));});
test('research with forged sportsbook verification is rejected',()=>{assert.throws(()=>unsealResearch(seal({...valid,sportsbookVerified:true}),secret));});
test('wrong encryption key cannot decrypt',()=>{assert.throws(()=>unsealResearch(seal(valid),'other-secret'));});
