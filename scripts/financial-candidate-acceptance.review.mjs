// Fictional staging acceptance only. No credentials or document content are logged.
// See docs/coordination/FINANCIAL-CANDIDATE-TEST-RUNBOOK.md for prerequisites.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHmac } from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setTimeout, clearTimeout } from 'node:timers';
import console from 'node:console';
const { AZZORA_PREVIEW_ORIGIN: origin, AZZORA_FIXTURE_CREDENTIALS: credentialsPath,
  AZZORA_PRIVATE_DIR: privateDir, AZZORA_VERCEL_CLI: cli, AZZORA_CASE: testCase,
  AZZORA_SETTLEMENT: settlement, AZZORA_AMOUNT: amount = '1.00',
  AZZORA_PROTECTION_COOKIE_FILE: protectionPath } = process.env;
if (!origin || !/^https:\/\/azzora-shared-staging-[a-z0-9]+-faziils-projects\.vercel\.app$/.test(origin) ||
    !credentialsPath || !privateDir || (!cli && !protectionPath) || !/^[a-z0-9-]{3,40}$/.test(testCase || '') ||
    !['receipt','supplier-payment'].includes(settlement)) throw Error('Missing or unsafe staging configuration');
if (!/^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(amount)) throw Error('Use a positive exact two-decimal AED amount');
const amountFils = BigInt(amount.replace('.', ''));
if (amountFils <= 0n) throw Error('Amount must be positive');
let protectionCookie;
if (protectionPath) {
  if (!path.isAbsolute(protectionPath) || fs.lstatSync(protectionPath).isSymbolicLink()) throw Error('Protection cookie requires an absolute private regular file');
  const protection = JSON.parse(fs.readFileSync(protectionPath, 'utf8'));
  if (protection.origin !== origin || typeof protection.cookie !== 'string' ||
      !protection.cookie || /[\r\n]/.test(protection.cookie)) throw Error('Protection cookie does not match this exact deployment');
  protectionCookie = protection.cookie;
}
const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
const pending = path.join(privateDir, `acceptance-${testCase}.private`);
function totp(secret) {
  let bits=''; for (const c of secret.replace(/=+$/,'').toUpperCase()) {
    const i='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c); if(i<0) throw Error('Bad fixture'); bits+=i.toString(2).padStart(5,'0');
  }
  const key=Buffer.from(bits.match(/.{8}/g).map(x=>parseInt(x,2))), counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const h=createHmac('sha1',key).update(counter).digest(), offset=h[h.length-1]&15;
  return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
function headers(cookie,csrf,extra={}) {
  const file=path.join(privateDir,`acceptance-header-${randomUUID()}.private`);
  const entries=[`Origin: ${origin}`,'Content-Type: application/json'];
  if(cookie) entries.push(`Cookie: ${cookie}`); if(csrf) entries.push(`X-Azzora-CSRF: ${csrf}`);
  for(const [name,value] of Object.entries(extra)) entries.push(`${name}: ${value}`);
  fs.writeFileSync(file,entries.join('\n')+'\n',{flag:'wx',mode:0o600}); return file;
}
function parse(output) {
  const i=output.indexOf('\r\n\r\n'); if(i<0) throw Error('Missing HTTP response');
  const head=output.slice(0,i); let data; try { data=JSON.parse(output.slice(i+4)); } catch { data={}; }
  return {status:Number(head.match(/^HTTP\/\S+\s+(\d+)/)?.[1]),cookie:head.match(/^set-cookie:\s*([^;\r\n]+)/im)?.[1],data};
}
async function nativeRequest(route,body,cookie,csrf,extra={},signal) {
  const start = Date.now();
  const h = {'Origin':origin,'Content-Type':'application/json',...extra};
  h.Cookie = [protectionCookie,cookie].filter(Boolean).join('; ');
  if (csrf) h['X-Azzora-CSRF'] = csrf;
  const response = await fetch(`${origin}/api/staging${route}`, {
    method:body ? 'POST' : 'GET',headers:h,body:body ? JSON.stringify(body) : undefined,
    redirect:'error',signal,
  });
  let data; try { data = await response.json(); } catch { data = {}; }
  const sessionCookie = response.headers.getSetCookie().find(v=>v.startsWith('__Host-azzora_staging='))?.split(';')[0];
  return {status:response.status,cookie:sessionCookie,data,elapsed:Date.now()-start};
}
async function request(route,body,cookie,csrf,extra={}) {
  if (protectionCookie) return nativeRequest(route,body,cookie,csrf,extra);
  const h=headers(cookie,csrf,extra); try {
    const args=[cli,'curl',`${origin}/api/staging${route}`,'-i','--header','@'+h]; if(body) args.push('--data-binary','@-');
    const start=Date.now(), r=spawnSync(process.execPath,args,{input:body?JSON.stringify(body):undefined,encoding:'utf8',maxBuffer:30*1024*1024});
    if(r.status!==0) throw Error('Preview transport failed'); return {...parse(r.stdout),elapsed:Date.now()-start};
  } finally { fs.unlinkSync(h); }
}
const actionHeaders=p=>({'X-Azzora-Expected-Version':String(p.version),'X-Azzora-Idempotency-Key':p.key});
async function asynchronousSend(p, interrupt=false) {
  if (protectionCookie) {
    const controller = new AbortController(), start = Date.now();
    const timer = interrupt ? setTimeout(()=>controller.abort(),2500) : null;
    try { const r=await nativeRequest('/accounts/action',p.action,p.cookie,p.csrf,actionHeaders(p),controller.signal); return {status:r.status,elapsed:r.elapsed}; }
    catch (e) { if (interrupt && e.name==='AbortError') return {interrupted:true,elapsed:Date.now()-start}; throw Error('Preview transport failed; reconcile before any retry'); }
    finally { if(timer)clearTimeout(timer); }
  }
  const h=headers(p.cookie,p.csrf,actionHeaders(p));
  try { return await new Promise((resolve,reject)=>{
    const start=Date.now(), proc=spawn(process.execPath,[cli,'curl',`${origin}/api/staging/accounts/action`,'-i','--header','@'+h,'--data-binary','@-'],{stdio:['pipe','pipe','ignore']});
    const chunks=[]; proc.stdout.on('data',x=>chunks.push(x)); proc.on('error',reject);
    const timer=interrupt ? setTimeout(()=>proc.kill(),2500) : null;
    proc.on('close',(code,signal)=>{if(timer)clearTimeout(timer); if(signal)return resolve({interrupted:true,elapsed:Date.now()-start});
      if(code!==0)return reject(Error('Preview transport failed')); resolve({status:parse(Buffer.concat(chunks).toString()).status,elapsed:Date.now()-start});});
    proc.stdin.end(JSON.stringify(p.action));
  }); } finally { fs.unlinkSync(h); }
}
const mode=process.argv[2];
if(mode==='prepare') {
  const login=await request('/auth/login',{email:creds.email,password:creds.password,workspace:'accountant'});
  if(login.status!==200 || login.data.status!=='mfa-challenge')throw Error('Expected fictional MFA challenge');
  if((30000-Date.now()%30000)<12000)await new Promise(r=>setTimeout(r,30000-Date.now()%30000+250));
  const verify=await request('/auth/mfa/verify',{code:totp(creds.totpSecret)},login.cookie,login.data.csrf);
  if(verify.status!==200 || !verify.cookie)throw Error('Fictional MFA failed');
  const session=await request('/auth/session',null,verify.cookie);
  const snap=await request('/accounts/snapshot?asOf=2026-11-11&from=2026-01-01&to=2026-11-11',null,verify.cookie);
  if(session.status!==200 || snap.status!==200)throw Error('Fictional session or snapshot failed');
  const isReceipt=settlement==='receipt', documents=isReceipt?snap.data.invoices:snap.data.bills;
  const item=documents?.find(x=>BigInt(x.outstandingFils??'0')>=amountFils); if(!item)throw Error('No issued fictional document has adequate outstanding value');
  const id=`acceptance-${testCase}-${randomUUID()}`;
  const action={kind:settlement,id,documentId:item.id,date:'2026-11-11',amount,account:'bank',reference:`Fictional ${id}`};
  const values=isReceipt?snap.data.receipts:snap.data.supplierPayments;
  fs.writeFileSync(pending,JSON.stringify({cookie:verify.cookie,csrf:session.data.csrf,version:snap.data.version,id,key:randomUUID(),action,documentId:item.id,outstanding:item.outstandingFils,count:values.length}),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({prepared:true,version:snap.data.version,count:values.length,outstandingFils:item.outstandingFils}));
} else if(['parallel','distinct','interrupt','send','delayed','retry','mismatch','check'].includes(mode)) {
  const p=JSON.parse(fs.readFileSync(pending,'utf8'));
  if(mode==='parallel') console.log(JSON.stringify({results:await Promise.all([asynchronousSend(p),asynchronousSend(p)])}));
  if(mode==='distinct') { const q={...p,id:`acceptance-${testCase}-${randomUUID()}`,key:randomUUID()}; q.action={...p.action,id:q.id,reference:`Fictional ${q.id}`};
    fs.writeFileSync(pending+'.second',JSON.stringify(q),{flag:'wx',mode:0o600}); console.log(JSON.stringify({results:await Promise.all([asynchronousSend(p),asynchronousSend(q)])})); }
  if(mode==='interrupt') console.log(JSON.stringify(await asynchronousSend(p,true)));
  if(mode==='delayed') { await new Promise(r=>setTimeout(r,5000)); const x=await request('/accounts/action',p.action,p.cookie,p.csrf,actionHeaders(p)); console.log(JSON.stringify({status:x.status,elapsed:x.elapsed})); }
  if(mode==='send'||mode==='retry'||mode==='mismatch') { const action=mode==='mismatch'?{...p.action,amount:p.action.amount==='2.00'?'3.00':'2.00'}:p.action;
    const x=await request('/accounts/action',action,p.cookie,p.csrf,actionHeaders(p)); console.log(JSON.stringify({status:x.status,elapsed:x.elapsed})); }
  if(mode==='check') { const x=await request('/accounts/snapshot?asOf=2026-11-11&from=2026-01-01&to=2026-11-11',null,p.cookie);
    const receipt=settlement==='receipt', items=receipt?x.data.receipts:x.data.supplierPayments, docs=receipt?x.data.invoices:x.data.bills;
    console.log(JSON.stringify({status:x.status,beforeVersion:p.version,version:x.data.version,beforeCount:p.count,count:items?.length,
      matching:items?.filter(v=>v.id===p.id).length,beforeOutstandingFils:p.outstanding,outstandingFils:docs?.find(v=>v.id===p.documentId)?.outstandingFils,
      trialBalanced:x.data.trial?.balanced,balanceBalanced:x.data.balance?.balanced})); }
} else throw Error('Unknown acceptance mode');
