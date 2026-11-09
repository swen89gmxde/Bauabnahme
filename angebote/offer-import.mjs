// Read the selected PDF in the browser. No OCR service, account lookup or upload.
const clean=s=>String(s??'').replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
const join=rows=>clean(rows.map(r=>r.text).join('\n').replace(/(\p{L})-\n(?=\p{Ll})/gu,'$1'));
const EMAIL=/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi;
const LIMITS={'customer-id':100,'customer-name':160,'commission-id':100,'checkout-description':1200,'checkout-payment':1800,'checkout-delivery':700,'checkout-costs':500,'checkout-email':254};

export function textRows(page,items=page.items){
 const sorted=items.filter(i=>clean(i.text)).toSorted((a,b)=>a.y-b.y||a.x-b.x),rows=[];
 for(const item of sorted){let row=rows.at(-1);if(!row||Math.abs(item.y-row.y)>Math.max(2,Math.min(item.h||10,row.h||10)*.28)){row={y:item.y,h:item.h||10,items:[]};rows.push(row);}row.items.push(item);row.h=Math.max(row.h,item.h||10);}
 return rows.map(r=>({...r,items:r.items.toSorted((a,b)=>a.x-b.x),text:clean(r.items.toSorted((a,b)=>a.x-b.x).map(i=>i.text).join(' '))}));
}
function paragraphs(rows){
 const out=[];let block=[];
 for(const row of rows){const previous=block.at(-1);if(previous&&(row.y-previous.y>Math.max(previous.h,row.h)*1.8||/^\d+\.\s*[A-ZÄÖÜ]|^(?:Ort\s*\/\s*Datum|Datum\s*\/\s*Ort|Unterschrift|Vom Kunden|Vom Versicherer)\s*:/i.test(row.text))){out.push(join(block));block=[];}block.push(row);}
 if(block.length)out.push(join(block));return out;
}
function cents(text){
 const value=clean(text).replace(/\s(?=\d{3}(?:[.,]|\s))/g,'');
 const matches=[...value.matchAll(/(?<![\d.,])(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?![\d.,])/g)];
 if(matches.length!==1)return null;const [euros,cent]=matches[0][0].replaceAll('.','').split(','),n=Number(euros)*100+Number(cent);
 if(!Number.isSafeInteger(n)||n<1||n>1000000000||/-\s*$/.test(value.slice(0,matches[0].index)))return null;return n;
}
function labelled(rows,re){
 const values=[];for(const row of rows){const m=row.text.match(re);if(m){const value=clean(row.text.slice(m[0].length));if(value)values.push(value);}}
 return [...new Set(values)].length===1?values[0]:'';
}
export function extractOffer(pages){
 const fields={},notes={},warnings=[],allRows=pages.map(p=>textRows(p));let business=false;
 const put=(id,value,note='Aus der Angebots-PDF übernommen.')=>{value=clean(value);if(!value)return;if(value.length>(LIMITS[id]??10000)){notes[id]='Im PDF erkannt, aber zu lang für die Übersicht. Bitte passend zusammenfassen.';return;}fields[id]=value;notes[id]=note;};
 if(!pages.length)return {fields,notes,warnings:['Die PDF enthält keinen lesbaren Text.']};
 const first=pages[0],firstRows=allRows[0];
 put('commission-id',labelled(firstRows,/^(?:Angebots(?:nr\.?|nummer)|Angebot\s*(?:Nr\.?|Nummer))\s*:?\s*/i));
 put('customer-id',labelled(firstRows,/^(?:Kunden(?:nr\.?|nummer)|Kunden\s*(?:Nr\.?|Nummer))\s*:?\s*/i));
 // The recipient occupies the left address window. Never copy the issuer or bank footer.
 const address=textRows(first,first.items.filter(i=>i.x<first.width*.58&&i.y>first.height*.11&&i.y<first.height*.31));
 const postal=address.findIndex(r=>/^\d{5}\s+\p{L}/u.test(r.text));
 if(postal>0){const before=address.slice(0,postal),street=before.findLastIndex(r=>/\p{L}.*\d/u.test(r.text)&&!/@|Sichtwerk|Telefon|Tel\./i.test(r.text));
  if(street>0){let start=before.findLastIndex((r,i)=>i<street&&/Sichtwerk|^Absender\b/i.test(r.text))+1;for(let i=start+1;i<street;i++)if(before[i].y-before[i-1].y>24)start=i;
   const name=before.slice(start,street).filter(r=>!/^Herrn?$|^Frau$/i.test(r.text));put('customer-name',join(name));business=/\b(?:GmbH|UG|AG|GbR|OHG|KG|e\.?\s*K\.?)\b|\bFirma\b/i.test(fields['customer-name']||'');
  }
 }
 const issuerEmails=new Set(pages.flatMap(p=>p.items.filter(i=>i.x>p.width*.60||i.y>p.height*.89).flatMap(i=>[...i.text.matchAll(EMAIL)].map(m=>m[0].toLowerCase()))));
 const recipientEmails=[...new Set(address.flatMap(r=>[...r.text.matchAll(EMAIL)].map(m=>m[0])).filter(s=>!issuerEmails.has(s.toLowerCase())&&!/@sichtwerk-neubauer\.de$/i.test(s)))];
 if(recipientEmails.length===1)put('checkout-email',recipientEmails[0]);
 else notes['checkout-email']='Keine eindeutige Kunden-E-Mail im Adressbereich gefunden. Bitte ergänzen.';
 const totals=[];
 for(const rows of allRows)for(let i=0;i<rows.length;i++){
  const row=rows[i];if(!/^(?:Gesamtbetrag|Bruttobetrag|Gesamtpreis\s*(?:inkl\.?|einschließlich)|Endsumme\s*(?:inkl\.?|brutto))\b/i.test(row.text))continue;
  let value=cents(row.text);if(value===null&&rows[i+1]&&rows[i+1].y-row.y<22){const next=rows[i+1];if(next.items.every(item=>item.x>pages[0].width*.6))value=cents(next.text);}
  if(value!==null)totals.push(value);
 }
 if(new Set(totals).size===1){const total=totals[0];put('checkout-total',Math.floor(total/100)+','+String(total%100).padStart(2,'0'));}
 else notes['checkout-total']=totals.length?'Mehrere unterschiedliche Bruttosummen erkannt. Bitte die verbindliche Summe prüfen.':'Keine eindeutige Bruttogesamtsumme erkannt. Bitte ergänzen.';

 const positions=[],blocks=[];let insurer=false;
 for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
  const page=pages[pageIndex],rows=allRows[pageIndex],header=rows.find(r=>/\bPos\.?\s+Bezeichnung\b/i.test(r.text)),quantity=header?.items.find(i=>/^Menge$/i.test(i.text)),descEnd=quantity?quantity.x-8:page.width*.60;
  const main=textRows(page,page.items.filter(i=>i.x>=page.width*.09&&i.y<page.height*.89&&i.y>page.height*.065));let prose=[];
  for(let i=0;i<main.length;i++){
   const row=main[i];
   if(/^2\.\s*VERSICHERUNG\b/i.test(row.text)){insurer=true;break;}
   if(!insurer&&!/^(?:Seite \d+|Pos\.?\s+Bezeichnung|Übertrag|Zwischensumme|Umsatzsteuer|Gesamtbetrag)\b/i.test(row.text))prose.push(row);
  }
  if(!insurer||prose.length)blocks.push(...paragraphs(prose));
  if(!header)continue;
  for(let i=0;i<rows.length;i++){
   const row=rows[i],pos=row.items.find(t=>/^\d+[.)]?$/.test(clean(t.text))&&t.x>=page.width*.10&&t.x<page.width*.17);
   if(!pos||row.y<=header.y||row.y>page.height*.85)continue;
   const titleItems=row.items.filter(t=>t.x>=page.width*.17&&t.x<descEnd);if(!titleItems.length)continue;
   const titleRows=[{...row,text:clean(titleItems.map(t=>t.text).join(' '))}];
   for(let k=1;k<=2&&rows[i+k];k++){const next=rows[i+k],part=next.items.filter(t=>t.x>=page.width*.17&&t.x<descEnd);if(!part.length||!titleItems[0].font||part.some(t=>t.font!==titleItems[0].font)||next.y-titleRows.at(-1).y>row.h*1.7)break;titleRows.push({...next,text:clean(part.map(t=>t.text).join(' '))});}
   const qty=quantity?row.items.find(t=>t.x>=quantity.x-3&&t.x<quantity.x+45&&/^\d+(?:[.,]\d+)?$/.test(clean(t.text))):null;
   positions.push((qty?clean(qty.text)+' × ':'')+join(titleRows));
  }
 }
 if(positions.length)put('checkout-description',positions.join('; '),'Positionen aus dem Angebot übernommen. Wesentliche Ausführungsdetails bitte prüfen.');
 else notes['checkout-description']='Keine eindeutige Positionstabelle erkannt. Bitte die Leistung aus dem Angebot ergänzen.';
 const unique=items=>[...new Set(items)];
 const payment=unique(blocks.filter(p=>/\b(?:Zahlungsbedingungen|Zahlungsziel|zahlbar|Vorauszahlung|Restzahlung|Abschlagszahlung|Direktabrechnung|im Voraus zu zahlen|Restbetrag|Rechnungseingang)\b/i.test(p)&&!/^\d+\s/.test(p)));
 put('checkout-payment',payment.join('\n\n'));
 if(!fields['checkout-payment'])notes['checkout-payment']||='Keine eindeutigen Zahlungsbedingungen erkannt. Bitte aus dem Angebot ergänzen.';
 const delivery=unique(blocks.filter(p=>/\b(?:Lieferzeit|Lieferfrist|Liefertermin|Ausführungszeit|Ausführungsfrist|Ausführungstermin|Montagetermin|Herstellerbestellung|Produktionsfreigabe)\b/i.test(p)));
 put('checkout-delivery',delivery.join('\n\n'));
 if(!fields['checkout-delivery'])notes['checkout-delivery']||='Keine eindeutige Liefer-/Ausführungszeit erkannt. Bitte ergänzen.';
 else if(!/Lieferzeit|Lieferfrist|Liefertermin|Ausführungszeit|Ausführungsfrist|Ausführungstermin|Montagetermin/i.test(fields['checkout-delivery']))notes['checkout-delivery']='Voraussetzungen für den Beginn übernommen. Konkrete Liefer-/Ausführungszeit bitte prüfen.';
 const costs=unique(blocks.filter(p=>/^(?:Weitere|Zusätzliche) Kosten\s*:/i.test(p)));
 put('checkout-costs',costs.join('\n\n'));
 if(!fields['checkout-costs'])notes['checkout-costs']='Weitere Kosten sind nicht gesondert bezeichnet. Bitte die Angaben einschließlich möglicher Zusatzkosten prüfen.';
 if(business){fields['checkout-type']='other';notes['checkout-type']='Firmenbezeichnung erkannt. Die Verbraucher-Vertragsvorlagen passen möglicherweise nicht.';warnings.push('Firmenkunde erkannt: Vertragsart prüfen.');}
 else notes['checkout-type']='Vertragsart bitte prüfen; aus einer PDF ist der Verbraucherstatus nicht verlässlich erkennbar.';
 if(insurer)warnings.push('Versicherungsangebot: Angaben der noch zu unterschreibenden Versichererzusage werden nicht als bestätigte Bedingungen übernommen.');
 if(!first.items.some(i=>clean(i.text)))warnings.push('Die erste PDF-Seite enthält keinen auslesbaren Text. Bei gescannten PDFs ist eine manuelle Ergänzung nötig.');
 for(const id of Object.keys(LIMITS))if(!fields[id]&&!notes[id])notes[id]='Nicht eindeutig im Angebot erkannt. Bitte ergänzen.';
 return {fields,notes,warnings};
}

