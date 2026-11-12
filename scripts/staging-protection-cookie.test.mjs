import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireProtectionCookie} from './staging-protection-cookie.review.mjs';
const origin='https://azzora-shared-staging-unit-faziils-projects.vercel.app';
test('establishes only deployment-scoped share cookie and verifies application denial',async()=>{
  let n=0;
  const result=await acquireProtectionCookie({origin,shareUrl:origin+'/?_vercel_share=synthetic'},async(url,options)=>{
    assert.equal(options.redirect,'manual');n++;
    if(n===1)return new Response(null,{status:307,headers:{location:'/accountant.html','set-cookie':'unit_protection=synthetic; Secure; HttpOnly; Path=/'}});
    assert.equal(options.headers.Cookie,'unit_protection=synthetic');
    if(n===2)return new Response('Fictional page');
    assert.equal(url,origin+'/api/staging/auth/session');
    return new Response('{}',{status:401,headers:{'content-type':'application/json'}});
  });
  assert.equal(n,3);assert.deepEqual(result,{origin,cookie:'unit_protection=synthetic'});
});
test('rejects cross-origin redirects without transmitting the share cookie',async()=>{
  let n=0;
  await assert.rejects(acquireProtectionCookie({origin,shareUrl:origin+'/?_vercel_share=synthetic'},async()=>{n++;return new Response(null,{status:307,headers:{location:'https://vercel.com/login','set-cookie':'unit_protection=synthetic'}});}),/separate authentication/);
  assert.equal(n,1);
});
test('rejects unverified protection responses and mismatched origins',async()=>{
  await assert.rejects(acquireProtectionCookie({origin,shareUrl:'https://unrelated.example.test/?_vercel_share=synthetic'},()=>{throw Error('must not fetch');}),/does not match/);
  await assert.rejects(acquireProtectionCookie({origin,shareUrl:origin+'/?_vercel_share=synthetic'},async()=>new Response('Login page',{headers:{'set-cookie':'unit_protection=synthetic'}})),/not verified/);
});
