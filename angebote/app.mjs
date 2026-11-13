import {mountRecordActions,workflowURL,customerTokenFromFragment} from './records.mjs?v=20261113-kundenlink-2';
import {renderInsuranceSummary} from './insurance.mjs?v=20261110-eigenanteil-1';
import {checkoutFromPDF} from './offer-checkout.mjs?v=20261109-versicherung-1';
import {authorityDefinition,mountAuthority,authorityFromForm,authorityPayload,renderAuthoritySummary,authorityPage} from './authority.mjs?v=20261109-versicherung-1';
import {extractOffer,resetOfferFields,applyOfferImport} from './offer-import.mjs?v=20261109-versicherung-1';
import {ORDER_BUTTON,copyDeliveryFromForm,renderCheckout,syncCopyDelivery} from './checkout.mjs?v=20261109-versicherung-1';
import {validateMontagePolicy} from './montage.mjs?v=20261109-versicherung-1';
import {protectSignatureTouch} from './signature-touch.mjs?v=20261106-touch-1';
import {RETURN_EMAIL,returnMail,canShareFile,returnSignedPDF} from './return.mjs?v=20261106-ruecksendung-1';
import * as pdfjs from './vendor/pdf.min.mjs';
import {LEGAL_CONSENT,BUSINESS_CONSENT,attachmentInfo,validateAttachments,validateLayout,rejectExistingSignatures,stampPDF,germanDate,signedName,detectLayout,readEmbeddedLayout} from './core.mjs?v=20261109-versicherung-1';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
let bytes,offer,pdf,pageNumber=1,pad,signedFile,signedURL,originalURL,csrf='',serverAvailable=false,ownerPDF,ownerBytes,ownerLayout,ownerPage=1,pickMode='',ownerTitle='',currentToken='',preparedToken='',renderSerial=0,ownerRenderSerial=0;
const visited=new Set();let preparedId='',recordsTrash=false;
let signatureSubmitted=false,archiveTimer=null,archivePolls=0;
let completionLocked=false,completionRequest="",signingData=null;const attachmentURLs=[];
let ownerFile=null,ownerAttachments=[],customerAttachmentFiles=new Map(),ownerImportSerial=0,ownerCanPublish=false,ownerMontagePolicy=null,ownerSourcePages=null,ownerSourceSHA='';
const signatureTouch=protectSignatureTouch($('signature'),{onIdle:()=>requestAnimationFrame(resizePad),onCancel:()=>{if(pad){pad.off();pad.on();invalidateSigned();}}});
function message(text=''){ $('status').hidden=!text;$('status').textContent=text; }
function fail(error){$('loading').hidden=true;$('customer').hidden=true;$('owner').hidden=true;$('access-gate').hidden=true;$('error').hidden=false;$('error-text').textContent=error.message||String(error);}
function showStage(stage){if((completionLocked||signatureSubmitted)&&stage!=='complete')return;signatureTouch.reset();document.activeElement?.blur?.();for(const s of ['review','sign','complete'])$(s).hidden=s!==stage;for(const [i,s] of ['review','sign','complete'].entries()){const el=$(['step-one','step-two','step-three'][i]);el.removeAttribute('aria-current');if(s===stage)el.setAttribute('aria-current','step');}message();window.scrollTo({top:0,behavior:'instant'});if(stage==='sign'){requestAnimationFrame(resizePad);} }
async function openPDF(data){return pdfjs.getDocument({data:data.slice(),isEvalSupported:false,enableXfa:false,useSystemFonts:true,disableFontFace:false,wasmUrl:new URL('./vendor/wasm/',import.meta.url).href}).promise;}
async function hash(data){if(!crypto.subtle)throw Error('Bitte diese Seite über den sicheren HTTPS-Link öffnen.');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function api(action,{method='GET',body,token,binary=false}={}){
 const headers={};if(csrf)headers['X-CSRF-Token']=csrf;if(token)headers['X-Offer-Token']=token;if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
 const r=await fetch(`server/api.php?action=${action}`,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'same-origin'}),ct=r.headers.get('content-type')||'';
 if(r.ok&&binary&&!ct.includes('application/json'))return new Uint8Array(await r.arrayBuffer());
 if(!ct.includes('application/json'))throw Error('Die geschützte Angebotsablage ist hier noch nicht eingerichtet.');
 const data=await r.json();if(!r.ok){const e=Error(data.error||'Der Vorgang konnte nicht ausgeführt werden.');e.code=data.code;throw e;}return data;
}
async function renderPage(doc,n,target,width){const p=await doc.getPage(n),base=p.getViewport({scale:1}),scale=Math.min(2.3,(width||target.parentElement.clientWidth||700)/base.width*Math.max(1,Math.min(devicePixelRatio||1,2)));const viewport=p.getViewport({scale}),temp=document.createElement('canvas');temp.width=Math.ceil(viewport.width);temp.height=Math.ceil(viewport.height);await p.render({canvasContext:temp.getContext('2d'),viewport,annotationMode:pdfjs.AnnotationMode.ENABLE}).promise;target.width=temp.width;target.height=temp.height;target.getContext('2d').drawImage(temp,0,0);return {p,base,scale,temp};}
async function renderOffer(){const id=++renderSerial;$('prev-page').disabled=pageNumber===1;$('next-page').disabled=pageNumber===pdf.numPages;$('page-label').textContent=`Seite ${pageNumber} von ${pdf.numPages}`;const temp=document.createElement('canvas');temp.width=1;const data=await renderPage(pdf,pageNumber,temp,$('offer-canvas').parentElement.clientWidth);if(id!==renderSerial)return;const c=$('offer-canvas');c.width=data.temp.width;c.height=data.temp.height;c.getContext('2d').drawImage(data.temp,0,0);visited.add(pageNumber);}
async function loadCustomer(data,metadata,localFiles=new Map()){
 const test=await PDFLib.PDFDocument.load(data,{updateMetadata:false});rejectExistingSignatures(test,PDFLib);validateLayout(metadata.layout,test.getPages());
 if(metadata.checkout?.version===2&&metadata.checkout.source_sha256!==await hash(data))throw Error('Die Angebotsangaben gehören nicht zu dieser PDF. Bitte einen neuen Link anfordern.');bytes=data;offer=metadata;$('signed-canvas').hidden=false;renderCheckout($('checkout-summary'),offer);renderInsuranceSummary($('checkout-summary'),offer.insurance);customerAttachmentFiles=localFiles;offer.sha256 ||= await hash(data);offer.attachments ||= [];completionLocked=false;signatureSubmitted=false;archivePolls=0;if(archiveTimer)clearTimeout(archiveTimer);completionRequest="";signingData=null;pdf=await openPDF(bytes);pageNumber=1;visited.clear();
 const signatureCosts=$('signature-insurance-summary');if(signatureCosts){signatureCosts.replaceChildren();signatureCosts.hidden=!offer.insurance?.data;renderInsuranceSummary(signatureCosts,offer.insurance);}
 if(originalURL)URL.revokeObjectURL(originalURL);originalURL=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));$('original-pdf').href=originalURL;
 $('offer-title').textContent=metadata.title;$('sign-offer').textContent=metadata.title;$('demo-banner').hidden=!(metadata.demo||metadata.archive_test);
 if(metadata.archive_test)$('demo-banner').innerHTML=metadata.archive_mode==='signed_pdf_only'?'<b>Archivtest – kein Kundenauftrag</b><br>Beim ausdrücklichen Abschluss wird die unterschriebene Muster-PDF geprüft im geschützten Archiv von Sichtwerk gespeichert. Bitte nur mit „TEST“ unterschreiben. Es entsteht kein Auftrag.':'<b>Archivtest – kein Kundenauftrag</b><br>Diese frühere Freigabe verwendet weiterhin die vollständige Paketablage auf STRATO und in Drive. Bitte nur mit „TEST“ unterschreiben. Es entsteht kein Auftrag.';
 $('confirm-text').textContent=metadata.demo||metadata.archive_test?'Ich möchte das Unterschreiben unverbindlich ausprobieren. Es entsteht kein Auftrag.':'Ich habe das Angebot mit allen Seiten gelesen und nehme es mit meiner Unterschrift unverändert an.';
 mountAuthority($('authority-fields'),offer,()=>{invalidateSigned();$('confirm').checked=false;});renderAuthoritySummary($('authority-summary'),null);
 offer.consent ||= LEGAL_CONSENT;$('confirm').checked=false;$('legal-confirm').checked=false;$('legal-confirm-text').textContent=metadata.demo?'Im Muster: Ich probiere die Pflichtbestätigung zu den Vertragsunterlagen aus. Es entsteht kein Auftrag.':offer.consent.text;const business=offer.checkout?.contract_type==='work_business';$('legal-intro').textContent=business?'Bitte die gemeinsamen AGB vor der verbindlichen Annahme lesen und speichern. Dieser Auftrag ist für den genannten Geschäftskunden bestimmt.':'Bitte beachten Sie vor dem Abschluss die AGB und die Widerrufsbelehrung einschließlich Muster-Widerrufsformular. Hier können Sie beide Unterlagen einsehen und speichern.';$('legal-consent-section').setAttribute('aria-label',business?'AGB für den Geschäftskundenauftrag':'AGB und Widerrufsbelehrung');
 if(metadata.checkout&&!metadata.archive_test)$('confirm-text').textContent='Ich habe das Angebot und die zugehörigen Unterlagen geprüft. Die verbindliche Annahme erfolgt mit dem Abschlussbutton im nächsten Schritt.'+(metadata.copy_consent?' '+metadata.copy_consent.text:'');
 if(offer.authority)$('confirm-text').textContent+=' '+offer.authority.confirmation;
 pad?.clear();$('full-name').value=metadata.archive_test?'Testperson Sichtwerk':'';invalidateSigned();$('finalize-offer').textContent=metadata.archive_test?'Archivtest abschließen →':'Unterschrift abschließen →';
 $('back-preparation').hidden=!metadata.test;
 $('loading').hidden=true;$('access-gate').hidden=true;$('owner').hidden=true;$('customer').hidden=false;$('error').hidden=true;$('commission-label').textContent=[metadata.customer_name,metadata.commission?('Kommission '+metadata.commission):'',metadata.revision?('Stand '+metadata.revision):''].filter(Boolean).join(' · ');renderDocuments();showStage('review');await renderOffer();
}
function resizePad(){if($('sign').hidden||signatureTouch.active)return;const c=$('signature'),w=c.clientWidth,h=c.clientHeight,dpr=Math.max(1,Math.min(devicePixelRatio||1,3));if(!w||!h)return;const data=pad?.toData()||[],oldW=Number(c.dataset.width)||w,oldH=Number(c.dataset.height)||h;if(c.width===Math.round(w*dpr)&&c.height===Math.round(h*dpr))return;c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.getContext('2d').scale(dpr,dpr);c.dataset.width=w;c.dataset.height=h;if(!pad){pad=new SignaturePad(c,{backgroundColor:'rgba(255,255,255,0)',penColor:'#000000',minWidth:1.4,maxWidth:3.2,minDistance:1});pad.addEventListener('endStroke',invalidateSigned);}else{pad.clear();if(data.length)pad.fromData(data.map(g=>({...g,points:g.points.map(p=>({...p,x:p.x*w/oldW,y:p.y*h/oldH}))})));}}
function invalidateSigned(){if(completionLocked||signatureSubmitted)return;if(signedURL){URL.revokeObjectURL(signedURL);signedURL='';}signedFile=null;$('preview-pdf').hidden=true;}
function cropSignature(){if(!pad||pad.isEmpty())throw Error('Bitte zuerst mit dem Finger unterschreiben.');const c=$('signature'),ctx=c.getContext('2d'),pixels=ctx.getImageData(0,0,c.width,c.height);let x0=c.width,y0=c.height,x1=-1,y1=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const p=(y*c.width+x)*4;if(pixels.data[p+3]>45&&pixels.data[p]<220){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}if(x1-x0<12||y1-y0<3)throw Error('Bitte eine vollständige Unterschrift in das weiße Feld schreiben.');const out=document.createElement('canvas');out.width=x1-x0+9;out.height=y1-y0+9;out.getContext('2d').drawImage(c,x0-4,y0-4,out.width,out.height,0,0,out.width,out.height);return out;}
function textPanel(text,r,withSignature){const factor=4,c=document.createElement('canvas');c.width=Math.round(r.w*factor);c.height=Math.round(r.h*factor);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#000';ctx.textBaseline='middle';const padding=4*factor;if(withSignature){const sig=cropSignature(),nameHeight=Math.max(10*factor,c.height*.24),areaH=c.height-nameHeight-6*factor,scale=Math.min((c.width-padding*2)/sig.width,areaH/sig.height);ctx.drawImage(sig,padding,2*factor,sig.width*scale,sig.height*scale);let size=Math.min(11*factor,nameHeight*.75);do{ctx.font=`${size}px Arial, sans-serif`;if(ctx.measureText(text).width<=c.width-padding*2)break;size-=1;}while(size>6*factor);ctx.fillText(text,padding,c.height-nameHeight/2,c.width-padding*2);}else{let size=Math.min(12*factor,c.height*.72);do{ctx.font=`${size}px Arial, sans-serif`;if(ctx.measureText(text).width<=c.width-padding*2)break;size-=1;}while(size>6*factor);ctx.fillText(text,padding,c.height/2,c.width-padding*2);}return c.toDataURL('image/png');}
async function createSigned(e){e.preventDefault();if(completionLocked||signatureSubmitted)return;message();if(!$('sign-form').reportValidity())return;const name=$('full-name').value.trim().replace(/\s+/g,' ');if(name.length<3){message('Bitte Ihren vollständigen Namen eingeben.');$('full-name').focus();return;}const button=$('create-pdf');button.disabled=true;button.textContent='Ihre PDF wird erstellt …';try{const date=germanDate($('sign-date').value),authority=authorityFromForm($('authority-fields'),offer,name,$('sign-date').value,$('confirm').checked);const images={signature:textPanel(name,offer.layout.signature,true),date:textPanel(date,offer.layout.date,false),...(authority?{authority:authorityPage(authority,offer,document)}:{})};const result=await stampPDF(bytes.slice(),offer.layout,images,PDFLib,{authority,insurance:offer.insurance,testLabel:!!(offer.test||offer.archive_test),bundle:offer.attachments,checkout:offer.checkout,copyConsent:offer.copy_consent?{...offer.copy_consent,accepted:$('confirm').checked}:null,consent:{...offer.consent,accepted:true,text:$('legal-confirm-text').textContent,test:!!(offer.demo||offer.archive_test)}});invalidateSigned();signedFile=new File([result],(offer.test||offer.archive_test?'PROBELAUF_':'')+signedName(offer.filename||offer.title),{type:'application/pdf'});signedURL=URL.createObjectURL(signedFile);$('download-pdf').href=signedURL;$('download-pdf').download=signedFile.name;$('open-pdf').href=signedURL;$('preview-pdf').href=signedURL;$('preview-pdf').hidden=false;renderAuthoritySummary($('authority-summary'),authority);signingData={...(offer.insurance?.pdf?{insurance_sha256:offer.insurance.pdf.sha256}:{}),...(authority?{authority:authorityPayload(authority)}:{}),name,date:$('sign-date').value,legal_consent:true,consent_version:offer.consent.version,...(offer.copy_consent?{copy_consent:$('confirm').checked,copy_consent_version:offer.copy_consent.version}:{})};completionRequest=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join('');$('finalize-area').hidden=false;$('return-area').hidden=true;$('correct').hidden=false;$('completion-title').textContent='Unterschrift prüfen';$('completion-text').textContent='Bitte Name, Datum und Unterschrift prüfen. Mit dem nächsten Button schließen Sie die Unterschrift ab.';$('finalize-offer').disabled=true;$('send-status').textContent='Zusätzliches Teilen ist freiwillig.';showStage('complete');const signedDoc=await openPDF(new Uint8Array(result));try{const data=await renderPage(signedDoc,offer.layout.page+1,$('signed-canvas'));const r=offer.layout.signature,top=Math.max(0,Math.min(r.y,offer.layout.date.y)-25),bottom=Math.min(data.base.height,Math.max(r.y+r.h,offer.layout.date.y+offer.layout.date.h)+25),c=$('signed-canvas');c.width=data.temp.width;c.height=Math.ceil((bottom-top)*data.scale);c.getContext('2d').fillStyle='#fff';c.getContext('2d').fillRect(0,0,c.width,c.height);c.getContext('2d').drawImage(data.temp,0,top*data.scale,data.temp.width,(bottom-top)*data.scale,0,0,c.width,c.height);}finally{await signedDoc.destroy();}
 $('finalize-offer').disabled=false;configureReturn();
 }catch(error){showStage('sign');message(error.message||'Die PDF konnte nicht erstellt werden. Bitte noch einmal versuchen.');}finally{button.disabled=false;button.textContent='Unterschrift ins Angebot einsetzen →';}}
function configureReturn(){
 if(offer.demo||offer.test)$('finalize-offer').textContent='Musterabschluss testen';else if(offer.checkout&&!offer.archive_test)$('finalize-offer').textContent=ORDER_BUTTON;
 $('optional-sharing').open=false;
 const supported=canShareFile(navigator,signedFile);
 $('email-options').hidden=true;$('show-email-options').hidden=!supported;
 $('email-pdf').textContent=supported?'PDF per E-Mail teilen':'Per E-Mail zurücksenden';
 $('share-pdf').textContent=supported?'PDF per WhatsApp teilen':'PDF für WhatsApp speichern';
 $('share-hint').textContent=supported?'Im Teilen-Menü WhatsApp und den Chat mit Swen Neubauer auswählen. Dort den Versand bestätigen.':'Bitte die PDF speichern und im bestehenden WhatsApp-Chat mit Swen Neubauer als Dokument anhängen.';
 $('email-hint').textContent=supported?'Im Teilen-Menü Ihre Mail-App auswählen. Die PDF wird übergeben. Als Empfänger '+RETURN_EMAIL+' eintragen und den Anhang vor dem Senden prüfen.':'Empfänger: '+RETURN_EMAIL+'. Die PDF zunächst speichern, dann im Mailprogramm anhängen.';
 $('email-draft').href=returnMail({title:offer.title,name:signingData?.name,demo:offer.demo||offer.archive_test});
 $('download-email-pdf').href=signedURL;$('download-email-pdf').download=signedFile.name;
 $('finalize-hint').textContent=offer.archive_mode==='signed_pdf_only'&&!offer.demo?(offer.archive_test?'Mit „Archivtest abschließen“ wird nur die unterschriebene Muster-PDF im geschützten Archiv von Sichtwerk gesichert und geprüft. Danach wird der Testlink gesperrt. Es entsteht kein Auftrag.':'Mit „Unterschrift abschließen“ wird Ihre unterschriebene Angebots-PDF im geschützten Archiv von Sichtwerk gesichert und geprüft. Danach wird der Angebotslink gesperrt. Ein zusätzliches Zurücksenden ist nicht erforderlich.'):offer.archive_test?'Mit „Archivtest abschließen“ wird dieses Musterpaket auf STRATO und in Google Drive gesichert und zurückgeprüft. Danach wird der Testlink gesperrt. Es entsteht kein Auftrag.':offer.demo?'Mit dem Musterabschluss testen Sie den Ablauf. Es erfolgt keine automatische Übertragung oder Archivierung. Danach können Sie die Test-PDF selbst teilen oder speichern.':'Mit „Unterschrift abschließen“ werden Ihre Unterlagen geschützt an Sichtwerk übertragen. Nach bestätigter Archivierung wird der Angebotslink gesperrt. Ein zusätzliches Zurücksenden ist nicht erforderlich. Sichtwerk wird nach bestätigter Ablage automatisch benachrichtigt.';
 if(offer.checkout&&!offer.archive_test&&!offer.demo&&!offer.test)$('finalize-hint').textContent='Mit „'+ORDER_BUTTON+'“ nehmen Sie das oben bezeichnete Angebot zahlungspflichtig an. Ihre Unterschrift wird übermittelt. Der Angebotslink wird erst nach bestätigter Archivierung gesperrt. Sie müssen nichts zurückschicken.';
 $('return-storage').textContent=offer.archive_mode==='signed_pdf_only'&&!offer.demo?'Ihre unterschriebene PDF ist im geschützten Archiv von Sichtwerk gesichert. Sie müssen nichts zurückschicken. Hier können Sie Ihre eigene Kopie speichern.':offer.demo?'Probelauf: Es wurden keine Unterlagen automatisch an Sichtwerk übertragen oder archiviert. Sie können die Test-PDF jetzt selbst teilen oder speichern.':'Ihre Unterlagen wurden geschützt an Sichtwerk übertragen und archiviert. Sie müssen nichts zurückschicken. Hier können Sie Ihre eigene Kopie speichern.';
 $('send-status').textContent='Zusätzliches Teilen ist noch nicht erfolgt. Die Übergabe an eine App bestätigt keinen Eingang.';
}
function showEmailOptions(){if(!signedFile||!completionLocked)return;$('email-options').hidden=false;$('email-options').scrollIntoView({behavior:'smooth',block:'nearest'});}
function sharePDF(channel='whatsapp'){
 if(!signedFile||!completionLocked)return;
 return returnSignedPDF({channel,file:signedFile,title:(offer.demo?'PROBELAUF – ':'')+offer.title,navigator,
  onStatus:text=>{$('send-status').textContent=text;},
  onFallback:method=>{if(method==='email')showEmailOptions();else{$('download-pdf').click();$('send-status').textContent='Bitte die gespeicherte PDF im WhatsApp-Chat mit Swen Neubauer als Dokument anhängen und dort senden. Der Eingang ist hier nicht bestätigt.';}}
 });
}

function ownerCheckout(){return checkoutFromPDF(ownerSourcePages,ownerSourceSHA,ownerMontagePolicy,{...copyDeliveryFromForm(document),contract_type:$('customer-kind').value,customer_type_confirmed:$('placement-confirm').checked});}
$('customer-kind').onchange=()=>{$('placement-confirm').checked=false;$('offer-link-result').hidden=true;};
async function scanOffer(doc){const pages=[];for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n),v=p.getViewport({scale:1}),text=await p.getTextContent();pages.push({width:v.width,height:v.height,items:text.items.filter(t=>t.str?.trim()).map(t=>{const x=pdfjs.Util.transform(v.transform,t.transform);return {text:t.str,x:x[4],y:x[5]-Math.abs(x[3]),w:t.width,h:Math.abs(x[3]),font:t.fontName};})});}return {layout:detectLayout(pages),imported:extractOffer(pages),pages};}
async function prepareFile(file){
 message();if(!file)return;const seq=++ownerImportSerial;ownerFile=null;ownerSourcePages=null;ownerSourceSHA='';ownerAttachments=[];resetOfferFields(document);$('extra-files').value='';$('prepared-title').value='';$('placement').hidden=true;$('offer-link-result').hidden=true;$('placement-confirm').checked=false;$('publish-offer').disabled=true;$('offer-fields').hidden=true;$('offer-import-status').textContent='Die Angebots-PDF wird ausgelesen …';renderAttachmentSelection();
 let parsed;
 try{
  if(file.size>20*1024*1024)throw Error('Bitte eine PDF mit höchstens 20 MB auswählen.');const data=new Uint8Array(await file.arrayBuffer());if(seq!==ownerImportSerial)return;
  const doc=await PDFLib.PDFDocument.load(data,{updateMetadata:false});rejectExistingSignatures(doc,PDFLib);parsed=await openPDF(data);if(parsed.numPages>100)throw Error('Bitte höchstens 100 Angebotsseiten auswählen.');const scanned=await scanOffer(parsed);if(seq!==ownerImportSerial){await parsed.destroy();return;}
  const sourceSHA=await hash(data);if(seq!==ownerImportSerial){await parsed.destroy();return;}const automaticCheckout=checkoutFromPDF(scanned.pages,sourceSHA,ownerMontagePolicy);$('customer-kind').value=automaticCheckout.contract_type;ownerSourcePages=scanned.pages;ownerSourceSHA=sourceSHA;const previousPDF=ownerPDF;ownerBytes=data;ownerPDF=parsed;if(previousPDF)previousPDF.destroy().catch(()=>{});ownerTitle=file.name.replace(/\.pdf$/i,'');$('prepared-title').value=ownerTitle;ownerLayout=readEmbeddedLayout(doc,PDFLib)||scanned.layout;
  applyOfferImport(document,scanned.imported);syncCopyDelivery(document);if(!$('commission-id').value)$('commission-id').value=ownerTitle.match(/AG-\d{4}-\d{2}-\d+/)?.[0]||'';
  if(!ownerLayout&&/AG-2026-10-016[234].*mobil/i.test(file.name))ownerLayout={page:ownerPDF.numPages-1,date:{x:125,y:243,w:414,h:18},signature:{x:145,y:270,w:394,h:42}};
  $('auto-result').textContent=ownerLayout?'Eine mögliche Unterschriftsstelle wurde erkannt. Bitte beide markierten Flächen vor dem Versand prüfen.':'Keine eindeutige Unterschriftsstelle erkannt. Bitte die richtige Seite öffnen und die Flächen für Datum und Unterschrift markieren.';
  ownerPage=ownerLayout?ownerLayout.page+1:ownerPDF.numPages;if(!ownerLayout)ownerLayout={page:ownerPage-1};ownerFile=file;$('offer-fields').hidden=false;$('placement').hidden=false;renderAttachmentSelection();await renderOwner();
 }catch(e){if(seq!==ownerImportSerial){if(parsed&&parsed!==ownerPDF)await parsed.destroy();return;}if(seq===ownerImportSerial){ownerFile=null;$('offer-import-status').textContent='Die PDF konnte nicht übernommen werden. Bitte eine passende Angebots-PDF auswählen.';if(parsed&&parsed!==ownerPDF)await parsed.destroy();}throw e;}
 finally{if(seq===ownerImportSerial)$('publish-offer').disabled=!ownerCanPublish||!ownerFile;}
}
async function renderOwner(){const seq=++ownerRenderSerial;$('owner-prev').disabled=ownerPage===1;$('owner-next').disabled=ownerPage===ownerPDF.numPages;$('owner-page').textContent=`Seite ${ownerPage} von ${ownerPDF.numPages}`;const temp=document.createElement('canvas');const d=await renderPage(ownerPDF,ownerPage,temp,$('owner-canvas').parentElement.clientWidth);if(seq!==ownerRenderSerial)return;const c=$('owner-canvas');c.width=d.temp.width;c.height=d.temp.height;c.getContext('2d').drawImage(d.temp,0,0);c.dataset.pageWidth=d.base.width;c.dataset.pageHeight=d.base.height;drawPlacement();}
function drawPlacement(){for(const key of ['signature','date']){const el=$(key+'-box'),r=ownerLayout?.[key],c=$('owner-canvas'),w=+c.dataset.pageWidth,h=+c.dataset.pageHeight;el.hidden=!r||ownerLayout.page!==ownerPage-1;if(!el.hidden)Object.assign(el.style,{left:r.x/w*100+'%',top:r.y/h*100+'%',width:r.w/w*100+'%',height:r.h/h*100+'%'});}}
function chooseMode(mode){pickMode=mode;for(const k of ['signature','date'])$('pick-'+k).setAttribute('aria-pressed',String(k===mode));$('placement-view').classList.add('picking');}
function checkedLayout(){if(!$('placement-confirm').checked)throw Error('Bitte zuerst die Platzierung auf der PDF prüfen und das Häkchen setzen.');if(!ownerLayout?.signature||!ownerLayout?.date)throw Error('Bitte beide Flächen für Datum und Unterschrift markieren.');return ownerLayout;}
async function initOwner(){
 const policyResponse=await fetch('montage-current.json',{cache:'no-store'});if(!policyResponse.ok)throw Error('Die Montagebedingungen konnten nicht geladen werden. Bitte die Seite neu laden.');ownerMontagePolicy=validateMontagePolicy(await policyResponse.json());
 $('loading').hidden=true;$('owner').hidden=false;if(params.get('passwort')==='geaendert')message('Passwort geändert. Bitte mit deinem neuen Passwort anmelden.');
 try{const data=await api('status');serverAvailable=data.configured;csrf=data.csrf||'';if(data.authenticated){$('login-area').hidden=true;$('prepare-area').hidden=false;await loadPreparationStatus();}}
 catch{serverAvailable=false;}
 $('server-note').hidden=serverAvailable;if(!serverAvailable){$('login-area').hidden=true;$('prepare-area').hidden=false;$('publish-offer').disabled=true;$('publish-offer').textContent='Kundenlink nach Einrichtung der Ablage';$('records-admin').hidden=true;$('notification-admin').hidden=true;$('withdrawals-admin').hidden=true;$('archive-status').textContent='Öffentliches Muster: Es werden keine echten Kundendaten auf einen Server oder nach Drive übertragen.';}
}
async function loadTokenOffer(){const meta=await api('offer',{token:currentToken});csrf=meta.csrf;const data=await api('document',{token:currentToken,binary:true});if(await hash(data)!==meta.sha256)throw Error('Die PDF passt nicht zum Angebotslink. Bitte einen neuen Link anfordern.');await loadCustomer(data,meta);if(meta.archive_pending){signatureSubmitted=true;showStage('complete');$('signed-canvas').hidden=true;showArchivePending({retry_after:2});}}
async function init(){
 try {
  if(!window.PDFLib||!window.SignaturePad)throw Error('Die Unterschriftsfunktion konnte nicht geladen werden. Bitte die Seite neu öffnen.');
  const now=new Date();
  $('sign-date').value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if(params.has('vorbereiten'))return initOwner();
  currentToken=customerTokenFromFragment(location.hash);
  if(currentToken){
   const access=await api('access',{token:currentToken});
   csrf=access.csrf;
   if(access.requires_code&&!access.unlocked){
    $('loading').hidden=true;
    $('access-gate').hidden=false;
   }else await loadTokenOffer();
   return;
  }
  const [metadataResponse,pdfResponse]=await Promise.all([fetch('demo.json',{cache:'no-store'}),fetch('musterangebot.pdf')]);
  if(!metadataResponse.ok||!pdfResponse.ok)throw Error('Das Musterangebot konnte nicht geladen werden.');
  await loadCustomer(new Uint8Array(await pdfResponse.arrayBuffer()),await metadataResponse.json());
 }catch(error){fail(error);}
}
$('retry').onclick=()=>location.reload();$('prev-page').onclick=()=>{pageNumber--;renderOffer().catch(e=>message(e.message));};$('next-page').onclick=()=>{pageNumber++;renderOffer().catch(e=>message(e.message));};$('to-sign').onclick=()=>showStage('sign');$('back-review').onclick=()=>showStage('review');$('correct').onclick=()=>showStage('sign');$('clear-signature').onclick=()=>{pad?.clear();invalidateSigned();message();};$('sign-form').onsubmit=createSigned;$('share-pdf').onclick=()=>sharePDF();$('email-pdf').onclick=()=>sharePDF('email');$('show-email-options').onclick=showEmailOptions;
for(const id of ['full-name','sign-date','confirm','legal-confirm'])$(id).addEventListener('input',invalidateSigned);
window.addEventListener('resize',()=>resizePad());window.addEventListener('pagehide',()=>{ /* No persistent signature or customer data in browser storage. */ });
$('login').onclick=async()=>{try{const s=await api('login',{method:'POST',body:{password:$('password').value}});csrf=s.csrf;$('password').value='';$('login-area').hidden=true;$('prepare-area').hidden=false;await loadPreparationStatus();message();}catch(e){message(e.message);}};
$('pdf-file').onchange=()=>prepareFile($('pdf-file').files[0]).catch(e=>message(e.message));$('owner-prev').onclick=()=>{ownerPage--;renderOwner().catch(e=>message(e.message));};$('owner-next').onclick=()=>{ownerPage++;renderOwner().catch(e=>message(e.message));};$('pick-signature').onclick=()=>chooseMode('signature');$('pick-date').onclick=()=>chooseMode('date');
let drag=null;const view=$('placement-view');function pointerPoint(e){const rect=$('owner-canvas').getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};}
view.addEventListener('pointerdown',e=>{if(!pickMode)return;e.preventDefault();view.setPointerCapture(e.pointerId);drag=pointerPoint(e);$('placement-confirm').checked=false;});view.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();const p=pointerPoint(e),el=$('draw-box');el.hidden=false;Object.assign(el.style,{left:Math.min(p.x,drag.x)*100+'%',top:Math.min(p.y,drag.y)*100+'%',width:Math.abs(p.x-drag.x)*100+'%',height:Math.abs(p.y-drag.y)*100+'%'});});view.addEventListener('pointerup',e=>{if(!drag)return;const p=pointerPoint(e),c=$('owner-canvas'),w=+c.dataset.pageWidth,h=+c.dataset.pageHeight;if(Math.abs(p.x-drag.x)*w>=40&&Math.abs(p.y-drag.y)*h>=(pickMode==='signature'?25:12)){if(ownerLayout.page!==ownerPage-1)ownerLayout={page:ownerPage-1};ownerLayout[pickMode]={x:Math.min(p.x,drag.x)*w,y:Math.min(p.y,drag.y)*h,w:Math.abs(p.x-drag.x)*w,h:Math.abs(p.y-drag.y)*h};}else message('Bitte eine größere Fläche markieren.');drag=null;$('draw-box').hidden=true;pickMode='';view.classList.remove('picking');for(const k of ['signature','date'])$('pick-'+k).setAttribute('aria-pressed','false');drawPlacement();});view.addEventListener('pointercancel',()=>{drag=null;$('draw-box').hidden=true;});
function syncInsurancePreparation(){
 const on=$('insurance-case').checked,select=$('assignment-attachment'),old=select.selectedOptions[0]?.dataset.filename||'';select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Unterschriebene Abtretung auswählen';select.append(empty);
 ownerAttachments.forEach((f,i)=>{if(!/\.pdf$/i.test(f.name))return;const o=document.createElement('option');o.value=String(i);o.textContent=f.name;o.dataset.filename=f.name;select.append(o);if(f.name===old)select.value=String(i);});
 if(!select.value){const candidates=ownerAttachments.map((f,i)=>({f,i})).filter(x=>/abtret.*\.pdf$/i.test(x.f.name));if(candidates.length===1)select.value=String(candidates[0].i);}
 select.required=on;$('insurance-options').hidden=!on;$('publish-offer').textContent=on?'3. Versicherungslink erstellen':'3. Kundenlink erstellen';
}
$('insurance-case').onchange=()=>{$('offer-link-result').hidden=true;syncInsurancePreparation();};
function showWorkflowLink(result,customerName){const link=workflowURL(result,location,customerName);preparedId=result.id;preparedToken=result.role==='customer'?result.token:'';$('offer-link').value=link;$('offer-link-label').textContent=result.role==='insurance'?'Diesen Link an die Versicherung senden':'Diesen Link an den Kunden senden';$('offer-link-result').hidden=false;message(result.role==='insurance'?'Versicherungslink erstellt. Nach bestätigter Zusage unter Meine Vorgänge den Kundenlink erstellen.':'Kundenlink erstellt. Er enthält die unveränderte Versichererzusage und die Abtretung. Ein vorheriger Kundenlink dieses Vorgangs ist gesperrt.');$('offer-link-result').scrollIntoView({behavior:'smooth'});}
function renderAttachmentSelection(){
 const list=$('extra-file-list');list.replaceChildren();const total=ownerAttachments.reduce((sum,f)=>sum+f.size,0),size=total<1024*1024?Math.ceil(total/1024)+' KB':(total/1024/1024).toLocaleString('de-DE',{maximumFractionDigits:1})+' MB';
 syncInsurancePreparation();$('extra-file-summary').textContent=ownerAttachments.length?`${ownerAttachments.length} von 12 Anlagen ausgewählt · ${size}`:'Noch keine zusätzlichen Unterlagen ausgewählt.';
 for(const [index,file] of ownerAttachments.entries()){
  const row=document.createElement('li'),text=document.createElement('span'),name=document.createElement('b'),detail=document.createElement('small'),remove=document.createElement('button');
  name.textContent=file.name;detail.textContent=`${file.name.split('.').pop().toUpperCase()} · ${(file.size/1024).toLocaleString('de-DE',{maximumFractionDigits:0})} KB`;text.append(name,detail);
  remove.type='button';remove.className='secondary';remove.textContent='Entfernen';remove.setAttribute('aria-label',file.name+' entfernen');remove.onclick=()=>{ownerAttachments.splice(index,1);renderAttachmentSelection();};row.append(text,remove);list.append(row);
 }
}
$('extra-files').onchange=()=>{try{const added=[...$('extra-files').files],next=[...ownerAttachments,...added];validateAttachments(next,ownerFile?.size||0);ownerAttachments=next;renderAttachmentSelection();message();}catch(e){message(e.message);}finally{$('extra-files').value='';}};
$('back-preparation').onclick=()=>{if(!offer?.test||completionLocked||signatureSubmitted)return;$('customer').hidden=true;$('owner').hidden=false;$('demo-banner').hidden=true;customerAttachmentFiles=new Map();message();window.scrollTo({top:0,behavior:'smooth'});};
$('local-test').onclick=async()=>{
 const button=$('local-test');button.disabled=true;
 try{
  const layout=checkedLayout(),doc=await PDFLib.PDFDocument.load(ownerBytes,{updateMetadata:false});validateLayout(layout,doc.getPages());const files=[...ownerAttachments];validateAttachments(files,ownerFile.size);
  const legalResponse=await fetch('demo.json',{cache:'no-store'});if(!legalResponse.ok)throw Error('Die Muster-Vertragsunterlagen konnten nicht geladen werden.');let {attachments}=await legalResponse.json();const checkout=ownerCheckout(),business=checkout.contract_type==='work_business';if(business)attachments=attachments.filter(f=>f.role!=='widerruf');const localFiles=new Map();
  for(const [index,file] of files.entries()){const id='local-extra-'+index;localFiles.set(id,file);attachments.push({...attachmentInfo(file),id,role:'anlage',version:'lokaler Probelauf',sha256:await hash(await file.arrayBuffer()),local:true});}
  const metadata={checkout,consent:business?BUSINESS_CONSENT:LEGAL_CONSENT,authority:authorityDefinition($('customer-name').value.trim()||'Unverbindlicher Musterkunde',business),title:$('prepared-title').value||ownerTitle,filename:ownerFile.name,layout,demo:true,test:true,attachments,customer_name:$('customer-name').value.trim(),commission:$('commission-id').value.trim()};
  $('demo-banner').innerHTML='<b>Lokaler Probelauf</b><br>Das Angebot und die ausgewählten Anlagen werden nur in diesem Browser verarbeitet. Sie wurden nicht hochgeladen.';
  await loadCustomer(ownerBytes.slice(),metadata,localFiles);
 }catch(e){message(e.message);}finally{button.disabled=false;}
};
$('publish-offer').onclick=async()=>{
 const button=$('publish-offer');
 try {
  for(const id of ['customer-id','customer-name','commission-id'])if(!$(id).reportValidity())return;
  const insurance=$('insurance-case').checked;
  if(insurance&&!$('assignment-attachment').reportValidity())return;
  const checkout=ownerCheckout(),layout=checkedLayout();
  const doc=await PDFLib.PDFDocument.load(ownerBytes,{updateMetadata:false});
  validateLayout(layout,doc.getPages());
  button.disabled=true;
  button.textContent='Angebot wird vorbereitet …';
  const form=new FormData();
  const customerName=$('customer-name').value.trim();
  validateAttachments(ownerAttachments,ownerFile.size);
  form.append('pdf',ownerFile);
  form.append('metadata',JSON.stringify({
   title:$('prepared-title').value||ownerTitle,
   layout,
   pageCount:ownerPDF.numPages,
   customer_id:$('customer-id').value.trim(),
   customer_name:customerName,
   commission:$('commission-id').value.trim(),
   checkout,
   ...(insurance?{insurance:{enabled:true,assignment_index:Number($('assignment-attachment').value)}}:{})
  }));
  for(const file of ownerAttachments)form.append('attachments[]',file);
  const result=await api('create',{method:'POST',body:form});
  preparedId=result.id;
  if(result.insurance_token){
   showWorkflowLink({id:result.id,token:result.insurance_token,role:'insurance'});
   return;
  }
  preparedToken=result.token;
  $('offer-link-label').textContent='Diesen Link an den Kunden senden';
  $('offer-link').value=workflowURL({role:'customer',token:result.token},location,customerName);
  $('offer-link-result').hidden=false;
  message('Neuer Kundenlink erstellt. Er öffnet nur diesen Kunden und diese Kommission. Vorherige Links derselben Kommission sind gesperrt.');
 }catch(error){message(error.message);}
 finally{button.disabled=!ownerCanPublish||!ownerFile;syncInsurancePreparation();}
};
$('copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('offer-link').value);message('Link kopiert. Jetzt im WhatsApp-Chat einfügen.');}catch{$('offer-link').select();message('Bitte den markierten Link kopieren.');}};
$('revoke-link').onclick=async()=>{try{await api('revoke',{method:'POST',body:preparedId?{id:preparedId}:{token:preparedToken}});$('offer-link-result').hidden=true;message('Der Kundenlink ist jetzt gesperrt.');}catch(e){message(e.message);}};
function saveBlob(data,name,mime){const file=new File([data],name,{type:mime}),url=URL.createObjectURL(file);attachmentURLs.push(url);const a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';a.click();}
function documentButton(f){
 const button=document.createElement('button');button.className='secondary';button.type='button';
 const text=document.createElement('span'),title=document.createElement('span'),details=document.createElement('small');
 title.textContent=f.role==='agb'?'AGB herunterladen':f.role==='widerruf'?'Widerrufsbelehrung + Formular herunterladen':f.name;
 details.textContent=[f.version?('Stand '+f.version):'',f.name].filter(Boolean).join(' · ');text.append(title,details);button.append(text);
 button.onclick=async()=>{button.disabled=true;try{const local=customerAttachmentFiles.get(f.id);if(f.local&&!local)throw Error('Bitte den lokalen Probelauf aus der Vorbereitung erneut öffnen.');const data=local?new Uint8Array(await local.arrayBuffer()):offer.demo?new Uint8Array(await(await fetch(f.demoPath)).arrayBuffer()):await api('attachment&id='+encodeURIComponent(f.id),{token:currentToken,binary:true});if(await hash(data)!==f.sha256)throw Error('Die Datei passt nicht zu diesem Unterlagenstand.');saveBlob(data,f.name,f.mime);}catch(e){message(e.message);}finally{button.disabled=false;}};
 return button;
}
function renderDocuments(){
 const list=$('document-list'),legal=$('sign-document-list');list.replaceChildren();legal.replaceChildren();
 for(const f of offer.attachments){list.append(documentButton(f));if(['agb','widerruf'].includes(f.role))legal.append(documentButton(f));}
 $('documents').hidden=!offer.attachments.length;
}

function showArchivePending(result){
 signatureSubmitted=true;$('checkout-summary').hidden=true;$('correct').hidden=true;$('completion-title').textContent='Unterschrift ist gespeichert';
 $('completion-text').textContent='Ihre Unterschrift ist bei Sichtwerk eingegangen. Die zusätzliche Sicherung läuft noch. Bitte nicht erneut unterschreiben.';
 $('finalize-area').hidden=false;$('return-area').hidden=true;$('finalize-hint').textContent='Der Angebotslink wird erst nach bestätigter Sicherung geschlossen. Sie können die Übertragung hier erneut prüfen.';
 $('finalize-offer').textContent='Sicherung erneut prüfen';
 if(archiveTimer)clearTimeout(archiveTimer);
 if(archivePolls++<20)archiveTimer=setTimeout(()=>finalizeOffer(),Math.max(2,Math.min(900,result.retry_after||5))*1000);
}
function showArchived(){
 completionLocked=true;signatureSubmitted=true;$('checkout-summary').hidden=true;if(archiveTimer)clearTimeout(archiveTimer);
 $('finalize-area').hidden=true;$('return-area').hidden=!signedFile;$('correct').hidden=true;
 $('completion-title').textContent=offer.archive_test?'Archivtest abgeschlossen':offer.demo?'Muster abgeschlossen':'Unterschrift abgeschlossen';
 $('completion-text').textContent=offer.archive_mode==='signed_pdf_only'&&!offer.demo?(offer.archive_test?'Die unterschriebene Muster-PDF ist im geschützten Archiv von Sichtwerk geprüft gespeichert. Dieser Testlink ist jetzt gesperrt. Es wurde kein Kundenauftrag erteilt.':'Vielen Dank. Ihre unterschriebene Angebots-PDF ist im geschützten Archiv von Sichtwerk geprüft gespeichert. Sie müssen nichts zurückschicken. Dieser Angebotslink ist jetzt gesperrt.'):offer.archive_test?'Das Testpaket ist auf STRATO und im geschützten Archiv von Sichtwerk geprüft gespeichert. Dieser Testlink ist jetzt gesperrt. Es wurde kein Kundenauftrag erteilt.':offer.demo?'Dies ist ein Muster. Im echten Vorgang wird der Link erst nach der bestätigten Archivierung geschlossen.':'Vielen Dank. Ihr unterschriebenes Angebot und die Unterlagen sind bei Sichtwerk eingegangen und archiviert. Sie müssen nichts zurückschicken. Dieser Angebotslink ist jetzt gesperrt.';
 if(!signedFile)$('completion-text').textContent+=' Ihre PDF kann Ihnen Swen Neubauer aus dem Archiv bereitstellen.';
 if(offer.checkout&&['whatsapp','paper'].includes(offer.checkout.copy_delivery))$('completion-text').textContent+=' Ihre vollständige Vertragskopie wird Ihnen von Sichtwerk '+(offer.checkout.copy_delivery==='paper'?'auf Papier':'als speicherbare Dateien per WhatsApp')+' übermittelt.';
 else if(offer.checkout)$('completion-text').textContent+=' Ihre Vertragskopie per E-Mail: '+(offer.customer_copy_state==='submitted'?'an den Maildienst übergeben. Bitte Postfach einschließlich Spam prüfen.':'Versand noch ausstehend oder unklar. Bitte Sichtwerk bei ausbleibender E-Mail kontaktieren.');
 if(originalURL){URL.revokeObjectURL(originalURL);originalURL='';}for(const url of attachmentURLs)URL.revokeObjectURL(url);attachmentURLs.length=0;
}
async function finalizeOffer(){
 if(completionLocked||(!signedFile&&!signatureSubmitted))return;
 if(!signatureSubmitted&&(!$('legal-confirm').checked||signingData?.legal_consent!==true||signingData.consent_version!==offer.consent.version)){showStage('sign');message('Bitte das Pflichtfeld zu den Vertragsunterlagen aktiv anhaken.');return;}
 const b=$('finalize-offer');if(b.disabled)return;if(offer.checkout&&signingData){signingData.order_consent=true;signingData.checkout_hash=offer.checkout_hash;}b.disabled=true;b.textContent='Unterschrift wird gesichert …';
 try{
  let result={ok:true};
  if(!offer.demo){
   if(signatureSubmitted)result=await api('archive-progress',{method:'POST',token:currentToken,body:{proof:offer.proof}});
   else{const body=new FormData();body.append('pdf',signedFile);body.append('metadata',JSON.stringify({...signingData,source_sha256:offer.sha256,proof:offer.proof,request_id:completionRequest,documents:Object.fromEntries(offer.attachments.map(f=>[f.id,f.sha256]))}));result=await api('complete',{method:'POST',token:currentToken,body});}
  }
  if(result.ok){offer.customer_copy_state=result.customer_copy_state;showArchived();message();}else if(result.archive_pending){showArchivePending(result);message();}else throw Error('Die Sicherung wurde noch nicht bestätigt.');
 }catch(e){message(e.message+' Bitte die Sicherung erneut prüfen oder Swen Neubauer kontaktieren.');if(signatureSubmitted)showArchivePending({retry_after:15});}
 finally{b.disabled=false;b.textContent=signatureSubmitted&&!completionLocked?'Sicherung erneut prüfen':offer.archive_test?'Archivtest abschließen →':offer.checkout?ORDER_BUTTON:'Unterschrift abschließen →';}
}
$('finalize-offer').onclick=finalizeOffer;
$('create-archive-test').onclick=async()=>{
 const b=$('create-archive-test');b.disabled=true;$('archive-test-result').hidden=true;$('archive-test-status').textContent='Musterunterlagen werden für den Archivtest vorbereitet …';
 try{
  const responses=await Promise.all([fetch('musterangebot.pdf',{cache:'no-store'}),fetch('datenschutz.pdf',{cache:'no-store'})]);if(responses.some(r=>!r.ok))throw Error('Die Musterunterlagen konnten nicht geladen werden.');
  const data=await Promise.all(responses.map(r=>r.arrayBuffer())),body=new FormData();body.append('pdf',new File([data[0]],'ARCHIVTEST_Musterangebot.pdf',{type:'application/pdf'}));body.append('attachments[]',new File([data[1]],'ARCHIVTEST_Zusatzanlage.pdf',{type:'application/pdf'}));if($('archive-test-checkout').checked)body.append('checkout_test','1');body.append('authority_test','1');
  const result=await api('archive-test',{method:'POST',body}),url=new URL('./',location.href);url.hash='auftrag='+result.token;$('archive-test-open').href=url.href;$('archive-test-result').hidden=false;$('archive-test-status').textContent='Testangebot vorbereitet. „Testangebot öffnen“ wählen; ein Kundencode ist nicht erforderlich. Echte Kundenfreigaben bleiben gesperrt.';
 }catch(e){$('archive-test-status').textContent=e.message;message(e.message);}finally{b.disabled=false;}
};
$('code-form').onsubmit=async e=>{e.preventDefault();const b=$('unlock-offer');b.disabled=true;try{await api('unlock',{method:'POST',token:currentToken,body:{code:$('customer-code').value.trim()}});$('customer-code').value='';await loadTokenOffer();message();}catch(e){if(['closed_link','expired_link','replaced_link'].includes(e.code))fail(e);else message(e.message);}finally{b.disabled=false;}};
async function loadPreparationStatus(){const l=await api('legal'),ready=l.archive_provider==='strato'?l.archive_ready:l.drive_configured;$('archive-policy').textContent='Versicherungsablauf: Kundenangebot, Versichererzusage, Abtretung und sämtliche Anlagen werden dauerhaft geprüft auf STRATO archiviert. Andere neue Freigaben behalten die Ablage nur der unterschriebenen Angebots-PDF. Frühere Pakete bleiben unverändert.';$('notification-status').textContent=l.notification_enabled?'Benachrichtigung an '+l.notification_recipient+' nach bestätigter Archivierung.':'E-Mail-Benachrichtigung ist deaktiviert.';if($('drive-connect'))$('drive-connect').hidden=true;if($('change-password'))$('change-password').hidden=false;$('archive-test-admin').hidden=l.releases_enabled!==false;$('create-archive-test').disabled=!ready;$('archive-test-status').textContent=ready?'Bereit für einen unverbindlichen STRATO-Archivtest mit Musterunterlagen.':'Die geschützte Ablage ist noch nicht beschreibbar.';ownerCanPublish=ready&&l.releases_enabled!==false;$('publish-offer').disabled=!ownerCanPublish||!ownerFile;$('publish-offer').textContent=l.releases_enabled===false?'Kundenfreigaben nach dem Einrichtungstest':ready?'3. Kundenlink erstellen':'Kundenfreigaben nach Archiveinrichtung';$('archive-status').textContent=ready?'STRATO-Archiv bereit. Zugriff: Meine Vorgänge anzeigen → Unterschriebene PDF laden. Jeder Abschluss wird vor der Linksperre geprüft.':'Die geschützte STRATO-Ablage ist noch nicht verfügbar.';}
$('records-trash').onchange=()=>$('load-records').click();
$('load-records').onclick=async()=>{
 try{
  recordsTrash=$('records-trash').checked;const {records}=await api('list'+(recordsTrash?'&trash=1':'')),root=$('record-list');root.replaceChildren();if(!records.length)root.textContent=recordsTrash?'Der Papierkorb ist leer.':'Noch keine freigegebenen Angebote.';
  for(const r of records){
   const card=document.createElement('article');card.className='record-card';
   const title=document.createElement('b');title.textContent=r.customer_name+' · '+r.commission;
   const state=document.createElement('p'),names={trashed:'Papierkorb',insurance_pending:'Versichererzusage ausstehend - Kunde noch nicht beauftragt',active:'Offen',completed:'Unterschrieben – Archiv bestätigt, Link gesperrt',archive_pending:'Unterschrift gespeichert – Archivierung ausstehend',revoked:'Gesperrt',replaced:'Durch neuen Link ersetzt'};
   state.textContent=(names[r.state]||r.state)+' · Freigabe '+r.revision;card.append(title,state);mountRecordActions(card,r,{api,reload:()=>$('load-records').click(),message,showLink:showWorkflowLink,document});if(r.state==='trashed'){root.append(card);continue;}if(r.authority){const declaration=document.createElement('p');declaration.textContent='Eigentum/Beauftragung: '+r.authority.role_text+' Auftraggeber: '+r.authority.principal_name;card.append(declaration);}if(r.state==='archive_pending'){const n=document.createElement('p');n.textContent='Die vorhandene Unterschrift bleibt erhalten. Bitte unten „Archivierung erneut versuchen“ wählen; keinen neuen Kundenlink anlegen.';card.append(n);}
   const button=(text,action,primary=false)=>{const b=document.createElement('button');b.className=primary?'primary':'secondary';b.textContent=text;b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){message(e.message);}finally{b.disabled=false;}};card.append(b);return b;};
   if(r.archive_mode!=='signed_pdf_only')button('Gesamtes Unterlagenpaket laden',async()=>{const data=await api('owner-file&id='+encodeURIComponent(r.id)+'&kind=archive',{binary:true});saveBlob(data,'Unterlagen_'+r.commission+'.zip','application/zip');});
   if(r.insurance?.pdf)button('Versichererzusage laden',async()=>{const data=await api('owner-file&id='+encodeURIComponent(r.id)+'&kind=insurance',{binary:true});saveBlob(data,'Versichererzusage_'+r.commission+'.pdf','application/pdf');});if(r.drive_pdf_url){const a=document.createElement('a');a.className='secondary';a.textContent='Unterschriebene PDF in Drive öffnen';a.href=r.drive_pdf_url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
   if(r.legal_update_available&&r.state==='active'){const note=document.createElement('p');note.textContent='Neuere Vertragsvorlagen vorhanden. Prüfen, ob eine neue Freigabe erforderlich ist.';card.append(note);}
   if(r.saved_locally)button('Unterschriebene PDF laden',async()=>{const data=await api('owner-file&id='+encodeURIComponent(r.id)+'&kind=signed',{binary:true});saveBlob(data,'Angebot_'+r.commission+'_unterschrieben.pdf','application/pdf');});
   if(r.archive_mode==='signed_pdf_only'&&r.state==='completed'){
    const n=document.createElement('p');n.textContent=r.archive_provider==='strato'?(r.local_cleanup?.state==='done'?'Unterschriebene PDF dauerhaft im geschützten STRATO-Archiv. Temporäre Originale und Anlagen entfernt.':'PDF auf STRATO archiviert. Temporäre Dateien bleiben bis zur bestätigten Übergabe der Kundenkopie erhalten.'):r.local_cleanup?.state==='done'?'Dokumentenablage nur in Drive. Die Portal-Zwischendateien wurden entfernt.':'Die PDF ist in Drive gesichert. Die Bereinigung der STRATO-Zwischendateien steht noch aus. Eine ausstehende Vertragskopie muss zuvor versendet werden.';card.append(n);
    if(r.local_cleanup?.state!=='done')button('STRATO-Zwischenspeicherung erneut bereinigen',async()=>{await api('archive-retry',{method:'POST',body:{id:r.id}});$('load-records').click();});
   }
   if(r.customer_copy?.state){const copy=document.createElement('p');copy.textContent=r.customer_copy.state==='manual_delivered'?'Vollständige Vertragskopie laut Inhaber tatsächlich manuell übermittelt.':r.customer_copy.state==='submitted'?'Vertragskopie für den Kunden an den Maildienst übergeben.':r.customer_copy.state==='manual_required'?'Vollständige Vertragskopie MANUELL '+(r.customer_copy.delivery==='paper'?'AUF PAPIER':'PER WHATSAPP')+' übergeben; anschließend bestätigen.':'Vertragskopie für den Kunden AUSSTEHEND / UNKLAR. Bitte unverzüglich prüfen.';card.append(copy);if(['manual_required','pending','sending','uncertain'].includes(r.customer_copy.state)){button('Vollständige Vertragskopie für manuellen Versand laden',async()=>{const data=await api('owner-file&id='+encodeURIComponent(r.id)+'&kind=customer-copy',{binary:true});saveBlob(data,'Vertragskopie_'+r.commission+'.zip','application/zip');});const manual=document.createElement('label');manual.className='check';const confirmed=document.createElement('input');confirmed.type='checkbox';const manualText=document.createElement('span');manualText.textContent='Ich habe dem Kunden die unveränderte Vertragskopie samt allen zugehörigen Unterlagen tatsächlich auf einem dauerhaften Datenträger übermittelt.';manual.append(confirmed,manualText);card.append(manual);button('Tatsächlichen manuellen Versand bestätigen',async()=>{if(!confirmed.checked)throw Error('Bitte erst nach dem tatsächlichen vollständigen Versand bestätigen.');await api('customer-copy-manual',{method:'POST',body:{id:r.id,delivered:true}});$('load-records').click();});const uncertain=['sending','uncertain'].includes(r.customer_copy.state);if(r.customer_copy.delivery!=='whatsapp'&&r.customer_copy.delivery!=='paper')button(uncertain?'Nach Rückfrage beim Kunden Vertragskopie erneut senden':'Vertragskopie erneut senden',async()=>{await api('customer-copy-retry',{method:'POST',body:{id:r.id,acknowledge_possible_duplicate:uncertain}});$('load-records').click();});}}
   if(r.notification?.state){
    const n=document.createElement('p'),labels={pending:'E-Mail-Benachrichtigung ausstehend',sending:'E-Mail-Versandstatus unklar – bitte Postfach prüfen',uncertain:'E-Mail-Versandstatus unklar – bitte Postfach prüfen',submitted:'E-Mail an den Versanddienst übergeben (Posteingang nicht bestätigt)'};n.textContent=labels[r.notification.state]||'E-Mail-Status prüfen';card.append(n);
    if(['pending','sending','uncertain'].includes(r.notification.state)){
     const uncertain=['sending','uncertain'].includes(r.notification.state);
     if(uncertain){const warning=document.createElement('p');warning.className='hint';warning.textContent='Vor einem erneuten Versand bitte den Posteingang und Spam prüfen. Die Nachricht könnte sonst doppelt ankommen.';card.append(warning);}
     button(uncertain?'Nach Postfachprüfung erneut benachrichtigen':'E-Mail-Benachrichtigung erneut versuchen',async()=>{const result=await api('notification-retry',{method:'POST',body:{id:r.id,acknowledge_possible_duplicate:uncertain}});message(result.notification.state==='submitted'?'Benachrichtigung an den Versanddienst übergeben. Bitte Posteingang prüfen.':'Benachrichtigung weiterhin ausstehend. Die PDF ist bereits archiviert.');$('load-records').click();});
    }
   }
   if(r.state==='archive_pending')button('Archivierung erneut versuchen',async()=>{const result=await api('archive-retry',{method:'POST',body:{id:r.id}});message(result.ok?'Archiv bestätigt. Kundenlink gesperrt.':'Unterschrift ist vorübergehend geschützt gespeichert. Archivierung steht noch aus.');$('load-records').click();},true);
   if(r.state==='active')button('Diesen Link sperren',async()=>{await api('revoke',{method:'POST',body:{id:r.id}});$('load-records').click();});
   root.append(card);
  }
 }catch(e){message(e.message);}
};
$('load-withdrawals').onclick=async()=>{try{const {withdrawals}=await api('withdrawals'),root=$('withdrawal-list');root.replaceChildren();if(!withdrawals.length)root.textContent='Noch keine Widerrufserklärungen eingegangen.';for(const r of withdrawals){const card=document.createElement('article');card.className='record-card';for(const text of [r.name+' · '+r.received_at,'Vertrag / Vertragsteil: '+r.contract,'Eingangsbestätigung an: '+r.email,'Bitte Zuordnung, Widerrufsrecht und Frist prüfen. Ein Vorgang wird nicht automatisch storniert.']){const p=document.createElement('p');p.textContent=text;card.append(p);}const statuses=Object.values(r.mail);if(statuses.some(n=>n.state!=='submitted')){const b=document.createElement('button');b.className='secondary';const uncertain=statuses.some(n=>['sending','uncertain'].includes(n.state));b.textContent=uncertain?'Nach Postfachprüfung Bestätigungen erneut senden':'Ausstehende Bestätigungen erneut senden';b.onclick=async()=>{b.disabled=true;try{await api('withdrawal-retry',{method:'POST',body:{id:r.id,acknowledge_possible_duplicate:uncertain}});$('load-withdrawals').click();}catch(e){message(e.message);}finally{b.disabled=false;}};card.append(b);}root.append(card);}}catch(e){message(e.message);}};

for(const id of ['full-name','sign-date'])$(id).addEventListener('input',invalidateSigned);
init();

$('checkout-copy-delivery').addEventListener('change',()=>syncCopyDelivery(document));
