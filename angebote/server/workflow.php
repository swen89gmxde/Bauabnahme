<?php
declare(strict_types=1);

// New insurance releases only. All historic releases retain their frozen policy.
function insuranceDefinition(): array {
    return ['version'=>1,'text'=>'Wir treten als Versicherer der aus einer anschließenden unveränderten Annahme dieses Angebots entstehenden Zahlungspflicht des genannten Kunden gegenüber Swen Neubauer, Sichtwerk - Neubauer, bis zum übernommenen Betrag als weiterer Gesamtschuldner bei. Der Betrieb erhält einen eigenen unmittelbaren Zahlungsanspruch, unabhängig von Deckungs- oder Erstattungsstreitigkeiten mit dem Versicherungsnehmer. Die berechtigte Vergütung ausgeführter Leistungen zahlen wir direkt binnen 14 Kalendertagen nach Rechnungseingang, frühestens nach Abnahme und gesetzlicher Fälligkeit. Einwendungen aus dem Reparaturvertrag bleiben unberührt. Zahlungen werden auf dieselbe Forderung angerechnet; sie wird insgesamt nur einmal verlangt. Der Kunde bleibt Auftraggeber. Diese Zusage ersetzt weder seine Angebotsannahme noch eine erforderliche Abtretung. Bestellwartezeit und gesetzliche Rechte bleiben bestehen. Für die Direktabrechnung zusätzlicher Leistungen ist eine gesonderte verbindliche Kostenübernahme nach Ziffer 20.3 der beigefügten AGB erforderlich.','confirmation'=>'Ich bin zur Abgabe dieser verbindlichen Zahlungszusage für den genannten Versicherer befugt und bestätige die angezeigten Angaben und den vollständigen Zusagetext.'];
}
function insuranceConfig(array $meta,array $files,bool $archiveTest): ?array {
    $v=$meta['insurance']??null;if($v===null)return null;
    if($archiveTest||!is_array($v)||($v['enabled']??null)!==true||!is_int($v['assignment_index']??null)||!isset($files[$v['assignment_index']]))abortPortal('Bitte die bereits unterschriebene Abtretung als Anlage auswählen.',400,'assignment_required');
    if(newArchiveProvider()!=='strato')abortPortal('Der Versicherungsablauf benötigt das geschützte STRATO-Archiv.',409);
    if($files[$v['assignment_index']]['mime']!=='application/pdf')abortPortal('Bitte die unterschriebene Abtretung als PDF hochladen.',400,'assignment_required');
    if(($meta['checkout']['version']??null)!==2)abortPortal('Bitte die ursprüngliche Lexware-Angebots-PDF verwenden.',400);
    $sourceText=implode("\n",array_column($meta['checkout']['source_pages']??[],'text'));if(preg_match('/Vorauszahlung\s*:?\s*80\s*%/iu',$sourceText)||preg_match('/2\.?\s*VERSICHERUNG\s*[–-]\s*VERBINDLICHE\s+ZAHLUNGSZUSAGE/iu',$sourceText))abortPortal('Bitte im Lexware-Angebot die Portal-Nachbemerkung für Versicherungen ohne Vorauszahlung und ohne alte Unterschriftsblöcke verwenden.',409,'insurance_offer_conflict');
    return ['assignment_index'=>$v['assignment_index']];
}
function workflowLinkIndex(string $kind,string $hash): string {
    global $dataDir;if(!in_array($kind,['insurance','customer'],true)||preg_match('/^[a-f0-9]{64}$/D',$hash)!==1)abortPortal('Dieser Zugang ist ungültig.',404);
    directory($dataDir.'/'.$kind.'-links');return $dataDir.'/'.$kind.'-links/'.$hash.'.json';
}
function recordIdForCustomerToken(string $token): string {
    $hash=tokenId($token);$alias=readJson(workflowLinkIndex('customer',$hash));
    if(!$alias){$r=recordById($hash);if(!empty($r['insurance']))abortPortal('Dieser Kundenlink ist noch nicht freigegeben oder gesperrt.',410,'closed_link');return $hash;}
    $id=(string)($alias['id']??'');$r=recordById($id);
    if(!hash_equals((string)($r['insurance']['customer_token_hash']??''),$hash))abortPortal('Dieser Kundenlink wurde ersetzt oder gesperrt.',410,'closed_link');
    return $id;
}
function requireInsuranceCustomer(array $r,array $meta=[]): void {
    if(empty($r['insurance']))return;
    if(($r['insurance']['state']??'')!=='accepted'||empty($r['insurance']['customer_token_hash']))abortPortal('Zuerst muss die Versicherung ihre Zahlungszusage bestätigen. Danach erstellt Sichtwerk den Kundenlink.',409,'insurance_pending');
    if($meta&&(!is_string($meta['insurance_sha256']??null)||!hash_equals($r['insurance']['pdf']['sha256'],$meta['insurance_sha256'])))abortPortal('Die Versichererzusage gehört nicht zu diesem Angebotsabschluss.',409,'insurance_mismatch');
}
function insurancePublic(array $r): ?array {
    $v=$r['insurance']??null;if(!$v)return null;
    return ['state'=>$v['state'],'version'=>$v['definition']['version'],'data'=>$v['receipt']??null,'pdf'=>$v['pdf']??null,'accepted_at'=>$v['accepted_at']??null,'notification'=>array_intersect_key($v['notification']??[],array_flip(['state','attempts','submitted_at']))];
}
function lockedInsuranceToken(string $token): array {
    $hash=tokenId($token);$alias=readJson(workflowLinkIndex('insurance',$hash));$id=(string)($alias['id']??'');$r=recordById($id);
    lockPortal('scope:'.$r['scope']);lockPortal('record:'.$id);$r=recordById($id);
    if(!hash_equals((string)($r['insurance']['token_hash']??''),$hash))abortPortal('Dieser Versicherungslink ist nicht mehr gültig.',410,'closed_link');
    return [$id,$r];
}
function requireOpenInsurance(array $r): void {
    global $dataDir;$index=readJson($dataDir.'/scopes/'.$r['scope'].'.json');
    if(($r['state']??'')!=='insurance_pending'||($r['insurance']['state']??'')!=='pending'||!empty($r['access_revoked'])||($index['active_id']??'')!==$r['id'])abortPortal('Diese Zahlungszusage ist bereits abgeschlossen oder gesperrt.',410,'closed_link');
    if(($r['expires']??0)<time())abortPortal('Dieser Versicherungslink ist abgelaufen. Bitte Sichtwerk um einen neuen Link bitten.',410,'expired_link');
}
function insuranceAccess(string $token): array {
    [$id,$r]=lockedInsuranceToken($token);requireOpenInsurance($r);
    if(($_SESSION['insurance'][$id]['until']??0)<time())$_SESSION['insurance'][$id]=['until'=>time()+7200,'proof'=>bin2hex(random_bytes(24))];
    return ['test'=>!empty($r['archive_test']),'csrf'=>$_SESSION['csrf'],'proof'=>$_SESSION['insurance'][$id]['proof'],'title'=>$r['title'],'filename'=>$r['filename'],'customer_name'=>$r['customer_name'],'commission'=>$r['commission'],'revision'=>$r['revision'],'sha256'=>$r['sha256'],'pageCount'=>$r['pageCount'],'total_cents'=>$r['checkout']['total_cents'],'attachments'=>$r['insurance']['base_attachments'],'definition'=>$r['insurance']['definition']];
}
function insuranceReceipt(array $r,array $m): array {
    $v=$r['insurance']['definition'];if(($m['accepted']??null)!==true||($m['version']??null)!==$v['version']||($m['authority_confirmed']??null)!==true)abortPortal('Bitte die Befugnis und die verbindliche Zahlungszusage aktiv bestätigen.',400,'insurance_consent_required');
    $company=checkoutText($m['company']??null,160,'genaue Versicherungsgesellschaft');$claim=checkoutText($m['claim_number']??null,100,'Schadennummer');$name=checkoutText($m['signer_name']??null,100,'vollständigen Namen');$role=checkoutText($m['signer_role']??null,100,'Funktion oder Vertretungsbefugnis');
    $cents=$m['covered_cents']??null;$total=$r['checkout']['total_cents'];if(!is_int($cents)||$cents<1||$cents>$total)abortPortal('Bitte einen übernommenen Betrag zwischen 0,01 EUR und dem Angebotsgesamtpreis eintragen.');
    $date=$m['date']??null;$dt=is_string($date)?DateTimeImmutable::createFromFormat('!Y-m-d',$date):false;if(!$dt||$dt->format('Y-m-d')!==$date)abortPortal('Bitte ein gültiges Datum eintragen.');
    return ['version'=>$v['version'],'customer_name'=>$r['customer_name'],'commission'=>$r['commission'],'revision'=>$r['revision'],'source_sha256'=>$r['sha256'],'documents'=>array_column($r['insurance']['base_attachments'],'sha256','id'),'total_cents'=>$total,'company'=>$company,'claim_number'=>$claim,'covered_cents'=>$cents,'customer_share_cents'=>$total-$cents,'signer_name'=>$name,'signer_role'=>$role,'date'=>$date,'text'=>$v['text'],'confirmation'=>$v['confirmation'],'accepted'=>true,'authority_confirmed'=>true];
}
function checkedInsurancePDF(string $path,array $receipt): void {
    $bytes=file_get_contents($path);if(!is_string($bytes)||strlen($bytes)>4*1024*1024||preg_match_all('/\/SichtwerkInsurance\s*<([a-f0-9]+)>/i',$bytes,$found)!==1)abortPortal('Bitte die vollständige Vorschau der Zahlungszusage erneut erstellen.',409,'insurance_pdf_mismatch');
    $parsed=json_decode((string)hex2bin($found[1][0]),true);
    if(!is_array($parsed)||$parsed!==$receipt)abortPortal('Die PDF stimmt nicht mit den bestätigten Versicherungsangaben überein.',409,'insurance_pdf_mismatch');
}
function verifyInsurancePDF(array $r): string {
    $f=$r['insurance']['pdf']??[];$id=$f['id']??'';if(preg_match('/^[a-f0-9]{32}$/D',$id)!==1)abortPortal('Die Versichererzusage fehlt.',409,'insurance_missing');
    $path=recordPath($r['id']).'/archive/asset-'.$id;
    if(is_link(dirname($path))||is_link($path)||!is_file($path)||filesize($path)!==($f['size']??-1)||!hash_equals((string)$f['sha256'],hash_file('sha256',$path)))abortPortal('Die archivierte Versichererzusage konnte nicht geprüft werden.',503,'insurance_checksum');return $path;
}
function completeInsurance(string $token,array $meta,array $upload): array {
    [$id,$r]=lockedInsuranceToken($token);$key=$meta['request_id']??'';
    if(!is_string($key)||preg_match('/^[a-f0-9]{32}$/D',$key)!==1||!is_string($meta['proof']??null)||!hash_equals((string)($_SESSION['insurance'][$id]['proof']??''),$meta['proof'])||($_SESSION['insurance'][$id]['until']??0)<time())abortPortal('Bitte den Versicherungslink erneut öffnen.',403);
    $receipt=insuranceReceipt($r,$meta);$file=checkUpload($upload,true);checkedInsurancePDF($file['tmp'],$receipt);
    if(($r['insurance']['state']??'')==='accepted'){
        if(($r['insurance']['receipt']??null)!=$receipt||!hash_equals($r['insurance']['request_hash'],hash('sha256',$key))||!hash_equals($r['insurance']['pdf']['sha256'],$file['sha256']))abortPortal('Die bestätigte Zahlungszusage kann nicht geändert werden.',410,'signature_saved');
        verifyInsurancePDF($r);return ['ok'=>true,'already_saved'=>true];
    }
    requireOpenInsurance($r);$packageSize=filesize(recordPath($id).'/original.pdf')+array_sum(array_column($r['attachments'],'size'))+$file['size'];if($packageSize>(customerCopyMethod($r)==='email'?10:60)*1024*1024)abortPortal('Die vollständigen Unterlagen sind für den gewählten Versandweg zu groß. Bitte Sichtwerk um eine angepasste Freigabe bitten.',409);$aid=bin2hex(random_bytes(16));$dir=recordPath($id);$target=$dir.'/asset-'.$aid;$permanent=$dir.'/archive/asset-'.$aid;
    if(is_link($dir.'/archive'))abortPortal('Die geschützte Ablage ist nicht verfügbar.',503);directory($dir.'/archive');
    if(!copy($file['tmp'],$target)||!copy($target,$permanent)||!hash_equals($file['sha256'],hash_file('sha256',$permanent)))abortPortal('Die Zahlungszusage konnte nicht geprüft gespeichert werden.',503);
    $f=['id'=>$aid,'name'=>'Versicherer_Zahlungszusage_'.preg_replace('/[^a-zA-Z0-9_.-]/','_',$r['commission']).'.pdf','mime'=>'application/pdf','size'=>$file['size'],'sha256'=>$file['sha256'],'role'=>'versichererzusage','version'=>'Zusage zur Freigabe '.$r['revision']];
    $r['attachments'][]=$f;$r['insurance']['pdf']=$f;$r['insurance']['receipt']=$receipt;$r['insurance']['request_hash']=hash('sha256',$key);$r['insurance']['accepted_at']=gmdate(DATE_ATOM);$r['insurance']['state']='accepted';$r['state']='active';$r['insurance']['notification']=['state'=>'pending','attempts'=>0];
    saveJson($dir.'/record.json',$r);notifyInsuranceConfirmed($r);return ['ok'=>true];
}
function notifyInsuranceConfirmed(array $r,bool $retry=false,bool $acknowledge=false): array {
    $n=$r['insurance']['notification']??[];if(($n['state']??'')==='submitted')return $r;
    if(in_array($n['state']??'',['sending','uncertain'],true)&&!$acknowledge){$r['insurance']['notification']['state']='uncertain';saveJson(recordPath($r['id']).'/record.json',$r);return $r;}
    try{$settings=completionNotificationSettings();if(!$settings['enabled'])return $r;verifyInsurancePDF($r);$domain=substr($settings['from'],strpos($settings['from'],'@')+1);$message=['to'=>$settings['to'],'from'=>$settings['from'],'subject'=>'Versichererzusage bestätigt - Kundenlink bereit','body'=>"Die verbindliche Versichererzusage wurde geschützt auf STRATO gespeichert.\nKunde: ".$r['customer_name']."\nAngebot: ".$r['commission']."\nÜbernommen: ".euroCents($r['insurance']['receipt']['covered_cents'])."\nKundenanteil: ".euroCents($r['insurance']['receipt']['customer_share_cents'])."\n\nBitte in der Verwaltung unter Meine Vorgänge den Kundenlink erstellen und an den Kunden senden. Der Kunde hat das Angebot noch nicht angenommen.\n".rtrim($GLOBALS['config']['origin'],'/')."/angebote/?vorbereiten=1\n",'message_id'=>'<sichtwerk.insurance.'.$r['id'].'@'.$domain.'>'];
        $r['insurance']['notification']['state']='sending';$r['insurance']['notification']['attempts']=($n['attempts']??0)+1;saveJson(recordPath($r['id']).'/record.json',$r);
        if(submitCompletionNotification($message,$settings)){$r['insurance']['notification']['state']='submitted';$r['insurance']['notification']['submitted_at']=gmdate(DATE_ATOM);}else $r['insurance']['notification']['state']='pending';
    }catch(Throwable){$r['insurance']['notification']['state']='uncertain';}
    saveJson(recordPath($r['id']).'/record.json',$r);return $r;
}
function ownerWorkflowLink(string $id,string $role): array {
    global $dataDir,$config;$r=recordById($id);lockPortal('scope:'.$r['scope']);lockPortal('record:'.$id);$r=recordById($id);$index=readJson($dataDir.'/scopes/'.$r['scope'].'.json');
    if(empty($r['insurance'])||($index['active_id']??'')!==$id||!in_array($r['state'],['insurance_pending','active'],true))abortPortal('Für diesen Vorgang kann kein neuer Link erstellt werden.',409);
    if($role==='customer'&&($config['releases_enabled']??true)!==true&&empty($r['archive_test']))abortPortal('Neue Kundenfreigaben sind derzeit gesperrt.',503,'releases_disabled');
    $token=bin2hex(random_bytes(32));$hash=tokenId($token);
    if($role==='insurance'){
        if($r['insurance']['state']!=='pending')abortPortal('Die Versichererzusage ist bereits bestätigt.',409);
        $r['insurance']['token_hash']=$hash;$r['state']='insurance_pending';
    }else{
        if($r['insurance']['state']!=='accepted')abortPortal('Zuerst muss die Versicherung ihre Zahlungszusage bestätigen.',409,'insurance_pending');
        verifyInsurancePDF($r);$r['insurance']['customer_token_hash']=$hash;
    }
    $r['access_revoked']=false;$r['expires']=time()+max(1,min(30,(int)($config['lifetime_days']??14)))*86400;
    saveJson(workflowLinkIndex($role,$hash),['id'=>$id]);saveJson(recordPath($id).'/record.json',$r);return ['id'=>$id,'token'=>$token,'role'=>$role,'expires'=>$r['expires']];
}
function portalAssetPath(array $r,string $filename): string {
    if(!empty($r['insurance'])&&($r['archive']['state']??'')==='verified')return recordPath($r['id']).'/archive/'.$filename;
    return recordPath($r['id']).'/'.$filename;
}
function archiveInsuranceBundle(array $r): array {
    verifyInsurancePDF($r);$dir=recordPath($r['id']);$files=['original.pdf'=>['sha256'=>$r['sha256'],'size'=>filesize($dir.'/original.pdf')]];
    foreach($r['attachments'] as $f){if(preg_match('/^[a-f0-9]{32}$/D',$f['id'])!==1)throw new RuntimeException('strato_bundle_path');$files['asset-'.$f['id']]=['sha256'=>$f['sha256'],'size'=>$f['size']];}
    foreach($files as $name=>$f){$source=$dir.'/'.$name;$dest=$dir.'/archive/'.$name;if(is_link($source)||!is_file($source)||filesize($source)!==$f['size']||!hash_equals($f['sha256'],hash_file('sha256',$source)))throw new RuntimeException('strato_bundle_source');
        if(!file_exists($dest)&&!is_link($dest)){if(!copy($source,$dest))throw new RuntimeException('strato_bundle_write');}
        if(is_link($dest)||!is_file($dest)||filesize($dest)!==$f['size']||!hash_equals($f['sha256'],hash_file('sha256',$dest)))throw new RuntimeException('strato_bundle_checksum');
    }
    $r['archive']['bundle']=$files;verifyInsuranceBundle($r);return $r;
}
function verifyInsuranceBundle(array $r): void {
    if(empty($r['insurance']))return;
    $expected=['original.pdf'=>$r['sha256']];foreach($r['attachments'] as $f)$expected['asset-'.$f['id']]=$f['sha256'];$files=$r['archive']['bundle']??[];
    if(count($files)!==count($expected))throw new RuntimeException('strato_bundle_missing');
    foreach($expected as $name=>$sha){$path=recordPath($r['id']).'/archive/'.$name;$f=$files[$name]??[];if(($f['sha256']??'')!==$sha||is_link($path)||!is_file($path)||filesize($path)!==($f['size']??-1)||!hash_equals($sha,hash_file('sha256',$path)))throw new RuntimeException('strato_bundle_checksum');}
}
function insuranceSummaryText(array $r): string {
    $v=$r['insurance']['receipt']??null;if(!$v)return '';
    return "\nVersicherungs-Direktabrechnung ohne Voraus-/Abschlagszahlung\nVersicherer: ".$v['company']."\nSchadennummer: ".$v['claim_number']."\nVerbindlich übernommener Bruttobetrag: ".euroCents($v['covered_cents'])."\nKundenanteil einschließlich etwaiger Selbstbeteiligung: ".euroCents($v['customer_share_cents'])."\nVersichererzusage bestätigt: ".$r['insurance']['accepted_at']."\nDer Kunde bleibt Auftraggeber. Die vollständige Zahlungszusage und die Abtretung sind Anlagen dieser Freigabe.\n";
}

