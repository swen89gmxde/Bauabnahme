import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {LEGAL_CONSENT,stampPDF,validateLayout,germanDate,detectLayout,signedName} from '../angebote/core.mjs';
const require=createRequire(import.meta.url),PDFLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib':'pdf-lib');
const root=new URL('../',import.meta.url),demo=fs.readFileSync(new URL('angebote/musterangebot.pdf',root)),meta=JSON.parse(fs.readFileSync(new URL('angebote/demo.json',root)));
const signature=fs.readFileSync(new URL('signature-test.png',import.meta.url)),date=fs.readFileSync(new URL('date-test.png',import.meta.url));
let checks=0;
const cases=[['demo',demo,meta.layout]];if(process.env.PDF_PRIVATE_TEST_FILE)cases.push(['private',fs.readFileSync(process.env.PDF_PRIVATE_TEST_FILE),{page:3,signature:{x:145,y:270,w:394,h:42},date:{x:125,y:243,w:414,h:18}}]);
for(const [name,input,layout] of cases){
 const source=await PDFLib.PDFDocument.load(input),out=await stampPDF(input,layout,{signature,date},PDFLib),doc=await PDFLib.PDFDocument.load(out);assert.equal(doc.getPageCount(),source.getPageCount());for(let i=0;i<doc.getPageCount();i++)assert.deepEqual(doc.getPage(i).getSize(),source.getPage(i).getSize());fs.writeFileSync(new URL(name+'-signed.pdf',import.meta.url),out);checks+=2;
}
const d=await PDFLib.PDFDocument.load(demo);assert.throws(()=>validateLayout({...meta.layout,page:99},d.getPages()));assert.throws(()=>validateLayout({...meta.layout,signature:{x:1,y:1,w:999,h:100}},d.getPages()));assert.throws(()=>validateLayout({...meta.layout,date:meta.layout.signature},d.getPages()));checks+=3;
const withConsent=await PDFLib.PDFDocument.load(await stampPDF(demo,meta.layout,{signature,date},PDFLib,{bundle:meta.attachments,consent:{...LEGAL_CONSENT,accepted:true}}));
const consent=withConsent.catalog.lookup(PDFLib.PDFName.of('SichtwerkConsent'),PDFLib.PDFDict);assert.equal(consent.lookup(PDFLib.PDFName.of('Text'),PDFLib.PDFHexString).decodeText(),LEGAL_CONSENT.text);assert.equal(consent.lookup(PDFLib.PDFName.of('Accepted'),PDFLib.PDFBool).asBoolean(),true);assert.equal(withConsent.getPageCount(),d.getPageCount());checks+=3;
await assert.rejects(stampPDF(demo,meta.layout,{signature,date},PDFLib,{consent:{...LEGAL_CONSENT,accepted:false}}));checks++;
assert.equal(germanDate('2026-10-29'),'29.10.2026');assert.throws(()=>germanDate('2026-02-31'));assert.equal(signedName('Mein Angebot.pdf'),'Mein Angebot_unterschrieben.pdf');checks+=3;
const detected=detectLayout([{width:596,height:842,items:[{text:'Ort/Datum:',x:71,y:242,w:53,h:10},{text:'Unterschrift:',x:71,y:254,w:58,h:10},{text:'2. VERSICHERUNG',x:71,y:290,w:350,h:10}]}]);assert.equal(detected.page,0);assert.ok(detected.signature.y+detected.signature.h<290);assert.equal(detectLayout([{width:596,height:842,items:[]}]),null);checks+=3;
console.log(JSON.stringify({checks,result:'passed',pagesPreserved:true,output:'internal synthetic tests only'}));
