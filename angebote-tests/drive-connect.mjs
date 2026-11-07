// Isolated OAuth/setup tests. All accounts, credentials and Google replies are synthetic.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomBytes,createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),modules=process.env.PHP_WASM_MODULE_ROOT||path.join(root,'node_modules');
const {PHP,PHPRequestHandler}=await import(pathToFileURL(path.join(modules,'@php-wasm/universal/index.js'))),{loadNodeRuntime,useHostFilesystem}=await import(pathToFileURL(path.join(modules,'@php-wasm/node/index.js')));
const fixture=path.join(root,'angebote-tests/private-drive-connect-'+randomBytes(8).toString('hex')),web=path.join(fixture,'public'),privateDir=path.join(fixture,'sichtwerk-signieren-private'),configPath=path.join(privateDir,'config.php');
fs.cpSync(path.join(root,'angebote'),web,{recursive:true});fs.mkdirSync(privateDir,{recursive:true});
// Config rewrites contain data only; attach the synthetic transport to the isolated fixture.
fs.appendFileSync(path.join(web,'server/store.php'),`\nrequire_once '${root}/angebote-tests/drive-connect-mock.php';\n`);
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));useHostFilesystem(php);
const handler=new PHPRequestHandler({php,documentRoot:web,absoluteUrl:'https://connect.test',cookieStore:false});
const password=randomBytes(24).toString('hex'),secret='GOCSPX-'+randomBytes(24).toString('hex'),clientId='999999-synthetic.apps.googleusercontent.com',redirect='https://connect.test/angebote/server/drive-callback.php';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashed=await php.run({code:`<?php echo password_hash('${password}',PASSWORD_DEFAULT);`});
const baseConfig=`<?php require_once '${root}/angebote-tests/drive-connect-mock.php';return ['origin'=>'https://connect.test','password_hash'=>'${hashed.text.trim()}','data_dir'=>'${privateDir}/data','lifetime_days'=>14,'releases_enabled'=>false,'preserved'=>'untouched','drive_archive'=>['batch_size'=>2,'transport'=>'syntheticConnectHTTP']];`;
const client=()=>({cookies:{},csrf:''}),owner=client(),stranger=client(),page='/server/drive-connect.php',callback='/server/drive-callback.php';
function reset(mode=''){fs.writeFileSync(configPath,baseConfig);fs.writeFileSync(privateDir+'/google-mock.json',JSON.stringify({mode}));fs.rmSync(privateDir+'/data/records',{recursive:true,force:true});}
const json=({redirects=[redirect],...changes}={})=>JSON.stringify({web:{client_id:clientId,client_secret:secret,token_uri:'https://oauth2.googleapis.com/token',redirect_uris:redirects,...changes}});
async function call(c,url,{method='GET',body,origin='https://connect.test',cookies=c.cookies}={}){
 const headers={Cookie:Object.entries(cookies).map(([k,v])=>k+'='+v).join('; ')};
 if(method==='POST')headers.Origin=origin;
 if(typeof body==='string'){headers['Content-Type']='application/json';headers['X-CSRF-Token']=c.csrf;body=new TextEncoder().encode(body);}
 else if(body&&!Object.values(body).some(v=>v instanceof File)){headers['Content-Type']='application/x-www-form-urlencoded';body=new TextEncoder().encode(new URLSearchParams(body).toString());}
 const r=await handler.request({url,method,headers,body});
 for(const [key,values] of Object.entries(r.headers))if(key.toLowerCase()==='set-cookie')for(const value of values){const first=value.split(';')[0],i=first.indexOf('=');c.cookies[first.slice(0,i)]=first.slice(i+1);}
 return r;
}
async function expect(c,url,status,options){const r=await call(c,url,options);assert.equal(r.httpStatusCode,status,url+': '+r.text.slice(0,160));checks++;return r;}
async function login(c){let r=await expect(c,'/server/api.php?action=status',200);c.csrf=JSON.parse(r.text).csrf;r=await expect(c,'/server/api.php?action=login',200,{method:'POST',body:JSON.stringify({password})});c.csrf=JSON.parse(r.text).csrf;}
const post=(c,action,extra={})=>({method:'POST',body:{csrf:c.csrf,action,...extra}}),upload=(c,raw=json(),extra={})=>post(c,'import',{google_email:'owner@example.test',credentials:new File([raw],'client.json',{type:'application/json'}),...extra});
async function config(){const r=await php.run({code:`<?php $v=require '${configPath}';echo json_encode($v);`});return JSON.parse(r.text);}
const google=()=>JSON.parse(fs.readFileSync(privateDir+'/google-mock.json'));
async function start(c){let r=await expect(c,page,200,post(c,'authorize'));const match=r.text.match(/id="google-authorization" href="([^"]+)"/);assert.ok(match);checks++;const url=new URL(match[1].replaceAll('&amp;','&'));return {r,url,state:url.searchParams.get('state'),cookies:{'__Secure-sichtwerk_drive_oauth':c.cookies['__Secure-sichtwerk_drive_oauth']}};}
async function connect(mode=''){reset(mode);await expect(owner,page,303,upload(owner));return start(owner);}
try{
 reset();for(const name of ['drive-connect-store.php','drive-connect.php','drive-callback.php']){const r=await php.run({code:`<?php token_get_all(file_get_contents('${web}/server/${name}'),TOKEN_PARSE);echo 'OK';`});eq(r.text,'OK');}
 let r=await expect(stranger,page,401);eq(r.text.includes('name="credentials"'),false);eq(r.text.includes(secret),false);await expect(stranger,page,401,upload(stranger));
 await login(owner);r=await expect(owner,page,200);eq(r.text.includes(redirect),true);eq(r.text.includes('name="credentials"'),true);eq(r.text.includes('content="same-origin"'),true);
 await expect(owner,page,403,{...upload(owner),origin:'https://foreign.test'});await expect(owner,page,403,{...upload(owner),origin:'null'});await expect(owner,page,403,upload(owner,json(),{csrf:'wrong'}));
 for(const raw of ['broken',JSON.stringify({installed:{client_id:clientId}}),json({redirects:['https://foreign.test/callback']}),json({token_uri:'https://foreign.test/token'}),json({client_secret:'bad\nsecret'}),'x'.repeat(32769)])await expect(owner,page,400,upload(owner,raw));
 await expect(owner,page,400,upload(owner,json(),{google_email:'invalid'}));eq((await config()).drive_archive.client_secret,undefined);
 await expect(owner,page,303,upload(owner));const saved=await config();eq(saved.password_hash,hashed.text.trim());eq(saved.preserved,'untouched');eq(saved.releases_enabled,false);eq(saved.drive_archive.client_secret,secret);eq(fs.statSync(configPath).mode&0o777,0o600);
 r=await expect(owner,page,200);for(const value of [password,secret,'synthetic-refresh'])eq(r.text.includes(value),false);
 let flow=await start(owner);eq(flow.url.origin,'https://accounts.google.com');eq(flow.url.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');eq(flow.url.searchParams.get('access_type'),'offline');eq(flow.url.searchParams.get('include_granted_scopes'),'false');eq(flow.url.searchParams.get('redirect_uri'),redirect);eq(flow.url.searchParams.get('code_challenge_method'),'S256');
 const cookie=Object.entries(flow.r.headers).filter(([key])=>key.toLowerCase()==='set-cookie').flatMap(([,v])=>v).join(' ');eq(/secure/i.test(cookie),true);eq(/httponly/i.test(cookie),true);eq(/samesite=lax/i.test(cookie),true);
 const flowPath=privateDir+'/data/drive-connect/'+sha(flow.state)+'.json',record=JSON.parse(fs.readFileSync(flowPath));eq(flow.url.searchParams.get('code_challenge'),createHash('sha256').update(record.verifier).digest('base64url'));
 await expect(stranger,callback+'?state='+flow.state+'&code=synthetic',403);await expect(stranger,callback+'?state='+flow.state+'&code=synthetic',403,{cookies:{'__Secure-sichtwerk_drive_oauth':'0'.repeat(64)}});
 const expired={...record,expires:Math.floor(Date.now()/1000)-1};fs.writeFileSync(flowPath,JSON.stringify(expired));await expect(stranger,callback+'?state='+flow.state+'&code=synthetic',403,{cookies:flow.cookies});fs.writeFileSync(flowPath,JSON.stringify(record));
 // Callback runs without the Strict admin cookie, using only the separately bound short-lived Lax cookie.
 r=await expect(stranger,callback+'?state='+flow.state+'&code=synthetic',200,{cookies:flow.cookies});eq(r.text.includes('Google Drive verbunden'),true);eq(r.text.includes('synthetic-refresh'),false);eq(r.text.includes('code=synthetic'),false);
 const complete=await config();eq(complete.drive_archive.connection_verified,true);eq(complete.drive_archive.folder_id,'synthetic_archive_root_001');eq(complete.drive_archive.refresh_token,'synthetic-refresh');eq(complete.releases_enabled,false);eq(complete.password_hash,saved.password_hash);eq(google().exchanges,1);eq(google().reserved,1);eq(google().created,1);eq(google().verifier,record.verifier);
 await expect(stranger,callback+'?state='+flow.state+'&code=synthetic',403,{cookies:flow.cookies});eq(google().exchanges,1);await expect(owner,page,409,upload(owner));
 r=await expect(owner,page,200);eq(r.text.includes('Google-Verbindung bestätigt'),true);eq(r.text.includes(secret),false);
 for(const [mode,status] of [['wrong-account',400],['broad',400],['missing-refresh',400],['failure',503],['shared',503]]){flow=await connect(mode);r=await expect(stranger,callback+'?state='+flow.state+'&code=synthetic',status,{cookies:flow.cookies});eq(r.text.includes('PRIVATE_REMOTE_ERROR'),false);eq((await config()).drive_archive.connection_verified,false);}
 flow=await connect();await expect(stranger,callback+'?state='+flow.state+'&error=PRIVATE_DENIAL',400,{cookies:flow.cookies});eq(google().exchanges,undefined);
 flow=await connect();const previous=flow;flow=await start(owner);await expect(stranger,callback+'?state='+previous.state+'&code=synthetic',403,{cookies:previous.cookies});
 // Any client import, including the same JSON, invalidates a pending flow.
 await expect(owner,page,303,upload(owner));await expect(stranger,callback+'?state='+flow.state+'&code=synthetic',403,{cookies:flow.cookies});flow=await start(owner);
 await expect(owner,page,303,upload(owner,json({client_id:'999999-replacement.apps.googleusercontent.com'})));await expect(stranger,callback+'?state='+flow.state+'&code=synthetic',403,{cookies:flow.cookies});
 flow=await connect('folder-failure');await expect(stranger,callback+'?state='+flow.state+'&code=synthetic',503,{cookies:flow.cookies});eq((await config()).drive_archive.connection_verified,false);eq((await config()).drive_archive.folder_id,'synthetic_archive_root_001');await expect(owner,page,303,post(owner,'folder'));eq((await config()).drive_archive.connection_verified,true);eq(google().reserved,1);eq(google().created,2);
 reset();fs.mkdirSync(privateDir+'/data/records/synthetic',{recursive:true});fs.writeFileSync(privateDir+'/data/records/synthetic/record.json','{}');await expect(owner,page,409,upload(owner));eq((await config()).drive_archive.client_secret,undefined);
 console.log(JSON.stringify({checks,result:'passed',coverage:['owner-only upload with Origin and CSRF','private config and admin hash preserved','fixed Google endpoints and exact redirect','least-privilege OAuth with PKCE','short-lived one-use state plus bound Lax cookie','Strict admin session remains unchanged','wrong account and broad scopes rejected','private folder verified and resumable without duplicates','no real secrets or customer releases']}));
}finally{await php.exit();fs.rmSync(fixture,{recursive:true,force:true});}
