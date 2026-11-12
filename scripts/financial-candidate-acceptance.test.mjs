// Synthetic transport checks only; no provider, database, or hosted request.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

test('native transport preserves protection, individual login, MFA and action headers',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'azzora-synthetic-transport-'));
  try {
    const origin='https://azzora-shared-staging-unittest-faziils-projects.vercel.app';
    const fixture=path.join(dir,'credentials.json'),protection=path.join(dir,'protection.json'),mock=path.join(dir,'mock.mjs');
    fs.writeFileSync(fixture,JSON.stringify({email:'fictional@example.test',password:'unit-fixture-only',totpSecret:'JBSWY3DPEHPK3PXP'}));
    fs.writeFileSync(protection,JSON.stringify({origin,cookie:'unit_protection=synthetic'}));
    fs.writeFileSync(mock,`import assert from 'node:assert/strict';
Date.now=()=>1794405601000;
globalThis.fetch=async(url,options)=>{
assert.equal(options.redirect,'error');assert.equal(options.headers.Origin,${JSON.stringify(origin)});
assert.ok(options.headers.Cookie.includes('unit_protection=synthetic'));
const route=new URL(url).pathname;
if(route.endsWith('/auth/login'))return new Response(JSON.stringify({status:'mfa-challenge',csrf:'challenge-csrf'}),{headers:{'Set-Cookie':'__Host-azzora_staging=challenge; Secure; HttpOnly'}});
if(route.endsWith('/auth/mfa/verify')){assert.ok(options.headers.Cookie.includes('__Host-azzora_staging=challenge'));assert.equal(options.headers['X-Azzora-CSRF'],'challenge-csrf');assert.match(JSON.parse(options.body).code,/^[0-9]{6}$/);return new Response('{}',{headers:{'Set-Cookie':'__Host-azzora_staging=verified; Secure; HttpOnly'}});}
assert.ok(options.headers.Cookie.includes('__Host-azzora_staging=verified'));
if(route.endsWith('/auth/session'))return new Response(JSON.stringify({csrf:'action-csrf'}));
if(route.endsWith('/accounts/snapshot'))return new Response(JSON.stringify({version:7,invoices:[{id:'fictional-invoice',outstandingFils:'1000'}],receipts:[]}));
if(route.endsWith('/accounts/action')){assert.equal(options.method,'POST');assert.equal(options.headers['X-Azzora-CSRF'],'action-csrf');assert.equal(options.headers['X-Azzora-Expected-Version'],'7');assert.ok(options.headers['X-Azzora-Idempotency-Key']);return new Response('{}');}
throw Error('Unexpected fixture route');};`);
    const script=fileURLToPath(new URL('./financial-candidate-acceptance.review.mjs',import.meta.url));
    const env={...process.env,AZZORA_PREVIEW_ORIGIN:origin,AZZORA_FIXTURE_CREDENTIALS:fixture,AZZORA_PRIVATE_DIR:dir,AZZORA_PROTECTION_COOKIE_FILE:protection,AZZORA_SETTLEMENT:'receipt',AZZORA_CASE:'native-unit',AZZORA_AMOUNT:'1.00'};
    for(const mode of ['prepare','send']){
      const result=spawnSync(process.execPath,['--import',pathToFileURL(mock).href,script,mode],{env,encoding:'utf8',timeout:20000});
      assert.equal(result.status,0,result.stderr);
      assert.ok(JSON.parse(result.stdout)[mode==='prepare'?'prepared':'status']);
    }
    fs.writeFileSync(protection,JSON.stringify({origin:'https://unrelated.example.test',cookie:'unit_protection=synthetic'}));
    const rejected=spawnSync(process.execPath,['--import',pathToFileURL(mock).href,script,'send'],{env,encoding:'utf8'});
    assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/does not match this exact deployment/);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(dir,{recursive:true});
  }
});
