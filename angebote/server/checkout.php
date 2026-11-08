<?php
declare(strict_types=1);

// New releases only. Historic offers retain their accepted document snapshot.
function checkoutText(mixed $value,int $max,string $label): string {
    if(!is_string($value)||preg_match('//u',$value)!==1||preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u',$value)||preg_match_all('/./us',$value)>$max)abortPortal('Bitte '.$label.' vollständig und innerhalb der angegebenen Länge eintragen.');
    $value=trim($value);if($value==='')abortPortal('Bitte '.$label.' eintragen.');return $value;
}
function checkoutEmail(mixed $value): string {
    if(!is_string($value)||strlen($value)>254||!preg_match('/^[A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+$/D',$value)||!filter_var($value,FILTER_VALIDATE_EMAIL))abortPortal('Bitte eine gültige E-Mail-Adresse für die Vertragskopie eintragen.');return $value;
}
function validateCheckout(mixed $value): array {
    if(!is_array($value)||($value['version']??null)!==1||($value['contract_type']??'')!=='work_consumer'||($value['checked_against_offer']??null)!==true)abortPortal('Bitte die Abschlussübersicht für diesen Werk-/Montagevertrag mit dem Angebot abgleichen.',400,'checkout_required');
    $total=$value['total_cents']??null;if(!is_int($total)||$total<1||$total>1000000000)abortPortal('Bitte den Gesamtpreis einschließlich Umsatzsteuer als gültigen Betrag eintragen.');
    return ['version'=>1,'contract_type'=>'work_consumer','description'=>checkoutText($value['description']??null,1200,'Leistung und wesentliche Ausführung'),'total_cents'=>$total,'additional_costs'=>checkoutText($value['additional_costs']??null,500,'Angaben zu weiteren Kosten'),'payment_terms'=>checkoutText($value['payment_terms']??null,1800,'Zahlungsbedingungen'),'delivery_terms'=>checkoutText($value['delivery_terms']??null,700,'Liefer-/Ausführungszeit und deren Beginn'),'customer_email'=>checkoutEmail($value['customer_email']??null),'checked_against_offer'=>true];
}
function checkoutHash(array $checkout): string {return hash('sha256',json_encode($checkout,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));}
function requireOrderConsent(array $r,array $meta): void {
    if(empty($r['checkout'])||!empty($r['archive_test']))return;
    if(($meta['order_consent']??null)!==true||!is_string($meta['checkout_hash']??null)||!hash_equals(checkoutHash($r['checkout']),$meta['checkout_hash']))abortPortal('Bitte die vollständige Abschlussübersicht prüfen und die zahlungspflichtige Annahme bestätigen.',400,'order_consent_required');
}
function customerCopyStatus(array $r): array {return array_intersect_key($r['customer_copy']??[],array_flip(['state','requested_at','submitted_at','manual_delivered_at','last_error','attempts']));}
function euroCents(int $cents): string {return number_format($cents/100,2,',','.').' EUR';}
function checkoutSummaryText(array $r): string {
    $c=$r['checkout'];return (!empty($r['archive_test'])?"ARCHIVTEST - KEIN KUNDENAUFTRAG - KEINE ZAHLUNGSPFLICHT\n\n":"")."Vertragsbestätigung - Sichtwerk - Neubauer\nSwen Neubauer, Winterberg 2, 96361 Steinbach am Wald\nTelefon: 0151 11546112; E-Mail: sichtwerk.neubauer@gmx.de\n\nKunde: ".$r['customer_name']."\nKommission: ".$r['commission']."\nAngebot: ".$r['title']."\nFreigabe: ".$r['revision']."\n\nLeistung und Ausführung:\n".$c['description']."\n\nGesamtpreis einschließlich Umsatzsteuer: ".euroCents($c['total_cents'])."\nWeitere Kosten: ".$c['additional_costs']."\n\nZahlung:\n".$c['payment_terms']."\n\nLieferung/Ausführung:\n".$c['delivery_terms']."\n\nEinmaliger Werk-/Montageauftrag, kein Abonnement. Die individuell vereinbarten Angebotsangaben gehen den AGB vor. Gesetzliche Mängelrechte bleiben bestehen. Es wird kein vorzeitiger Beginn und kein Widerrufsverzicht erklärt. Die Bestellwartezeit nach Ziffern 6 und 16 der beigefügten AGB bleibt erhalten.\n\nWiderruf: Bei bestehendem gesetzlichen Widerrufsrecht gelten die beigefügte Belehrung und das Musterformular. Die elektronische Widerrufsfunktion bleibt unabhängig vom gesperrten Angebotslink unter ".withdrawalURL()." erreichbar. Andere zulässige Widerrufswege bleiben bestehen.\n";
}
function customerCopyFiles(array $r): array {
    $dir=recordPath($r['id']);$files=[['path'=>$dir.'/signed.pdf','name'=>'Unterschriebenes_Angebot.pdf','mime'=>'application/pdf','sha256'=>$r['completion']['sha256']]];
    foreach($r['attachments'] as $f)$files[]=['path'=>$dir.'/asset-'.$f['id'],'name'=>$f['name'],'mime'=>$f['mime'],'sha256'=>$f['sha256']];
    $total=0;foreach($files as $f){if(!is_file($f['path'])||is_link($f['path'])||!hash_equals($f['sha256'],hash_file('sha256',$f['path'])))throw new RuntimeException('customer_copy_source');$total+=filesize($f['path']);}if($total>11*1024*1024)throw new RuntimeException('customer_copy_size');return $files;
}
function submitCustomerCopy(array $message,array $settings,array $files): bool {
    $boundary='sichtwerk_'.bin2hex(random_bytes(18));
    $part=static fn($s)=>chunk_split(base64_encode($s),76,"\r\n");$body='--'.$boundary."\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".$part($message['body']);
    foreach($files as $f){$name=preg_replace('/[^a-zA-Z0-9_.-]/','_',$f['name']);$body.='--'.$boundary."\r\nContent-Type: ".$f['mime']."\r\nContent-Disposition: attachment; filename=\"".$name."\"; filename*=UTF-8''".rawurlencode($f['name'])."\r\nContent-Transfer-Encoding: base64\r\n\r\n".$part((string)file_get_contents($f['path']));}
    $body.='--'.$boundary."--\r\n";$headers=['From'=>'Sichtwerk - Neubauer <'.$message['from'].'>','MIME-Version'=>'1.0','Content-Type'=>'multipart/mixed; boundary="'.$boundary.'"','Message-ID'=>$message['message_id'],'Auto-Submitted'=>'auto-generated'];
    $transport=$settings['transport']??null;if(is_callable($transport))return $transport($message+['attachments'=>array_map(fn($f)=>array_diff_key($f,['path'=>true]),$files),'mime_body'=>$body,'mime_headers'=>$headers])===true;
    if(!function_exists('mail'))return false;
    return @mail($message['to'],'=?UTF-8?B?'.base64_encode($message['subject']).'?=',$body,$headers,'-f'.$message['from']);
}
function sendCustomerCopy(array $r,bool $force=false,bool $acknowledgeUncertain=false): array {
    if(empty($r['checkout'])||empty($r['completion'])||empty($r['customer_copy']))return $r;$n=$r['customer_copy'];
    if(in_array($n['state']??'',['submitted','manual_delivered'],true))return $r;
    if(in_array($n['state']??'',['sending','uncertain'],true)&&!$acknowledgeUncertain){$r['customer_copy']['state']='uncertain';saveJson(recordPath($r['id']).'/record.json',$r);return $r;}
    if(!$force&&($n['next_attempt']??0)>time())return $r;
    try{$settings=completionNotificationSettings();$files=customerCopyFiles($r);$to=checkoutEmail($r['checkout']['customer_email']);$domain=substr($settings['from'],strpos($settings['from'],'@')+1);
        $message=['to'=>$to,'from'=>$settings['from'],'subject'=>(!empty($r['archive_test'])?'ARCHIVTEST - ':'').'Ihre Vertragsunterlagen - '.cleanText($r['commission'],100),'body'=>checkoutSummaryText($r)."\nIhre Angebotsannahme ist am ".$r['completion']['accepted_at']." bei Sichtwerk eingegangen. Die unterschriebene PDF und die zu dieser Freigabe gehörenden Unterlagen sind beigefügt. Bitte dauerhaft speichern. Eine Zahlung wird im Portal nicht eingezogen.\n",'message_id'=>'<sichtwerk.customer.'.$r['id'].'@'.$domain.'>'];
    }catch(Throwable){$r['customer_copy']['state']='pending';$r['customer_copy']['last_error']='customer_copy_source';$r['customer_copy']['next_attempt']=time()+60;saveJson(recordPath($r['id']).'/record.json',$r);return $r;}
    $r['customer_copy']['state']='sending';$r['customer_copy']['attempts']=($n['attempts']??0)+1;saveJson(recordPath($r['id']).'/record.json',$r);
    try{if(submitCustomerCopy($message,$settings,$files)){$r['customer_copy']['state']='submitted';$r['customer_copy']['submitted_at']=gmdate(DATE_ATOM);unset($r['customer_copy']['last_error'],$r['customer_copy']['next_attempt']);}else{$r['customer_copy']['state']='pending';$r['customer_copy']['last_error']='customer_copy_rejected';$r['customer_copy']['next_attempt']=time()+60;}}
    catch(Throwable){$r['customer_copy']['state']='uncertain';$r['customer_copy']['last_error']='customer_copy_uncertain';}
    saveJson(recordPath($r['id']).'/record.json',$r);return $r;
}
function retryCustomerCopy(string $id,bool $acknowledge=false): array {
    $r=recordById($id);$scope=lockPortal('scope:'.$r['scope']);$record=lockPortal('record:'.$id);
    try{$r=recordById($id);if(empty($r['customer_copy']))abortPortal('Für diese Freigabe gibt es keinen Kundenkopie-Auftrag.',409);if(in_array($r['customer_copy']['state'],['sending','uncertain'],true)&&!$acknowledge)abortPortal('Bitte vor erneutem Versand beim Kunden nachfragen. Eine doppelte Mail ist möglich.',409,'customer_copy_uncertain');$r=sendCustomerCopy($r,true,$acknowledge);$r=purgeTemporaryDocuments($r);return ['ok'=>true,'customer_copy'=>customerCopyStatus($r)];}finally{releasePortal($record);releasePortal($scope);}
}

function archiveTestCheckout(): array {
    $n=completionNotificationSettings();return validateCheckout(['version'=>1,'contract_type'=>'work_consumer','description'=>'Unverbindlicher Mustervertrag: Prüfung von Abschlussübersicht, Pflichtbestätigungen, Vertragskopie und Archivierung. Kein Kundenauftrag.','total_cents'=>123456,'additional_costs'=>'Musterbetrag; keine tatsächlichen Kosten.','payment_terms'=>'Im Archivtest entsteht keine Zahlungspflicht. Die AGB-Bestellwartezeit wird nur als Anzeige geprüft.','delivery_terms'=>'Keine Lieferung und keine Ausführung: ausschließlich technischer Musterablauf.','customer_email'=>$n['to'],'checked_against_offer'=>true]);
}
function manualCustomerCopy(string $id,array $input): array {
    if(($input['delivered']??null)!==true)abortPortal('Bitte erst den tatsächlichen Versand der vollständigen Vertragskopie bestätigen.');
    $r=recordById($id);$scope=lockPortal('scope:'.$r['scope']);$record=lockPortal('record:'.$id);
    try{$r=recordById($id);if(empty($r['customer_copy'])||empty($r['completion']))abortPortal('Für diesen Vorgang liegt keine Vertragskopie vor.',409);if($r['customer_copy']['state']==='manual_delivered')return ['ok'=>true,'customer_copy'=>customerCopyStatus($r)];if($r['customer_copy']['state']==='submitted')abortPortal('Die Vertragskopie wurde bereits an den Maildienst übergeben.',409);unset($r['customer_copy']['last_error'],$r['customer_copy']['next_attempt']);$r['customer_copy']['state']='manual_delivered';$r['customer_copy']['manual_delivered_at']=gmdate(DATE_ATOM);saveJson(recordPath($id).'/record.json',$r);return ['ok'=>true,'customer_copy'=>customerCopyStatus(purgeTemporaryDocuments($r))];}finally{releasePortal($record);releasePortal($scope);}
}
