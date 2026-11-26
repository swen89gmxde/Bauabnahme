import assert from 'node:assert/strict';
import {saveOfferWithRecovery} from '../angebote/upload-recovery.mjs';
const request='f'.repeat(32),form={},result={id:'synthetic',token:'synthetic'};
let calls=[];
assert.equal(await saveOfferWithRecovery(async action=>{calls.push(action);return result;},form,request),result);assert.deepEqual(calls,['create']);
for(const code of ['network_error','invalid_response','server_error']){
 calls=[];const actual=await saveOfferWithRecovery(async action=>{calls.push(action);if(action==='create')throw Object.assign(Error('lost response'),{code});return result;},form,request);
 assert.equal(actual,result);assert.deepEqual(calls,['create','create-result&request='+request]);
}
calls=[];await assert.rejects(()=>saveOfferWithRecovery(async action=>{calls.push(action);throw Object.assign(Error('permission'),{code:'csrf'});},form,request),/permission/);assert.deepEqual(calls,['create']);
calls=[];await assert.rejects(()=>saveOfferWithRecovery(async action=>{calls.push(action);throw Object.assign(Error('offline'),{code:'network_error'});},form,request),/keine doppelte Freigabe/);assert.equal(calls.filter(x=>x==='create').length,1);
await assert.rejects(()=>saveOfferWithRecovery(async action=>{throw Object.assign(Error('already closed'),{code:action==='create'?'network_error':'create_closed'});},form,request),/already closed/);
console.log('Upload recovery: lost-response lookup, no automatic write retry, validation errors and offline fallback passed.');
