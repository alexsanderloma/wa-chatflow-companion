import { test } from 'node:test';
import assert from 'node:assert/strict';
import {gatewayChat, gatewaySafeError} from './ai-gateway.server.ts';
const dependencies={access:async()=>{},pause:async()=>{},record:async()=>{}};
test('split metadata and empty frames do not strand streaming; usage recorded',async()=>{
 const original=fetch,key=process.env.LOVABLE_API_KEY;process.env.LOVABLE_API_KEY='offline';
 const encoder=new TextEncoder();let recorded;
 globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){for(const part of [': ping\n\n','data: {"choices":[]}\n\n','data: {"choices":[{"delta":{"content":"O','K"}}]}\n\n','data: {"usage":{"prompt_tokens":500,"completion_tokens":200},"choices":[]}\n\n','data: [DONE]\n\n'])controller.enqueue(encoder.encode(part));controller.close();}}));
 try {assert.equal(await gatewayChat([{role:'user',content:'oi'}],undefined,{}, {...dependencies,record:async(_,row)=>{recorded=row;}}),'OK');assert.equal(recorded.input,500);assert.equal(recorded.output,200);}finally{globalThis.fetch=original;if(key===undefined)delete process.env.LOVABLE_API_KEY;else process.env.LOVABLE_API_KEY=key;}
});
test('credit/provider blocks pause durably with no retry',async()=>{
 const original=fetch,key=process.env.LOVABLE_API_KEY;process.env.LOVABLE_API_KEY='offline';
 try{for(const status of [402,403]){let calls=0,paused=0;globalThis.fetch=async()=>{calls++;return Response.json({message:'Acesso bloqueado com motivo seguro'},{status});};await assert.rejects(gatewayChat([{role:'user',content:'oi'}],undefined,{}, {...dependencies,pause:async()=>{paused++;}}),/motivo seguro/);assert.equal(calls,1);assert.equal(paused,1);}}finally{globalThis.fetch=original;if(key===undefined)delete process.env.LOVABLE_API_KEY;else process.env.LOVABLE_API_KEY=key;}
});
test('404 and refusals end request without replay',async()=>{
 const original=fetch,key=process.env.LOVABLE_API_KEY;process.env.LOVABLE_API_KEY='offline';
 try {let calls=0;globalThis.fetch=async()=>{calls++;return new Response('raw secret body',{status:404});};await assert.rejects(gatewayChat([{role:'user',content:'oi'}],undefined,{},dependencies),/HTTP 404/);assert.equal(calls,1);
 globalThis.fetch=async()=>new Response('data: {"choices":[{"delta":{},"finish_reason":"refusal"}]}\n\ndata: [DONE]\n\n');await assert.rejects(gatewayChat([{role:'user',content:'oi'}],undefined,{},dependencies),/não pôde responder/);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.LOVABLE_API_KEY;else process.env.LOVABLE_API_KEY=key;}
});
test('429 retains temporary-limit fallback',()=>assert.match(gatewaySafeError(429),/Limite temporário/));