// Consume an authorized connector share URL through stdin; never log it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';

export async function acquireProtectionCookie(input, request=fetch) {
  const {origin,shareUrl}=input;
  if(typeof origin!=='string' || !/^https:\/\/azzora-shared-staging-[a-z0-9]+-faziils-projects\.vercel\.app$/.test(origin) || typeof shareUrl!=='string')throw Error('Invalid staging target');
  let url=new URL(shareUrl);
  if(url.origin!==origin || url.username || url.password || !url.searchParams.get('_vercel_share'))throw Error('Share URL does not match this staging deployment');
  const cookies=new Map();
  const collect=response=>{
    for(const value of response.headers.getSetCookie()){
      const pair=value.split(';')[0],index=pair.indexOf('=');
      if(index<=0 || /[\r\n]/.test(pair))throw Error('Invalid protection cookie');
      const name=pair.slice(0,index),content=pair.slice(index+1);
      if(!content || /(?:^|;)\s*max-age=0(?:;|$)/i.test(value))cookies.delete(name);else cookies.set(name,content);
    }
  };
  let complete=false;
  for(let i=0;i<6;i++){
    const response=await request(url.href,{redirect:'manual',headers:cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}});
    collect(response);
    if(response.status>=300 && response.status<400){
      const location=response.headers.get('location');
      if(!location)throw Error('Missing staging redirect');
      url=new URL(location,url);
      if(url.origin!==origin || url.username || url.password)throw Error('Protection requires separate authentication');
    }else{
      if(!response.ok)throw Error('Share access failed');
      complete=true;break;
    }
  }
  if(!complete || !cookies.size)throw Error('No deployment protection cookie established');
  const cookie=[...cookies].map(([k,v])=>`${k}=${v}`).join('; ');
  // A JSON application denial demonstrates that protection accepted the cookie,
  // without logging in, changing access settings, or touching business data.
  const session=await request(`${origin}/api/staging/auth/session`,{redirect:'manual',headers:{Cookie:cookie,Origin:origin}});
  if(session.status!==401 || !session.headers.get('content-type')?.includes('application/json'))throw Error('Protected application access was not verified');
  return {origin,cookie};
}

function privateDirectory(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'azzora-preview-access-'));
  if(process.platform==='win32'){
    const identity=spawnSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8'});
    const sid=identity.status===0 && identity.stdout.match(/S-1-[0-9-]+/)?.[0];
    if(!sid)throw Error('Could not restrict private access directory');
    const acl=spawnSync('icacls',[directory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`],{encoding:'utf8'});
    if(acl.status!==0)throw Error('Could not restrict private access directory');
  }else fs.chmodSync(directory,0o700);
  return directory;
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const lines=createInterface({input:process.stdin,terminal:false});
  try{
    let input;
    for await(const line of lines){if(line.length>16384)throw Error('Input too large');input=JSON.parse(line);break;}
    lines.close();
    const protection=await acquireProtectionCookie(input??{});
    const directory=privateDirectory(),file=path.join(directory,'deployment-protection.private.json');
    fs.writeFileSync(file,JSON.stringify(protection),{flag:'wx',mode:0o600});
    process.stdout.write(file+'\n');
  }catch{
    lines.close();process.stderr.write('Staging protection access could not be established. No credentials were logged.\n');process.exitCode=1;
  }
}
