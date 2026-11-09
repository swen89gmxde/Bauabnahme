// Versioned default for new releases. Existing checkout snapshots remain authoritative.
export function validateMontagePolicy(value){
 if(!value||!Number.isInteger(value.version)||value.version<1||value.weeks!==4||value.trigger!=='supplier_arrival'||typeof value.text!=='string'||!value.text.trim()||value.text.length>700)throw Error('Die Montagebedingungen konnten nicht geladen werden. Bitte die Seite neu laden.');
 return {version:value.version,weeks:value.weeks,trigger:value.trigger,text:value.text};
}
export function montageCheckout(policy){
 const p=validateMontagePolicy(policy);return {delivery_terms:p.text,delivery_policy_version:p.version};
}
export async function appendMontagePage(doc,checkout,PDFLib,{testLabel=false}={}){
 if(!checkout?.delivery_policy_version)return;
 if(!Number.isInteger(checkout.delivery_policy_version)||typeof checkout.delivery_terms!=='string'||!checkout.delivery_terms.trim()||checkout.delivery_terms.length>700)throw Error('Die freigegebenen Montagebedingungen fehlen.');
 const page=doc.addPage([595.276,841.89]),font=await doc.embedFont(PDFLib.StandardFonts.Helvetica),bold=await doc.embedFont(PDFLib.StandardFonts.HelveticaBold),left=48,width=499;let y=775;
 const paragraph=(text,size=12,weight=font,gap=18)=>{let line='';for(const word of text.split(/\s+/)){const next=line?line+' '+word:word;if(weight.widthOfTextAtSize(next,size)>width&&line){page.drawText(line,{x:left,y,size,font:weight});y-=size*1.5;line=word;}else line=next;}if(line){page.drawText(line,{x:left,y,size,font:weight});y-=size*1.5;}y-=gap;if(y<100)throw Error('Die Montagebedingungen passen nicht auf die Protokollseite.');};
 paragraph('SICHTWERK / NEUBAUER',11,bold,24);
 if(testLabel)paragraph('PROBELAUF - KEIN AUFTRAG',11,bold,20);
 paragraph('Montagezeit und Voraussetzungen',20,bold,22);
 paragraph(checkout.delivery_terms);
 paragraph('Diese Bedingungen wurden vor der Angebotsannahme im Portal angezeigt und sind Bestandteil dieser Vertragskopie. Individuelle Vereinbarungen im Angebot gehen vor. Die Unterschrift und das Datum befinden sich im zugehörigen Angebot.',11,font,24);
 page.drawText('Montagebedingungen - Textversion '+checkout.delivery_policy_version,{x:left,y:48,size:9,font});
 doc.catalog.set(PDFLib.PDFName.of('SichtwerkMontage'),PDFLib.PDFHexString.fromText(JSON.stringify({version:checkout.delivery_policy_version,text:checkout.delivery_terms})));
}
