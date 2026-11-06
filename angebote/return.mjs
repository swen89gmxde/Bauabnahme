export const RETURN_EMAIL='info@sichtwerk-neubauer.de';
const line=value=>String(value||'').replace(/[\r\n\x00-\x1f\x7f]+/g,' ').trim().slice(0,200);
export function returnMail({title,name='',demo=false}){
 const subject=(demo?'PROBELAUF – ':'')+'Unterschriebenes Angebot: '+line(title);
 const body='Guten Tag Herr Neubauer,\r\n\r\nRücksendung meines unterschriebenen Angebots „'+line(title)+'“.\r\n\r\nFreundliche Grüße\r\n'+line(name);
 return 'mailto:'+RETURN_EMAIL+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}
export function canShareFile(navigator,file){
 try{return !!file&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});}catch{return false;}
}
// Share-sheet completion is an app handoff, never proof of delivery. No automatic retries.
export async function returnSignedPDF({channel,file,title,navigator,onStatus,onFallback}){
 if(!file)return;
 if(!canShareFile(navigator,file)){onFallback(channel);return;}
 onStatus(channel==='email'?'Bitte Ihre Mail-App auswählen, Empfänger und PDF-Anhang prüfen und dort auf „Senden“ drücken.':'Bitte WhatsApp und den Chat mit Swen Neubauer auswählen und dort auf „Senden“ drücken.');
 try{
  await navigator.share({files:[file],title});
  onStatus('Die PDF wurde an die ausgewählte App übergeben. Bitte Empfänger und Anhang prüfen und dort den Versand abschließen. Der Eingang ist hier nicht bestätigt.');
 }catch(error){
  if(error.name==='AbortError')onStatus('Teilen abgebrochen. Die PDF bleibt in diesem Fenster verfügbar. Sie können einen anderen Rücksendeweg wählen.');
  else{onStatus('Das direkte Teilen hat hier nicht funktioniert. Bitte die PDF speichern und selbst als Anhang versenden.');onFallback(channel);}
 }
}
