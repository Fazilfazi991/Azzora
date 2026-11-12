import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryApprovalDigest,verifyLocalRecoveryOperator} from './recovery-local-operator.mjs';
const config={authUrl:'http://127.0.0.1:46035/',container:'supabase_db_azzora-recovery-auth-isolated-60fe',database:'azzora_recovery_test',dbPort:'46022',targetId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
const company='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',operator='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',nonce='c'.repeat(64),path='package.json';
const first={originalUserId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',newUserId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'};
test('approval binds archive, target, company, nonce and canonical mapping',async()=>{
  const a=await recoveryApprovalDigest(path,config,[first],company,nonce,operator);
  const same=await recoveryApprovalDigest(path,config,[{originalUserId:first.originalUserId.toUpperCase(),newUserId:first.newUserId.toUpperCase()}],company,nonce,operator);
  assert.equal(a.digest,same.digest);
  assert.notEqual(a.digest,(await recoveryApprovalDigest(path,config,[first],company,'d'.repeat(64),operator)).digest);
  assert.notEqual(a.digest,(await recoveryApprovalDigest(path,{...config,targetId:'ffffffff-ffff-4fff-8fff-ffffffffffff'},[first],company,nonce,operator)).digest);
  const binding={authContainerId:'a'.repeat(64),dbContainerId:'b'.repeat(64),storageContainerId:'c'.repeat(64),authPort:'46035',dbPort:'46022',database:config.database,storagePort:'46042'};
  const bound=await recoveryApprovalDigest(path,config,[first],company,nonce,operator,binding);
  assert.notEqual(bound.digest,(await recoveryApprovalDigest(path,config,[first],company,nonce,operator,{...binding,storageContainerId:'d'.repeat(64)})).digest);
  await assert.rejects(recoveryApprovalDigest(path,config,[first,{...first,originalUserId:first.originalUserId.toUpperCase()}],company,nonce,operator),/unique/);
});
test('rejects nonlocal and unapproved targets before network access',async()=>{
  await assert.rejects(verifyLocalRecoveryOperator({...config,authUrl:'https://example.com/'},'fake'),/loopback/);
  await assert.rejects(recoveryApprovalDigest(path,{...config,container:'unrelated'},[first],company,nonce,operator),/isolated/);
});
