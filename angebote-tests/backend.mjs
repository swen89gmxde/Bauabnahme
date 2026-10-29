import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
const modules=process.env.PHP_WASM_MODULE_ROOT;if(!modules)throw Error('Set PHP_WASM_MODULE_ROOT to the node_modules directory containing @php-wasm packages.');
const {PHP,PHPRequestHandler}=await import(pathToFileURL(path.join(modules,'@php-wasm/universal/index.js')));
const {loadNodeRuntime,useHostFilesystem}=await import(pathToFileURL(path.join(modules,'@php-wasm/node/index.js')));
const root=fileURLToPath(new URL('../',import.meta.url)),fixture=path.join(root,'tests/private-server-'+randomBytes(8).toString('hex')),publicDir=path.join(fixture,'public'),privateDir=path.join(fixture,'sichtwerk-signieren-private');
fs.mkdirSync(path.join(publicDir,'server'),{recursive:true});fs.mkdirSync(privateDir,{recursive:true});fs.copyFileSync(path.join(root,'angebote/server/api.php'),path.join(publicDir,'server/api.php'));
const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));useHostFilesystem(php);
const password=randomBytes(32).toString('hex'),hashed=await php.run({code:`<?php echo password_hash('${password}', PASSWORD_DEFAULT);`});
const configPath=path.join(privateDir,'config.php');fs.writeFileSync(configPath,`<?php return ['origin'=>'https://sign.test','password_hash'=>'${hashed.text.trim()}','data_dir'=>'${privateDir}/data','lifetime_days'=>14];`);
const handler=new PHPRequestHandler({php,documentRoot:publicDir,absoluteUrl:'https://sign.test'});
let csrf='',checks=0;
async function request(action,{method='GET',body,headers={}}={}){const h={...headers};if(method==='POST'){h.Origin??='https://sign.test';h['X-CSRF-Token']??=csrf;if(typeof body==='string')h['Content-Type']='application/json';}return handler.request({url:'/server/api.php?action='+action,method,body:typeof body==='string'?new TextEncoder().encode(body):body,headers:h});}
async function expect(action,status,options){const r=await request(action,options);assert.equal(r.httpStatusCode,status,action+': '+r.text.slice(0,300)+' '+r.errors);checks++;return r;}
try{
 let r=await expect('status',200);let data=JSON.parse(r.text);assert.equal(data.authenticated,false);csrf=data.csrf;
 await expect('create',401,{method:'POST',body:'{}'});
 await expect('login',403,{method:'POST',body:'{}',headers:{Origin:'https://other.test'}});
 await expect('login',403,{method:'POST',body:'{}',headers:{'X-CSRF-Token':'invalid'}});
 r=await expect('login',200,{method:'POST',body:JSON.stringify({password})});csrf=JSON.parse(r.text).csrf;
 r=await expect('status',200);assert.equal(JSON.parse(r.text).authenticated,true);
 const source=fs.readFileSync(path.join(root,'angebote/musterangebot.pdf')),meta=JSON.parse(fs.readFileSync(path.join(root,'angebote/demo.json')));meta.pageCount=4;
 await expect('create',400,{method:'POST',body:{pdf:new File(['bad pdf'],'bad.pdf',{type:'application/pdf'}),metadata:JSON.stringify(meta)}});
 r=await expect('create',201,{method:'POST',body:{pdf:new File([source],'musterangebot.pdf',{type:'application/pdf'}),metadata:JSON.stringify(meta)}});
 const token=JSON.parse(r.text).token;assert.match(token,/^[a-f0-9]{64}$/);const tokenHeaders={'X-Offer-Token':token};
 await expect('offer',404);r=await expect('offer',200,{headers:tokenHeaders});assert.equal(JSON.parse(r.text).sha256,createHash('sha256').update(source).digest('hex'));
 r=await expect('document',200,{headers:tokenHeaders});assert.deepEqual(Buffer.from(r.bytes),source);
 await expect('revoke',403,{method:'POST',body:JSON.stringify({token}),headers:{'X-CSRF-Token':'wrong'}});
 await expect('revoke',200,{method:'POST',body:JSON.stringify({token})});await expect('offer',404,{headers:tokenHeaders});await expect('document',404,{headers:tokenHeaders});
 r=await expect('create',201,{method:'POST',body:{pdf:new File([source],'musterangebot.pdf',{type:'application/pdf'}),metadata:JSON.stringify(meta)}});const expired=JSON.parse(r.text).token;
 const p=path.join(privateDir,'data',createHash('sha256').update(expired).digest('hex')+'.json');const m=JSON.parse(fs.readFileSync(p));m.expires=0;fs.writeFileSync(p,JSON.stringify(m));await expect('offer',410,{headers:{'X-Offer-Token':expired}});
 await expect('logout',200,{method:'POST',body:'{}'});r=await expect('status',200);csrf=JSON.parse(r.text).csrf;await expect('create',401,{method:'POST',body:'{}'});
 console.log(JSON.stringify({checks,result:'passed',coverage:['authentication','CSRF','origin','PDF validation','private storage','token lookup','byte identity','revocation','expiration']}));
}finally{await php.exit();}
