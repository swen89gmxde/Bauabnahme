<?php
declare(strict_types=1);

// Releases snapshot their provider. Unmarked historic records retain their Drive policy.
function archiveProvider(array $r): string {return $r['archive_provider']??'drive';}
function newArchiveProvider(): string {
    global $config;$provider=$config['archive_provider']??'strato';
    if(!in_array($provider,['strato','drive'],true))abortPortal('Die Archiveinstellung ist ungültig.',503);
    return $provider;
}
function stratoArchiveReady(): bool {global $dataDir;return is_dir($dataDir)&&is_writable($dataDir)&&!is_link($dataDir);}
function requireNewArchive(): void {
    if(newArchiveProvider()==='drive'){driveSettings();return;}
    if(!stratoArchiveReady())abortPortal('Das geschützte STRATO-Archiv ist nicht beschreibbar.',503,'strato_archive_unavailable');
}
function stratoSignedPath(array $r): string {
    $dir=recordPath($r['id']).'/archive';
    if(is_link($dir))throw new RuntimeException('strato_archive_path');
    return $dir.'/signed.pdf';
}
function verifyStratoArchive(array $r): string {
    $path=stratoSignedPath($r);clearstatcache(true,$path);$stored=$r['archive']['files']['signed']??[];
    if(is_link($path)||!is_file($path)||($stored['sha256']??'')!==($r['completion']['sha256']??'')||($stored['size']??-1)!==filesize($path)||!hash_equals($r['completion']['sha256'],hash_file('sha256',$path)))throw new RuntimeException('strato_archive_checksum');
    return $path;
}
function ownerSignedPath(array $r): string {
    if(archiveProvider($r)!=='strato')return recordPath($r['id']).'/signed.pdf';
    if(($r['state']??'')!=='completed'||($r['archive']['state']??'')!=='verified')abortPortal('Die Archivierung ist noch nicht bestätigt.',409);
    try{return verifyStratoArchive($r);}catch(Throwable){abortPortal('Die Archivdatei konnte nicht geprüft werden. Bitte die Sicherung kontrollieren.',503,'strato_archive_checksum');}
}
function signedSavedLocally(array $r): bool {
    if(archiveProvider($r)==='strato'&&($r['archive']['state']??'')==='verified'){try{verifyStratoArchive($r);return true;}catch(Throwable){return false;}}
    return is_file(recordPath($r['id']).'/signed.pdf');
}
function runOfferArchive(array $r): array {return archiveProvider($r)==='strato'?runStratoArchive($r):runDriveArchive($r);}
function runStratoArchive(array $r): array {
    if($r['state']!=='archive_pending')return $r;
    try{
        $source=recordPath($r['id']).'/signed.pdf';$sha=$r['completion']['sha256'];
        if(is_link($source)||!is_file($source)||!hash_equals($sha,hash_file('sha256',$source)))throw new RuntimeException('archive_source_checksum');
        $path=stratoSignedPath($r);clearstatcache(true,$path);directory(dirname($path));$size=filesize($source);
        if(!file_exists($path)&&!is_link($path)){
            $tmp=dirname($path).'/pending-'.bin2hex(random_bytes(12)).'.pdf';
            try{if(!copy($source,$tmp)||filesize($tmp)!==$size||!hash_equals($sha,hash_file('sha256',$tmp))||!rename($tmp,$path))throw new RuntimeException('strato_archive_write');}
            finally{if(is_file($tmp))unlink($tmp);}
        }
        $r['archive']['files']['signed']=['sha256'=>$sha,'size'=>$size,'verified_at'=>gmdate(DATE_ATOM)];
        verifyStratoArchive($r);
        $r['archive']['state']='verified';$r['archive']['verified_at']=gmdate(DATE_ATOM);$r['state']='completed';$r['completion']['completed_at']=gmdate(DATE_ATOM);
        $r['notification']=['state'=>'pending','requested_at'=>gmdate(DATE_ATOM),'attempts'=>0,'next_attempt'=>0];
        $r['local_cleanup']=['state'=>'pending','next_attempt'=>0];unset($r['archive']['last_error']);$r['archive']['next_attempt']=0;
    }catch(Throwable $e){
        $r['archive']['attempts']=($r['archive']['attempts']??0)+1;
        $r['archive']['last_error']=in_array($e->getMessage(),['archive_source_checksum','strato_archive_path','strato_archive_checksum'],true)?$e->getMessage():'strato_archive_write';
        $r['archive']['next_attempt']=time()+min(900,15*2**min(6,$r['archive']['attempts']-1));
    }
    saveJson(recordPath($r['id']).'/record.json',$r);return notifyCompletedOffer(purgeTemporaryDocuments($r));
}
