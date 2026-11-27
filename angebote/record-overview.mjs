import {berlinCalendarDate} from './order-status.mjs?v=20261118-kalender-1';

const DAY = 86400000;
const names = {trashed:'Papierkorb',insurance_pending:'Versichererzusage ausstehend',active:'Angebot offen',completed:'Unterschrieben',archive_pending:'Unterschrieben · Archivierung ausstehend',revoked:'Gesperrt',replaced:'Ersetzt'};
const compare = new Intl.Collator('de-DE',{numeric:true,sensitivity:'base'}).compare;
const dateText = value => value.split('-').reverse().join('.');
const asDay = value => Date.parse(value+'T00:00:00Z');
const iso = value => new Date(value).toISOString().slice(0,10);

// Gregorian Easter calculation. The calendar is for Sichtwerk's business location
// in Steinbach am Wald, Bavaria (including 15 August; not Augsburg's local holiday).
function easterSunday(y){
 const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
 return Date.UTC(y,Math.floor(n/31)-1,n%31+1);
}
function nonWorkingDay(ms){
 const date=new Date(ms),weekday=date.getUTCDay(),fixed=iso(ms).slice(5);
 if(weekday===0||weekday===6||['01-01','01-06','05-01','08-15','10-03','11-01','12-25','12-26'].includes(fixed))return true;
 const diff=(ms-easterSunday(date.getUTCFullYear()))/DAY;
 return [-2,1,39,50,60].includes(diff);
}

export function recordWait(record,today=berlinCalendarDate()){
 if(record.archive_test||record.state==='trashed')return null;
 if(!record.accepted_at)return ['completed','archive_pending'].includes(record.state)?{kind:'unknown',label:'Annahmedatum prüfen',detail:'Für diese ältere Freigabe ist kein eindeutiger Zeitpunkt der Kundenannahme gespeichert. Bitte die Unterlagen prüfen.'}:null;
 if(record.minimum_wait_days!==14)return {kind:'unknown',label:'AGB-Wartezeit prüfen',detail:'Für diese Freigabe ist noch keine geprüfte Mindestwartezeit hinterlegt. Bitte den vereinbarten AGB-Stand prüfen.'};
 const accepted=new Date(record.accepted_at);
 if(!Number.isFinite(accepted.getTime()))return {kind:'unknown',label:'Annahmedatum prüfen',detail:'Der Zeitpunkt des Vertragsschlusses ist nicht eindeutig gespeichert.'};
 const start=berlinCalendarDate(accepted);let end=asDay(start)+14*DAY;
 while(nonWorkingDay(end))end+=DAY;
 const endDate=iso(end),earliest=iso(end+DAY),remaining=(end-asDay(today))/DAY;
 const detail=`Annahme: ${dateText(start)} · Wartezeit bis einschließlich ${dateText(endDate)} · zeitlich frühestens ab ${dateText(earliest)}. Feiertagskalender: Steinbach am Wald.`;
 if(record.ordered_on)return {kind:'ordered',label:'Bestellt am '+dateText(record.ordered_on),detail,endDate,remaining};
 if(remaining<0)return {kind:'elapsed',label:'Wartezeit abgelaufen',detail,endDate,remaining};
 return {kind:'waiting',label:remaining===0?'Wartezeit endet heute':`Noch ${remaining} ${remaining===1?'Tag':'Tage'} Wartezeit`,detail,endDate,remaining};
}

export function recordStateLabel(record){
 if(record.order_status_closed&&record.state==='completed')return 'Auftrag abgeschlossen';
 return names[record.state]||record.state;
}

export function selectRecords(records,{query='',filter='all',sort='customer',today=berlinCalendarDate()}={}){
 const q=query.trim().toLocaleLowerCase('de-DE');
 const selected=records.filter(r=>{
  if(q&&!`${r.customer_name} ${r.customer_id||''} ${r.commission} ${r.title||''}`.toLocaleLowerCase('de-DE').includes(q))return false;
  const wait=recordWait(r,today);
  if(filter==='open')return ['active','insurance_pending'].includes(r.state);
  if(filter==='signed')return !!r.accepted_at&&!r.archive_test;
  if(filter==='waiting')return wait?.kind==='waiting'&&!r.order_status_closed;
  if(filter==='elapsed')return wait?.kind==='elapsed'&&!r.order_status_closed;
  if(filter==='closed')return r.order_status_closed||['revoked','replaced'].includes(r.state);
  return true;
 });
 const latest=(a,b)=>(b.created||0)-(a.created||0)||(b.revision||0)-(a.revision||0)||compare(a.customer_name,b.customer_name);
 return selected.sort((a,b)=>{
  if(sort==='newest')return latest(a,b);
  if(sort==='commission')return compare(b.commission,a.commission)||latest(a,b);
  if(sort==='deadline'){
   const aw=recordWait(a,today),bw=recordWait(b,today),ad=aw?.kind==='waiting'?aw.endDate:'9999-99-99',bd=bw?.kind==='waiting'?bw.endDate:'9999-99-99';
   return compare(ad,bd)||latest(a,b);
  }
  return compare(a.customer_name,b.customer_name)||compare(b.commission,a.commission)||latest(a,b);
 });
}

export function updateWaitLabels(root,records,today=berlinCalendarDate()){
 const byId=new Map(records.map(r=>[r.id,r]));
 for(const span of root.querySelectorAll('[data-wait-record]')){
  const record=byId.get(span.dataset.waitRecord),wait=record&&recordWait(record,today);
  span.hidden=!wait;if(wait){span.textContent=wait.label;span.dataset.waitKind=wait.kind;}
 }
 for(const span of root.querySelectorAll('[data-wait-detail]')){
  const record=byId.get(span.dataset.waitDetail),wait=record&&recordWait(record,today);
  span.hidden=!wait;if(wait)span.textContent=wait.detail;
 }
}

export function makeRecordRow(document,record,card){
 const row=document.createElement('details');row.className='record-row';row.dataset.recordId=record.id;
 const summary=document.createElement('summary'),identity=document.createElement('span'),customer=document.createElement('strong'),commission=document.createElement('span'),status=document.createElement('span'),wait=document.createElement('span');
 identity.className='record-identity';customer.textContent=record.customer_name;commission.className='record-commission';commission.textContent=record.commission+' · Freigabe '+record.revision;identity.append(customer,commission);
 status.className='record-status';status.textContent=recordStateLabel(record);wait.className='record-wait';wait.dataset.waitRecord=record.id;wait.hidden=true;
 summary.append(identity,status,wait);row.append(summary,card);
 if(recordWait(record)){
  const section=document.createElement('section');section.className='record-wait-panel';const title=document.createElement('strong'),detail=document.createElement('p'),note=document.createElement('p');title.textContent='Bestellwartezeit gemäß AGB';detail.dataset.waitDetail=record.id;note.className='hint';note.textContent='Vor der Bestellung zusätzlich prüfen: erforderliche Vorauszahlung eingegangen, technische Klärung, gegebenenfalls ordnungsgemäß begonnene gesetzliche Widerrufsfrist abgelaufen, kein rechtzeitig erklärter Widerruf und keine abweichende Vereinbarung.';section.append(title,detail,note);card.prepend(section);
 }
 return row;
}
