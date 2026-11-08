<?php
declare(strict_types=1);

function withdrawalURL(): string {global $config;return rtrim($config['origin'],'/').'/angebote/widerruf.php';}
function validateWithdrawal(array $input): array {
    return ['name'=>checkoutText($input['name']??null,150,'Ihren Namen'),'contract'=>checkoutText($input['contract']??null,500,'Angaben zur Identifizierung des Vertrags oder Vertragsteils'),'email'=>checkoutEmail($input['email']??null)];
}
function withdrawalPath(string $id): string {global $dataDir;if(!preg_match('/^[a-f0-9]{32}$/D',$id))abortPortal('Die Erklärung wurde nicht gefunden.',404);return $dataDir.'/withdrawals/'.$id.'.json';}
function withdrawalBody(array $r): string {
    return "Eingangsbestätigung einer Widerrufserklärung\n\nSichtwerk - Neubauer, Swen Neubauer\nWinterberg 2, 96361 Steinbach am Wald\nsichtwerk.neubauer@gmx.de; 0151 11546112\n\nEingegangen: ".$r['received_at']."\nVorgangskennung: ".$r['id']."\n\nErklärung:\nHiermit widerrufe ich den nachfolgend bezeichneten Vertrag beziehungsweise Vertragsteil.\n\nName: ".$r['name']."\nVertrag/Vertragsteil: ".$r['contract']."\nE-Mail für die Eingangsbestätigung: ".$r['email']."\n\nDies bestätigt den Eingang und Inhalt Ihrer Erklärung. Ob ein Widerrufsrecht besteht und der Widerruf wirksam ist, wird gesondert geprüft. Andere gesetzliche Rechte bleiben unberührt.\n";
}
function sendWithdrawalReceipts(array $r,bool $force=false,bool $acknowledgeUncertain=false): array {
    $settings=completionNotificationSettings();$domain=substr($settings['from'],strpos($settings['from'],'@')+1);
    foreach(['customer'=>$r['email'],'owner'=>$settings['to']] as $key=>$to){$state=$r['mail'][$key]['state']??'pending';if($state==='submitted')continue;
        if(in_array($state,['sending','uncertain'],true)&&!$acknowledgeUncertain){$r['mail'][$key]['state']='uncertain';saveJson(withdrawalPath($r['id']),$r);continue;}
        if(!$force&&($r['mail'][$key]['next_attempt']??0)>time())continue;
        $r['mail'][$key]['state']='sending';$r['mail'][$key]['attempts']=($r['mail'][$key]['attempts']??0)+1;saveJson(withdrawalPath($r['id']),$r);
        $message=['to'=>$to,'from'=>$settings['from'],'subject'=>$key==='customer'?'Eingang Ihrer Widerrufserklärung':'Neue Widerrufserklärung - bitte prüfen','body'=>($key==='owner'?"Über die öffentliche Widerrufsfunktion eingegangen. Keine automatische Vertragszuordnung oder Identitätsprüfung. Bitte unverzüglich bearbeiten.\n\n":"").withdrawalBody($r),'message_id'=>'<sichtwerk.withdrawal.'.$r['id'].'.'.$key.'@'.$domain.'>'];
        try{if(submitCompletionNotification($message,$settings)){$r['mail'][$key]['state']='submitted';$r['mail'][$key]['submitted_at']=gmdate(DATE_ATOM);unset($r['mail'][$key]['next_attempt']);}else{$r['mail'][$key]['state']='pending';$r['mail'][$key]['next_attempt']=time()+60;}}
        catch(Throwable){$r['mail'][$key]['state']='uncertain';}
        saveJson(withdrawalPath($r['id']),$r);
    }return $r;
}
function acceptWithdrawal(array $input,string $id): array {
    $valid=validateWithdrawal($input);$path=withdrawalPath($id);$lock=lockPortal('withdrawal:'.$id);
    try{
        $existing=readJson($path);if($existing){foreach($valid as $k=>$v)if(($existing[$k]??null)!==$v)abortPortal('Bitte die Widerrufsfunktion erneut öffnen.',409);return $existing;}
        // Rate limits protect the public form without requiring an offer link, login or code.
        $rate=lockPortal('withdrawal-rate');directory(dirname($path));$buckets=[];
        foreach([['email:'.strtolower($valid['email']),6],['ip:'.($_SERVER['REMOTE_ADDR']??''),20]] as [$key,$limit]){
            $rateFile=dirname($path).'/rate-'.hash_hmac('sha256',$key,portalPasswordFingerprint()).'.json';$counter=readJson($rateFile);
            if(time()-($counter['start']??0)>3600)$counter=['start'=>time(),'count'=>0];if(($counter['count']??0)>=$limit)abortPortal('Bitte versuchen Sie es später erneut oder erklären Sie den Widerruf per E-Mail oder Post.',429);
            $counter['count']++;$buckets[]=[$rateFile,$counter];
        }
        foreach($buckets as [$rateFile,$counter])saveJson($rateFile,$counter);releasePortal($rate);
        $r=$valid+['id'=>$id,'received_at'=>gmdate(DATE_ATOM),'mail'=>['customer'=>['state'=>'pending'],'owner'=>['state'=>'pending']]];saveJson($path,$r);
        try{return sendWithdrawalReceipts($r);}catch(Throwable){return $r;}
    }finally{releasePortal($lock);}
}
function listWithdrawals(): array {
    global $dataDir;$out=[];foreach(glob($dataDir.'/withdrawals/*.json')?:[] as $p){if(!preg_match('/\/[a-f0-9]{32}\.json$/D',$p))continue;$r=readJson($p);if($r)$out[]=$r;}usort($out,fn($a,$b)=>strcmp($b['received_at'],$a['received_at']));return array_slice($out,0,200);
}
function retryWithdrawalReceipts(string $id,bool $acknowledge): array {
    $path=withdrawalPath($id);$lock=lockPortal('withdrawal:'.$id);try{$r=readJson($path);if(!$r)abortPortal('Diese Erklärung wurde nicht gefunden.',404);foreach($r['mail'] as $n)if(in_array($n['state']??'',['sending','uncertain'],true)&&!$acknowledge)abortPortal('Bitte zuerst Postfach und Empfänger prüfen. Eine doppelte Mail ist möglich.',409);return ['ok'=>true,'withdrawal'=>sendWithdrawalReceipts($r,true,$acknowledge)];}finally{releasePortal($lock);}
}
