// All records, files and link secrets in these cases belong to the disposable local fixture.
export async function linksRecoveryCases({assert,fs,path,privateDir,create,meta,expect,admin,guest,alice,json,post,file,source,legal2,signed,syntheticAuthority,metadataJSON,randomBytes}){
 const request=randomBytes(16).toString('hex'),m={...meta('LINK-RECOVERY','TEST-RETRY'),create_request_id:request};
 const body=()=>({method:'POST',body:{pdf:file(source),metadata:metadataJSON(m)}});
 const first=json(await expect(admin,'create',201,body()));
 const lookup=json(await expect(admin,'create-result&request='+request,200));assert.equal(lookup.id,first.id);assert.equal(lookup.token,first.token);assert.equal(lookup.recovered,true);
 await expect(guest,'create-result&request='+request,401);await expect(admin,'create-result&request=wrong',400);await expect(admin,'create-result&request='+'e'.repeat(32),404);
 const retry=json(await expect(admin,'create',201,body()));assert.equal(retry.id,first.id);assert.equal(retry.token,first.token);assert.equal(retry.revision,first.revision);
 await expect(admin,'create',409,{method:'POST',body:{pdf:file(legal2),metadata:metadataJSON(m)}});
 const list=()=>expect(admin,'list',200).then(json),get=rows=>rows.records.find(r=>r.id===first.id);
 let record=get(await list());assert.equal(record.links[0].token,first.token);assert.equal(record.links[0].active,true);
 // Readback remains stable across independent list calls; no write or new link is necessary.
 assert.deepEqual(get(await list()).links,record.links);
 await expect(alice,'access',200,{token:first.token});const publicOffer=json(await expect(alice,'offer',200,{token:first.token}));assert.ok(!JSON.stringify(publicOffer).includes(first.token));assert.ok(!('links' in publicOffer));
 // A pre-update record never had a recoverable token. One explicit owner action rotates its access only.
 guest.csrf=json(await expect(guest,'status',200)).csrf;
 const old=await create(meta('LEGACY-LINK','LEGACY-ONLY')),dir=path.join(privateDir,'data/records',old.id);fs.unlinkSync(path.join(dir,'owner-links.json'));
 const original=JSON.parse(fs.readFileSync(path.join(dir,'record.json')));await expect(guest,'owner-customer-link',401,post({id:old.id,confirmed:true}));await expect(admin,'owner-customer-link',400,post({id:old.id}));
 const regenerated=json(await expect(admin,'owner-customer-link',200,post({id:old.id,confirmed:true})));assert.notEqual(regenerated.token,old.token);assert.equal(regenerated.id,old.id);
 const again=json(await expect(admin,'owner-customer-link',200,post({id:old.id,confirmed:true})));assert.equal(again.token,regenerated.token);
 for(const action of ['access','offer','document'])await expect(alice,action,410,{token:old.token});await expect(alice,'access',200,{token:regenerated.token});await expect(alice,'document',200,{token:regenerated.token});
 const changed=JSON.parse(fs.readFileSync(path.join(dir,'record.json')));for(const key of ['sha256','revision','attachments','layout','checkout','created_at'])assert.deepEqual(changed[key],original[key]);
 assert.equal((await list()).records.find(r=>r.id===old.id).links[0].token,regenerated.token);
 const offer=json(await expect(alice,'offer',200,{token:regenerated.token}));
 const completion={authority:syntheticAuthority(offer),order_consent:true,checkout_hash:offer.checkout_hash,name:'Synthetic link rotation test',date:'2026-11-26',legal_consent:true,consent_version:offer.consent.version,request_id:randomBytes(16).toString('hex'),source_sha256:offer.sha256,proof:offer.proof,documents:Object.fromEntries(offer.attachments.map(f=>[f.id,f.sha256]))};
 await expect(alice,'complete',200,{method:'POST',token:regenerated.token,body:{pdf:file(signed,'unterschrieben.pdf'),metadata:metadataJSON(completion)}});
 await expect(admin,'owner-customer-link',409,post({id:old.id,confirmed:true}));
 const zip=await expect(admin,'owner-file&id='+old.id+'&kind=archive',200);assert.ok(!Buffer.from(zip.bytes).includes(Buffer.from('owner-links.json')));assert.ok(!Buffer.from(zip.bytes).includes(Buffer.from(regenerated.token)));

 await expect(admin,'revoke',200,post({id:first.id}));record=get(await list());assert.equal(record.links[0].token,first.token);assert.equal(record.links[0].active,false);await expect(admin,'create-result&request='+request,409);
 await expect(admin,'record-trash',200,post({id:first.id,confirmed:true}));await expect(admin,'record-purge',200,post({id:first.id,confirmed:true,retention_checked:true}));assert.equal(fs.existsSync(path.join(privateDir,'data/create-requests',request+'.json')),false);await expect(admin,'create-result&request='+request,404);
}