const INPUTS=['customer-id','customer-name','commission-id','checkout-email'];
export function resetOfferFields(doc){
 if(doc.getElementById('checkout-copy-delivery'))doc.getElementById('checkout-copy-delivery').value='whatsapp';
 for(const id of INPUTS){const e=doc.getElementById(id);e.value=id==='checkout-type'?'work_consumer':'';e.removeAttribute('data-imported');doc.getElementById(id+'-import-note')?.remove();}
 const check=doc.getElementById('checkout-checked');if(check)check.checked=false;
}
export function applyOfferImport(doc,result){
 for(const id of INPUTS){const e=doc.getElementById(id),value=result.fields[id];if(value)e.value=value;const note=doc.createElement('p');note.id=id+'-import-note';note.className='hint import-note';note.textContent=result.notes[id]||'Aus der Angebots-PDF übernommen.';if(value){e.dataset.imported='true';note.dataset.imported='true';}e.insertAdjacentElement('afterend',note);}
 const check=doc.getElementById('checkout-checked');if(check)check.checked=false;
 const missing=INPUTS.filter(id=>!doc.getElementById(id).value.trim());
 doc.getElementById('offer-import-status').textContent=`${INPUTS.filter(id=>result.fields[id]).length} Angaben aus der PDF übernommen. Bitte die übernommenen Daten und den Versandweg prüfen. Markierte Pflichtangaben ergänzen.`+(result.warnings.length?' '+result.warnings.join(' '):'');
}
