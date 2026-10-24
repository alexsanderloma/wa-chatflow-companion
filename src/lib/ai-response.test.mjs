import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reserveResponse,sendAccountedPart,finishResponse,confirmDeliveryEvent} from './ai-response.server.ts';
test('RPC errors are not confused with empty credits',async()=>{
 await assert.rejects(reserveResponse({rpc:async()=>({error:{message:'offline'}})},'company','source'),/Falha ao reservar/);
});
test('no-credit and duplicate decisions preserve durable RPC result',async()=>{
 for(const status of ['no_credits','pending'])assert.equal((await reserveResponse({rpc:async()=>({data:{claimed:false,status},error:null})},'company','source')).status,status);
});
function admin(status){const updates=[],calls=[];return {updates,calls,rpc:async(name,data)=>{calls.push({name,data});return {error:null};},from:()=>({insert:()=>({select:()=>({single:async()=>({data:{id:'part'},error:null})})}),update:data=>({eq:async()=>{updates.push(data);return {error:null};}})})};}
test('accepted pending part does not charge as delivered',async()=>{const a=admin();assert.deepEqual(await sendAccountedPart(a,'response','company',0,async()=>({key:{id:'w1'},status:'PENDING'})),{delivered:false,accepted:true,uncertain:false});assert.equal(a.calls.length,0);assert.equal(a.updates[0].status,'accepted');});
test('confirmed delivery requests one logical response charge',async()=>{const a=admin();await sendAccountedPart(a,'response','company',0,async()=>({key:{id:'w1'},status:'DELIVERY_ACK'}));assert.equal(a.calls.length,1);assert.equal(a.calls[0].data._outcome,'delivered');});
test('network send failure remains uncertain without replay',async()=>{const a=admin();let sent=0;const r=await sendAccountedPart(a,'r','c',0,async()=>{sent++;throw new Error('offline');});assert.equal(r.uncertain,true);assert.equal(sent,1);assert.equal(a.calls.length,0);});
test('explicit rejection is a known failure',async()=>{const a=admin();const r=await sendAccountedPart(a,'r','c',0,async()=>{throw {status:400};});assert.equal(r.uncertain,false);assert.equal(a.updates[0].status,'failed');});
test('delivery event ignores acceptance and handles true acknowledgement',async()=>{const a=admin();await confirmDeliveryEvent(a,'c',[{key:{id:'x'},update:{status:'SERVER_ACK'}},{key:{id:'y'},update:{status:'DELIVERY_ACK'}}]);assert.equal(a.calls.length,1);assert.equal(a.calls[0].data._whatsapp_id,'y');});
test('release RPC errors surface instead of inventing refund',async()=>{await assert.rejects(finishResponse({rpc:async()=>({error:{}})},'r','released'),/conciliar/);});