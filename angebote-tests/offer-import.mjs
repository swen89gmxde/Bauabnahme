// Synthetic Lexware-style coordinates only. Never publish customer PDF fixtures.
import assert from 'node:assert/strict';
import {extractOffer,resetOfferFields,applyOfferImport} from '../angebote/offer-import.mjs';
const item=(x,y,text,font='regular')=>({x,y,text,font,w:text.length*4.8,h:10});
function example({name='Beispiel Kundin',total='5.526,66',email='kundin@example.test',extra=[]}={}){
 return [{width:600,height:840,items:[
  item(380,50,'Angebotsnr.:'),item(460,50,'AG-TEST-100'),item(385,63,'Kundennr.:'),item(510,63,'TEST-17'),
  item(71,144,'Sichtwerk - Neubauer, Beispielanschrift'),item(71,164,name),item(71,176,'Musterstraße 4'),item(71,188,'12345 Beispielstadt'),
  item(411,173,'info@sichtwerk-neubauer.de'),...(email?[item(71,204,email)]:[]),
  item(75,425,'Pos.','bold'),item(109,425,'Bezeichnung','bold'),item(332,425,'Menge','bold'),item(420,425,'Einzel €','bold'),
  item(76,450,'1','bold'),item(109,450,'Kunststofffenster','bold'),item(365,450,'2'),item(109,462,'Typ W76','bold'),item(109,474,'Nicht als abgebrochene Überschrift übernehmen.'),
  item(76,500,'2','bold'),item(109,500,'Montage und Anschlussabdichtung','bold'),item(365,500,'2'),
  item(77,536,'Zwischensumme (netto)'),item(520,536,'4.644,25'),item(77,551,'Umsatzsteuer 19 %'),item(530,551,'882,41'),
  item(77,574,'Gesamtbetrag'),item(520,574,total),
  item(71,610,'Zahlungsbedingungen: Zahlung nach Abnahme binnen 14 Tagen.'),
  item(71,650,'Lieferzeit: voraussichtlich 6 bis 8 Wochen nach technischer Klärung.'),
  item(71,690,'Weitere Kosten: Keine zusätzlichen verpflichtenden Kosten.'),
  item(71,780,'info@sichtwerk-neubauer.de'),...extra
 ]}];
}
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const original=example(),result=extractOffer(original);
eq(result.fields['customer-id'],'TEST-17');eq(result.fields['customer-name'],'Beispiel Kundin');eq(result.fields['commission-id'],'AG-TEST-100');eq(result.fields['checkout-total'],'5526,66');eq(result.fields['checkout-email'],'kundin@example.test');
eq(result.fields['checkout-description'],'2 × Kunststofffenster Typ W76; 2 × Montage und Anschlussabdichtung');
eq(result.fields['checkout-payment'],'Zahlungsbedingungen: Zahlung nach Abnahme binnen 14 Tagen.');eq(result.fields['checkout-delivery'],'Lieferzeit: voraussichtlich 6 bis 8 Wochen nach technischer Klärung.');eq(result.fields['checkout-costs'],'Weitere Kosten: Keine zusätzlichen verpflichtenden Kosten.');
eq(extractOffer(example({email:''})).fields['checkout-email'],undefined);
eq(extractOffer(example({email:'info@sichtwerk-neubauer.de'})).fields['checkout-email'],undefined);
eq(extractOffer(example({email:'eins@example.test zwei@example.test'})).fields['checkout-email'],undefined);
eq(extractOffer(example({name:'Beispiel GmbH'})).fields['checkout-type'],'other');
eq(extractOffer(example({total:'5526,66'})).fields['checkout-total'],'5526,66');
eq(extractOffer(example({total:'5 526,66'})).fields['checkout-total'],'5526,66');
eq(extractOffer(example({total:'-5.526,66'})).fields['checkout-total'],undefined);
eq(extractOffer(example({total:'0,00'})).fields['checkout-total'],undefined);
eq(extractOffer(example({total:'4.644,25 + 882,41'})).fields['checkout-total'],undefined);
eq(extractOffer(example({extra:[item(77,720,'Gesamtbetrag'),item(520,720,'7.000,00')]})).fields['checkout-total'],undefined);
eq(extractOffer([...original,...original]).fields['checkout-total'],'5526,66');
const noTotal=example();noTotal[0].items=noTotal[0].items.filter(i=>i.y!==574);eq(extractOffer(noTotal).fields['checkout-total'],undefined);
const overflow=example();overflow[0].items.push(item(71,612,'x'.repeat(1850)));eq(extractOffer(overflow).fields['checkout-payment'],undefined);eq(extractOffer(overflow).notes['checkout-payment'].includes('zu lang'),true);
const insurance=example({email:''});insurance[0].items=insurance[0].items.filter(i=>i.y<600||i.y>750);insurance.push({width:600,height:840,items:[
 item(71,75,'1. KUNDE / VERSICHERUNGSNEHMER'),item(71,130,'Direktabrechnung ohne Voraus-/Abschlagszahlung nach gesonderter Abtretung.'),
 item(71,170,'Herstellerbestellung und Produktionsfreigabe erst nach technischer Klärung.'),
 item(71,278,'2. VERSICHERUNG – VERBINDLICHE ZAHLUNGSZUSAGE'),item(71,425,'Der Versicherer zahlt nach Rechnungseingang binnen 14 Tagen.')
]});
const insured=extractOffer(insurance);eq(insured.fields['checkout-payment'],'Direktabrechnung ohne Voraus-/Abschlagszahlung nach gesonderter Abtretung.');eq(insured.fields['checkout-payment'].includes('Versicherer zahlt'),false);eq(insured.warnings.length,1);eq(insured.notes['checkout-delivery'].includes('Konkrete'),true);
eq(extractOffer([{width:600,height:840,items:[]}]).fields,{});eq(extractOffer([{width:600,height:840,items:[]}]).warnings.length,1);

