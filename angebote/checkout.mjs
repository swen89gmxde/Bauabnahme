export const ORDER_BUTTON='Zahlungspflichtig bestellen';
export function amountCents(value){
 const v=String(value).trim().replace(/\s/g,'');if(!/^\d{1,8}([.,]\d{1,2})?$/.test(v))throw Error('Bitte den Gesamtpreis ohne Tausenderpunkte, zum Beispiel 1234,56, eintragen.');const [a,b='']=v.split(/[.,]/),n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n<1||n>1000000000)throw Error('Bitte einen gültigen Gesamtpreis einschließlich Umsatzsteuer eintragen.');return n;
}
export function money(cents){return (cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});}
export function checkoutFromForm(doc){
 for(const id of ['checkout-type','checkout-description','checkout-total','checkout-costs','checkout-payment','checkout-delivery','checkout-email','checkout-checked'])if(!doc.getElementById(id).reportValidity())throw Error('Bitte die Abschlussübersicht vollständig prüfen.');
 const get=id=>doc.getElementById(id).value.trim();if(get('checkout-type')!=='work_consumer')throw Error('Die hinterlegten Vertragsunterlagen sind für Werk-/Montageverträge mit Verbrauchern bestimmt. Für reine Warenlieferungen und Verbraucherbauverträge ist zuerst ein passendes Paket einzurichten.');
 return {version:1,contract_type:'work_consumer',description:get('checkout-description'),total_cents:amountCents(get('checkout-total')),additional_costs:get('checkout-costs'),payment_terms:get('checkout-payment'),delivery_terms:get('checkout-delivery'),customer_email:get('checkout-email'),checked_against_offer:true};
}
export function renderCheckout(root,offer){
 root.replaceChildren();const c=offer.checkout;root.hidden=!c;if(!c)return;
 const el=(tag,text)=>{const e=root.ownerDocument.createElement(tag);e.textContent=text;root.append(e);return e;};
 el('h2',offer.archive_test?'Unverbindlicher Test der Abschlussübersicht':'Ihre verbindliche Angebotsannahme');el('p','Sichtwerk - Neubauer · Swen Neubauer · Winterberg 2 · 96361 Steinbach am Wald · 0151 11546112 · sichtwerk.neubauer@gmx.de');
 el('h3','Leistung und Ausführung');el('p',c.description);el('p','Angebot: '+offer.title+' · Kommission: '+offer.commission+' · Freigabe: '+offer.revision);
 el('h3','Gesamtpreis einschließlich Umsatzsteuer');el('p',money(c.total_cents)).className='checkout-price';el('p','Weitere Kosten: '+c.additional_costs);
 el('h3','Zahlung');el('p',c.payment_terms);el('h3','Lieferung / Ausführung');el('p',c.delivery_terms);
 el('p','Einmaliger Werk-/Montageauftrag, kein Abonnement. Individuelle Angebotsvereinbarungen gehen den AGB vor. Gesetzliche Mängelrechte bleiben bestehen. Es wird kein vorzeitiger Beginn und kein Widerrufsverzicht erklärt; die Bestellwartezeit nach Ziffern 6 und 16 der AGB bleibt erhalten.');
 el('p','Bei bestehendem Widerrufsrecht gelten die beigefügte Belehrung und das Musterformular. Die Funktion „Vertrag widerrufen“ bleibt auch nach Sperrung dieses Angebotslinks erreichbar.');
 el('p','Ihre Vertragskopie einschließlich der Unterlagen geht an: '+c.customer_email+'. Bitte lassen Sie eine falsche Adresse vor dem Abschluss durch Sichtwerk korrigieren.');
 el('p',offer.archive_test?'ARCHIVTEST: Es entsteht kein Auftrag und keine Zahlungspflicht. Die Test-Vertragskopie geht ausschließlich an Sichtwerk.':'Mit „'+ORDER_BUTTON+'“ nehmen Sie dieses Angebot zahlungspflichtig an. Im Portal wird kein Geld eingezogen.');
}
