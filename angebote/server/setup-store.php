<?php
declare(strict_types=1);
require_once __DIR__.'/store.php';

function setupPaths(): array {
    $web=realpath($_SERVER['DOCUMENT_ROOT']??'');
    $private=$web?realpath(dirname($web).'/sichtwerk-signieren-private'):false;
    if(!$web||!$private||$private===$web||str_starts_with($private.'/',rtrim($web,'/').'/'))abortPortal('Die private Einrichtung ist nicht verfügbar.',404);
    return [$private,$private.'/setup-grant.json',$private.'/config.php'];
}
function setupGrant(string $path): array {
    $g=readJson($path);
    if(!preg_match('/^[a-f0-9]{64}$/D',(string)($g['token_hash']??''))||!is_int($g['expires']??null)||$g['expires']<time()||!empty($g['used_at']))abortPortal('Der Einrichtungszugang ist nicht freigegeben oder abgelaufen.',404);
    $origin=$g['origin']??'';$u=is_string($origin)?parse_url($origin):false;
    if(!$u||($u['scheme']??'')!=='https'||empty($u['host'])||isset($u['user'])||isset($u['pass'])||isset($u['query'])||isset($u['fragment'])||!empty($u['path']))abortPortal('Der Einrichtungszugang ist ungültig.',404);
    return $g;
}
function setupUnlock(string $private,array $grant,string $token): void {
    $key=hash('sha256',(string)($_SERVER['REMOTE_ADDR']??'').$grant['token_hash']);
    directory($private.'/setup-rates');$file=$private.'/setup-rates/'.$key.'.json';$rate=readJson($file);
    if(time()-($rate['start']??0)>=900)$rate=['start'=>time(),'attempts'=>0];
    if(($rate['attempts']??0)>=6)abortPortal('Bitte den Einrichtungszugang in 15 Minuten erneut öffnen.',429);
    $valid=preg_match('/^[a-f0-9]{64}$/D',$token)&&hash_equals($grant['token_hash'],hash('sha256',$token));
    $rate['attempts']=$valid?0:($rate['attempts']??0)+1;saveJson($file,$rate);
    if(!$valid)abortPortal('Der Einrichtungszugang ist ungültig.',403);
    session_regenerate_id(true);$_SESSION['setup_grant']=$grant['token_hash'];
}
function setupCreate(string $private,string $configPath,array $grant,array $input): void {
    if(!hash_equals($grant['token_hash'],(string)($_SESSION['setup_grant']??'')))abortPortal('Bitte den persönlichen Einrichtungszugang öffnen.',403);
    if(file_exists($configPath)||is_link($configPath)||glob($private.'/data/records/*/record.json'))abortPortal('Ein vorhandener Portalzugang oder bestehende Vorgänge dürfen hier nicht überschrieben werden.',409);
    $password=portalPassword($input['password']??null,$input['repeat']??null);
    directory($private.'/data');
    $config=['origin'=>$grant['origin'],'password_hash'=>password_hash($password,PASSWORD_DEFAULT),'data_dir'=>$private.'/data','lifetime_days'=>14,'releases_enabled'=>false,'drive_archive'=>['folder_id'=>'','client_id'=>'','client_secret'=>'','refresh_token'=>'','batch_size'=>2]];
    $bytes="<?php\n// Private portal configuration. Never publish or copy into GitHub.\nreturn ".var_export($config,true).";\n";
    $handle=@fopen($configPath,'x');if(!$handle)abortPortal('Der Portalzugang konnte nicht neu angelegt werden.',409);
    $ok=fwrite($handle,$bytes)===strlen($bytes)&&fflush($handle);fclose($handle);
    if(!$ok){@unlink($configPath);abortPortal('Die private Konfiguration konnte nicht gespeichert werden.',503);}
    @chmod($configPath,0600);
    $grant['used_at']=time();saveJson($private.'/setup-grant.json',$grant);
    $_SESSION=[];session_destroy();
}
