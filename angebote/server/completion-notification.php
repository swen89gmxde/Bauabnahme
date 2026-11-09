<?php
declare(strict_types=1);

// Owner notifications are independent of the immutable signed PDF and archive manifest.
// Credentials/overrides and the optional synthetic transport belong to private config only.
function completionNotificationSettings(): array {
    global $config;
    $n=$config['completion_notification']??[];
    $n+=['enabled'=>true,'to'=>'sichtwerk.neubauer@gmx.de','from'=>'info@sichtwerk-neubauer.de'];
    foreach(['to','from'] as $key)if(!is_string($n[$key])||strlen($n[$key])>254||!preg_match('/^[A-Za-z0-9_.+\-]+@[A-Za-z0-9.\-]+$/D',$n[$key])||!filter_var($n[$key],FILTER_VALIDATE_EMAIL))throw new RuntimeException('notification_configuration');
    return $n;
}
function completionNotificationStatus(array $r): array {
    $n=$r['notification']??[];
    return array_intersect_key($n,array_flip(['state','requested_at','submitted_at','last_error','attempts']));
}
function completionNotificationMessage(array $r,array $n): array {
    $folder=(string)($r['archive']['folder_id']??'');
    $local=archiveProvider($r)==='strato';
    if(!$local&&!preg_match('/^[A-Za-z0-9_-]{10,200}$/D',$folder))throw new RuntimeException('notification_archive');
    $line=static fn($s)=>trim(preg_replace('/[\x00-\x1f\x7f]+/u',' ',(string)$s)??'');
    $test=!empty($r['archive_test']);$single=archiveMode($r)==='signed_pdf_only';
    $subject=($test?'ARCHIVTEST - ':'').'Unterschriebenes Angebot im Archiv';
    $body=($test?"ARCHIVTEST - KEIN KUNDENAUFTRAG\n\n":"").($local?"Die unterschriebene Angebots-PDF wurde im geschützten STRATO-Archiv geprüft gespeichert.\n\n":($single?"Die unterschriebene Angebots-PDF wurde in Google Drive geprüft gespeichert.\n\n":"Ein unterschriebenes Angebot und das vollständige Unterlagenpaket wurden auf STRATO und in Google Drive geprüft gespeichert.\n\n"));
    foreach(['Kunde'=>$r['customer_name'],'Kommission'=>$r['commission'],'Angebot'=>$r['title'],'Freigabe'=>$r['revision'],'Unterschriftsdatum'=>$r['completion']['date'],'Archiv bestätigt'=>$r['archive']['verified_at']] as $label=>$value)$body.=$label.': '.$line($value)."\n";
    $body.=$local?"\nGeschütztes STRATO-Archiv (Anmeldung mit dem Verwaltungspasswort erforderlich):\n".rtrim($GLOBALS['config']['origin'],'/')."/angebote/?vorbereiten=1#archiv\nDort: Meine Vorgänge anzeigen – unterschriebene PDF herunterladen.\n":"\nGeschütztes Archiv (Anmeldung mit dem verbundenen Google-Konto erforderlich):\nhttps://drive.google.com/drive/folders/".$folder."\n";
    $body.="\nDer Kundenlink ist gesperrt.\n\nDiese Nachricht enthält keine PDF, Unterschrift, Kundencodes oder Kunden-Zugangslinks.\n";
    if(!empty($r['customer_copy'])&&customerCopyMethod($r)!=='email')$body.="\nVertragskopie: MANUELLE ÜBERGABE per ".(customerCopyMethod($r)==='paper'?'Papier':'WhatsApp')." erforderlich. Vollständige Unterlagen in der Verwaltung herunterladen und tatsächliche Übergabe bestätigen.\n";
    elseif(!empty($r['customer_copy']))$body.="\nVertragskopie an den Kunden: ".(in_array($r['customer_copy']['state'],['submitted','manual_delivered'],true)?'an Maildienst übergeben oder manuell zugestellt.':'AUSSTEHEND / UNKLAR - bitte unverzüglich in der Verwaltung prüfen.')."\n";
    if($local)$body.="\nDauerhafte Dokumentenablage: ausschließlich diese PDF auf STRATO. Separate Anlagen werden nach Übergabe der Kundenkopie entfernt.\n";
    elseif($single)$body.="\nDauerhafte Dokumentenablage: ausschließlich diese PDF in Google Drive. Separate Anlagen werden nicht archiviert.\n";
    $domain=substr($n['from'],strpos($n['from'],'@')+1);
    return ['to'=>$n['to'],'from'=>$n['from'],'subject'=>$subject,'body'=>$body,'message_id'=>'<sichtwerk.archive.'.$r['id'].'@'.$domain.'>'];
}
function submitCompletionNotification(array $message,array $settings): bool {
    $transport=$settings['transport']??null;
    if(is_callable($transport))return $transport($message)===true;
    if(!function_exists('mail'))return false;
    $headers=['From'=>'Sichtwerk Angebotsarchiv <'.$message['from'].'>','MIME-Version'=>'1.0','Content-Type'=>'text/plain; charset=UTF-8','Content-Transfer-Encoding'=>'base64','Auto-Submitted'=>'auto-generated','Message-ID'=>$message['message_id']];
    // Strict ASCII mailbox validation above also protects the envelope sender argument.
    return @mail($message['to'],'=?UTF-8?B?'.base64_encode($message['subject']).'?=',chunk_split(base64_encode($message['body']),76,"\r\n"),$headers,'-f'.$message['from']);
}
function notifyCompletedOffer(array $r,bool $force=false,bool $acknowledgeUncertain=false): array {
    if(($r['state']??'')!=='completed'||($r['archive']['state']??'')!=='verified'||empty($r['notification']))return $r;
    $state=$r['notification']['state']??'';
    if($state==='submitted')return $r;
    // A crash after handoff may leave an uncertain result. Never resend it automatically.
    if(in_array($state,['sending','uncertain'],true)&&!$acknowledgeUncertain){$r['notification']['state']='uncertain';$r['notification']['last_error']='notification_uncertain';saveJson(recordPath($r['id']).'/record.json',$r);return $r;}
    if(!$force&&($r['notification']['next_attempt']??0)>time())return $r;
    try{
        $settings=completionNotificationSettings();
        if($settings['enabled']!==true)throw new RuntimeException('notification_disabled');
        $message=completionNotificationMessage($r,$settings);
    }catch(Throwable $e){
        $r['notification']['state']='pending';$r['notification']['last_error']=$e->getMessage()==='notification_disabled'?'notification_disabled':'notification_configuration';$r['notification']['next_attempt']=time()+900;saveJson(recordPath($r['id']).'/record.json',$r);return $r;
    }
    $r['notification']['state']='sending';$r['notification']['attempts']=($r['notification']['attempts']??0)+1;$r['notification']['last_attempt_at']=gmdate(DATE_ATOM);
    saveJson(recordPath($r['id']).'/record.json',$r);
    try{
        if(submitCompletionNotification($message,$settings)){$r['notification']['state']='submitted';$r['notification']['submitted_at']=gmdate(DATE_ATOM);unset($r['notification']['last_error'],$r['notification']['next_attempt']);}
        else{$r['notification']['state']='pending';$r['notification']['last_error']='notification_rejected';$r['notification']['next_attempt']=time()+min(900,30*2**min(5,$r['notification']['attempts']-1));}
    }catch(Throwable){$r['notification']['state']='uncertain';$r['notification']['last_error']='notification_uncertain';}
    saveJson(recordPath($r['id']).'/record.json',$r);return $r;
}
function retryCompletionNotification(string $id,bool $acknowledgeUncertain=false): array {
    $r=recordById($id);$scope=lockPortal('scope:'.$r['scope']);$record=lockPortal('record:'.$id);
    try{
        $r=recordById($id);
        if($r['state']!=='completed'||empty($r['notification']))abortPortal('Für diesen Vorgang liegt keine Archivbenachrichtigung vor.',409);
        if(in_array($r['notification']['state'],['sending','uncertain'],true)&&!$acknowledgeUncertain)abortPortal('Bitte zuerst das Postfach prüfen. Eine erneute Benachrichtigung könnte doppelt ankommen.',409,'notification_uncertain');
        return ['ok'=>true,'notification'=>completionNotificationStatus(notifyCompletedOffer($r,true,$acknowledgeUncertain))];
    }finally{releasePortal($record);releasePortal($scope);}
}
