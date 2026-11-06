import assert from 'node:assert/strict';
import {attachmentInfo,validateAttachments} from '../angebote/core.mjs';
const MB=1024*1024,file=(name,size=100)=>({name,size});let checks=0;
for(const [name,mime] of [['Zeichnung.PDF','application/pdf'],['Sondervereinbarung.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['Vereinbarung.doc','application/msword'],['Baustelle.jpg','image/jpeg'],['Detail.jpeg','image/jpeg'],['Detail.png','image/png'],['Detail.webp','image/webp']]){assert.equal(attachmentInfo(file(name)).mime,mime);checks++;}
assert.equal(validateAttachments([],20*MB).length,0);checks++;
assert.equal(validateAttachments([file('Plan.pdf',20*MB),file('Vereinbarung.pdf',20*MB)],20*MB).length,2);checks++;
assert.throws(()=>validateAttachments([file('Plan.pdf',20*MB),file('Vereinbarung.pdf',20*MB)],20*MB+1));checks++;
assert.equal(validateAttachments(Array.from({length:12},(_,i)=>file(i+'.pdf'))).length,12);checks++;
assert.throws(()=>validateAttachments(Array.from({length:13},(_,i)=>file(i+'.pdf'))));checks++;
for(const f of [file('Leer.pdf',0),file('Zu-gross.pdf',20*MB+1),file('Seite.html'),file('Makros.docm'),file('Plan.dwg')]){assert.throws(()=>validateAttachments([f]));checks++;}
console.log(JSON.stringify({checks,result:'passed',coverage:['document and optional image selection','12-file and 20-MB limits','offer included in 60-MB package limit','unsupported file extensions rejected']}));
