// Password rotation uses synthetic credentials and an isolated private configuration only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomBytes,createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),modules=process.env.PHP_WASM_MODULE_ROOT||path.join(root,'node_modules');
const {PHP,PHPRequestHandler}=await import(pathToFileURL(path.join(modules,'@php-wasm/universal/index.js'))),{loadNodeRuntime,useHostFilesystem}=await import(pathToFileURL(path.join(modules,'@php-wasm/node/index.js')));
const fixture=path.join(root,'angebote-tests/private-password-'+randomBytes(8).toString('hex')),web=path.join(fixture,'public'),privateDir=path.join(fixture,'sichtwerk-signieren-private'),configPath=path.join(privateDir,'config.php');
fs.cpSync(path.join(root,'angebote'),web,{recursive:true});fs.mkdirSync(privateDir,{recursive:true});
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));useHostFilesystem(php);
const handler=new PHPRequestHandler({php,documentRoot:web,absoluteUrl:'https://password.test',cookieStore:false});
const oldPassword=randomBytes(24).toString('hex'),nextPassword=randomBytes(5).toString('hex'),thirdPassword='ü'.repeat(10);
const hashed=await php.run({code:`<?php echo password_hash('${oldPassword}',PASSWORD_DEFAULT);`});
fs.writeFileSync(configPath,`<?php return ['origin'=>'https://password.test','password_hash'=>'${hashed.text.trim()}','data_dir'=>'${privateDir}/data','lifetime_days'=>14,'releases_enabled'=>false,'unrelated'=>['text'=>'preserved','number'=>42],'drive_archive'=>['folder_id'=>'synthetic_archive_folder','client_id'=>'999999-synthetic.apps.googleusercontent.com','client_secret'=>'SYNTHETIC_SECRET_ONLY','account_email'=>'owner@example.test','batch_size'=>2]];`);
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},sha=b=>createHash('sha256').update(b).digest('hex');
const client=()=>({cookies:{},csrf:''}),owner=client(),other=client(),guest=client(),page='/server/password.php',api='/server/api.php?action=';
async function call(c,url,{method='GET',body,origin='https://password.test'}={}){
 const headers={Cookie:Object.entries(c.cookies).map(([k,v])=>k+'='+v).join('; ')};
 if(method==='POST')headers.Origin=origin;
 if(typeof body==='string'){headers['Content-Type']='application/json';headers['X-CSRF-Token']=c.csrf;body=new TextEncoder().encode(body);}
 else if(body){headers['Content-Type']='application/x-www-form-urlencoded';body=new TextEncoder().encode(new URLSearchParams(body).toString());}
 const r=await handler.request({url,method,headers,body});
 for(const [key,values] of Object.entries(r.headers))if(key.toLowerCase()==='set-cookie')for(const value of values){const first=value.split(';')[0],i=first.indexOf('=');c.cookies[first.slice(0,i)]=first.slice(i+1);}
 return r;
}
async function expect(c,url,status,options){const r=await call(c,url,options);assert.equal(r.httpStatusCode,status,url+': '+r.text.slice(0,160));checks++;return r;}
async function login(c,password){let r=await expect(c,api+'status',200);c.csrf=JSON.parse(r.text).csrf;r=await expect(c,api+'login',200,{method:'POST',body:JSON.stringify({password})});c.csrf=JSON.parse(r.text).csrf;}
const form=(c,password=nextPassword,repeat=password,current_password=oldPassword)=>({method:'POST',body:{csrf:c.csrf,current_password,password,repeat}});
async function config(){const r=await php.run({code:`<?php echo json_encode(require '${configPath}');`});return JSON.parse(r.text);}
try{
 const sessionRules=await php.run({code:`<?php require '${web}/server/store.php';$config=require '${configPath}';$_SESSION=['authenticated_at'=>time()];$checks=[portalOwnerAuthenticated()];$_SESSION['password_fingerprint']=[];$checks[]=portalOwnerAuthenticated();unset($_SESSION['password_fingerprint']);$config['password_changed_at']=gmdate(DATE_ATOM);$checks[]=portalOwnerAuthenticated();$_SESSION['password_fingerprint']=portalPasswordFingerprint();$checks[]=portalOwnerAuthenticated();$config['password_hash']='changed';$checks[]=portalOwnerAuthenticated();echo json_encode($checks);`});eq(JSON.parse(sessionRules.text),[true,false,false,true,false]);
 let r=await expect(guest,page,401);eq(r.text.includes('name="current_password"'),false);await expect(guest,page,401,form(guest));
 await login(owner,oldPassword);await login(other,oldPassword);r=await expect(owner,page,200);
 eq(r.text.includes('minlength="10"'),true);eq(r.text.includes('autocomplete="new-password"'),true);eq(r.text.includes(oldPassword),false);eq(r.text.includes('SYNTHETIC_SECRET_ONLY'),false);
 eq(Object.entries(r.headers).filter(([key])=>key.toLowerCase()==='referrer-policy').flatMap(([,v])=>v),['same-origin']);
 if(process.env.PORTAL_PASSWORD_PREVIEW_FILE){const target=process.env.PORTAL_PASSWORD_PREVIEW_FILE;fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,r.text.replace(/value="[a-f0-9]{64}"/g,'value="SYNTHETIC-PREVIEW-ONLY"').replace('<main>','<main><p class="notice">Vorschau mit Testdaten. Bitte hier kein echtes Passwort eingeben.</p>'));}
 const originalBytes=fs.readFileSync(configPath),original=await config();
 await expect(owner,page,405,{method:'PUT'});await expect(owner,page,403,{...form(owner),origin:'https://foreign.test'});await expect(owner,page,403,{...form(owner),origin:'null'});await expect(owner,page,403,{method:'POST',body:{...form(owner).body,csrf:'wrong'}});
 await expect(owner,page,403,form(owner,nextPassword,nextPassword,'wrong'));
 for(const value of ['a'.repeat(9),'ü'.repeat(5),'a'.repeat(73),'ü'.repeat(37),'a\0'.repeat(10)])await expect(owner,page,400,form(owner,value));
 await expect(owner,page,400,form(owner,nextPassword,'mismatch'));await expect(owner,page,400,{method:'POST',body:{csrf:owner.csrf,current_password:oldPassword}});eq(sha(fs.readFileSync(configPath)),sha(originalBytes));
 // Frozen customer packages and Drive credentials must survive password rotation unchanged.
 const record=path.join(privateDir,'data/records/synthetic');fs.mkdirSync(record,{recursive:true});fs.writeFileSync(record+'/record.json','{"state":"completed","test":true}');fs.writeFileSync(record+'/signed.pdf','SYNTHETIC_FROZEN_BYTES');
 const frozen=sha(fs.readFileSync(record+'/signed.pdf')),recordHash=sha(fs.readFileSync(record+'/record.json'));
 // Start a pending OAuth flow before rotation, then remove the synthetic customer marker.
 fs.renameSync(record,path.join(privateDir,'frozen-test-record'));
 r=await expect(other,'/server/drive-connect.php',200,{method:'POST',body:{csrf:other.csrf,action:'authorize'}});
 const match=r.text.match(/id="google-authorization" href="([^"]+)"/);assert.ok(match);checks++;
 const state=new URL(match[1].replaceAll('&amp;','&')).searchParams.get('state'),flowPath=privateDir+'/data/drive-connect/'+sha(state)+'.json';
 fs.renameSync(path.join(privateDir,'frozen-test-record'),record);
 const previousCookie=owner.cookies.sichtwerk_signieren;
 r=await expect(owner,page,303,form(owner));eq(Object.entries(r.headers).filter(([k])=>k.toLowerCase()==='location').flatMap(([,v])=>v),['../?vorbereiten=1&passwort=geaendert']);
 eq(owner.cookies.sichtwerk_signieren===previousCookie,false);
 const changed=await config(),{password_hash,password_changed_at,...preserved}=changed,{password_hash:oldHash,...expected}=original;eq(preserved,expected);eq(typeof password_changed_at,'string');eq(password_hash===oldHash,false);eq(fs.readFileSync(configPath).includes(Buffer.from(nextPassword)),false);eq(fs.statSync(configPath).mode&0o777,0o600);
 eq(sha(fs.readFileSync(record+'/signed.pdf')),frozen);eq(sha(fs.readFileSync(record+'/record.json')),recordHash);
 for(const c of [owner,other]){r=await expect(c,api+'status',200);c.csrf=JSON.parse(r.text).csrf;eq(JSON.parse(r.text).authenticated,false);await expect(c,api+'list',401);await expect(c,'/server/drive-connect.php',401);await expect(c,page,401);}
 r=await expect(owner,api+'login',401,{method:'POST',body:JSON.stringify({password:oldPassword})});eq(r.text.includes(nextPassword),false);
 await login(owner,nextPassword);await expect(owner,api+'list',200);await expect(owner,page,200);
 // The separate OAuth cookie alone may not finish a flow started before the password change.
 fs.renameSync(record,path.join(privateDir,'frozen-test-record'));
 const callbackClient=client();callbackClient.cookies['__Secure-sichtwerk_drive_oauth']=other.cookies['__Secure-sichtwerk_drive_oauth'];
 r=await expect(callbackClient,'/server/drive-callback.php?state='+state+'&code=synthetic',403);eq(r.text.includes('Portalzugang wurde geändert'),true);eq(JSON.parse(fs.readFileSync(flowPath)).used,false);
 // Repeated rotation also invalidates sessions created with an earlier fingerprint.
 await login(other,nextPassword);await expect(owner,page,303,form(owner,thirdPassword,thirdPassword,nextPassword));await expect(other,api+'list',401);await login(owner,thirdPassword);await expect(owner,page,200);
 for(let i=0;i<6;i++)await expect(owner,page,403,form(owner,nextPassword,nextPassword,'wrong'));
 await expect(owner,page,429,form(owner,nextPassword,nextPassword,thirdPassword));
 console.log(JSON.stringify({checks,result:'passed',coverage:['10-character minimum including Unicode','owner login plus current password','Origin and CSRF checks','rate limit','atomic private config with Drive settings preserved','frozen customer files preserved','current and other sessions invalidated','pending OAuth flow invalidated','new password works and old password rejected']}));
}finally{await php.exit();fs.rmSync(fixture,{recursive:true,force:true});}
