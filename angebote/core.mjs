export function validateLayout(layout,pages){
 if(!layout || !Number.isInteger(layout.page) || layout.page<0 || layout.page>=pages.length)throw Error('Die Unterschriftsseite fehlt. Bitte das Angebot neu vorbereiten.');
 const page=pages[layout.page],{width,height}=page.getSize();
 if(page.getRotation().angle%360!==0)throw Error('Gedrehte PDF-Seiten bitte vor der Vorbereitung aufrecht speichern.');
 const c=page.getCropBox();if(Math.abs(c.x)>.1||Math.abs(c.y)>.1||Math.abs(c.width-width)>.1||Math.abs(c.height-height)>.1)throw Error('Diese PDF hat einen abweichenden Seitenbeschnitt. Bitte zuerst als Standard-PDF exportieren.');
 for(const k of ['signature','date']){const r=layout[k];if(!r || !['x','y','w','h'].every(n=>Number.isFinite(r[n])) || r.x<0 || r.y<0 || r.w<40 || r.h<(k==='signature'?25:12) || r.x+r.w>width+.1 || r.y+r.h>height+.1)throw Error('Die markierte Fläche liegt außerhalb der PDF oder ist zu klein.');}
 const a=layout.signature,b=layout.date;if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)throw Error('Datum und Unterschrift dürfen sich nicht überlagern.');
 return layout;
}
export function rejectExistingSignatures(doc,PDFLib){
 if(!doc.catalog.get(PDFLib.PDFName.of('AcroForm')))return;
 for(const f of doc.getForm().getFields()){
  if(f instanceof PDFLib.PDFSignature && f.acroField.dict.get(PDFLib.PDFName.of('V')))throw Error('Diese PDF wurde bereits digital unterschrieben. Bitte die ursprüngliche, ununterzeichnete Datei verwenden.');
 }
}
export async function stampPDF(bytes,layout,images,PDFLib,options={}){
 const doc=await PDFLib.PDFDocument.load(bytes,{updateMetadata:false});
 rejectExistingSignatures(doc,PDFLib);validateLayout(layout,doc.getPages());
 // Keep existing page content and forms outside the signing areas intact.
 const page=doc.getPages()[layout.page],height=page.getHeight();
 const annots=page.node.Annots();
 if(annots)for(let i=0;i<annots.size();i++){
  const a=doc.context.lookup(annots.get(i)),type=a.get(PDFLib.PDFName.of('Subtype'))?.toString(),rect=a.lookupMaybe(PDFLib.PDFName.of('Rect'),PDFLib.PDFArray);
  if(!rect||!['/Widget','/Ink','/Stamp'].includes(type))continue;
  const b=rect.asArray().map(v=>doc.context.lookup(v).asNumber());
  for(const r of [layout.signature,layout.date]){const y=height-r.y-r.h;if(b[0]<r.x+r.w&&b[2]>r.x&&b[1]<y+r.h&&b[3]>y)throw Error('In der Unterschriftsfläche liegt bereits ein Formularfeld oder eine Markierung. Bitte die einfache, ununterzeichnete PDF-Fassung verwenden.');}
 }
 if(options.testLabel)for(const p of doc.getPages())p.drawText('PROBELAUF - KEINE ANGEBOTSANNAHME',{x:36,y:65,size:11,color:PDFLib.rgb(.7,0,0)});
 for(const [key,png] of [['signature',images.signature],['date',images.date]]){
  const r=layout[key],p={x:r.x,y:height-r.y-r.h,width:r.w,height:r.h};
  page.drawRectangle({...p,color:PDFLib.rgb(1,1,1),opacity:1});
  const image=await doc.embedPng(png);page.drawImage(image,{...p,opacity:1});
 }
 if(options.bundle?.length)doc.catalog.set(PDFLib.PDFName.of('SichtwerkDocuments'),doc.context.obj(options.bundle.map(f=>({Name:PDFLib.PDFHexString.fromText(f.name),SHA256:PDFLib.PDFHexString.fromText(f.sha256),Version:PDFLib.PDFHexString.fromText(f.version||'')}))));
 return doc.save({useObjectStreams:false,updateFieldAppearances:false});
}
export function germanDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Bitte ein gültiges Datum wählen.');const [y,m,d]=value.split('-');const date=new Date(Number(y),Number(m)-1,Number(d));if(date.getFullYear()!==+y||date.getMonth()!==+m-1||date.getDate()!==+d)throw Error('Bitte ein gültiges Datum wählen.');return `${d}.${m}.${y}`;}
export function signedName(filename){return filename.replace(/\.pdf$/i,'').replace(/[^\p{L}\p{N}_. -]/gu,'_').slice(0,140)+'_unterschrieben.pdf';}
export function detectLayout(pages){
 for(let i=0;i<pages.length;i++){
  const {items,width,height}=pages[i];
  const signatures=items.filter(t=>/unterschrift/i.test(t.text)&&!/(rechtsverbindlich|versicherer|auftragnehmer)/i.test(t.text));
  for(const sig of signatures){
   // A label at left, with a date label just above, is a recognizable customer block.
   if(sig.x>width*.4 || sig.text.length>65)continue;
   const date=items.filter(t=>/(ort\s*[,/]?\s*datum|ort\/datum)/i.test(t.text)&&t.y<=sig.y+3&&sig.y-t.y<70).sort((a,b)=>b.y-a.y)[0];
   if(!date)continue;
   const left=Math.max(sig.x+sig.w+10,width*.24),right=width*.905;
   const next=items.filter(t=>t.y>sig.y+12&&t.x<right&&t.x+t.w>left).sort((a,b)=>a.y-b.y)[0];
   const available=Math.min(56,(next?next.y:height-60)-sig.y-7);
   if(available<25||right-left<120)continue;
   const dx=Math.max(date.x+date.w+5,width*.21);
   return {page:i,signature:{x:left,y:sig.y-1,w:right-left,h:available},date:{x:dx,y:date.y-2,w:right-dx,h:Math.max(14,date.h+4)}};
  }
 }
 return null;
}
export function readEmbeddedLayout(doc,PDFLib){
 const d=doc.catalog.lookupMaybe(PDFLib.PDFName.of('SichtwerkSigning'),PDFLib.PDFDict);if(!d)return null;
 const version=d.lookup(PDFLib.PDFName.of('Version'),PDFLib.PDFNumber).asNumber();if(version!==1)throw Error('Diese vorbereitete PDF verwendet eine unbekannte Signierversion.');
 const number=k=>d.lookup(PDFLib.PDFName.of(k),PDFLib.PDFNumber).asNumber();
 const rect=k=>{const a=d.lookup(PDFLib.PDFName.of(k),PDFLib.PDFArray).asArray().map(x=>doc.context.lookup(x).asNumber());if(a.length!==4)throw Error('Die vorbereiteten Signierflächen sind ungültig.');return {x:a[0],y:a[1],w:a[2],h:a[3]};};
 return validateLayout({page:number('Page'),signature:rect('Signature'),date:rect('Date')},doc.getPages());
}
