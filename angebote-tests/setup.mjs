// Synthetic initial setup only. No real passwords, activation links or customer data.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomBytes,createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),modules=process.env.PHP_WASM_MODULE_ROOT||path.join(root,'node_modules');
const {PHP,PHPRequestHandler}=await import(pathToFileURL(path.join(modules,'@php-wasm/universal/index.js'))),{loadNodeRuntime,useHostFilesystem}=await import(pathToFileURL(path.join(modules,'@php-wasm/node/index.js')));
const fixture=path.join(root,'angebote-tests/private-setup-'+randomBytes(8).toString('hex')),web=path.join(fixture,'public'),privateDir=path.join(fixture,'sichtwerk-signieren-private');
fs.cpSync(path.join(root,'angebote'),web,{recursive:true});fs.mkdirSync(privateDir,{recursive:true});
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));useHostFilesystem(php);
const handler=new PHPRequestHandler({php,documentRoot:web,absoluteUrl:'https://setup.test',cookieStore:false});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),grantPath=path.join(privateDir,'setup-grant.json'),configPath=path.join(privateDir,'config.php');
let checks=0;const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const client=()=>({cookies:{},csrf:''}),owner=client(),stranger=client();
function grant(expires=Math.floor(Date.now()/1000)+3600){const token=randomBytes(32).toString('hex');fs.writeFileSync(grantPath,JSON.stringify({origin:'https://setup.test',expires,token_hash:hash(token)}));return token;}
async function call(c,url,{method='GET',body,origin='https://setup.test',csrf=c.csrf}={}){
 const headers={Cookie:Object.entries(c.cookies).map(([k,v])=>k+'='+v).join('; ')};
 if(method==='POST'){headers.Origin=origin;headers['X-CSRF-Token']=csrf;if(typeof body==='string')headers['Content-Type']='application/json';else if(body){headers['Content-Type']='application/x-www-form-urlencoded; charset=UTF-8';body=new TextEncoder().encode(new URLSearchParams(body).toString());}}
 const r=await handler.request({url,method,headers,body:typeof body==='string'?new TextEncoder().encode(body):body});
 for(const [key,values] of Object.entries(r.headers))if(key.toLowerCase()==='set-cookie')for(const value of values){const first=value.split(';')[0],i=first.indexOf('=');c.cookies[first.slice(0,i)]=first.slice(i+1);}
 const match=r.text.match(/name="setup-csrf" content="([a-f0-9]+)"/);if(match)c.csrf=match[1];return r;
}
async function expect(c,url,status,options){const r=await call(c,url,options);assert.equal(r.httpStatusCode,status,url+': '+r.text.slice(0,200));checks++;return r;}
const page='/server/setup.php',unlock=page+'?phase=unlock',json=r=>JSON.parse(r.text),unlockBody=token=>({method:'POST',body:JSON.stringify({token})}),form=(c,password,repeat=password)=>({method:'POST',body:{csrf:c.csrf,password,repeat}});
try{
 for(const name of ['setup.php','setup-store.php']){const r=await php.run({code:`<?php token_get_all(file_get_contents('${web}/server/${name}'),TOKEN_PARSE);echo 'OK';`});eq(r.text,'OK');}
 await expect(owner,page,404);const expired=grant(Math.floor(Date.now()/1000)-60);await expect(owner,page,404);
 const token=grant();let r=await expect(owner,page,200);eq(r.text.includes('name="password"'),false);eq(r.text.includes(token),false);eq(r.text.includes(hash(token)),false);
 // The native password form must keep its same-origin Origin (Fetch standard section 3.2).
 eq(Object.entries(r.headers).filter(([key])=>key.toLowerCase()==='referrer-policy').flatMap(([,values])=>values),['same-origin']);eq(r.text.includes('<meta name="referrer" content="same-origin">'),true);
 r=await expect(owner,unlock,403,{...unlockBody(token),origin:'https://foreign.test'});eq(fs.existsSync(configPath),false);
 await expect(owner,unlock,403,{...unlockBody(token),csrf:'wrong'});await expect(owner,unlock,403,unlockBody('0'.repeat(64)));
 const oldSession=owner.cookies.sichtwerk_portal_setup;
 r=await expect(owner,unlock,200,unlockBody(token));eq(json(r).ok,true);eq(owner.cookies.sichtwerk_portal_setup===oldSession,false);
 const cookieHeaders=Object.entries(r.headers).filter(([key])=>key.toLowerCase()==='set-cookie').flatMap(([,values])=>values).join(' ');eq(/secure/i.test(cookieHeaders),true);eq(/httponly/i.test(cookieHeaders),true);eq(/samesite=strict/i.test(cookieHeaders),true);
 r=await expect(owner,page,200);eq(r.text.includes('autocomplete="new-password"'),true);eq(r.text.includes(token),false);eq(r.text.includes('Kundenfreigaben bleiben zunächst gesperrt'),true);
 r=await expect(stranger,page,200);eq(r.text.includes('name="password"'),false);
 const password=randomBytes(5).toString('hex');await expect(stranger,page,403,form(stranger,password));eq(fs.existsSync(configPath),false);
 await expect(owner,page,403,{...form(owner,password),origin:'https://foreign.test'});await expect(owner,page,403,{...form(owner,password),origin:'null'});eq(fs.existsSync(configPath),false);await expect(owner,page,403,{method:'POST',body:{csrf:'wrong',password,repeat:password}});
 await expect(owner,page,400,form(owner,'short'));await expect(owner,page,400,form(owner,'a'.repeat(9)));await expect(owner,page,400,form(owner,'ü'.repeat(5)));await expect(owner,page,400,form(owner,password,'different'));await expect(owner,page,400,form(owner,'ü'.repeat(40)));eq(fs.existsSync(configPath),false);
 // Expiry must also apply to an already-unlocked session.
 const originalGrant=fs.readFileSync(grantPath);const g=JSON.parse(originalGrant);g.expires=Math.floor(Date.now()/1000)-60;fs.writeFileSync(grantPath,JSON.stringify(g));await expect(owner,page,404,form(owner,password));eq(fs.existsSync(configPath),false);fs.writeFileSync(grantPath,originalGrant);
 r=await expect(owner,page,303,form(owner,password));
 const configBytes=fs.readFileSync(configPath);eq(configBytes.includes(Buffer.from(password)),false);eq(JSON.parse(fs.readFileSync(grantPath)).used_at>0,true);eq(fs.statSync(configPath).mode&0o777,0o600);
 const verified=await php.run({code:`<?php $c=require '${configPath}';echo json_encode(['password'=>password_verify('${password}',$c['password_hash']),'releases'=>$c['releases_enabled'],'drive'=>$c['drive_archive']['refresh_token'],'outside'=>!str_starts_with($c['data_dir'],'${web}/')]);`});eq(JSON.parse(verified.text),{password:true,releases:false,drive:'',outside:true});
 r=await expect(owner,page+'?erledigt=1',200);eq(r.text.includes('Portalzugang eingerichtet'),true);eq(r.text.includes('name="password"'),false);
 await expect(owner,page,409,form(owner,password));await expect(stranger,unlock,409,unlockBody(token));eq(hash(fs.readFileSync(configPath)),hash(configBytes));
 const api=client();r=await expect(api,'/server/api.php?action=status',200);api.csrf=json(r).csrf;eq(json(r).authenticated,false);
 r=await expect(api,'/server/api.php?action=login',200,{method:'POST',body:JSON.stringify({password})});api.csrf=json(r).csrf;
 r=await expect(api,'/server/api.php?action=legal',200);eq(json(r).drive_configured,false);eq(json(r).releases_enabled,false);
 r=await expect(api,'/server/api.php?action=create',503,{method:'POST',body:{metadata:JSON.stringify({title:'Synthetischer Test'})}});eq(json(r).code,'releases_disabled');
 // A new grant must not turn a missing configuration into a reset path for existing customer records.
 fs.unlinkSync(configPath);grant();fs.mkdirSync(path.join(privateDir,'data/records/synthetic'),{recursive:true});fs.writeFileSync(path.join(privateDir,'data/records/synthetic/record.json'),'{}');
 const blocked=client();const blockedToken=grant();await expect(blocked,page,200);await expect(blocked,unlock,200,unlockBody(blockedToken));await expect(blocked,page,200);await expect(blocked,page,409,form(blocked,password));eq(fs.existsSync(configPath),false);
 const rate=client(),rateToken=grant();await expect(rate,page,200);for(let i=0;i<6;i++)await expect(rate,unlock,403,unlockBody('a'.repeat(64)));await expect(rate,unlock,429,unlockBody(rateToken));
 console.log(JSON.stringify({checks,result:'passed',coverage:['one-use setup only','expiry and CSRF','rate limit and secure session','password hash outside webroot','no overwrite of configuration or records','customer releases remain blocked without setup completion']}));
}finally{await php.exit();fs.rmSync(fixture,{recursive:true,force:true});}
