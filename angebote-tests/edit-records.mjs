// Synthetic owner-edit integration checks, invoked by backend.mjs.
export async function editRecordCases({assert,fs,path,privateDir,create,meta,expect,admin,guest,alice,bob,json,post,file,source,legal2,sha,metadataJSON}){
 const A=await create(meta('EDIT-A','EDIT-1'),{'attachments[0]':file(source,'alt.pdf'),'attachments[1]':file(legal2,'behalten.pdf')}),B=await create(meta('EDIT-B','EDIT-2'),{'attachments[0]':file(legal2,'fremd.pdf')});
 const filePath=id=>path.join(privateDir,'data/records',id,'record.json'),read=id=>JSON.parse(fs.readFileSync(filePath(id)));
 const originalRecord=read(A.id),oldFiles=originalRecord.attachments.map(f=>[f.id,fs.readFileSync(path.join(privateDir,'data/records',A.id,'asset-'+f.id))]);
 await expect(guest,'record-edit&id='+A.id,401);await expect(alice,'record-edit-file&id='+A.id+'&file=original',401);await expect(admin,'record-edit&id='+A.id,405,post({}));
 const edit=json(await expect(admin,'record-edit&id='+A.id,200));assert.equal(edit.attachments.length,2);assert.ok(edit.attachments.every(f=>f.role==='anlage'));assert.equal(edit.customer_id,'EDIT-A');assert.equal(edit.fingerprint.length,64);assert.ok(!('code_hash' in edit));assert.ok(!('path' in edit));
 const download=(id,fp,asset)=>'record-edit-file&id='+id+'&fingerprint='+fp+'&file='+asset;
 assert.deepEqual(Buffer.from((await expect(admin,download(A.id,edit.fingerprint,'original'),200)).bytes),source);
 assert.deepEqual(Buffer.from((await expect(admin,download(A.id,edit.fingerprint,edit.attachments[0].id),200)).bytes),source);
 await expect(admin,download(A.id,'0'.repeat(64),'original'),409);
 await expect(admin,download(A.id,edit.fingerprint,read(B.id).attachments.find(f=>f.role==='anlage').id),404);
 await expect(admin,download(A.id,edit.fingerprint,read(A.id).attachments.find(f=>f.role==='agb').id),404);
 await expect(admin,download(A.id,edit.fingerprint,'../../config.php'),404);
 const editMeta={...meta('EDIT-A','EDIT-1'),edit_source:{id:A.id,fingerprint:edit.fingerprint}};
 // Invalid files or stale state must never retire the existing customer link.
 await expect(admin,'create',400,{method:'POST',body:{pdf:file(source),metadata:metadataJSON(editMeta),'attachments[0]':new File(['bad'],'bad.html',{type:'text/html'})}});
 await expect(bob,'access',200,{token:A.token});assert.deepEqual(read(A.id),originalRecord);
 await expect(admin,'create',409,{method:'POST',body:{pdf:file(source),metadata:metadataJSON({...editMeta,edit_source:{id:A.id,fingerprint:'0'.repeat(64)}})}});
 await expect(admin,'create',409,{method:'POST',body:{pdf:file(source),metadata:metadataJSON({...editMeta,customer_id:'EDIT-B'})}});
 const next=json(await expect(admin,'create',201,{method:'POST',body:{pdf:file(legal2,'neues-angebot.pdf'),metadata:metadataJSON(editMeta),'attachments[0]':file(legal2,'behalten.pdf'),'attachments[1]':file(source,'ersetzt.pdf')}}));
 assert.equal(next.revision,2);assert.notEqual(next.token,A.token);const saved=read(next.id);assert.equal(saved.supersedes,A.id);assert.equal(saved.sha256,sha(legal2));assert.equal(saved.filename,'neues-angebot.pdf');assert.deepEqual(saved.attachments.filter(f=>f.role==='anlage').map(f=>f.name),['behalten.pdf','ersetzt.pdf']);
 for(const [id,bytes] of oldFiles)assert.deepEqual(fs.readFileSync(path.join(privateDir,'data/records',A.id,'asset-'+id)),bytes);assert.deepEqual(read(A.id).attachments,originalRecord.attachments);
 for(const action of ['access','offer','document','attachment&id='+edit.attachments[0].id])await expect(bob,action,410,{token:A.token});
 await expect(bob,'access',200,{token:next.token});await expect(bob,'access',200,{token:B.token});await expect(admin,'record-edit&id='+A.id,409);
 await expect(admin,'create',409,{method:'POST',body:{pdf:file(source),metadata:metadataJSON(editMeta)}});
 // Completion / pending archive cannot be bypassed with a previously opened editor.
 const open=json(await expect(admin,'record-edit&id='+next.id,200)),state=read(next.id);state.state='archive_pending';state.completion={name:'SYNTHETIC'};fs.writeFileSync(filePath(next.id),JSON.stringify(state));
 await expect(admin,'record-edit&id='+next.id,409);await expect(admin,download(next.id,open.fingerprint,'original'),409);
 await expect(admin,'create',409,{method:'POST',body:{pdf:file(source),metadata:metadataJSON({...editMeta,edit_source:{id:next.id,fingerprint:open.fingerprint}})}});
 state.state='completed';fs.writeFileSync(filePath(next.id),JSON.stringify(state));await expect(admin,'record-edit&id='+next.id,409);
 // Download integrity and revoked-source edits.
 const b=read(B.id),asset=b.attachments.find(f=>f.role==='anlage'),assetPath=path.join(privateDir,'data/records',B.id,'asset-'+asset.id),bytes=fs.readFileSync(assetPath),be=json(await expect(admin,'record-edit&id='+B.id,200));fs.writeFileSync(assetPath,'tampered');await expect(admin,download(B.id,be.fingerprint,asset.id),409);fs.writeFileSync(assetPath,bytes);
 await expect(admin,'revoke',200,post({id:B.id}));const revoked=json(await expect(admin,'record-edit&id='+B.id,200));assert.notEqual(revoked.fingerprint,be.fingerprint);
 const restored=json(await expect(admin,'create',201,{method:'POST',body:{pdf:file(source),metadata:metadataJSON({...meta('EDIT-B','EDIT-2'),edit_source:{id:B.id,fingerprint:revoked.fingerprint}})}}));await expect(bob,'access',200,{token:restored.token});
}