const nodes=new Map(),doc={getElementById:id=>nodes.get(id)||null,createElement:()=>element()};
function element(){return {value:'',checked:false,dataset:{},removeAttribute(key){if(key==='data-imported')delete this.dataset.imported;},insertAdjacentElement(_,node){nodes.set(node.id,node);},remove(){nodes.delete(this.id);}};}
for(const id of ['customer-id','customer-name','commission-id','checkout-type','checkout-description','checkout-total','checkout-costs','checkout-payment','checkout-delivery','checkout-email','checkout-checked','offer-import-status'])nodes.set(id,element());
resetOfferFields(doc);applyOfferImport(doc,result);eq(nodes.get('checkout-total').value,'5526,66');eq(nodes.get('checkout-checked').checked,false);nodes.get('checkout-checked').checked=true;
resetOfferFields(doc);eq(nodes.get('customer-name').value,'');eq(nodes.get('checkout-email').value,'');eq(nodes.get('checkout-payment').value,'');eq(nodes.get('checkout-checked').checked,false);eq(nodes.get('customer-name-import-note'),undefined);
applyOfferImport(doc,extractOffer(example({name:'Anderer Beispielkunde',email:''})));eq(nodes.get('customer-name').value,'Anderer Beispielkunde');eq(nodes.get('checkout-email').value,'');eq(nodes.get('checkout-email-import-note').dataset.imported,undefined);eq(nodes.get('customer-name-import-note').dataset.imported,'true');
console.log(JSON.stringify({checks,result:'passed',coverage:['Lexware-style multi-column recipient and IDs','gross total only with exact labels','thousands separators and ambiguous/negative totals','wrapped bold position headings with quantities','original payment and delivery conditions','issuer email excluded and missing customer email marked','unsigned insurer promise excluded','explicit review never prechecked','new PDF clears all previous customer and contract fields','scan and overlong text fail visibly']}));
