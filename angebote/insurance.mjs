// The insurer's payment promise is separate from the customer's order and signature.
export function insuranceAmount(value,total){
 const s=String(value??'').trim();if(!/^\d{1,8}(?:[,.]\d{1,2})?$/.test(s))throw Error('Bitte den übernommenen Bruttobetrag ohne Tausenderpunkte eingeben.');
 const [a,b='']=s.replace(',','.').split('.'),cents=Number(a)*100+Number(b.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<1||cents>total)throw Error('Der übernommene Betrag muss zwischen 0,01 EUR und dem Angebotsgesamtpreis liegen.');return cents;
}
export const insuranceMoney=cents=>(cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
export function insuranceReceipt(offer,value){
 const text=(key,max)=>{const v=String(value[key]??'').trim();if(!v||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error('Bitte alle Versicherungsangaben vollständig eintragen.');return v;};
 if(value.accepted!==true||value.authority_confirmed!==true)throw Error('Bitte die Befugnis und die verbindliche Zahlungszusage aktiv bestätigen.');
 const date=String(value.date??''),d=new Date(date+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw Error('Bitte ein gültiges Datum eintragen.');
 if(!offer.definition?.version||!offer.definition?.text||!Number.isInteger(offer.total_cents)||!/^[a-f0-9]{64}$/.test(offer.sha256))throw Error('Der freigegebene Angebotsstand ist unvollständig.');
 const covered=insuranceAmount(value.covered,offer.total_cents);
 return {version:offer.definition.version,customer_name:offer.customer_name,commission:offer.commission,revision:offer.revision,source_sha256:offer.sha256,documents:Object.fromEntries(offer.attachments.map(f=>[f.id,f.sha256])),total_cents:offer.total_cents,company:text('company',160),claim_number:text('claim_number',100),covered_cents:covered,customer_share_cents:offer.total_cents-covered,signer_name:text('signer_name',100),signer_role:text('signer_role',100),date,text:offer.definition.text,confirmation:offer.definition.confirmation,accepted:true,authority_confirmed:true};
}
const hex=s=>[...new TextEncoder().encode(s)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function pdfWriter(doc,PDFLib){
 const font=await doc.embedFont(PDFLib.StandardFonts.Helvetica),bold=await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);let page,y;
 const newPage=()=>{page=doc.addPage([595.276,841.89]);y=786;};newPage();
 const paragraph=(text,size=10.5,weight=font,gap=10)=>{
  let line='';const draw=()=>{if(y<65)newPage();page.drawText(line,{x:45,y,size,font:weight});y-=size*1.4;};
  for(const word of String(text).split(/\s+/)){const next=line?line+' '+word:word;if(weight.widthOfTextAtSize(next,size)>505&&line){draw();line=word;}else line=next;}if(line)draw();y-=gap;
 };
 return {paragraph,get page(){return page;},get y(){return y;},space(n){y-=n;if(y<100)newPage();}};
}
export async function createInsurancePDF(receipt,png,PDFLib,{test=false}={}){
 if(!png)throw Error('Bitte zuerst unterschreiben.');
 const doc=await PDFLib.PDFDocument.create(),w=await pdfWriter(doc,PDFLib),p=w.paragraph;
 p('SICHTWERK / NEUBAUER',11);if(test)p('UNVERBINDLICHER PROBELAUF - KEINE ZAHLUNGSZUSAGE',11);
 p('Verbindliche Zahlungszusage des Versicherers',18);
 p('Auftraggeber: '+receipt.customer_name);p('Angebot: '+receipt.commission+' / Freigabe '+receipt.revision);
 p('Versicherer: '+receipt.company);p('Schadennummer: '+receipt.claim_number);
 p('Angebotsgesamtpreis brutto: '+insuranceMoney(receipt.total_cents));p('Übernommener Betrag brutto: '+insuranceMoney(receipt.covered_cents),12);
 p('Kundenanteil einschließlich etwaiger Selbstbeteiligung: '+insuranceMoney(receipt.customer_share_cents),12);
 p(receipt.text,10);p(receipt.confirmation,10);
 p('Für den Versicherer: '+receipt.signer_name+' / '+receipt.signer_role);p('Datum: '+receipt.date.split('-').reverse().join('.'));
 w.space(65);const image=await doc.embedPng(png),scale=Math.min(230/image.width,65/image.height);w.page.drawImage(image,{x:45,y:w.y+8,width:image.width*scale,height:image.height*scale});
 w.space(10);p('Angebots-PDF SHA-256: '+receipt.source_sha256,7);
 p('Die unveränderte Angebotsfassung und die vor der Bestätigung verfügbaren Anlagen sind dieser Zusage eindeutig zugeordnet. Der Kunde nimmt das Angebot anschließend selbst an.',8);
 doc.catalog.set(PDFLib.PDFName.of('SichtwerkInsurance'),PDFLib.PDFHexString.of(hex(JSON.stringify(receipt))));
 return doc.save({useObjectStreams:false});
}
export async function appendInsurancePage(doc,insurance,PDFLib,{testLabel=false}={}){
 const r=insurance?.data;if(!r)return;
 if(insurance.state!=='accepted'||!insurance.pdf?.sha256)throw Error('Die verbindliche Versichererzusage fehlt.');
 const w=await pdfWriter(doc,PDFLib),p=w.paragraph;
 p('SICHTWERK / NEUBAUER',11);if(testLabel)p('PROBELAUF - KEIN KUNDENAUFTRAG',11);
 p('Versicherungs-Direktabrechnung',20);p('Auftraggeber: '+r.customer_name);p('Angebot: '+r.commission+' / Freigabe '+r.revision);
 p('Versicherer: '+r.company);p('Schadennummer: '+r.claim_number);
 p('Gesamtpreis brutto: '+insuranceMoney(r.total_cents),14);p('Verbindlich übernommener Betrag: '+insuranceMoney(r.covered_cents),14);
 p('Ihr verbleibender Anteil einschließlich etwaiger Selbstbeteiligung: '+insuranceMoney(r.customer_share_cents),14);
 p('Direktabrechnung ohne Voraus- und Abschlagszahlung nach Ziffer 20.2 der beigefügten AGB. Sie bleiben Auftraggeber und Schuldner der berechtigten Vergütung. Zahlungen werden angerechnet. Die Herstellerbestellung setzt insbesondere technische Klärung, wirksame Abtretung, verbindliche Versichererzusage und Ablauf der Wartefristen voraus.');
 p('Die vollständige, separat unterschriebene Versichererzusage und die Abtretung sind unveränderte Anlagen dieser Freigabe. Die Unterschrift des Versicherers wird nicht in dieses Angebot kopiert.');
 p('Versichererzusage SHA-256: '+insurance.pdf.sha256,8);
 doc.catalog.set(PDFLib.PDFName.of('SichtwerkInsuranceReference'),PDFLib.PDFHexString.of(hex(JSON.stringify({pdf_sha256:insurance.pdf.sha256,data:r}))));
}
export function renderInsuranceSummary(root,insurance){
 const r=insurance?.data;if(!r)return;const section=root.ownerDocument.createElement('section');section.className='notice insurance-summary';
 const h=root.ownerDocument.createElement('h2');h.textContent='Zahlungszusage der Versicherung';section.append(h);
 for(const text of ['Versicherer: '+r.company,'Schadennummer: '+r.claim_number,'Übernommener Bruttobetrag: '+insuranceMoney(r.covered_cents),'Ihr Anteil einschließlich etwaiger Selbstbeteiligung: '+insuranceMoney(r.customer_share_cents)]){const p=root.ownerDocument.createElement('p');p.textContent=text;section.append(p);}root.append(section);
}
