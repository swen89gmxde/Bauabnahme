import {extractOffer,textRows} from './offer-import.mjs?v=20261109-pdf-1';
import {montageCheckout} from './montage.mjs?v=20261109-montage-1';
import {amountCents} from './checkout.mjs?v=20261109-pdf-1';

// Read-only snapshot of the selected original PDF. Never infer net/gross amounts or costs.
export function checkoutFromPDF(pages,sourceSHA,montagePolicy,delivery={copy_delivery:'whatsapp',customer_email:''}){
 if(!Array.isArray(pages)||pages.length<1||pages.length>100||!/^[a-f0-9]{64}$/.test(sourceSHA))throw Error('Bitte die ursprüngliche Angebots-PDF erneut auswählen.');
 const sourcePages=pages.map((page,index)=>({number:index+1,text:textRows(page).map(r=>r.text).join('\n')}));
 if(!sourcePages.some(p=>p.text.trim()))throw Error('Die PDF enthält keinen auslesbaren Angebotstext. Bitte die ursprüngliche Text-PDF aus Lexware verwenden.');
 if(sourcePages.some(p=>p.text.length>50000)||sourcePages.reduce((n,p)=>n+p.text.length,0)>300000)throw Error('Die Angebots-PDF enthält zu viel Text für diese Freigabe. Bitte das konkrete Angebot ohne zusätzliche Sammelunterlagen auswählen.');
 const imported=extractOffer(pages);
 if(imported.fields['checkout-type']==='other')throw Error('In diesem Angebot wurde ein Firmenkunde erkannt. Die vorhandenen Vertragsunterlagen sind für Werk-/Montageverträge mit Privatkunden bestimmt.');
 const gross=imported.fields['checkout-total'];if(!gross)throw Error('Die Bruttogesamtsumme ist in dieser PDF nicht eindeutig lesbar. Bitte die vollständige ursprüngliche Angebots-PDF aus Lexware verwenden; Beträge werden nicht geschätzt.');
 const method=delivery.copy_delivery;if(!['email','whatsapp','paper'].includes(method))throw Error('Bitte einen gültigen Versandweg wählen.');
 return {version:2,mode:'offer_pdf',contract_type:'work_consumer',source_sha256:sourceSHA,source_pages:sourcePages,total_cents:amountCents(gross),...montageCheckout(montagePolicy),copy_delivery:method,customer_email:method==='email'?delivery.customer_email:''};
}
