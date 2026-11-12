/** LOCAL FICTIONAL TEST TARGET ONLY. Never use against a hosted or production project. */
import { spawn } from 'node:child_process';
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import process from 'node:process';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const literal=value=>`'${String(value).replaceAll("'","''")}'`;
function targetConfig(input){
  const u=new URL(input.authUrl);
  if(u.protocol!=='http:' || u.hostname!=='127.0.0.1' || u.pathname!=='/' || u.search || u.hash || u.username || u.password)throw Error('Recovery Auth target must be an explicit loopback origin.');
  if(!['supabase_db_azzora-recovery-auth-isolated-60fe','azzora-recovery-loopback-db'].includes(input.container) || !/^azzora_recovery_[a-z0-9_]+$/.test(input.database) || !['46022','46043'].includes(input.dbPort) || !uuid.test(input.targetId))throw Error('Recovery database must be the explicitly isolated local target.');
  return u.origin;
}
async function sql(config,query){
  return await new Promise((resolve,reject)=>{
    const p=spawn('docker',['exec','-i',config.container,'psql','-U','postgres','-d',config.database,'-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(Error(`Local recovery database rejected the operation (exit ${code}).`)));p.stdin.end(query);
  });
}
async function inspectAuthContainer(id) {
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('Trusted target Auth container is not pinned.');
  return await new Promise((resolve,reject)=>{const p=spawn('docker',['inspect',id],{stdio:['ignore','pipe','ignore']});let out='';p.stdout.on('data',v=>out+=v);p.on('error',reject);p.on('close',code=>code===0?resolve(JSON.parse(out)[0]):reject(Error('Pinned target Auth container unavailable.')));});
}
/** The target authority row must be independently provisioned by the target administrator. */
export async function verifyLocalRecoveryOperator(config,accessToken){
  const origin=targetConfig(config);
  if(!accessToken || accessToken.length>8192)throw Error('An operator access token is required.');
  const authority=JSON.parse(await sql(config,`select json_build_object('operator',a.operator_id,'target',a.target_id,'active',a.active,'auth_container_id',a.auth_container_id,'db_container_id',a.db_container_id,'storage_container_id',a.storage_container_id,'auth_port',a.auth_port,'db_port',a.db_port,'storage_port',a.storage_port,'database_name',a.database_name) from azzora_recovery_control.authority a where a.target_id=${literal(config.targetId)}::uuid;`));
  if(!authority?.active || authority.target!==config.targetId)throw Error('Recovery target authority is not provisioned.');
  const inspected=await inspectAuthContainer(authority.auth_container_id);
  const inspectedDb=await inspectAuthContainer(authority.db_container_id);
  const dbBinds=inspectedDb.NetworkSettings.Ports?.['5432/tcp']||[];
  if(inspectedDb.Id!==authority.db_container_id || inspectedDb.Name!==`/${config.container}` || !dbBinds.some(b=>['127.0.0.1','0.0.0.0'].includes(b.HostIp) && b.HostPort===config.dbPort))throw Error('Pinned local database endpoint differs from target.');
  const env=Object.fromEntries(inspected.Config.Env.map(row=>{const i=row.indexOf('=');return [row.slice(0,i),row.slice(i+1)];}));
  const binds=inspected.NetworkSettings.Ports?.['9999/tcp']||[];
  const port=new URL(origin).port;
  if(authority.auth_port!==port || authority.db_port!==config.dbPort || authority.storage_port!=='46042' || authority.database_name!==config.database)throw Error('Pinned target endpoints differ from the selected configuration.');
  const authDb=new URL(env.GOTRUE_DB_DATABASE_URL);
  if(inspected.Id!==authority.auth_container_id || !binds.some(b=>b.HostIp==='127.0.0.1' && b.HostPort===port) || binds.some(b=>!['127.0.0.1','::1'].includes(b.HostIp)) || authDb.pathname!==`/${config.database}` || authDb.hostname!==config.container)throw Error('Pinned Auth service does not belong to the selected isolated database.');
  const parts=accessToken.split('.');
  if(parts.length!==3)throw Error('Invalid recovery operator token.');
  const header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
  const actual=Buffer.from(parts[2],'base64url'),signed=`${parts[0]}.${parts[1]}`;
  let signatureValid=false;
  if(header.alg==='HS256' && env.GOTRUE_JWT_SECRET){const expected=createHmac('sha256',env.GOTRUE_JWT_SECRET).update(signed).digest();signatureValid=actual.length===expected.length && timingSafeEqual(actual,expected);}
  else if(header.alg==='ES256' && typeof header.kid==='string'){
    const r=await globalThis.fetch(`${origin}/.well-known/jwks.json`,{redirect:'error'});
    if(!r.ok)throw Error('Pinned target signing keys unavailable.');
    const jwks=await r.json(),keys=Array.isArray(jwks.keys)?jwks.keys.filter(k=>k.kid===header.kid && k.kty==='EC' && k.crv==='P-256'):[];
    if(keys.length===1)signatureValid=verify('sha256',Buffer.from(signed),{key:createPublicKey({key:keys[0],format:'jwk'}),dsaEncoding:'ieee-p1363'},actual);
  }
  if(!signatureValid)throw Error('Recovery operator token signature is invalid.');
  const response=await globalThis.fetch(`${origin}/user`,{headers:{Authorization:`Bearer ${accessToken}`},redirect:'error'});
  if(!response.ok)throw Error('Target Auth rejected the recovery operator session.');
  const user=await response.json();
  if(parts.length!==3 || !uuid.test(user.id))throw Error('Invalid recovery operator identity.');
  const claim=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  if(claim.sub!==user.id || claim.aal!=='aal2' || !uuid.test(claim.session_id))throw Error('Recovery operator requires a verified target MFA session.');
  const mfa=Array.isArray(claim.amr) ? claim.amr.find(x=>x.method==='totp') : undefined;
  const now=Math.floor(Date.now()/1000);
  if(!mfa || !Number.isSafeInteger(mfa.timestamp) || mfa.timestamp>now || now-mfa.timestamp>900)throw Error('Recovery operator MFA must be recent.');
  const result=JSON.parse(await sql(config,`select json_build_object('operator',a.operator_id,'target',a.target_id,'active',a.active,'session_valid',exists(select 1 from auth.sessions s where s.id=${literal(claim.session_id)}::uuid and s.user_id=${literal(user.id)}::uuid and (s.not_after is null or s.not_after>now()) and s.aal::text='aal2'),'factor_verified',exists(select 1 from auth.mfa_factors f where f.user_id=${literal(user.id)}::uuid and f.status::text='verified' and f.factor_type::text='totp')) from azzora_recovery_control.authority a where a.target_id=${literal(config.targetId)}::uuid;`));
  if(!result || !result.active || result.operator!==user.id || result.target!==config.targetId || !result.session_valid || !result.factor_verified)throw Error('Recovery operator is not authorized on this isolated target.');
  if(!Number.isSafeInteger(claim.exp) || claim.exp<=now)throw Error('Recovery operator token expired.');
  const binding={authContainerId:authority.auth_container_id,dbContainerId:authority.db_container_id,storageContainerId:authority.storage_container_id??null,authPort:port,dbPort:config.dbPort,database:config.database,storagePort:'46042',dbLoopbackOnly:dbBinds.every(b=>b.HostIp==='127.0.0.1'||b.HostIp==='::1')};
  return {operatorId:user.id,sessionId:claim.session_id,targetId:config.targetId,mfaTimestamp:mfa.timestamp,expires:claim.exp,binding};
}

/** Hash the exact encrypted input and explicit mappings; never infer identity from email. */
export async function recoveryApprovalDigest(archivePath,config,mappings,companyId,nonce,operatorId,binding){
  targetConfig(config);
  if(!uuid.test(companyId) || !uuid.test(operatorId) || !/^[a-f0-9]{64}$/.test(nonce))throw Error('Company, operator and fresh approval nonce are required.');
  const bytes=await readFile(archivePath),archiveSha256=createHash('sha256').update(bytes).digest('hex');
  if(!Array.isArray(mappings) || !mappings.length)throw Error('Explicit reviewed mappings are required.');
  const old=new Set(),replacement=new Set();
  const sorted=mappings.map(m=>{
    if(!m || Object.keys(m).sort().join(',')!=='newUserId,originalUserId' || !uuid.test(m.originalUserId) || !uuid.test(m.newUserId))throw Error('Each mapping must be a unique explicit UUID pair.');
    const originalUserId=m.originalUserId.toLowerCase(),newUserId=m.newUserId.toLowerCase();
    if(old.has(originalUserId) || replacement.has(newUserId))throw Error('Each mapping must be a unique explicit UUID pair.');
    old.add(originalUserId);replacement.add(newUserId);return {originalUserId,newUserId};
  }).sort((a,b)=>a.originalUserId.localeCompare(b.originalUserId));
  const payload={format:binding?'azzora-local-recovery-approval-v2':'azzora-local-recovery-approval-v1',targetId:config.targetId.toLowerCase(),companyId:companyId.toLowerCase(),operatorId:operatorId.toLowerCase(),nonce,archiveSha256,mappings:sorted,...(binding?{binding}:{})};
  return {payload,digest:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
}

/** Execute only after an authenticated operator has independently reviewed the digest. */
export async function applyLocalRecoveryMappings({config,accessToken,archivePath,key,sealKey,companyId,keyId,nonce,mappings,confirmedDigest,tool}) {
  if(!(sealKey instanceof Uint8Array) || sealKey.byteLength!==32)throw Error('Target recovery seal key must be exactly 32 bytes.');
  const operator=await verifyLocalRecoveryOperator(config,accessToken);
  if(!operator.binding.dbLoopbackOnly)throw Error('Recovery database must be published on loopback only.');
  const approval=await recoveryApprovalDigest(archivePath,config,mappings,companyId,nonce,operator.operatorId,operator.binding);
  if(!/^[a-f0-9]{64}$/.test(confirmedDigest) || approval.digest!==confirmedDigest)throw Error('Explicit operator confirmation does not match this recovery mapping.');
  const bytes=await readFile(archivePath);
  if(createHash('sha256').update(bytes).digest('hex')!==approval.payload.archiveSha256)throw Error('Encrypted archive changed after review.');
  const envelope=JSON.parse(bytes.toString('utf8'));
  const clear=tool.decryptBusinessBackup(envelope,key,{companyId,keyId});
  const archive=tool.verifyAuthoritativeStagingArchive(JSON.parse(Buffer.from(clear).toString('utf8')),companyId);
  for(const m of approval.payload.mappings){
    const matches=archive.provenance.memberships.filter(x=>x.userId.toLowerCase()===m.originalUserId && x.active);
    if(matches.length!==1)throw Error('Mapping must refer to one active archived membership.');
  }
  // Revalidate the external Auth service just before the database transaction.
  const current=await verifyLocalRecoveryOperator(config,accessToken);
  if(current.operatorId!==operator.operatorId || current.sessionId!==operator.sessionId || JSON.stringify(current.binding)!==JSON.stringify(operator.binding))throw Error('Recovery operator session or target changed.');
  const a=approval.payload;
  const context=JSON.stringify({...a,approvalDigest:approval.digest,sessionId:current.sessionId,tokenExpires:current.expires,mfaTimestamp:current.mfaTimestamp,version:archive.business.capturedCompanyVersion,data:archive.business.data,memberships:archive.provenance.memberships});
  const seal=createHmac('sha256',sealKey).update(context).digest('hex');
  // Bound parameters keep archive and seal out of SQL statement text and process arguments.
  const {Client}=createRequire(import.meta.url)('pg');
  if(!process.env.AZZORA_RECOVERY_LOCAL_DB_PASSWORD)throw Error('Local recovery database credential is required.');
  const db=new Client({host:'127.0.0.1',port:Number(config.dbPort),database:config.database,user:'postgres',password:process.env.AZZORA_RECOVERY_LOCAL_DB_PASSWORD,application_name:'azzora-local-recovery'});
  await db.connect();
  try {
    const settings=(await db.query("select current_database() db, current_setting('log_statement') statement, current_setting('log_parameter_max_length_on_error') parameter_error_length, current_setting('pgaudit.log_parameter',true) audit_parameters")).rows[0];
    if(settings.db!==config.database || !['none','ddl'].includes(settings.statement) || settings.parameter_error_length!=='0' || (settings.audit_parameters && settings.audit_parameters!=='off'))throw Error('Local target or parameter logging settings are unsafe for recovery.');
    await db.query('begin');
    try {
      // Preserve event/statement monitoring while suppressing sensitive bind values.
      await db.query("set local log_parameter_max_length = 0; set local auto_explain.log_parameter_max_length = 0");
      const logging=(await db.query("select current_setting('log_parameter_max_length') normal, current_setting('auto_explain.log_parameter_max_length') explain")).rows[0];
      if(logging.normal!=='0' || logging.explain!=='0')throw Error('Local parameter logging protections unavailable.');
      await db.query('select azzora_recovery_control.apply_mappings($1,$2)',[context,seal]);await db.query('commit');
    } catch {await db.query('rollback');throw Error('Local mapping transaction failed; no mapping was committed.');}
  } finally {await db.end();}
  return {targetId:a.targetId,companyId:a.companyId,archiveSha256:a.archiveSha256,approvalDigest:approval.digest,mappingCount:a.mappings.length,operatorVerified:true};
}

/** Append a fresh operator confirmation for an already restored exact mapping. */
export async function confirmExistingLocalMapping({config,accessToken,archivePath,key,keyId,sealKey,companyId,nonce,mappings,confirmedDigest,tool}) {
  if(!(sealKey instanceof Uint8Array) || sealKey.byteLength!==32 || !/^[a-f0-9]{64}$/.test(confirmedDigest))throw Error('Target seal and explicit approved digest are required.');
  const operator=await verifyLocalRecoveryOperator(config,accessToken);
  if(!operator.binding.dbLoopbackOnly)throw Error('Recovery database must be published on loopback only.');
  const old=JSON.parse(await sql(config,`select json_build_object('nonce',a.nonce,'archive',a.archive_sha256) from azzora_recovery_control.approvals a where a.target_id=${literal(config.targetId)}::uuid and a.company_id=${literal(companyId)}::uuid and a.operator_id=${literal(operator.operatorId)}::uuid and a.approval_sha256=${literal(confirmedDigest)};`));
  if(!old)throw Error('No matching previous recovery mapping.');
  const legacy=await recoveryApprovalDigest(archivePath,config,mappings,companyId,old.nonce,operator.operatorId);
  const approval=legacy.digest===confirmedDigest?legacy:await recoveryApprovalDigest(archivePath,config,mappings,companyId,old.nonce,operator.operatorId,operator.binding);
  if(approval.digest!==confirmedDigest || approval.payload.archiveSha256!==old.archive)throw Error('Approved mapping does not match the existing archive and target.');
  const bytes=await readFile(archivePath);
  if(createHash('sha256').update(bytes).digest('hex')!==old.archive)throw Error('Encrypted archive changed after review.');
  const archive=tool.verifyAuthoritativeStagingArchive(JSON.parse(Buffer.from(tool.decryptBusinessBackup(JSON.parse(bytes.toString('utf8')),key,{companyId,keyId})).toString('utf8')),companyId);
  for(const m of approval.payload.mappings)if(archive.provenance.memberships.filter(x=>x.userId.toLowerCase()===m.originalUserId && x.active).length!==1)throw Error('Approved mapping is not an active archived membership.');
  if(!/^[a-f0-9]{64}$/.test(nonce) || nonce===old.nonce)throw Error('A fresh confirmation nonce is required.');
  const current=await verifyLocalRecoveryOperator(config,accessToken);
  if(current.operatorId!==operator.operatorId || current.sessionId!==operator.sessionId || JSON.stringify(current.binding)!==JSON.stringify(operator.binding))throw Error('Recovery operator session or target changed.');
  const context=JSON.stringify({targetId:config.targetId,companyId,operatorId:current.operatorId,sessionId:current.sessionId,tokenExpires:current.expires,mfaTimestamp:current.mfaTimestamp,archiveSha256:old.archive,priorApprovalDigest:confirmedDigest,mappings:approval.payload.mappings,nonce,binding:current.binding});
  const seal=createHmac('sha256',sealKey).update(context).digest('hex');
  const {Client}=createRequire(import.meta.url)('pg');
  if(!process.env.AZZORA_RECOVERY_LOCAL_DB_PASSWORD)throw Error('Local recovery database credential is required.');
  const db=new Client({host:'127.0.0.1',port:Number(config.dbPort),database:config.database,user:'postgres',password:process.env.AZZORA_RECOVERY_LOCAL_DB_PASSWORD,application_name:'azzora-local-recovery-confirm'});
  await db.connect();
  try {
    const settings=(await db.query("select current_database() db, current_setting('log_statement') statement, current_setting('log_parameter_max_length_on_error') parameter_error_length, current_setting('pgaudit.log_parameter',true) audit_parameters")).rows[0];
    if(settings.db!==config.database || !['none','ddl'].includes(settings.statement) || settings.parameter_error_length!=='0' || (settings.audit_parameters && settings.audit_parameters!=='off'))throw Error('Local target or parameter logging settings are unsafe for recovery.');
    await db.query('begin');
    try {await db.query("set local log_parameter_max_length = 0; set local auto_explain.log_parameter_max_length = 0");const logging=(await db.query("select current_setting('log_parameter_max_length') normal, current_setting('auto_explain.log_parameter_max_length') explain")).rows[0];if(logging.normal!=='0'||logging.explain!=='0')throw Error('Unsafe parameter logging.');await db.query('select azzora_recovery_control.confirm_existing($1,$2)',[context,seal]);await db.query('commit');}
    catch {await db.query('rollback');throw Error('Local confirmation failed; no receipt was committed.');}
  } finally {await db.end();}
  return {targetId:config.targetId,companyId,archiveSha256:old.archive,approvalDigest:confirmedDigest,confirmationNonce:nonce,operatorVerified:true,previousMappingChanged:false};
}

/** Isolated synthetic recovery only; operator + two separate nonces required. */
export async function recoverLocalApplication({config,accessToken,archivePath,key,keyId,sealKey,companyId,nonce,confirmationNonce,mappings,confirmedDigest,tool}) {
  const operator=await verifyLocalRecoveryOperator(config,accessToken);
  if(!operator.binding.dbLoopbackOnly)throw Error('Recovery database must be published on loopback only.');
  const approval=await recoveryApprovalDigest(archivePath,config,mappings,companyId,nonce,operator.operatorId,operator.binding);
  if(approval.digest!==confirmedDigest || !/^[a-f0-9]{64}$/.test(confirmationNonce) || confirmationNonce===nonce)throw Error('Explicit approved digest and fresh confirmation nonce are required.');
  const bytes=await readFile(archivePath);
  if(createHash('sha256').update(bytes).digest('hex')!==approval.payload.archiveSha256)throw Error('Encrypted archive changed after review.');
  const archive=tool.verifyAuthoritativeStagingArchive(JSON.parse(Buffer.from(tool.decryptBusinessBackup(JSON.parse(bytes.toString('utf8')),key,{companyId,keyId})).toString('utf8')),companyId);
  if(!archive.schemaBundle)throw Error('The staging archive does not contain its reviewed schema bundle.');
  for(const m of approval.payload.mappings)if(archive.provenance.memberships.filter(x=>x.userId.toLowerCase()===m.originalUserId && x.active).length!==1)throw Error('Mapping must refer to one active archived membership.');
  const serviceKey=process.env.AZZORA_RECOVERY_LOCAL_SERVICE_KEY;
  if(!serviceKey || !process.env.AZZORA_RECOVERY_LOCAL_DB_PASSWORD || !(sealKey instanceof Uint8Array) || sealKey.byteLength!==32)throw Error('Local-only recovery service, database and seal credentials are required.');
  const authority=JSON.parse(await sql(config,`select json_build_object('storage_container_id',a.storage_container_id) from azzora_recovery_control.authority a where a.target_id=${literal(config.targetId)}::uuid and a.operator_id=${literal(operator.operatorId)}::uuid and a.active;`));
  const storage=await inspectAuthContainer(authority?.storage_container_id);
  const storageEnv=Object.fromEntries(storage.Config.Env.map(row=>{const i=row.indexOf('=');return [row.slice(0,i),row.slice(i+1)];}));
  const storageDb=new URL(storageEnv.DATABASE_URL),binds=storage.NetworkSettings.Ports?.['5000/tcp']||[];
  if(storage.Id!==authority.storage_container_id || storage.Id!==operator.binding.storageContainerId || storageDb.hostname!==config.container || storageDb.pathname!==`/${config.database}` || storageEnv.STORAGE_BACKEND!=='file' || !binds.some(b=>b.HostIp==='127.0.0.1'&&b.HostPort==='46042') || binds.some(b=>!['127.0.0.1','::1'].includes(b.HostIp)))throw Error('Pinned private Storage does not belong to the isolated target.');
  const storageHeaders={Authorization:`Bearer ${serviceKey}`,apikey:serviceKey},storageOrigin='http://127.0.0.1:46042';
  const bucket=await globalThis.fetch(`${storageOrigin}/bucket/azzora-private`,{headers:storageHeaders,redirect:'error'});if(!bucket.ok || (await bucket.json()).public!==false)throw Error('Target private bucket is unavailable. No business restore was started.');
  const authOrigin=targetConfig(config),adminHeaders={Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'};
  const historical=new Set([...archive.provenance.memberships.map(m=>m.userId),...archive.provenance.assignments.map(m=>m.user_id),...archive.provenance.journals.map(m=>m.actorId),...archive.provenance.snapshots.map(m=>m.capturedBy),...archive.provenance.auditEvents.map(m=>m.actorId),...archive.provenance.commandReceipts.map(m=>m.actorId)]);
  if([...historical].some(id=>id.toLowerCase()===operator.operatorId.toLowerCase() || approval.payload.mappings.some(m=>m.newUserId===id.toLowerCase())))throw Error('Historical and replacement identities must be distinct.');
  for(const id of historical){
    const url=`${authOrigin}/admin/users/${id}`,existing=await globalThis.fetch(url,{headers:adminHeaders,redirect:'error'});
    let user;
    if(existing.status===404){const r=await globalThis.fetch(`${authOrigin}/admin/users`,{method:'POST',headers:adminHeaders,redirect:'error',body:JSON.stringify({id,email:`retired-${id}@example.test`,password:randomBytes(32).toString('base64url'),email_confirm:false,ban_duration:'876000h'})});if(!r.ok)throw Error('Target Auth could not provision a historical identity.');user=await r.json();}
    else if(existing.ok)user=await existing.json();else throw Error('Target Auth could not inspect a historical identity.');
    if(user.id?.toLowerCase()!==id.toLowerCase() || !user.banned_until || Date.parse(user.banned_until)<Date.now()+50*365*86400_000)throw Error('Historical identity is not disabled on the target.');
  }
  const current=await verifyLocalRecoveryOperator(config,accessToken);
  if(current.operatorId!==operator.operatorId || current.sessionId!==operator.sessionId || JSON.stringify(current.binding)!==JSON.stringify(operator.binding))throw Error('Recovery operator session or target changed.');
  const a=approval.payload,context=JSON.stringify({...a,approvalDigest:approval.digest,sessionId:current.sessionId,tokenExpires:current.expires,mfaTimestamp:current.mfaTimestamp,version:archive.business.capturedCompanyVersion,data:archive.business.data,provenance:archive.provenance});
  const seal=createHmac('sha256',sealKey).update(context).digest('hex'),{Client}=createRequire(import.meta.url)('pg');
  const db=new Client({host:'127.0.0.1',port:Number(config.dbPort),database:config.database,user:'postgres',password:process.env.AZZORA_RECOVERY_LOCAL_DB_PASSWORD,application_name:'azzora-local-recovery-restore'});await db.connect();
  try{const settings=(await db.query("select current_database() db,current_setting('log_statement') statement,current_setting('log_parameter_max_length_on_error') parameter_error_length,current_setting('pgaudit.log_parameter',true) audit_parameters")).rows[0];if(settings.db!==config.database||!['none','ddl'].includes(settings.statement)||settings.parameter_error_length!=='0'||(settings.audit_parameters&&settings.audit_parameters!=='off'))throw Error('Local recovery logging settings are unsafe.');await db.query('begin');try{await db.query('set local log_parameter_max_length=0; set local auto_explain.log_parameter_max_length=0');await db.query('select azzora_recovery_control.restore_business($1,$2)',[context,seal]);await db.query('commit');}catch(error){await db.query('rollback');const detail=/^Recovery restore rejected at (authorization|clean-target-receipt|company|parties|departments|projects|assignments|records|accounts|periods|journals|snapshots|audit|command-receipts|allocations|canonical-check) \([A-Z0-9]{5}\); transaction rolled back$/.test(error.message||'') ? ' '+error.message : '';throw Error('Local business restore failed; no business rows were committed.'+detail);}}finally{await db.end();}
  for(const original of archive.business.originals){const content=Buffer.from(original.base64,'base64');if(createHash('sha256').update(content).digest('hex')!==original.sha256)throw Error('Archive original integrity failed.');const url=`${storageOrigin}/object/azzora-private/${original.objectKey}`;const r=await globalThis.fetch(url,{method:'POST',headers:{...storageHeaders,'Content-Type':original.mime,'x-upsert':'false'},body:content,redirect:'error'});if(!r.ok)throw Error('Target private original could not be restored.');const check=await globalThis.fetch(url,{headers:storageHeaders,redirect:'error'});if(!check.ok || createHash('sha256').update(Buffer.from(await check.arrayBuffer())).digest('hex')!==original.sha256)throw Error('Restored private original failed integrity verification.');}
  await applyLocalRecoveryMappings({config,accessToken,archivePath,key,keyId,sealKey,companyId,nonce,mappings,confirmedDigest,tool});
  await confirmExistingLocalMapping({config,accessToken,archivePath,key,keyId,sealKey,companyId,nonce:confirmationNonce,mappings,confirmedDigest,tool});
  return {localOnly:true,archiveSha256:a.archiveSha256,approvalDigest:approval.digest,originalsRestored:archive.business.originals.length,mappingsApplied:a.mappings.length,liveSchemaVerified:false,applicationAccessVerified:false};
}