// Deleting is an explicit owner action. Trash is reversible and never runs automatically.
function recordLifecycle(string $id,string $operation,array $input): array {
    global $dataDir;$r=recordById($id);lockPortal('scope:'.$r['scope']);lockPortal('record:'.$id);$r=recordById($id);
    if(($input['confirmed']??null)!==true)abortPortal('Bitte die gewählte Aktion ausdrücklich bestätigen.');
    if($operation==='trash'){
        if($r['state']==='trashed')return ['ok'=>true];
        $r['trash']=['previous_state'=>$r['state'],'at'=>gmdate(DATE_ATOM)];$r['state']='trashed';$r['access_revoked']=true;saveJson(recordPath($id).'/record.json',$r);return ['ok'=>true];
    }
    if($r['state']!=='trashed')abortPortal('Dieser Vorgang liegt nicht im Papierkorb.',409);
    if($operation==='restore'){
        $previous=$r['trash']['previous_state'];$r['state']=$previous==='active'&&empty($r['insurance'])?'revoked':$previous;$r['restored_at']=gmdate(DATE_ATOM);unset($r['trash']);saveJson(recordPath($id).'/record.json',$r);return ['ok'=>true];
    }
    if($operation!=='purge'||($input['retention_checked']??null)!==true)abortPortal('Bitte prüfen und bestätigen, dass keine Aufbewahrungspflicht oder offene Klärung der endgültigen Löschung entgegensteht.');
    $path=recordPath($id);if(is_link($path))abortPortal('Der Vorgang konnte nicht sicher gelöscht werden.',503);
    $scopePath=$dataDir.'/scopes/'.$r['scope'].'.json';$scope=readJson($scopePath);if(($scope['active_id']??'')===$id){$scope['active_id']=null;saveJson($scopePath,$scope);}
    removePrivateRecordTree($path);return ['ok'=>true,'external_archive_unchanged'=>archiveProvider($r)==='drive'];
}
function removePrivateRecordTree(string $path): void {
    if(is_link($path)){if(!unlink($path))abortPortal('Eine Datei konnte nicht entfernt werden.',503);return;}
    if(is_dir($path)){foreach(scandir($path)?:[] as $name)if($name!=='.'&&$name!=='..')removePrivateRecordTree($path.'/'.$name);if(!rmdir($path))abortPortal('Der Vorgang konnte nicht vollständig entfernt werden.',503);}
    elseif(is_file($path)&&!unlink($path))abortPortal('Eine Datei konnte nicht entfernt werden.',503);
}
