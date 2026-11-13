const HEX_TOKEN = /^[a-f0-9]{64}$/;
// 32 bytes in unpadded base64url. The final two unused bits must be zero.
const CUSTOMER_LINK = /^[^/]+\/([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$/;

function customerLinkName(name) {
 const normalized = name.toLowerCase().normalize('NFC')
  .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
  .normalize('NFKD').replace(/\p{M}/gu, '');
 const slug = normalized.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
 return Array.from(slug).slice(0, 64).join('').replace(/-+$/, '') || 'angebot';
}

export function workflowURL(result, location, customerName) {
 const insurance = result.role === 'insurance';
 const url = new URL(insurance ? 'versicherung.html' : './', location.href);
 url.search = '';
 if (insurance || customerName === undefined) {
  url.hash = (insurance ? 'versicherung=' : 'auftrag=') + result.token;
  return url.href;
 }
 if (!HEX_TOKEN.test(result.token)) throw Error('Der Kundenlink konnte nicht erstellt werden.');
 const bytes = result.token.match(/../g).map(byte => parseInt(byte, 16));
 const key = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=$/, '');
 // Older copies of the portal may be cached at the plain /angebote/ address.
 url.search = '?angebot';
 url.hash = customerLinkName(customerName) + '/' + key;
 return url.href;
}

export function customerTokenFromFragment(hash) {
 const fragment = hash.slice(1);
 if (!fragment) return '';
 const legacy = new URLSearchParams(fragment).get('auftrag');
 if (HEX_TOKEN.test(legacy ?? '')) return legacy;
 const key = CUSTOMER_LINK.exec(fragment)?.[1];
 if (!key) throw Error('Dieser Angebotslink ist ungültig.');
 // The readable name is only a label. The server still receives the original token.
 const bytes = atob(key.replaceAll('-', '+').replaceAll('_', '/') + '=');
 return Array.from(bytes, byte => byte.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

// Owner-only controls. Creating controls never mutates a record.
export function mountRecordActions(card,record,{api,reload,message,showLink,document}){
 const button=(label,action,danger=false)=>{const b=document.createElement('button');b.type='button';b.className='secondary'+(danger?' danger':'');b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){message(e.message);}finally{b.disabled=false;}};card.append(b);};
 if(record.state==='trashed'){
  const p=document.createElement('p');p.className='hint';p.textContent='Im Papierkorb. Die Dateien bleiben geschützt erhalten; öffentliche Zugänge sind gesperrt.';card.append(p);
  button('Vorgang wiederherstellen',async()=>{await api('record-restore',{method:'POST',body:{id:record.id,confirmed:true}});message('Vorgang wiederhergestellt. Alte Zugangslinks bleiben gesperrt.');reload();});
  button('Endgültig aus STRATO löschen',()=>confirmRemoval(record,'purge',{api,reload,message,document}),true);return;
 }
 if(record.insurance){
  const p=document.createElement('p');p.className='notice';const i=record.insurance;p.textContent=i.state==='accepted'?'Versichererzusage bestätigt. Kunde nimmt das Angebot anschließend selbst an.':'Zuerst Versichererzusage einholen. Der Kunde hat noch keinen Auftrag erteilt.';card.append(p);
  if(record.state==='insurance_pending')button('Neuen Versicherungslink erstellen',async()=>showLink(await api('insurance-link',{method:'POST',body:{id:record.id}})));
  if(i.state==='accepted'&&record.state==='active')button('Kundenlink erstellen / bisherigen ersetzen',async()=>{
   const result=await api('insurance-customer-link',{method:'POST',body:{id:record.id}});
   showLink(result,record.customer_name);
  });
  if(i.notification?.state&&i.notification.state!=='submitted'&&i.state==='accepted'&&record.state==='active')button('Sichtwerk über die Zusage erneut benachrichtigen',async()=>{const uncertain=['sending','uncertain'].includes(i.notification.state);if(uncertain&&!globalThis.confirm('Die Nachricht könnte bereits versendet worden sein. Postfach geprüft und erneut senden?'))return;await api('insurance-notification-retry',{method:'POST',body:{id:record.id,acknowledge_possible_duplicate:uncertain}});reload();});
 }
 button('Vorgang in den Papierkorb legen',()=>confirmRemoval(record,'trash',{api,reload,message,document}),true);
}
function confirmRemoval(record,operation,{api,reload,message,document}){
 const dialog=document.createElement('dialog');dialog.className='record-dialog';const form=document.createElement('form');form.method='dialog';
 const heading=document.createElement('h2');heading.textContent=operation==='purge'?'Vorgang endgültig löschen?':'Vorgang in den Papierkorb legen?';
 const name=document.createElement('p');name.textContent=record.customer_name+' · '+record.commission;
 const note=document.createElement('p');note.textContent=operation==='purge'?'Die Portaldateien dieses Vorgangs einschließlich signierter PDFs und Anlagen werden unwiederbringlich aus dem STRATO-Portalarchiv gelöscht. Externe Sicherungen und historische Drive-Archive werden dadurch nicht gelöscht.':'Der Vorgang wird aus der normalen Liste entfernt. Seine Dateien bleiben geschützt erhalten und können im Papierkorb wiederhergestellt werden. Kunden- und Versicherungslinks werden gesperrt.';
 form.append(heading,name,note);let check;
 if(operation==='purge'){const label=document.createElement('label');label.className='check';check=document.createElement('input');check.type='checkbox';check.required=true;const span=document.createElement('span');span.textContent='Ich habe geprüft, dass keine Aufbewahrungspflicht oder offene Klärung entgegensteht oder die erforderlichen Unterlagen vollständig anderweitig aufbewahrt werden.';label.append(check,span);form.append(label);}
 const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Abbrechen';cancel.onclick=()=>dialog.close();
 const submit=document.createElement('button');submit.type='submit';submit.className='primary danger';submit.textContent=operation==='purge'?'Jetzt endgültig löschen':'In den Papierkorb legen';form.append(cancel,submit);dialog.append(form);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;submit.disabled=true;try{await api('record-'+operation,{method:'POST',body:{id:record.id,confirmed:true,...(operation==='purge'?{retention_checked:check.checked}:{})}});dialog.close();message(operation==='purge'?'Vorgang aus dem STRATO-Portalarchiv gelöscht.':'Vorgang liegt jetzt im Papierkorb.');reload();}catch(e){message(e.message);submit.disabled=false;}};
 dialog.showModal();
}
