<?php
declare(strict_types=1);

// All credentials and state belong to the private PHP configuration/data directory.
function driveSettings(): array {
    global $config;
    $d=$config['drive_archive']??[];
    foreach(['folder_id','client_id','client_secret','refresh_token'] as $key)
        if(!is_string($d[$key]??null)||$d[$key]==='')abortPortal('Die automatische Drive-Sicherung ist noch nicht eingerichtet. Bitte Swen Neubauer kontaktieren.',503,'drive_not_configured');
    if(!preg_match('/^[A-Za-z0-9_-]{10,200}$/D',$d['folder_id']))abortPortal('Der Drive-Archivordner ist ungültig.',503,'drive_not_configured');
    return $d;
}
function driveConfigured(): bool {try{driveSettings();return true;}catch(PortalError){return false;}}
function driveHTTP(string $method,string $url,array $headers=[],?string $body=null): array {
    global $config;
    if(!preg_match('~^https://(?:www\.googleapis\.com/(?:drive/v3/|upload/drive/v3/)|oauth2\.googleapis\.com/token$)~D',$url))throw new RuntimeException('drive_endpoint');
    // A private-config transport is used only by synthetic tests. It never bypasses verification.
    $transport=$config['drive_archive']['transport']??null;
    if(is_callable($transport))return $transport($method,$url,$headers,$body);
    if(!function_exists('curl_init'))throw new RuntimeException('drive_curl_missing');
    $responseHeaders=[];$h=curl_init($url);
    curl_setopt($h,CURLOPT_HEADERFUNCTION,static function($ch,string $line)use(&$responseHeaders):int{if(str_contains($line,':')){[$name,$value]=explode(':',$line,2);$responseHeaders[strtolower(trim($name))]=trim($value);}return strlen($line);});
    curl_setopt_array($h,[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$headers,CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>20,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS]);
    if($body!==null)curl_setopt($h,CURLOPT_POSTFIELDS,$body);
    $data=curl_exec($h);$status=(int)curl_getinfo($h,CURLINFO_RESPONSE_CODE);curl_close($h);
    if($data===false||$status===0)throw new RuntimeException('drive_connection');
    return ['status'=>$status,'body'=>$data,'headers'=>$responseHeaders];
}
function driveToken(): string {
    static $token=null;if($token!==null)return $token;
    $d=driveSettings();$r=driveHTTP('POST','https://oauth2.googleapis.com/token',['Content-Type: application/x-www-form-urlencoded'],http_build_query(['client_id'=>$d['client_id'],'client_secret'=>$d['client_secret'],'refresh_token'=>$d['refresh_token'],'grant_type'=>'refresh_token']));
    $j=json_decode($r['body'],true);
    if($r['status']!==200||!is_string($j['access_token']??null))throw new RuntimeException('drive_authorization');
    return $token=$j['access_token'];
}
function driveRequest(string $method,string $path,?array $json=null): array {
    $headers=['Authorization: Bearer '.driveToken()];$body=null;
    if($json!==null){$headers[]='Content-Type: application/json';$body=json_encode($json,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);}
    return driveHTTP($method,'https://www.googleapis.com/drive/v3/'.$path,$headers,$body);
}
function driveMetadata(string $id): ?array {
    if(!preg_match('/^[A-Za-z0-9_-]{10,200}$/D',$id))throw new RuntimeException('drive_file_id');
    $r=driveRequest('GET','files/'.rawurlencode($id).'?fields=id,name,mimeType,size,sha256Checksum,parents,trashed,shared,capabilities(canAddChildren),appProperties&supportsAllDrives=true');
    if($r['status']===404)return null;
    $j=json_decode($r['body'],true);if($r['status']!==200||!is_array($j))throw new RuntimeException('drive_metadata');return $j;
}
function drivePrivate(array $m): void {
    if(($m['trashed']??true)!==false||($m['shared']??true)!==false)throw new RuntimeException('drive_not_private');
}
function driveReserve(): string {
    $r=driveRequest('GET','files/generateIds?count=1&space=drive&type=files');$j=json_decode($r['body'],true);$id=$j['ids'][0]??'';
    if($r['status']!==200||!is_string($id)||!preg_match('/^[A-Za-z0-9_-]{10,200}$/D',$id))throw new RuntimeException('drive_generate_id');return $id;
}
function archiveManifest(array $r): array {
    return ['schema'=>1,'customer_id'=>$r['customer_id'],'customer_name'=>$r['customer_name'],'commission'=>$r['commission'],'revision'=>$r['revision'],'title'=>$r['title'],'accepted_at'=>$r['completion']['accepted_at'],'signer'=>$r['completion']['name'],'date'=>$r['completion']['date'],'original_sha256'=>$r['sha256'],'signed_sha256'=>$r['completion']['sha256'],'documents'=>publicFiles($r['attachments']),'legal_consent'=>$r['completion']['legal_consent']??null];
}
function archiveFiles(array $r): array {
    $dir=recordPath($r['id']);
    $files=[['key'=>'signed','path'=>$dir.'/signed.pdf','name'=>'Unterschriebenes_Angebot.pdf','mime'=>'application/pdf','sha256'=>$r['completion']['sha256']],['key'=>'original','path'=>$dir.'/original.pdf','name'=>'01_Angebot.pdf','mime'=>'application/pdf','sha256'=>$r['sha256']]];
    foreach($r['attachments'] as $i=>$f)$files[]=['key'=>'asset-'.$f['id'],'path'=>$dir.'/asset-'.$f['id'],'name'=>sprintf('%02d_', $i+2).$f['name'],'mime'=>$f['mime'],'sha256'=>$f['sha256']];
    $manifest=$dir.'/archive-manifest.json';
    if(!is_file($manifest))saveJson($manifest,archiveManifest($r));
    $files[]=['key'=>'manifest','path'=>$manifest,'name'=>'Unterlagenstand.json','mime'=>'application/json','sha256'=>hash_file('sha256',$manifest)];
    return $files;
}
function driveVerifyFile(array $m,array $f,string $folder,string $record): void {
    drivePrivate($m);
    if(!in_array($folder,$m['parents']??[],true)||($m['mimeType']??'')!==$f['mime']||($m['appProperties']['record']??'')!==$record||($m['appProperties']['asset']??'')!==$f['key']||(string)($m['size']??'')!==(string)filesize($f['path']))throw new RuntimeException('drive_wrong_file');
    $sha=$m['sha256Checksum']??'';
    if(!$sha){$download=driveRequest('GET','files/'.rawurlencode($m['id']).'?alt=media&supportsAllDrives=true');if($download['status']!==200)throw new RuntimeException('drive_readback');$sha=hash('sha256',$download['body']);}
    if(!hash_equals($f['sha256'],$sha))throw new RuntimeException('drive_checksum');
}
function driveUploadFile(array $f,string $id,string $folder,string $record): void {
    if(!is_file($f['path'])||!hash_equals($f['sha256'],hash_file('sha256',$f['path'])))throw new RuntimeException('archive_source_checksum');
    $m=driveMetadata($id);
    if(!$m){
        $meta=['id'=>$id,'name'=>$f['name'],'mimeType'=>$f['mime'],'parents'=>[$folder],'appProperties'=>['record'=>$record,'asset'=>$f['key'],'sha256'=>$f['sha256']]];
        $response=driveHTTP('POST','https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',['Authorization: Bearer '.driveToken(),'Content-Type: application/json; charset=UTF-8','X-Upload-Content-Type: '.$f['mime'],'X-Upload-Content-Length: '.filesize($f['path'])],json_encode($meta,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE));
        if($response['status']!==409){
            $session=$response['headers']['location']??'';
            if(!in_array($response['status'],[200,201],true)||!str_starts_with($session,'https://www.googleapis.com/upload/drive/v3/'))throw new RuntimeException('drive_upload_session');
            $response=driveHTTP('PUT',$session,['Authorization: Bearer '.driveToken(),'Content-Type: '.$f['mime'],'Content-Length: '.filesize($f['path'])],(string)file_get_contents($f['path']));
        }
        if(!in_array($response['status'],[200,201,409],true))throw new RuntimeException('drive_upload');
        // A successful upload or conflict is not enough: independently read back bytes/metadata.
        $m=driveMetadata($id);if(!$m)throw new RuntimeException('drive_readback');
    }
    driveVerifyFile($m,$f,$folder,$record);
}
function runDriveArchive(array $r): array {
    if($r['state']!=='archive_pending')return $r;
    try{
        $d=driveSettings();$root=$r['archive']['root_id'];$rootMeta=driveMetadata($root);
        if(!$rootMeta||($rootMeta['mimeType']??'')!=='application/vnd.google-apps.folder'||empty($rootMeta['capabilities']['canAddChildren']))throw new RuntimeException('drive_folder_access');
        drivePrivate($rootMeta);
        if(empty($r['archive']['folder_id'])){$r['archive']['folder_id']=driveReserve();saveJson(recordPath($r['id']).'/record.json',$r);}
        $folder=$r['archive']['folder_id'];$m=driveMetadata($folder);
        if(!$m){$created=driveRequest('POST','files?supportsAllDrives=true',['id'=>$folder,'name'=>$r['customer_id'].' · '.$r['commission'].' · Freigabe '.$r['revision'],'mimeType'=>'application/vnd.google-apps.folder','parents'=>[$root],'appProperties'=>['record'=>$r['id']]]);if(!in_array($created['status'],[200,201,409],true))throw new RuntimeException('drive_folder_create');$m=driveMetadata($folder);}
        if(!$m||($m['mimeType']??'')!=='application/vnd.google-apps.folder'||!in_array($root,$m['parents']??[],true)||($m['appProperties']['record']??'')!==$r['id'])throw new RuntimeException('drive_folder_mismatch');drivePrivate($m);
        $limit=max(1,min(20,(int)($d['batch_size']??2)));$done=0;$start=microtime(true);$files=archiveFiles($r);
        foreach($files as $f){
            if(!empty($r['archive']['files'][$f['key']]['verified_at']))continue;
            if($done>=$limit||microtime(true)-$start>15)break;
            if(empty($r['archive']['files'][$f['key']]['id'])){$r['archive']['files'][$f['key']]=['id'=>driveReserve()];saveJson(recordPath($r['id']).'/record.json',$r);}
            $fid=$r['archive']['files'][$f['key']]['id'];driveUploadFile($f,$fid,$folder,$r['id']);
            $r['archive']['files'][$f['key']]=['id'=>$fid,'sha256'=>$f['sha256'],'size'=>filesize($f['path']),'verified_at'=>gmdate(DATE_ATOM)];
            saveJson(recordPath($r['id']).'/record.json',$r);$done++;
        }
        $ready=true;foreach($files as $f)if(empty($r['archive']['files'][$f['key']]['verified_at']))$ready=false;
        if($ready){
            // Recheck the complete archive, including earlier batches, before closing the link.
            drivePrivate(driveMetadata($root)??[]);drivePrivate(driveMetadata($folder)??[]);
            foreach($files as $f){$fid=$r['archive']['files'][$f['key']]['id'];$m=driveMetadata($fid);if(!$m)throw new RuntimeException('drive_archive_missing');driveVerifyFile($m,$f,$folder,$r['id']);}
            $r['archive']['state']='verified';$r['archive']['verified_at']=gmdate(DATE_ATOM);$r['state']='completed';$r['completion']['completed_at']=gmdate(DATE_ATOM);
        }
        unset($r['archive']['last_error']);$r['archive']['next_attempt']=0;
    }catch(Throwable $e){
        $r['archive']['attempts']=($r['archive']['attempts']??0)+1;
        $safe=['drive_not_private','drive_checksum','drive_wrong_file','drive_authorization','drive_not_configured','drive_curl_missing','archive_source_checksum','drive_folder_access','drive_archive_missing'];
        $r['archive']['last_error']=$e instanceof PortalError?$e->reason:(in_array($e->getMessage(),$safe,true)?$e->getMessage():'drive_transfer');
        $r['archive']['next_attempt']=time()+min(900,15*2**min(6,$r['archive']['attempts']-1));
    }
    saveJson(recordPath($r['id']).'/record.json',$r);return $r;
}
function archiveResult(array $r): array {
    return ['ok'=>$r['state']==='completed','archive_pending'=>$r['state']==='archive_pending','completed_at'=>$r['completion']['completed_at']??null,'saved_locally'=>!empty($r['completion']),'retry_after'=>max(2,min(900,($r['archive']['next_attempt']??0)-time()))];
}
function retryCustomerArchive(string $token,array $input): array {
    [$id,$r]=lockRecordByToken($token);requireCustomer($id,$r);
    if(!hash_equals($_SESSION['customer'][$id]['proof'],(string)($input['proof']??'')))abortPortal('Bitte den Angebotslink erneut öffnen.',403);
    if($r['state']==='completed')return archiveResult($r);
    activeRecord($r);if($r['state']!=='archive_pending')abortPortal('Es liegt noch keine abgeschlossene Unterschrift vor.',409);
    if(($r['archive']['next_attempt']??0)<=time())$r=runDriveArchive($r);return archiveResult($r);
}
function retryOwnerArchive(string $id): array {
    $r=recordById($id);lockPortal('scope:'.$r['scope']);lockPortal('record:'.$id);$r=recordById($id);
    if($r['state']==='completed')return archiveResult($r);
    if($r['state']!=='archive_pending')abortPortal('Dieser Vorgang wartet nicht auf eine Archivierung.',409);
    return archiveResult(runDriveArchive($r));
}

function runArchiveQueue(): array {
    global $dataDir;$done=0;$pending=0;
    foreach(glob($dataDir.'/records/*/record.json')?:[] as $path){
        $r=readJson($path);if(($r['state']??'')!=='archive_pending'||($r['archive']['next_attempt']??0)>time())continue;
        $scope=lockPortal('scope:'.$r['scope']);$record=lockPortal('record:'.$r['id']);
        try{$r=recordById($r['id']);if($r['state']==='archive_pending'){$r=runDriveArchive($r);if($r['state']==='completed')$done++;else $pending++;}}
        finally{releasePortal($record);releasePortal($scope);}
        if($done+$pending>=5)break;
    }
    return ['completed'=>$done,'pending'=>$pending];
}
