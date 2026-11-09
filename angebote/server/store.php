<?php
declare(strict_types=1);
require_once __DIR__.'/authority.php';
require_once __DIR__.'/drive-archive.php';
require_once __DIR__.'/strato-archive.php';
require_once __DIR__.'/checkout.php';
require_once __DIR__.'/withdrawal-store.php';
final class PortalError extends RuntimeException { public function __construct(string $message, public int $status=400, public string $reason='request_error') { parent::__construct($message); } }
function abortPortal(string $message,int $status=400,string $reason='request_error'): never { throw new PortalError($message,$status,$reason); }
function portalPassword(mixed $password,mixed $repeat): string {
 if(!is_string($password)||!is_string($repeat)||str_contains($password,"\0")||preg_match_all('/./us',$password)<10)abortPortal('Bitte ein Passwort mit mindestens 10 Zeichen wählen.');
 if(strlen($password)>72)abortPortal('Dieses Passwort ist zu lang. Bitte ein kürzeres Passwort wählen.');
 if(!hash_equals($password,$repeat))abortPortal('Die beiden neuen Passwörter stimmen nicht überein.');
 return $password;
}
function portalPasswordFingerprint(): string {global $config;return hash('sha256',(string)$config['password_hash']);}
function portalOwnerAuthenticated(): bool {
 global $config;$at=$_SESSION['authenticated_at']??null;
 if(!is_int($at)||time()-$at<0||time()-$at>=3600)return false;
 $fingerprint=$_SESSION['password_fingerprint']??null;
 // Existing sessions remain usable until their normal expiry or the first password change.
 return array_key_exists('password_fingerprint',$_SESSION)?is_string($fingerprint)&&hash_equals(portalPasswordFingerprint(),$fingerprint):!isset($config['password_changed_at']);
}
function savePrivateConfig(string $path,array $fresh): void {
 $bytes="<?php\n// Private portal configuration. Never publish or copy into GitHub.\nreturn ".var_export($fresh,true).";\n";
 $tmp=$path.'.'.bin2hex(random_bytes(12)).'.tmp';$h=@fopen($tmp,'x');
 if(!$h)abortPortal('Die private Konfiguration konnte nicht gespeichert werden.',503);
 $ok=fwrite($h,$bytes)===strlen($bytes)&&fflush($h);fclose($h);@chmod($tmp,0600);
 if(!$ok||!rename($tmp,$path)){@unlink($tmp);abortPortal('Die private Konfiguration konnte nicht gespeichert werden.',503);}
 if(function_exists('opcache_invalidate'))@opcache_invalidate($path,true);
}
function readJson(string $path): array { if(!is_file($path))return []; $data=json_decode((string)file_get_contents($path),true); return is_array($data)?$data:[]; }
function saveJson(string $path,array $data): void { $tmp=$path.'.'.bin2hex(random_bytes(8)).'.tmp'; if(file_put_contents($tmp,json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),LOCK_EX)===false||!rename($tmp,$path))abortPortal('Die Änderung konnte nicht gespeichert werden.',503); }
function directory(string $path): void { if(!is_dir($path)&&!mkdir($path,0700,true))abortPortal('Die geschützte Ablage ist nicht verfügbar.',503); }
function lockPortal(string $key,int $mode=LOCK_EX): mixed { global $dataDir; directory($dataDir.'/locks'); $h=fopen($dataDir.'/locks/'.hash('sha256',$key).'.lock','c+'); if(!$h||!flock($h,$mode))abortPortal('Der Vorgang ist gerade belegt. Bitte erneut versuchen.',503); $GLOBALS['portal_locks'][]=$h; return $h; }
function releasePortal(mixed $h): void { if(is_resource($h)){flock($h,LOCK_UN);fclose($h);} }
function tokenId(string $token): string { if(!preg_match('/^[a-f0-9]{64}$/D',$token))abortPortal('Dieser Angebotslink ist ungültig.',404,'invalid_link');return hash('sha256',$token); }
function recordPath(string $id): string { global $dataDir; if(!preg_match('/^[a-f0-9]{64}$/D',$id))abortPortal('Der Vorgang wurde nicht gefunden.',404);return $dataDir.'/records/'.$id; }
function recordById(string $id): array { $r=readJson(recordPath($id).'/record.json');if(!$r)abortPortal('Dieser Angebotslink ist nicht mehr gültig.',404,'invalid_link');return $r; }
function lockRecordByToken(string $token,int $mode=LOCK_EX): array { $id=tokenId($token);$r=recordById($id);lockPortal('scope:'.$r['scope'],$mode);lockPortal('record:'.$id,$mode);$r=recordById($id);return [$id,$r]; }
function activeRecord(array $r): void { global $dataDir; if(!in_array($r['state']??'', ['active','archive_pending'],true))abortPortal('Dieser Angebotslink ist bereits abgeschlossen oder gesperrt. Bitte wenden Sie sich an Swen Neubauer.',410,'closed_link');if($r['state']!=='archive_pending'&&($r['expires']??0)<time())abortPortal('Dieser Angebotslink ist abgelaufen. Bitte Swen Neubauer um einen neuen Link bitten.',410,'expired_link');$index=readJson($dataDir.'/scopes/'.$r['scope'].'.json');if(($index['active_id']??'')!==$r['id'])abortPortal('Für dieses Angebot gibt es einen neuen Link. Dieser alte Link ist gesperrt.',410,'replaced_link'); }
function grantCustomer(string $id): void { if(empty($_SESSION['customer'][$id])||($_SESSION['customer'][$id]['until']??0)<time())$_SESSION['customer'][$id]=['until'=>time()+7200,'proof'=>bin2hex(random_bytes(24))]; }
function customerAuthorized(string $id,array $r): bool { if(empty($r['require_code']))grantCustomer($id);return ($_SESSION['customer'][$id]['until']??0)>=time(); }
function requireCustomer(string $id,array $r): void { if(!customerAuthorized($id,$r))abortPortal('Bitte den sechsstelligen Kundencode eingeben.',403,'code_required'); }
function cleanText(mixed $value,int $max=160): string { if(!is_string($value))return '';return trim(substr(preg_replace('/[\x00-\x1f\x7f]/u','',$value)??'',0,$max)); }
function checkUpload(array $f,bool $pdfOnly=false): array {
 if(($f['error']??-1)!==UPLOAD_ERR_OK||!is_uploaded_file($f['tmp_name']??''))abortPortal('Eine Datei konnte nicht hochgeladen werden. Bitte die Uploadgrenze prüfen.');
 if(($f['size']??0)<1||$f['size']>20*1024*1024)abortPortal('Eine Datei darf höchstens 20 MB groß sein.');
 $name=cleanText(basename(str_replace('\\','/',(string)$f['name'])),180);$ext=strtolower(pathinfo($name,PATHINFO_EXTENSION));$mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
 $allowed=['pdf'=>['application/pdf','application/x-pdf'],'jpg'=>['image/jpeg'],'jpeg'=>['image/jpeg'],'png'=>['image/png'],'webp'=>['image/webp'],'doc'=>['application/msword','application/x-ole-storage','application/CDFV2'],'docx'=>['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip']];
 if(!isset($allowed[$ext])||!in_array($mime,$allowed[$ext],true)||($pdfOnly&&$ext!=='pdf'))abortPortal('Erlaubt sind PDF, Word (.doc/.docx), JPG, PNG und WebP. Vertragsvorlagen müssen PDFs sein.');
 if($ext==='pdf'){ $h=fopen($f['tmp_name'],'rb');$start=$h?fread($h,1024):'';if($h)fclose($h);if(!str_contains((string)$start,'%PDF-'))abortPortal('Eine Datei ist keine gültige PDF.'); }
 if(in_array($ext,['jpg','jpeg','png','webp'],true)){ $size=@getimagesize($f['tmp_name']);if(!$size||$size[0]*$size[1]>40000000)abortPortal('Das Bild ist ungültig oder zu groß.'); }
 if($ext==='docx'){if(!class_exists('ZipArchive'))abortPortal('Word-Dateien benötigen die ZIP-Erweiterung auf dem Webspace.',503);$zip=new ZipArchive();if($zip->open($f['tmp_name'])!==true)abortPortal('Die Word-Datei ist ungültig.');$valid=$zip->locateName('[Content_Types].xml')!==false&&$zip->locateName('word/document.xml')!==false&&$zip->locateName('word/vbaProject.bin')===false;$zip->close();if(!$valid)abortPortal('Bitte eine normale Word-Datei ohne Makros verwenden.');$mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';}
 return ['name'=>$name,'mime'=>$mime,'size'=>(int)$f['size'],'sha256'=>hash_file('sha256',$f['tmp_name']),'tmp'=>$f['tmp_name']];
}
function uploadedList(string $key): array { $files=$_FILES[$key]??null;if(!$files)return [];if(!is_array($files['name']))return [$files];$out=[];foreach($files['name'] as $i=>$n)if(($files['error'][$i]??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE)$out[]=['name'=>$n,'tmp_name'=>$files['tmp_name'][$i],'error'=>$files['error'][$i],'size'=>$files['size'][$i]];return $out; }
function legalMasters(): array { global $dataDir;return readJson($dataDir.'/legal/current.json'); }
function publicFiles(array $files): array {return array_map(fn($f)=>array_intersect_key($f,array_flip(['id','name','mime','size','sha256','role','version'])), $files);}
function publicOffer(array $r,string $id): array {return array_intersect_key($r,array_flip(['title','filename','layout','sha256','expires','pageCount','customer_name','commission','revision','legal_generation']))+['attachments'=>publicFiles($r['attachments']),'csrf'=>$_SESSION['csrf'],'proof'=>$_SESSION['customer'][$id]['proof'],'archive_pending'=>$r['state']==='archive_pending','archive_test'=>($r['archive_test']??false)===true,'archive_mode'=>archiveMode($r),'archive_provider'=>archiveProvider($r),'authority'=>$r['authority']??null,'copy_consent'=>$r['copy_consent']??null,'checkout'=>$r['checkout']??null,'checkout_hash'=>isset($r['checkout'])?checkoutHash($r['checkout']):null,'consent'=>$r['consent']??legalConsentDefinition(($r['archive_test']??false)===true)];}
function rateLimit(string $key,callable $check): bool { global $dataDir,$config;$key=hash_hmac('sha256',$key.'|'.($_SERVER['REMOTE_ADDR']??''),(string)$config['password_hash']);$h=lockPortal('rate:'.$key);directory($dataDir.'/rates');$path=$dataDir.'/rates/'.$key.'.json';$r=readJson($path);if(time()-($r['start']??0)>=900)$r=['start'=>time(),'attempts'=>0];if(($r['attempts']??0)>=6)abortPortal('Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.',429,'rate_limit');$ok=$check();$r['attempts']=$ok?0:($r['attempts']??0)+1;saveJson($path,$r);releasePortal($h);return $ok; }
function legalUpload(array $file,string $role,string $version): array {
 global $dataDir;if(!in_array($role,['agb','widerruf'],true)||!$version)abortPortal('Bitte Vorlagentyp und Versionsstand angeben.');$f=checkUpload($file,true);$h=lockPortal('legal');directory($dataDir.'/legal');$current=legalMasters();$filename=$role.'-'.$f['sha256'].'.pdf';if(!is_file($dataDir.'/legal/'.$filename)&&!copy($f['tmp'],$dataDir.'/legal/'.$filename))abortPortal('Die Vertragsvorlage konnte nicht gespeichert werden.',503);
 $current['generation']=($current['generation']??0)+1;$current['documents'][$role]=array_intersect_key($f,array_flip(['name','mime','size','sha256']))+['role'=>$role,'version'=>$version,'stored'=>$filename,'updated_at'=>gmdate(DATE_ATOM)];saveJson($dataDir.'/legal/current.json',$current);releasePortal($h);return ['ok'=>true,'generation'=>$current['generation']];
}
function createOffer(array $meta,array $pdf,array $extra,bool $archiveTest=false): array {
 global $dataDir,$config;if(!$archiveTest&&($config['releases_enabled']??true)!==true)abortPortal('Kundenfreigaben bleiben bis zum abgeschlossenen Einrichtungstest gesperrt.',503,'releases_disabled');$title=cleanText($meta['title']??'');$customer=cleanText($meta['customer_id']??'',100);$commission=cleanText($meta['commission']??'',100);$customerName=cleanText($meta['customer_name']??'');if(!$title||!$customer||!$commission||!$customerName)abortPortal('Bitte Kunde, Kundennummer, Kommission und Angebotsbezeichnung angeben.');
 if(!$archiveTest&&$customer==='__ARCHIVTEST__')abortPortal('Diese Kundenkennung ist für den internen Archivtest reserviert.');
 $layout=$meta['layout']??null;$count=$meta['pageCount']??0;if(!is_int($count)||$count<1||$count>100||!is_array($layout)||!is_int($layout['page']??null)||$layout['page']<0||$layout['page']>=$count)abortPortal('Die Unterschriftsseite ist ungültig.');$safe=['page'=>$layout['page']];foreach(['signature','date'] as $key){$r=$layout[$key]??[];foreach(['x','y','w','h'] as $axis){$v=$r[$axis]??null;if(!is_numeric($v)||!is_finite((float)$v)||$v<0||$v>4000)abortPortal('Die Unterschriftsflächen sind ungültig.');$safe[$key][$axis]=(float)$v;}if($r['w']<40||$r['h']<($key==='signature'?25:12))abortPortal('Die Unterschriftsfläche ist zu klein.');}
 $checkout=$archiveTest?(($meta['checkout_test']??false)===true?archiveTestCheckout():null):validateCheckout($meta['checkout']??null);
 $business=isBusinessCheckout($checkout);$legalRoles=$business?['agb']:['agb','widerruf'];
 $f=checkUpload($pdf,true);if(($checkout['version']??null)===2&&(!hash_equals($f['sha256'],$checkout['source_sha256'])||count($checkout['source_pages'])!==$count))abortPortal('Der ausgelesene Text gehört nicht zu dieser Angebots-PDF. Bitte die PDF erneut auswählen.',400,'checkout_source_mismatch');if(count($extra)>12)abortPortal('Bitte höchstens zwölf zusätzliche Dateien bereitstellen.');$files=array_map(fn($x)=>checkUpload($x),$extra);$total=$f['size'];foreach($files as $x)$total+=$x['size'];if($total>60*1024*1024)abortPortal('Ein Unterlagenpaket darf höchstens 60 MB groß sein.');
 $lh=lockPortal('legal',LOCK_SH);$legal=legalMasters();if($archiveTest)requireArchiveTestLegal($legal);foreach($legalRoles as $role)if(empty($legal['documents'][$role]))abortPortal('Bitte zuerst aktuelle AGB und Widerrufsunterlagen in den Vertragsvorlagen hinterlegen.',409,'missing_legal');
 if($checkout){$mailTotal=$total;foreach($legalRoles as $role)$mailTotal+=$legal['documents'][$role]['size'];$max=($checkout['copy_delivery']??'email')==='email'?10:60;if($mailTotal>$max*1024*1024)abortPortal('Angebot und sämtliche Anlagen dürfen für diesen Versandweg zusammen höchstens '.$max.' MB groß sein.');}
 requireNewArchive();
 $token=bin2hex(random_bytes(32));$id=tokenId($token);$scope=hash('sha256',$customer."\0".$commission);directory($dataDir.'/records');directory($dataDir.'/scopes');directory($dataDir.'/staging');$stage=$dataDir.'/staging/'.$id;directory($stage);$attachments=[];
 if(!copy($f['tmp'],$stage.'/original.pdf'))abortPortal('Das Angebot konnte nicht gespeichert werden.',503);
 foreach($legalRoles as $role){$l=$legal['documents'][$role];$aid=bin2hex(random_bytes(16));if(!copy($dataDir.'/legal/'.$l['stored'],$stage.'/asset-'.$aid))abortPortal('Eine Vertragsvorlage konnte nicht übernommen werden.',503);$attachments[]=array_intersect_key($l,array_flip(['name','mime','size','sha256','role','version']))+['id'=>$aid];}
 foreach($files as $x){$aid=bin2hex(random_bytes(16));if(!copy($x['tmp'],$stage.'/asset-'.$aid))abortPortal('Ein Anhang konnte nicht gespeichert werden.',503);$attachments[]=array_intersect_key($x,array_flip(['name','mime','size','sha256']))+['id'=>$aid,'role'=>'anlage','version'=>'kundenspezifisch'];}
 releasePortal($lh);$scopeLock=lockPortal('scope:'.$scope);$index=readJson($dataDir.'/scopes/'.$scope.'.json');$oldId=$index['active_id']??null;if($oldId&&(recordById($oldId)['state']??'')==='archive_pending')abortPortal('Diese Kommission wartet noch auf die Archivierung. Bitte zuerst die Archivierung abschließen.',409,'archive_pending');$revision=($index['revision']??0)+1;
 // New releases use the 256-bit personal link only. Keep legacy PIN records unchanged.
 $requireCode=false;$code=null;
 $r=['schema'=>2,'archive_mode'=>newArchiveMode(),'archive_provider'=>newArchiveProvider(),'id'=>$id,'scope'=>$scope,'customer_id'=>$customer,'customer_name'=>$customerName,'commission'=>$commission,'revision'=>$revision,'title'=>$title,'filename'=>$f['name'],'layout'=>$safe,'sha256'=>$f['sha256'],'pageCount'=>$count,'state'=>'active','created_at'=>gmdate(DATE_ATOM),'created'=>time(),'expires'=>time()+max(1,min(30,(int)($config['lifetime_days']??14)))*86400,'require_code'=>$requireCode,'code_hash'=>$requireCode?password_hash($code,PASSWORD_DEFAULT):null,'legal_generation'=>$legal['generation'],'attachments'=>$attachments];
 if(!$archiveTest||($meta['authority_test']??false)===true)$r['authority']=authorityDefinition($customerName,$business);
 $r['consent']=legalConsentDefinition($archiveTest,$business);
 if($checkout){$r['checkout']=$checkout;if(isset($checkout['copy_delivery'])&&($copyConsent=copyConsentDefinition($checkout['copy_delivery'])))$r['copy_consent']=$copyConsent;}
 if($archiveTest)$r['archive_test']=true;
 saveJson($stage.'/record.json',$r);if(!rename($stage,recordPath($id)))abortPortal('Das Angebot konnte nicht freigegeben werden.',503);saveJson($dataDir.'/scopes/'.$scope.'.json',['active_id'=>$id,'revision'=>$revision]);if($oldId&&$oldId!==$id){lockPortal('record:'.$oldId);$old=recordById($oldId);if($old['state']==='active'){$old['state']='replaced';$old['closed_at']=gmdate(DATE_ATOM);saveJson(recordPath($oldId).'/record.json',$old);}}
 return ['token'=>$token,'id'=>$id,'code'=>$requireCode?$code:null,'expires'=>$r['expires'],'revision'=>$revision,'attachments'=>publicFiles($attachments)];
}
function requireArchiveTestLegal(array $masters): void {
 global $dataDir;
 $released=readJson(dirname(__DIR__).'/legal-current.json');
 if(count($released['documents']??[])!==2||count($masters['documents']??[])!==2)abortPortal('Die Vertragsvorlagen für den Archivtest sind nicht vollständig.',409);
 foreach($released['documents'] as $entry){
  $role=$entry['role']??'';$master=$masters['documents'][$role]??[];
  if(!in_array($role,['agb','widerruf'],true))abortPortal('Die Vertragsvorlagen für den Archivtest sind ungültig.',409);
  foreach(['name','version','mime','size','sha256'] as $key)if(($master[$key]??null)!==($entry[$key]??null))abortPortal('Der Archivtest benötigt die aktuell veröffentlichten AGB und Widerrufsunterlagen. Bitte die Vertragsvorlagen abgleichen.',409);
  $stored=$master['stored']??'';if(!is_string($stored)||basename($stored)!==$stored||!is_file($dataDir.'/legal/'.$stored)||!hash_equals((string)$entry['sha256'],hash_file('sha256',$dataDir.'/legal/'.$stored)))abortPortal('Eine Vertragsvorlage für den Archivtest stimmt nicht mit dem freigegebenen Stand überein.',409);
 }
}
function createArchiveTest(array $pdf,array $extra,bool $checkoutTest=false,bool $authorityTest=false): array {
 global $config;
 if(($config['releases_enabled']??true)!==false)abortPortal('Der Einrichtungstest ist nur bei gesperrten Kundenfreigaben verfügbar.',409);
 if(newArchiveProvider()==='drive'&&($config['drive_archive']['connection_verified']??false)!==true)abortPortal('Die historische Drive-Verbindung ist noch nicht geprüft.',409);
 requireNewArchive();
 $approved=[dirname(__DIR__).'/musterangebot.pdf',dirname(__DIR__).'/datenschutz.pdf'];
 if(count($extra)!==1)abortPortal('Der Archivtest benötigt genau die vorgegebene Musteranlage.');
 foreach([$pdf,$extra[0]] as $i=>$upload){$file=checkUpload($upload,true);if(!is_file($approved[$i])||!hash_equals(hash_file('sha256',$approved[$i]),$file['sha256']))abortPortal('Für den Archivtest sind ausschließlich die vorgegebenen Musterunterlagen erlaubt.',409);}
 $demo=readJson(dirname(__DIR__).'/demo.json');if(!is_array($demo['layout']??null))abortPortal('Die Testvorlage ist nicht verfügbar.',503);
 $pdf['name']='ARCHIVTEST_Musterangebot.pdf';$extra[0]['name']='ARCHIVTEST_Zusatzanlage.pdf';
 return createOffer(['title'=>'ARCHIVTEST - KEIN KUNDENAUFTRAG','customer_id'=>'__ARCHIVTEST__','customer_name'=>'Testkunde Sichtwerk - kein Auftrag','commission'=>newArchiveProvider()==='strato'?'ARCHIVTEST-STRATO':'ARCHIVTEST-Drive','checkout_test'=>$checkoutTest,'authority_test'=>$authorityTest,'layout'=>$demo['layout'],'pageCount'=>4],$pdf,$extra,true);
}
function legalConsentDefinition(bool $archiveTest=false,bool $business=false): array {if($business&&!$archiveTest)return ['version'=>2,'text'=>'Ich stimme der Geltung der AGB zu. Ich bestätige die Beauftragung für den im Angebot genannten Geschäftskunden zu dessen gewerblichen oder selbständigen beruflichen Zwecken.'];return $archiveTest?['version'=>1001,'text'=>'Im Archivtest: Ich probiere die Pflichtbestätigung zu AGB und Widerrufsbelehrung einschließlich Musterformular aus. Es entsteht kein Auftrag.','test'=>true]:['version'=>1,'text'=>'Ich stimme der Geltung der AGB zu und nehme den Hinweis auf die Widerrufsbelehrung einschließlich Muster-Widerrufsformular zur Kenntnis.'];}
function requireLegalConsent(array $meta,int $version): void {if(($meta['legal_consent']??null)!==true||($meta['consent_version']??null)!==$version)abortPortal('Bitte das Pflichtfeld zu den Vertragsunterlagen aktiv anhaken.',400,'legal_consent_required');}
function completeOffer(string $token,array $meta,array $file): array {
 [$id,$r]=lockRecordByToken($token);requireCustomer($id,$r);requireOrderConsent($r,$meta);$authority=requireAuthority($r,$meta);$key=(string)($meta['request_id']??'');if(!preg_match('/^[a-f0-9]{32}$/D',$key))abortPortal('Bitte die PDF erneut vorbereiten.');$f=checkUpload($file,true);
 $proof=(string)($meta['proof']??'');if(!hash_equals($_SESSION['customer'][$id]['proof'],$proof))abortPortal('Bitte den Angebotslink erneut öffnen.',403);
 if(in_array($r['state'],['archive_pending','completed'],true)){
  if(isset($r['completion']['authority'])&&array_diff_key($r['completion']['authority'],['accepted_at'=>true])!==$authority)abortPortal('Die gespeicherte Eigentums-/Vertretungserklärung kann nicht verändert werden.',410,'signature_saved');
  if(isset($r['completion']['legal_consent']))requireLegalConsent($meta,$r['completion']['legal_consent']['version']);
  if(!hash_equals($r['completion']['request_hash'],hash('sha256',$key))||!hash_equals($r['completion']['sha256'],$f['sha256'])||($meta['name']??'')!==$r['completion']['name']||($meta['date']??'')!==$r['completion']['date']||($meta['source_sha256']??'')!==$r['sha256'])abortPortal('Die Unterschrift ist bereits gespeichert und kann nicht überschrieben werden.',410,'signature_saved');
  $documents=$meta['documents']??[];if(!is_array($documents))abortPortal('Die Dokumentliste ist ungültig.',400);ksort($documents);$expected=$r['completion']['documents'];ksort($expected);if($documents!==$expected)abortPortal('Der Unterlagenstand stimmt nicht.',409);
  if($r['state']==='archive_pending'){activeRecord($r);$r=sendCustomerCopy($r);if(($r['archive']['next_attempt']??0)<=time())$r=runOfferArchive($r);}
  return archiveResult($r)+['already_saved'=>true];
 }
 activeRecord($r);if(!hash_equals($r['sha256'],(string)($meta['source_sha256']??'')))abortPortal('Die Unterschrift gehört nicht zu diesem Angebotsstand.',409);
 $name=cleanText($meta['name']??'',200);$date=(string)($meta['date']??'');$dt=DateTimeImmutable::createFromFormat('!Y-m-d',$date);if(strlen($name)<3||!$dt||$dt->format('Y-m-d')!==$date)abortPortal('Bitte Namen und gültiges Datum angeben.');
 $expected=array_column($r['attachments'],'sha256','id');$supplied=$meta['documents']??null;if(is_array($supplied)){ksort($supplied);ksort($expected);}if(!is_array($supplied)||$supplied!==$expected)abortPortal('Der Unterlagenstand stimmt nicht mehr. Bitte das Angebot erneut öffnen.',409);
 $consent=$r['consent']??legalConsentDefinition(($r['archive_test']??false)===true);requireLegalConsent($meta,$consent['version']);$legalFiles=array_values(array_filter(publicFiles($r['attachments']),fn($f)=>in_array($f['role'],['agb','widerruf'],true)));$legalRoles=array_column($legalFiles,'role');sort($legalRoles);$requiredRoles=isBusinessCheckout($r['checkout']??null)?['agb']:['agb','widerruf'];sort($requiredRoles);if($legalRoles!==$requiredRoles)abortPortal('Die Vertragsunterlagen sind nicht vollständig. Bitte Swen Neubauer kontaktieren.',409);
 if(archiveProvider($r)==='drive')$drive=driveSettings();$tmp=recordPath($id).'/signed-staging.pdf';
 if(!copy($f['tmp'],$tmp)||!hash_equals($f['sha256'],hash_file('sha256',$tmp))||!rename($tmp,recordPath($id).'/signed.pdf'))abortPortal('Die unterschriebene PDF konnte nicht gespeichert werden. Bitte erneut versuchen.',503);
 $acceptedAt=gmdate(DATE_ATOM);$consent+=['accepted_at'=>$acceptedAt,'documents'=>$legalFiles];$r['state']='archive_pending';$r['completion']=['name'=>$name,'date'=>$date,'accepted_at'=>$acceptedAt,'source_sha256'=>$r['sha256'],'sha256'=>$f['sha256'],'request_hash'=>hash('sha256',$key),'documents'=>$expected,'legal_consent'=>$consent];
 if($authority)$r['completion']['authority']=$authority+['accepted_at'=>$acceptedAt];
 $r['archive']=['state'=>'pending','root_id'=>$drive['folder_id']??null,'files'=>[],'attempts'=>0,'next_attempt'=>0];
 if(isset($r['checkout'])){$r['completion']['order_consent']=['accepted'=>true,'checkout_hash'=>checkoutHash($r['checkout']),'button'=>!empty($r['archive_test'])?'Archivtest abschließen':'Zahlungspflichtig bestellen','accepted_at'=>$acceptedAt];$r['customer_copy']=['state'=>customerCopyMethod($r)==='email'?'pending':'manual_required','requested_at'=>$acceptedAt,'attempts'=>0,'next_attempt'=>0];if(!empty($r['copy_consent']))$r['completion']['copy_consent']=$r['copy_consent']+['accepted'=>true,'accepted_at'=>$acceptedAt];}
 saveJson(recordPath($id).'/record.json',$r);return archiveResult(runOfferArchive(sendCustomerCopy($r)));
}
function syncBundledLegal(): void {
 global $dataDir;$manifest=dirname(__DIR__).'/legal-current.json';if(!is_file($manifest))return;$raw=(string)file_get_contents($manifest);$digest=hash('sha256',$raw);$lock=lockPortal('legal');$current=legalMasters();if(($current['bundle_digest']??'')===$digest){releasePortal($lock);return;}$bundle=json_decode($raw,true);if(!is_array($bundle)||!is_array($bundle['documents']??null))abortPortal('Die Vertragsvorlagen-Freigabe ist ungültig.',503);
 $base=realpath(dirname(__DIR__).'/vertragsunterlagen');if(!$base)abortPortal('Die Vertragsvorlagen fehlen.',503);$documents=[];foreach($bundle['documents'] as $entry){$role=$entry['role']??'';if(!in_array($role,['agb','widerruf'],true))abortPortal('Die Vertragsvorlagen-Freigabe ist ungültig.',503);$path=realpath(dirname(__DIR__).'/'.($entry['file']??''));if(!$path||!str_starts_with($path,$base.'/')||!hash_equals((string)$entry['sha256'],hash_file('sha256',$path)))abortPortal('Die Vertragsvorlage passt nicht zur freigegebenen Version.',503);$mime=(new finfo(FILEINFO_MIME_TYPE))->file($path);if($mime!=='application/pdf')abortPortal('Eine Vertragsvorlage ist keine PDF.',503);$stored=$role.'-'.$entry['sha256'].'.pdf';directory($dataDir.'/legal');if(!is_file($dataDir.'/legal/'.$stored)&&!copy($path,$dataDir.'/legal/'.$stored))abortPortal('Die Vertragsvorlagen konnten nicht übernommen werden.',503);$documents[$role]=array_intersect_key($entry,array_flip(['name','version','mime','size','sha256','role']))+['stored'=>$stored,'updated_at'=>gmdate(DATE_ATOM)];}
 if(count($documents)!==2)abortPortal('AGB und Widerrufsunterlagen müssen vollständig freigegeben werden.',503);$current['documents']=$documents;$current['generation']=($current['generation']??0)+1;$current['bundle_digest']=$digest;saveJson($dataDir.'/legal/current.json',$current);releasePortal($lock);
}
