<?php
declare(strict_types=1);
require_once __DIR__.'/store.php';

const DRIVE_CONNECT_SCOPE='https://www.googleapis.com/auth/drive.file';
const DRIVE_CONNECT_COOKIE='__Secure-sichtwerk_drive_oauth';

function driveConnectLoad(): string {
    global $config,$dataDir;
    $web=realpath($_SERVER['DOCUMENT_ROOT']??'');
    $path=$web?(getenv('SICHTWERK_SIGN_CONFIG')?:dirname($web).'/sichtwerk-signieren-private/config.php'):'';
    $real=$path?realpath($path):false;
    $outside=static fn($p)=>$p!==$web&&!str_starts_with($p.'/',rtrim((string)$web,'/').'/');
    if(PHP_VERSION_ID<80100||!$web||!$real||!$outside($real)||is_link($path))abortPortal('Die private Portaleinrichtung fehlt.',503);
    if(empty($_SERVER['HTTPS'])||$_SERVER['HTTPS']==='off')abortPortal('Bitte den sicheren HTTPS-Link verwenden.',400);
    $config=require $real;$origin=$config['origin']??'';$u=is_string($origin)?parse_url($origin):false;
    if(!is_array($config)||!$u||($u['scheme']??'')!=='https'||empty($u['host'])||isset($u['user'])||isset($u['pass'])||isset($u['query'])||isset($u['fragment'])||!empty($u['path'])||empty($config['password_hash'])||empty($config['data_dir']))abortPortal('Die private Portaleinrichtung ist ungültig.',503);
    umask(0077);directory($config['data_dir']);$dataDir=realpath($config['data_dir']);
    if(!$dataDir||!$outside($dataDir))abortPortal('Die Ablage muss außerhalb des Webverzeichnisses liegen.',503);
    $GLOBALS['drive_connect_config_path']=$real;
    return $real;
}
function driveConnectOwner(): void {
    global $dataDir,$config;
    directory($dataDir.'/sessions');session_save_path($dataDir.'/sessions');session_name('sichtwerk_signieren');
    session_set_cookie_params(['lifetime'=>0,'path'=>'/angebote/','secure'=>true,'httponly'=>true,'samesite'=>'Strict']);
    ini_set('session.use_strict_mode','1');session_start();
    if(!portalOwnerAuthenticated())abortPortal('Bitte zuerst in der Angebotsverwaltung anmelden.',401);
    $_SESSION['csrf']??=bin2hex(random_bytes(32));
    $method=$_SERVER['REQUEST_METHOD']??'GET';
    if(!in_array($method,['GET','POST'],true))abortPortal('Diese Aktion ist nicht verfügbar.',405);
    if($method==='POST'&&(!hash_equals($config['origin'],(string)($_SERVER['HTTP_ORIGIN']??''))||!is_string($_POST['csrf']??null)||!hash_equals($_SESSION['csrf'],$_POST['csrf'])))abortPortal('Bitte die Verbindungsseite neu öffnen.',403);
}
function driveConnectLock(): mixed {
    $path=$GLOBALS['drive_connect_config_path'];$h=fopen(dirname($path).'/.drive-connect.lock','c+');
    if(!$h||!flock($h,LOCK_EX))abortPortal('Die Einrichtung ist gerade belegt.',503);
    if(function_exists('opcache_invalidate'))@opcache_invalidate($path,true);
    $GLOBALS['config']=require $path;
    return $h;
}
function driveConnectSetupOnly(): void {
    global $config,$dataDir;
    if(($config['releases_enabled']??true)!==false||glob($dataDir.'/records/*/record.json'))abortPortal('Die Verbindung kann hier nur vor den ersten Kundenfreigaben eingerichtet werden.',409);
}
function driveConnectWrite(array $changes): void {
    global $config;
    $path=$GLOBALS['drive_connect_config_path'];$fresh=require $path;
    $fresh['drive_archive']=array_replace($fresh['drive_archive']??[],$changes);
    savePrivateConfig($path,$fresh);
    $config=$fresh;
}
function driveConnectRedirect(): string {global $config;return $config['origin'].'/angebote/server/drive-callback.php';}
function driveConnectFingerprint(): string {global $config;$d=$config['drive_archive']??[];return hash('sha256',json_encode([$d['client_id']??'',$d['client_secret']??'',$d['account_email']??''],JSON_THROW_ON_ERROR));}
function driveConnectImport(array $file,mixed $email): void {
    global $config,$dataDir;
    driveConnectSetupOnly();
    if(!empty($config['drive_archive']['refresh_token']))abortPortal('Die Google-Freigabe ist bereits hinterlegt. Sie wird hier nicht überschrieben.',409);
    if(!is_string($email)||strlen($email)>254||!filter_var($email,FILTER_VALIDATE_EMAIL))abortPortal('Bitte die Anmeldeadresse des Google-Kontos für dein Archiv eintragen.');
    if(($file['error']??-1)!==UPLOAD_ERR_OK||!is_uploaded_file($file['tmp_name']??'')||($file['size']??0)<1||$file['size']>32768)abortPortal('Bitte die heruntergeladene Google-JSON-Datei mit höchstens 32 KB auswählen.');
    try{$j=json_decode((string)file_get_contents($file['tmp_name']),true,16,JSON_THROW_ON_ERROR);}catch(Throwable){abortPortal('Die Google-JSON-Datei ist ungültig.');}
    $web=$j['web']??null;
    if(!is_array($web)||!is_string($web['client_id']??null)||!preg_match('/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/D',$web['client_id'])||!is_string($web['client_secret']??null)||!preg_match('/^[A-Za-z0-9_-]{16,200}$/D',$web['client_secret'])||($web['token_uri']??'')!=='https://oauth2.googleapis.com/token'||!is_array($web['redirect_uris']??null)||!in_array(driveConnectRedirect(),$web['redirect_uris'],true))abortPortal('Bitte einen Google-OAuth-Client vom Typ Webanwendung mit der hier angezeigten Weiterleitungsadresse verwenden.');
    if(!empty($_SESSION['drive_connect_started'])){$old=$dataDir.'/drive-connect/'.$_SESSION['drive_connect_started'].'.json';if(is_file($old))unlink($old);}
    unset($_SESSION['drive_connect_started']);
    driveConnectWrite(['client_id'=>$web['client_id'],'client_secret'=>$web['client_secret'],'account_email'=>strtolower(trim($email)),'connection_verified'=>false]);
}
function driveConnectStart(): string {
    global $config,$dataDir;
    driveConnectSetupOnly();$d=$config['drive_archive']??[];
    if(empty($d['client_id'])||empty($d['client_secret'])||empty($d['account_email']))abortPortal('Bitte zuerst die Google-JSON-Datei und deine Google-Adresse hinterlegen.');
    if(!empty($d['refresh_token']))abortPortal('Die Google-Freigabe ist bereits hinterlegt.',409);
    $state=bin2hex(random_bytes(32));$nonce=bin2hex(random_bytes(32));$verifier=rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');
    $expires=min(time()+600,$_SESSION['authenticated_at']+3600);directory($dataDir.'/drive-connect');
    // Superseded flows cannot finish even if the browser retained an older cookie.
    if(!empty($_SESSION['drive_connect_started'])){$old=$dataDir.'/drive-connect/'.$_SESSION['drive_connect_started'].'.json';if(is_file($old))unlink($old);}
    $key=hash('sha256',$state);$_SESSION['drive_connect_started']=$key;
    saveJson($dataDir.'/drive-connect/'.$key.'.json',['expires'=>$expires,'nonce_hash'=>hash('sha256',$nonce),'client_hash'=>driveConnectFingerprint(),'owner_hash'=>portalPasswordFingerprint(),'verifier'=>$verifier,'used'=>false]);
    setcookie(DRIVE_CONNECT_COOKIE,$nonce,['expires'=>$expires,'path'=>'/angebote/server/','secure'=>true,'httponly'=>true,'samesite'=>'Lax']);
    return 'https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query(['client_id'=>$d['client_id'],'redirect_uri'=>driveConnectRedirect(),'response_type'=>'code','scope'=>DRIVE_CONNECT_SCOPE,'access_type'=>'offline','prompt'=>'consent','include_granted_scopes'=>'false','login_hint'=>$d['account_email'],'state'=>$state,'code_challenge'=>rtrim(strtr(base64_encode(hash('sha256',$verifier,true)),'+/','-_'),'='),'code_challenge_method'=>'S256'],'','&',PHP_QUERY_RFC3986);
}
function driveConnectJSON(array $r): array {
    $j=json_decode($r['body']??'',true);
    if(($r['status']??0)!==200||!is_array($j))throw new RuntimeException('google_connection');
    return $j;
}
function driveConnectAccount(string $token): void {
    global $config;
    $j=driveConnectJSON(driveHTTP('GET','https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',['Authorization: Bearer '.$token]));
    if(!is_string($j['user']['emailAddress']??null)||!hash_equals($config['drive_archive']['account_email'],strtolower($j['user']['emailAddress'])))abortPortal('Die Google-Freigabe gehört zu einem anderen Konto. Bitte mit der hinterlegten Google-Adresse erneut verbinden.',400);
}
function driveConnectFolder(): void {
    global $config;
    driveConnectSetupOnly();$d=$config['drive_archive'];
    if(empty($d['refresh_token']))abortPortal('Bitte zuerst bei Google anmelden und die Verbindung freigeben.');
    $j=driveConnectJSON(driveHTTP('POST','https://oauth2.googleapis.com/token',['Content-Type: application/x-www-form-urlencoded'],http_build_query(['client_id'=>$d['client_id'],'client_secret'=>$d['client_secret'],'refresh_token'=>$d['refresh_token'],'grant_type'=>'refresh_token'])));
    $token=$j['access_token']??'';if(!is_string($token)||$token==='')throw new RuntimeException('google_connection');
    driveConnectAccount($token);$headers=['Authorization: Bearer '.$token];
    if(empty($d['folder_id'])){
        $ids=driveConnectJSON(driveHTTP('GET','https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files',$headers));$id=$ids['ids'][0]??'';
        if(!is_string($id)||!preg_match('/^[A-Za-z0-9_-]{10,200}$/D',$id))throw new RuntimeException('google_connection');
        driveConnectWrite(['folder_id'=>$id,'connection_verified'=>false]);$d=$config['drive_archive'];
    }
    $id=$d['folder_id'];$url='https://www.googleapis.com/drive/v3/files/'.rawurlencode($id).'?fields=id,mimeType,trashed,shared,capabilities(canAddChildren),appProperties';
    $r=driveHTTP('GET',$url,$headers);
    if($r['status']===404){
        $meta=['id'=>$id,'name'=>'Angebotsarchiv Sichtwerk','mimeType'=>'application/vnd.google-apps.folder','appProperties'=>['sichtwerk_archive'=>'1']];
        $r=driveHTTP('POST','https://www.googleapis.com/drive/v3/files',array_merge($headers,['Content-Type: application/json']),json_encode($meta,JSON_THROW_ON_ERROR));
        if(!in_array($r['status'],[200,201,409],true))throw new RuntimeException('google_connection');
        $r=driveHTTP('GET',$url,$headers);
    }
    $m=driveConnectJSON($r);drivePrivate($m);
    if(($m['id']??'')!==$id||($m['mimeType']??'')!=='application/vnd.google-apps.folder'||empty($m['capabilities']['canAddChildren'])||($m['appProperties']['sichtwerk_archive']??'')!=='1')throw new RuntimeException('google_connection');
    driveConnectWrite(['connection_verified'=>true,'connection_verified_at'=>gmdate(DATE_ATOM)]);
}
function driveConnectCallback(): void {
    global $config,$dataDir;
    if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET')abortPortal('Diese Rückleitung ist nicht verfügbar.',405);
    $state=$_GET['state']??null;$nonce=$_COOKIE[DRIVE_CONNECT_COOKIE]??null;
    if(!is_string($state)||!preg_match('/^[a-f0-9]{64}$/D',$state)||!is_string($nonce)||!preg_match('/^[a-f0-9]{64}$/D',$nonce))abortPortal('Die Google-Rückleitung ist nicht gültig. Bitte die Verbindung aus der Angebotsverwaltung neu starten.',403);
    $lock=driveConnectLock();
    try{
        driveConnectSetupOnly();$path=$dataDir.'/drive-connect/'.hash('sha256',$state).'.json';$flow=readJson($path);
        if(!$flow||!empty($flow['used'])||($flow['expires']??0)<time()||!hash_equals((string)($flow['nonce_hash']??''),hash('sha256',$nonce))||!hash_equals((string)($flow['client_hash']??''),driveConnectFingerprint()))abortPortal('Die Google-Rückleitung ist abgelaufen oder ungültig. Bitte neu starten.',403);
        if(isset($flow['owner_hash'])?!hash_equals((string)$flow['owner_hash'],portalPasswordFingerprint()):isset($config['password_changed_at']))abortPortal('Der Portalzugang wurde geändert. Bitte die Google-Verbindung aus der Angebotsverwaltung neu starten.',403);
        $verifier=(string)$flow['verifier'];$flow['used']=true;unset($flow['verifier']);saveJson($path,$flow);
        setcookie(DRIVE_CONNECT_COOKIE,'',['expires'=>1,'path'=>'/angebote/server/','secure'=>true,'httponly'=>true,'samesite'=>'Lax']);
        if(isset($_GET['error']))abortPortal('Die Google-Freigabe wurde nicht abgeschlossen. Du kannst die Verbindung erneut starten.');
        $code=$_GET['code']??null;if(!is_string($code)||$code===''||strlen($code)>4096)abortPortal('Google hat keine gültige Freigabe zurückgegeben.');
        $d=$config['drive_archive'];
        $j=driveConnectJSON(driveHTTP('POST','https://oauth2.googleapis.com/token',['Content-Type: application/x-www-form-urlencoded'],http_build_query(['client_id'=>$d['client_id'],'client_secret'=>$d['client_secret'],'code'=>$code,'redirect_uri'=>driveConnectRedirect(),'grant_type'=>'authorization_code','code_verifier'=>$verifier])));
        $scopes=preg_split('/\s+/',trim((string)($j['scope']??'')));sort($scopes);
        if($scopes!==[DRIVE_CONNECT_SCOPE]||!is_string($j['refresh_token']??null)||$j['refresh_token']===''||strlen($j['refresh_token'])>8192||!is_string($j['access_token']??null)||$j['access_token']==='')abortPortal('Google hat den benötigten eingeschränkten Dauerzugriff nicht erteilt. Bitte neu verbinden.');
        driveConnectAccount($j['access_token']);
        driveConnectWrite(['refresh_token'=>$j['refresh_token'],'connection_verified'=>false]);
        driveConnectFolder();
    }finally{releasePortal($lock);}
}
