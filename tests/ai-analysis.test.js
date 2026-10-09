import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai-analysis.js';

function mock(method='POST', body={},headers={}) {
 const req={method,body,headers};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
 return {req,res};
}
const old=process.env.GROQ_API_KEY;
test('rejects non-POST methods',async()=>{const {req,res}=mock('GET');await handler(req,res);assert.equal(res.statusCode,405)});
test('fails safely without a key',async()=>{delete process.env.GROQ_API_KEY;const {req,res}=mock();await handler(req,res);assert.equal(res.statusCode,503);assert.equal(res.body.error,'ai_not_configured')});
test('rejects unrecognized modes',async()=>{process.env.GROQ_API_KEY='test-only';const {req,res}=mock('POST',{mode:'delete',data:{gameId:'123'}});await handler(req,res);assert.equal(res.statusCode,400)});
test('rejects missing evidence',async()=>{process.env.GROQ_API_KEY='test-only';const {req,res}=mock('POST',{mode:'matchup'});await handler(req,res);assert.equal(res.statusCode,400)});
test('rejects oversized payload',async()=>{process.env.GROQ_API_KEY='test-only';const {req,res}=mock('POST',{mode:'matchup',data:{rows:Array.from({length:25},(_,i)=>({id:i,text:'x'.repeat(500)}))}});await handler(req,res);assert.equal(res.statusCode,413)});
test('blocks unknown origins',async()=>{process.env.GROQ_API_KEY='test-only';const {req,res}=mock('POST',{mode:'matchup',data:{gameId:'123'}},{origin:'https://untrusted.example'});await handler(req,res);assert.equal(res.statusCode,403)});
test.after(()=>{if(old===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=old});
