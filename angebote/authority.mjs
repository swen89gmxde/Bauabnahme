export const AUTHORITY_VERSION=1;
export const AUTHORITY_ROLES=Object.freeze({sole_owner:'Im eigenen Namen als Alleineigentümer.',co_owner:'Im eigenen Namen bei Miteigentum.',non_owner:'Im eigenen Namen ohne Eigentümerstellung.',representative:'Als bevollmächtigter Vertreter des im Angebot genannten Auftraggebers.'});
export const AUTHORITY_NOTICE='Erforderliche Eigentümerzustimmungen und Vertretungsnachweise sind vor Herstellerbestellung beziehungsweise Ausführung vorzulegen. Wer im eigenen Namen beauftragt, bleibt Vertragspartner und Zahlungsschuldner. Bei wirksamer Vertretung wird der im Angebot genannte Vertretene Vertragspartner. Diese Auswahl ersetzt keinen erforderlichen Zustimmungs- oder Vollmachtsnachweis.';
export const AUTHORITY_CONFIRMATION='Ich bestätige meine gewählte Erklärung zu Eigentum und Beauftragung.';
export function authorityDefinition(principalName){return {version:AUTHORITY_VERSION,principal_name:principalName,roles:{...AUTHORITY_ROLES},notice:AUTHORITY_NOTICE,confirmation:AUTHORITY_CONFIRMATION};}
export function validateAuthorityReceipt(value){
 const a=value;if(!a||a.version!==AUTHORITY_VERSION||a.accepted!==true||!Object.hasOwn(AUTHORITY_ROLES,a.role)||a.role_text!==AUTHORITY_ROLES[a.role]||a.notice!==AUTHORITY_NOTICE||a.confirmation!==AUTHORITY_CONFIRMATION||typeof a.principal_name!=='string'||!a.principal_name.trim()||a.principal_name.length>160||typeof a.signer_name!=='string'||a.signer_name.trim().length<3||a.signer_name.length>100||!/^\d{4}-\d{2}-\d{2}$/.test(a.date))throw Error('Bitte die Erklärung zu Eigentum und Beauftragung vollständig prüfen.');return a;
}
export function authorityReceipt(definition,role,name,date,accepted){
 if(!definition)return null;
 return validateAuthorityReceipt({version:definition.version,role,role_text:definition.roles?.[role],principal_name:definition.principal_name,signer_name:name,date,notice:definition.notice,confirmation:definition.confirmation,accepted});
}
export function authorityPayload(receipt){return receipt?{version:receipt.version,role:receipt.role,principal_name:receipt.principal_name,accepted:receipt.accepted}:null;}
export function mountAuthority(root,offer,onChange){
 root.replaceChildren();root.hidden=!offer.authority;if(!offer.authority)return;
 const d=offer.authority,doc=root.ownerDocument,field=doc.createElement('fieldset'),legend=doc.createElement('legend');legend.textContent='Eigentum und Beauftragung';field.append(legend);
 const intro=doc.createElement('p');intro.textContent='Bitte genau eine Möglichkeit wählen. Auftraggeber laut Angebot: '+d.principal_name;field.append(intro);
 const representative=doc.createElement('p');representative.className='notice';representative.hidden=true;representative.textContent='Vertretener Auftraggeber: '+d.principal_name+'. Die Anschrift ergibt sich aus dem zugehörigen Angebot. Bei einem abweichenden Auftraggeber bitte vor Annahme ein korrigiertes Angebot anfordern.';
 for(const [role,text] of Object.entries(d.roles)){
  const label=doc.createElement('label'),input=doc.createElement('input'),span=doc.createElement('span');label.className='check authority-choice';input.type='radio';input.name='authority-role';input.id='authority-'+role;input.value=role;input.required=true;span.textContent=text;input.addEventListener('change',()=>{representative.hidden=role!=='representative'||!input.checked;onChange();});label.append(input,span);field.append(label);
 }
 field.append(representative);const notice=doc.createElement('p');notice.className='hint';notice.textContent=d.notice;field.append(notice);root.append(field);
}
export function authorityFromForm(root,offer,name,date,accepted){
 if(!offer.authority)return null;
 const role=root.querySelector('input[name="authority-role"]:checked')?.value;if(!role)throw Error('Bitte eine Möglichkeit zu Eigentum und Beauftragung wählen.');return authorityReceipt(offer.authority,role,name,date,accepted);
}
export function renderAuthoritySummary(root,receipt){
 root.replaceChildren();root.hidden=!receipt;if(!receipt)return;const doc=root.ownerDocument;
 for(const [tag,text] of [['h2','Ihre Erklärung zu Eigentum und Beauftragung'],['p',receipt.role_text],['p','Auftraggeber laut Angebot: '+receipt.principal_name],['p','Unterzeichner: '+receipt.signer_name],['p',receipt.notice]]){const el=doc.createElement(tag);el.textContent=text;root.append(el);}
}
export function authorityPage(receipt,offer,doc){
 validateAuthorityReceipt(receipt);const canvas=doc.createElement('canvas');canvas.width=1240;canvas.height=1754;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1240,1754);ctx.fillStyle='#102f3c';let y=105;const left=90,width=1060;
 const paragraph=(value,{size=25,bold=false,gap=22}={})=>{ctx.font=`${bold?'bold ':''}${size}px Arial, sans-serif`;const lines=[];let line='';for(const word of String(value).split(/\s+/)){let next=line?line+' '+word:word;if(ctx.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;if(ctx.measureText(line).width>width){let part='';for(const char of line){if(ctx.measureText(part+char).width>width){lines.push(part);part='';}part+=char;}line=part;}}if(line)lines.push(line);for(const text of lines){if(y>1610)throw Error('Die Erklärung passt nicht vollständig in die Vertragskopie. Bitte Sichtwerk kontaktieren.');ctx.fillText(text,left,y);y+=size*1.36;}y+=gap;};
 if(offer.demo||offer.archive_test||offer.test){ctx.fillStyle='#a02121';paragraph('PROBELAUF - KEIN AUFTRAG',{size:22,bold:true});ctx.fillStyle='#102f3c';}
 paragraph('Eigentum und Beauftragung',{size:38,bold:true,gap:25});paragraph('Erklärung zum unverändert angenommenen Angebot',{size:24,bold:true});
 paragraph('Angebot: '+offer.title);paragraph('Kommission: '+(offer.commission||'Muster')+' | Freigabe: '+(offer.revision||'Probelauf'));
 paragraph('Auftraggeber laut Angebot: '+receipt.principal_name);paragraph('Unterzeichner: '+receipt.signer_name);paragraph('Datum: '+receipt.date.split('-').reverse().join('.'));
 paragraph('Gewählte Erklärung',{bold:true});paragraph(receipt.role_text,{size:28,bold:true,gap:28});paragraph(receipt.notice,{size:23});paragraph(receipt.confirmation,{size:24,bold:true});
 paragraph('Diese Erklärung ist Bestandteil derselben Vertragskopie. Die im Portal erfasste Unterschrift und das Datum stehen im zugehörigen Angebot. Die ursprünglichen Angebotsseiten bleiben erhalten.',{size:22});
 if(offer.sha256)paragraph('SHA-256 des ursprünglichen Angebots: '+offer.sha256,{size:17,gap:0});
 return canvas.toDataURL('image/png');
}
