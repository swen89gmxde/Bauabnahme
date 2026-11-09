<?php
declare(strict_types=1);

// New releases only. Historic offers retain their accepted document snapshot.
function montagePolicy(): array {
    $path=dirname(__DIR__).'/montage-current.json';$policy=is_file($path)?json_decode((string)file_get_contents($path),true):null;
    if(!is_array($policy)||!is_int($policy['version']??null)||$policy['version']<1||($policy['weeks']??null)!==4||($policy['trigger']??'')!=='supplier_arrival')abortPortal('Die Montagebedingungen sind noch nicht vollständig eingerichtet.',503);
    $policy['text']=checkoutText($policy['text']??null,700,'hinterlegte Montagebedingungen');return $policy;
}
function checkoutText(mixed $value,int $max,string $label): string {
    if(!is_string($value)||preg_match('//u',$value)!==1||preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u',$value)||preg_match_all('/./us',$value)>$max)abortPortal('Bitte '.$label.' vollständig und innerhalb der angegebenen Länge eintragen.');
    $value=trim($value);if($value==='')abortPortal('Bitte '.$label.' eintragen.');return $value;
}
function checkoutEmail(mixed $value): string {
    if(!is_string($value)||strlen($value)>254||!preg_match('/^[A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+$/D',$value)||!filter_var($value,FILTER_VALIDATE_EMAIL))abortPortal('Bitte eine gültige E-Mail-Adresse für die Vertragskopie eintragen.');return $value;
}
function isBusinessCheckout(mixed $value): bool {return is_array($value)&&($value['version']??null)===2&&($value['contract_type']??'')==='work_business';}
function validatePDFCheckout(array $value): array {
    if(($value['mode']??'')!=='offer_pdf'||!in_array($value['contract_type']??null,['work_consumer','work_business'],true)||!is_string($value['source_sha256']??null)||preg_match('/^[a-f0-9]{64}$/D',$value['source_sha256'])!==1)abortPortal('Bitte die ursprüngliche Angebots-PDF erneut auswählen.',400,'checkout_source_required');
    if(isBusinessCheckout($value)&&($value['customer_type_confirmed']??null)!==true)abortPortal('Bitte die Geschäftskundenart bei der Vorbereitung aktiv prüfen.',400,'customer_type_required');
    $total=$value['total_cents']??null;if(!is_int($total)||$total<1||$total>1000000000)abortPortal('Die Bruttogesamtsumme konnte nicht zuverlässig aus dem Angebot übernommen werden.');
    $pages=$value['source_pages']??null;if(!is_array($pages)||!array_is_list($pages)||count($pages)<1||count($pages)>100)abortPortal('Der Angebotstext ist unvollständig.',400,'checkout_source_required');
    $safe=[];$length=0;foreach($pages as $i=>$page){if(!is_array($page)||($page['number']??null)!==$i+1||!is_string($page['text']??null))abortPortal('Die Angebotsseiten sind unvollständig.',400,'checkout_source_required');$text=$page['text']===''?'':checkoutText($page['text'],50000,'ausgelesenen Angebotstext');$length+=preg_match_all('/./us',$text);$safe[]=['number'=>$i+1,'text'=>$text];}if($length<1||$length>300000)abortPortal('Der Angebotstext ist leer oder zu lang.',400,'checkout_source_required');
    $method=$value['copy_delivery']??'whatsapp';if(!is_string($method)||!in_array($method,['email','whatsapp','paper'],true))abortPortal('Bitte einen gültigen Versandweg für die Vertragskopie wählen.');
    $montage=montagePolicy();if(($value['delivery_policy_version']??null)!==$montage['version']||($value['delivery_terms']??null)!==$montage['text'])abortPortal('Die Montagebedingungen wurden aktualisiert. Bitte die Seite neu laden und das Angebot erneut vorbereiten.',409,'montage_version_changed');
    return ['version'=>2,'mode'=>'offer_pdf','contract_type'=>$value['contract_type'],... (isBusinessCheckout($value)?['customer_type_confirmed'=>true]:[]),'source_sha256'=>$value['source_sha256'],'source_pages'=>$safe,'total_cents'=>$total,'delivery_terms'=>$montage['text'],'delivery_policy_version'=>$montage['version'],'customer_email'=>$method==='email'?checkoutEmail($value['customer_email']??null):'','copy_delivery'=>$method];
}
function validateCheckout(mixed $value): array {
    if(is_array($value)&&($value['version']??null)===2)return validatePDFCheckout($value);
    if(!is_array($value)||($value['version']??null)!==1||($value['contract_type']??'')!=='work_consumer'||($value['checked_against_offer']??null)!==true)abortPortal('Bitte die Abschlussübersicht für diesen Werk-/Montagevertrag mit dem Angebot abgleichen.',400,'checkout_required');
    $total=$value['total_cents']??null;if(!is_int($total)||$total<1||$total>1000000000)abortPortal('Bitte den Gesamtpreis einschließlich Umsatzsteuer als gültigen Betrag eintragen.');
    $method=array_key_exists('copy_delivery',$value)?$value['copy_delivery']:'email';if(!is_string($method)||!in_array($method,['email','whatsapp','paper'],true))abortPortal('Bitte einen gültigen Versandweg für die Vertragskopie wählen.');
    $montage=montagePolicy();if(($value['delivery_policy_version']??null)!==$montage['version']||($value['delivery_terms']??null)!==$montage['text'])abortPortal('Die Montagebedingungen wurden aktualisiert. Bitte die Seite neu laden und das Angebot erneut vorbereiten.',409,'montage_version_changed');
    $result=['version'=>1,'contract_type'=>'work_consumer','description'=>checkoutText($value['description']??null,1200,'Leistung und wesentliche Ausführung'),'total_cents'=>$total,'additional_costs'=>checkoutText($value['additional_costs']??null,500,'Angaben zu weiteren Kosten'),'payment_terms'=>checkoutText($value['payment_terms']??null,1800,'Zahlungsbedingungen'),'delivery_terms'=>checkoutText($value['delivery_terms']??null,700,'Liefer-/Ausführungszeit und deren Beginn'),'customer_email'=>$method==='email'?checkoutEmail($value['customer_email']??null):'','checked_against_offer'=>true];
    $result['delivery_terms']=$montage['text'];$result['delivery_policy_version']=$montage['version'];
    if(array_key_exists('copy_delivery',$value))$result['copy_delivery']=$method;return $result;
}
function customerCopyMethod(array $r): string {return $r['checkout']['copy_delivery']??'email';}
function copyConsentDefinition(string $method): ?array {
    if(!in_array($method,['email','whatsapp'],true))return null;
    return ['version'=>1,'delivery'=>$method,'text'=>'Ich stimme zu, meine Vertragsbestätigung und die zugehörigen Unterlagen anstelle einer Papierkopie als speicherbare Dateien per '.($method==='email'?'E-Mail':'WhatsApp').' zu erhalten.'];
}
function checkoutHash(array $checkout): string {return hash('sha256',json_encode($checkout,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));}
function requireOrderConsent(array $r,array $meta): void {
    if(empty($r['checkout'])||!empty($r['archive_test']))return;
    if(!empty($r['copy_consent'])&&(($meta['copy_consent']??null)!==true||($meta['copy_consent_version']??null)!==$r['copy_consent']['version']))abortPortal('Bitte der angezeigten digitalen Vertragskopie aktiv zustimmen.',400,'copy_consent_required');
    if(($meta['order_consent']??null)!==true||!is_string($meta['checkout_hash']??null)||!hash_equals(checkoutHash($r['checkout']),$meta['checkout_hash']))abortPortal('Bitte die vollständige Abschlussübersicht prüfen und die zahlungspflichtige Annahme bestätigen.',400,'order_consent_required');
}
function customerCopyStatus(array $r): array {return array_intersect_key($r['customer_copy']??[],array_flip(['state','requested_at','submitted_at','manual_delivered_at','last_error','attempts']))+(!empty($r['customer_copy'])?['delivery'=>customerCopyMethod($r)]:[]);}
function euroCents(int $cents): string {return number_format($cents/100,2,',','.').' EUR';}
function checkoutSummaryText(array $r): string {
    if(($r['checkout']['version']??null)===2)return pdfCheckoutSummaryText($r);
    $c=$r['checkout'];$copy=['email'=>'per E-Mail an '.($c['customer_email']??''),'whatsapp'=>'als speicherbare Dateien per WhatsApp, manuell durch Sichtwerk','paper'=>'auf Papier, manuell durch Sichtwerk'];return (!empty($r['archive_test'])?"ARCHIVTEST - KEIN KUNDENAUFTRAG - KEINE ZAHLUNGSPFLICHT\n\n":"")."Vertragsbestätigung - Sichtwerk - Neubauer\nSwen Neubauer, Winterberg 2, 96361 Steinbach am Wald\nTelefon: 0151 11546112; E-Mail: sichtwerk.neubauer@gmx.de\n\nKunde: ".$r['customer_name']."\nKommission: ".$r['commission']."\nAngebot: ".$r['title']."\nFreigabe: ".$r['revision']."\n\nLeistung und Ausführung:\n".$c['description']."\n\nGesamtpreis einschließlich Umsatzsteuer: ".euroCents($c['total_cents'])."\nWeitere Kosten: ".$c['additional_costs']."\n\nZahlung:\n".$c['payment_terms']."\n\nLieferung/Ausführung:\n".$c['delivery_terms']."\n\nEinmaliger Werk-/Montageauftrag, kein Abonnement. Die individuell vereinbarten Angebotsangaben gehen den AGB vor. Gesetzliche Mängelrechte bleiben bestehen. Es wird kein vorzeitiger Beginn und kein Widerrufsverzicht erklärt. Die Bestellwartezeit nach Ziffern 6 und 16 der beigefügten AGB bleibt erhalten.\n\nVertragskopie: ".$copy[customerCopyMethod($r)].".\n\nWiderruf: Bei bestehendem gesetzlichen Widerrufsrecht gelten die beigefügte Belehrung und das Musterformular. Die elektronische Widerrufsfunktion bleibt unabhängig vom gesperrten Angebotslink unter ".withdrawalURL()." erreichbar. Andere zulässige Widerrufswege bleiben bestehen.\n".authoritySummaryText($r);
}
function pdfCheckoutSummaryText(array $r): string {
    $c=$r['checkout'];$text="Vertragsbestätigung - Sichtwerk - Neubauer\nSwen Neubauer, Winterberg 2, 96361 Steinbach am Wald\nTelefon: 0151 11546112; E-Mail: sichtwerk.neubauer@gmx.de\n\nKunde: ".$r['customer_name']."\nKommission: ".$r['commission']."\nAngebot: ".$r['title']."\nFreigabe: ".$r['revision']."\n\nAngaben aus der unveränderten ursprünglichen Angebots-PDF\nSHA-256: ".$c['source_sha256']."\n";
    foreach($c['source_pages'] as $page)$text.="\nOriginalangebot - Seite ".$page['number']."\n".$page['text']."\n";
    $text.="\nGesamtpreis einschließlich Umsatzsteuer: ".euroCents($c['total_cents'])."\n\nMontagezeit und Voraussetzungen:\n".$c['delivery_terms']."\n\nEinmaliger Werk-/Montageauftrag, kein Abonnement. Individuelle Angebotsvereinbarungen gehen vor. Gesetzliche Rechte bleiben bestehen.\nVertragskopie: ".(['email'=>'per E-Mail an '.$c['customer_email'],'whatsapp'=>'als speicherbare Dateien per WhatsApp, manuell durch Sichtwerk','paper'=>'auf Papier, manuell durch Sichtwerk'][customerCopyMethod($r)]).".\n\nBei bestehendem gesetzlichen Widerrufsrecht gelten die beigefügten Unterlagen. Die unabhängige Widerrufsfunktion bleibt unter ".withdrawalURL()." erreichbar. Andere zulässige Widerrufswege bleiben bestehen.\n";
    if(isBusinessCheckout($c))$text.="\nGeschäftskundenauftrag: Der im Angebot genannte Unternehmer ist Auftraggeber. Es wird kein freiwilliges Verbraucherwiderrufsrecht eingeräumt. Die vertragliche Mindestwartezeit nach Ziffern 6 und 16 der AGB bleibt bestehen.\n";
    return $text.authoritySummaryText($r).insuranceSummaryText($r);
}
function customerCopyFiles(array $r): array {
    $dir=recordPath($r['id']);$files=[['path'=>!empty($r['insurance'])&&($r['archive']['state']??'')==='verified'?ownerSignedPath($r):$dir.'/signed.pdf','name'=>'Unterschriebenes_Angebot.pdf','mime'=>'application/pdf','sha256'=>$r['completion']['sha256']]];
    foreach($r['attachments'] as $f)$files[]=['path'=>portalAssetPath($r,'asset-'.$f['id']),'name'=>$f['name'],'mime'=>$f['mime'],'sha256'=>$f['sha256']];
    $total=0;foreach($files as $f){if(!is_file($f['path'])||is_link($f['path'])||!hash_equals($f['sha256'],hash_file('sha256',$f['path'])))throw new RuntimeException('customer_copy_source');$total+=filesize($f['path']);}if($total>(customerCopyMethod($r)==='email'?11:61)*1024*1024)throw new RuntimeException('customer_copy_size');return $files;
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
    if(empty($r['checkout'])||empty($r['completion'])||empty($r['customer_copy']))return $r;
    if(customerCopyMethod($r)!=='email')return $r;$n=$r['customer_copy'];
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
    try{$r=recordById($id);if(customerCopyMethod($r)!=='email')abortPortal('Für diesen Vorgang ist die manuelle Übergabe der Vertragskopie vorgesehen.',409,'manual_copy_required');if(empty($r['customer_copy']))abortPortal('Für diese Freigabe gibt es keinen Kundenkopie-Auftrag.',409);if(in_array($r['customer_copy']['state'],['sending','uncertain'],true)&&!$acknowledge)abortPortal('Bitte vor erneutem Versand beim Kunden nachfragen. Eine doppelte Mail ist möglich.',409,'customer_copy_uncertain');$r=sendCustomerCopy($r,true,$acknowledge);$r=purgeTemporaryDocuments($r);return ['ok'=>true,'customer_copy'=>customerCopyStatus($r)];}finally{releasePortal($record);releasePortal($scope);}
}

function archiveTestCheckout(): array {
    $n=completionNotificationSettings();$montage=montagePolicy();return validateCheckout(['version'=>1,'contract_type'=>'work_consumer','description'=>'Unverbindlicher Mustervertrag: Prüfung von Abschlussübersicht, Pflichtbestätigungen, Vertragskopie und Archivierung. Kein Kundenauftrag.','total_cents'=>123456,'additional_costs'=>'Musterbetrag; keine tatsächlichen Kosten.','payment_terms'=>'Im Archivtest entsteht keine Zahlungspflicht. Die AGB-Bestellwartezeit wird nur als Anzeige geprüft.','delivery_terms'=>$montage['text'],'delivery_policy_version'=>$montage['version'],'customer_email'=>$n['to'],'checked_against_offer'=>true]);
}
function manualCustomerCopy(string $id,array $input): array {
    if(($input['delivered']??null)!==true)abortPortal('Bitte erst den tatsächlichen Versand der vollständigen Vertragskopie bestätigen.');
    $r=recordById($id);$scope=lockPortal('scope:'.$r['scope']);$record=lockPortal('record:'.$id);
    try{$r=recordById($id);if(empty($r['customer_copy'])||empty($r['completion']))abortPortal('Für diesen Vorgang liegt keine Vertragskopie vor.',409);if($r['customer_copy']['state']==='manual_delivered')return ['ok'=>true,'customer_copy'=>customerCopyStatus($r)];if($r['customer_copy']['state']==='submitted')abortPortal('Die Vertragskopie wurde bereits an den Maildienst übergeben.',409);try{customerCopyFiles($r);}catch(Throwable){abortPortal('Die vollständigen Unterlagen konnten nicht geprüft werden. Bitte vor der Bestätigung kontrollieren.',409,'customer_copy_source');}unset($r['customer_copy']['last_error'],$r['customer_copy']['next_attempt']);$r['customer_copy']['state']='manual_delivered';$r['customer_copy']['manual_delivered_at']=gmdate(DATE_ATOM);saveJson(recordPath($id).'/record.json',$r);return ['ok'=>true,'customer_copy'=>customerCopyStatus(purgeTemporaryDocuments($r))];}finally{releasePortal($record);releasePortal($scope);}
}
