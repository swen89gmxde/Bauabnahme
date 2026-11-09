import {montageCheckout} from './montage.mjs?v=20261109-versicherung-1';
export const ORDER_BUTTON='Zahlungspflichtig bestellen';
export function amountCents(value){
 const v=String(value).trim().replace(/\s/g,'');if(!/^\d{1,8}([.,]\d{1,2})?$/.test(v))throw Error('Bitte den Gesamtpreis ohne Tausenderpunkte, zum Beispiel 1234,56, eintragen.');const [a,b='']=v.split(/[.,]/),n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<1||n>1000000000)throw Error('Bitte einen gültigen Gesamtpreis einschließlich Umsatzsteuer eintragen.');return n;
}
export function money(cents){return (cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});}
export const COPY_DELIVERIES={email:'E-Mail (automatisch)',whatsapp:'WhatsApp (manuell)',paper:'Papier (manuell)'};
export function syncCopyDelivery(doc){
 const method=doc.getElementById('checkout-copy-delivery')?.value||'email',email=method==='email',field=doc.getElementById('checkout-email');field.required=email;doc.getElementById('checkout-email-area').hidden=!email;
 const note=doc.getElementById('checkout-copy-hint');note.textContent=email?'Die vollständige Vertragskopie wird nach Annahme automatisch an diese Adresse gesendet. Gesamtpaket einschließlich Vertragsvorlagen: höchstens 10 MB.':'Eine Kunden-E-Mail ist für diesen Weg nicht erforderlich. Nach Annahme die vollständigen Unterlagen in der Verwaltung herunterladen, '+(method==='paper'?'ausdrucken und aushändigen':'als speicherbare Dateien im vereinbarten WhatsApp-Chat übermitteln')+' und erst danach die tatsächliche Übergabe bestätigen. Die benötigten Dateien bleiben bis zur Bestätigung geschützt erhalten. Gesamtpaket: höchstens 60 MB.';
 const check=doc.getElementById('checkout-checked');if(check)check.checked=false;
}
export function copyDeliveryFromForm(doc){
 const method=doc.getElementById('checkout-copy-delivery')?.value||'whatsapp';if(!Object.hasOwn(COPY_DELIVERIES,method))throw Error('Bitte einen gültigen Versandweg wählen.');
 const field=doc.getElementById('checkout-email');if(method==='email'&&(!field||!field.reportValidity()))throw Error('Bitte eine gültige E-Mail-Adresse für die Vertragskopie eintragen.');
 return {copy_delivery:method,customer_email:method==='email'?field.value.trim():''};
}
export function checkoutFromForm(doc,montagePolicy){
 const method=doc.getElementById('checkout-copy-delivery')?.value||'email';if(!Object.hasOwn(COPY_DELIVERIES,method))throw Error('Bitte einen gültigen Versandweg wählen.');
 for(const id of ['checkout-type','checkout-description','checkout-total','checkout-costs','checkout-payment',...(method==='email'?['checkout-email']:[]),'checkout-checked'])if(!doc.getElementById(id).reportValidity())throw Error('Bitte die Abschlussübersicht vollständig prüfen.');
 const get=id=>doc.getElementById(id).value.trim();if(get('checkout-type')!=='work_consumer')throw Error('Die hinterlegten Vertragsunterlagen sind für Werk-/Montageverträge mit Verbrauchern bestimmt. Für reine Warenlieferungen und Verbraucherbauverträge ist zuerst ein passendes Paket einzurichten.');
 return {version:1,contract_type:'work_consumer',description:get('checkout-description'),total_cents:amountCents(get('checkout-total')),additional_costs:get('checkout-costs'),payment_terms:get('checkout-payment'),...montageCheckout(montagePolicy),customer_email:method==='email'?get('checkout-email'):'',copy_delivery:method,checked_against_offer:true};
}
export function renderCheckout(root,offer){
 root.replaceChildren();const c=offer.checkout,isTest=!!(offer.archive_test||offer.demo||offer.test);root.hidden=!c;if(!c)return;
 const el=(tag,text)=>{const e=root.ownerDocument.createElement(tag);e.textContent=text;root.append(e);return e;};
 el('h2',isTest?'Unverbindlicher Test der Abschlussübersicht':'Ihre verbindliche Angebotsannahme');el('p','Sichtwerk - Neubauer · Swen Neubauer · Winterberg 2 · 96361 Steinbach am Wald · 0151 11546112 · sichtwerk.neubauer@gmx.de');
 el('p','Angebot: '+offer.title+' · Kommission: '+offer.commission+' · Freigabe: '+(offer.revision??'Probelauf'));
 if(c.version===2&&c.mode==='offer_pdf'){
  el('h3','Leistungen und Bedingungen aus Ihrem Angebot');el('p','Die folgenden Angaben wurden aus der zugehörigen Angebots-PDF übernommen. Bitte prüfen Sie das vollständige Angebot vor der verbindlichen Annahme.');
  for(const page of c.source_pages){el('h4','Originalangebot - Seite '+page.number+' von '+c.source_pages.length);el('p',page.text||'(Diese Seite enthält keinen auslesbaren Text.)').className='offer-source-text';}
 }else{el('h3','Leistung und Ausführung');el('p',c.description);}
 el('h3','Gesamtpreis einschließlich Umsatzsteuer');el('p',money(c.total_cents)).className='checkout-price';
 if(c.version!==2){el('p','Weitere Kosten: '+c.additional_costs);el('h3','Zahlung');el('p',c.payment_terms);}
 el('p',c.contract_type==='work_business'?'Geschäftskundenauftrag für den im Angebot genannten Unternehmer. Der Unterzeichner bestätigt seine Befugnis zur Annahme.':'Privatkundenauftrag.');el('h3','Montagezeit und Voraussetzungen');el('p',c.delivery_terms);
 el('p','Einmaliger Werk-/Montageauftrag, kein Abonnement. Individuelle Angebotsvereinbarungen gehen den AGB vor. Gesetzliche Mängelrechte bleiben bestehen. Es wird kein vorzeitiger Beginn und kein Widerrufsverzicht erklärt; die Bestellwartezeit nach Ziffern 6 und 16 der AGB bleibt erhalten.');
 el('p',c.contract_type==='work_business'?'Für diesen Geschäftskundenauftrag wird kein freiwilliges Verbraucherwiderrufsrecht eingeräumt. Die vertragliche Mindestwartezeit nach Ziffern 6 und 16 der AGB bleibt bestehen.':'Bei bestehendem Widerrufsrecht gelten die beigefügte Belehrung und das Musterformular. Die Funktion „Vertrag widerrufen“ bleibt auch nach Sperrung dieses Angebotslinks erreichbar.');
 el('p',c.copy_delivery==='whatsapp'?'Ihre vollständige Vertragskopie erhalten Sie von Sichtwerk als speicherbare Dateien über den vereinbarten WhatsApp-Chat.':c.copy_delivery==='paper'?'Ihre vollständige Vertragskopie erhalten Sie von Sichtwerk auf Papier.':'Ihre Vertragskopie einschließlich der Unterlagen geht an: '+c.customer_email+'. Bitte lassen Sie eine falsche Adresse vor dem Abschluss durch Sichtwerk korrigieren.');
 el('p',offer.archive_test?'ARCHIVTEST: Es entsteht kein Auftrag und keine Zahlungspflicht. Die Test-Vertragskopie geht ausschließlich an Sichtwerk.':isTest?'PROBELAUF: Es entsteht kein Auftrag und keine Zahlungspflicht. Die Muster-PDF bleibt in diesem Browser.':'Mit „'+ORDER_BUTTON+'“ nehmen Sie dieses Angebot zahlungspflichtig an. Im Portal wird kein Geld eingezogen.');
}
