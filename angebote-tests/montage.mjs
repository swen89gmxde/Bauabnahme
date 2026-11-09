// Synthetic data only: verify the owner has no manual timing field and snapshots remain readable.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {checkoutFromForm,renderCheckout} from '../angebote/checkout.mjs';
import {validateMontagePolicy,montageCheckout} from '../angebote/montage.mjs';
import {stampPDF} from '../angebote/core.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('../angebote/montage-current.json',import.meta.url))),root=new URL('../',import.meta.url);
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
eq(validateMontagePolicy(policy),policy);eq(policy.weeks,4);eq(policy.trigger,'supplier_arrival');
for(const text of ['nach vollständiger Anlieferung','wirksam vereinbarten und fälligen Vorauszahlungen','sobald alle Voraussetzungen','Herstellerlieferzeit ist darin nicht enthalten','Gesetzliche Rechte bei Lieferverzögerungen bleiben unberührt','abweichender Montagezeitraum']){eq(policy.text.includes(text),true);}
const nodes=Object.fromEntries(Object.entries({'checkout-copy-delivery':'whatsapp','checkout-type':'work_consumer','checkout-description':'Synthetic installation','checkout-total':'1234,56','checkout-costs':'Keine zusätzlichen Kosten.','checkout-payment':'Synthetic payment terms.','checkout-checked':''}).map(([id,value])=>[id,{value,reportValidity:()=>true}]));
const doc={getElementById(id){assert.notEqual(id,'checkout-delivery');checks++;assert.ok(nodes[id],id);return nodes[id];}};
const checkout=checkoutFromForm(doc,policy);eq(checkout.delivery_terms,policy.text);eq(checkout.delivery_policy_version,policy.version);eq(checkout.customer_email,'');
const summary={children:[],replaceChildren(){this.children=[];},append(e){this.children.push(e);},ownerDocument:{createElement(tag){return {tag,textContent:''};}}};renderCheckout(summary,{demo:true,checkout,title:'Synthetic test',commission:'TEST'});eq(summary.children[0].textContent,'Unverbindlicher Test der Abschlussübersicht');eq(summary.children.some(e=>e.textContent.includes('Zahlungspflichtig bestellen')),false);eq(summary.children.some(e=>e.textContent.includes('Freigabe: Probelauf')),true);
assert.throws(()=>checkoutFromForm(doc,null));checks++;assert.throws(()=>montageCheckout({...policy,trigger:'contract_date'}));checks++;
const html=fs.readFileSync(new URL('angebote/index.html',root),'utf8');eq(html.includes('id="checkout-delivery"'),false);eq(html.includes('for="checkout-delivery"'),false);
const require=createRequire(import.meta.url),PDFLib=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/pdf-lib':'pdf-lib');
const source=fs.readFileSync(new URL('angebote/musterangebot.pdf',root)),meta=JSON.parse(fs.readFileSync(new URL('angebote/demo.json',root))),images={signature:fs.readFileSync(new URL('./signature-test.png',import.meta.url)),date:fs.readFileSync(new URL('./date-test.png',import.meta.url))};
const signed=await stampPDF(source,meta.layout,images,PDFLib,{checkout,testLabel:true}),pdf=await PDFLib.PDFDocument.load(signed),original=await PDFLib.PDFDocument.load(source);
eq(pdf.getPageCount(),original.getPageCount()+1);for(let i=0;i<original.getPageCount();i++)eq(pdf.getPage(i).getSize(),original.getPage(i).getSize());
eq(JSON.parse(pdf.catalog.lookup(PDFLib.PDFName.of('SichtwerkMontage'),PDFLib.PDFHexString).decodeText()),{version:policy.version,text:policy.text});
eq(JSON.parse(pdf.catalog.lookup(PDFLib.PDFName.of('SichtwerkCheckout'),PDFLib.PDFHexString).decodeText()),checkout);
fs.writeFileSync(new URL('./montage-signed.pdf',import.meta.url),signed);await assert.rejects(stampPDF(signed,meta.layout,images,PDFLib));checks++;
const historic={...checkout,delivery_terms:'Historic fixed timing.'};delete historic.delivery_policy_version;
const old=await PDFLib.PDFDocument.load(await stampPDF(source,meta.layout,images,PDFLib,{checkout:historic}));eq(old.getPageCount(),original.getPageCount());eq(JSON.parse(old.catalog.lookup(PDFLib.PDFName.of('SichtwerkCheckout'),PDFLib.PDFHexString).decodeText()),historic);
console.log(JSON.stringify({checks,result:'passed',coverage:['no manual timing field','four weeks only after supplier arrival and prerequisites','canonical defaults without customer email','visible PDF timing page and exact frozen metadata','original page formats retained','historical checkout unchanged','completed PDF cannot be reimported']}));
