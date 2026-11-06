<?php
declare(strict_types=1);
require __DIR__.'/setup-store.php';
// Native form POSTs need their same-origin Origin header; no-referrer serializes it as null.
header('Cache-Control: no-store, private, max-age=0');header('Referrer-Policy: same-origin');header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
function setupReply(array $data,int $status=200): never {http_response_code($status);header('Content-Type: application/json; charset=utf-8');echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);exit;}
$authorized=false;$ready=false;$error='';$csrf='';$json=($_GET['phase']??'')==='unlock';
try{
    if(PHP_VERSION_ID<80100||empty($_SERVER['HTTPS'])||$_SERVER['HTTPS']==='off')abortPortal('Die Einrichtung benötigt PHP 8.1 oder neuer und HTTPS.',503);
    umask(0077);[$private,$grantPath,$configPath]=setupPaths();
    if(is_file($configPath)){$ready=true;if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET')abortPortal('Der Portalzugang wurde bereits eingerichtet.',409);}
    else{
        $grant=setupGrant($grantPath);$method=$_SERVER['REQUEST_METHOD']??'GET';
        if(!in_array($method,['GET','POST'],true))abortPortal('Diese Aktion ist nicht verfügbar.',405);
        if($method==='POST'&&($_SERVER['HTTP_ORIGIN']??'')!==$grant['origin'])abortPortal('Die Einrichtung muss über die eigene Angebotsseite erfolgen.',403);
        directory($private.'/setup-sessions');session_save_path($private.'/setup-sessions');session_name('sichtwerk_portal_setup');ini_set('session.use_strict_mode','1');
        session_set_cookie_params(['lifetime'=>0,'path'=>rtrim(dirname($_SERVER['SCRIPT_NAME']),'/').'/','secure'=>true,'httponly'=>true,'samesite'=>'Strict']);session_start();
        $_SESSION['csrf']??=bin2hex(random_bytes(32));$csrf=$_SESSION['csrf'];
        $authorized=hash_equals($grant['token_hash'],(string)($_SESSION['setup_grant']??''));
        if($method==='POST'){
            $sentCsrf=$json?($_SERVER['HTTP_X_CSRF_TOKEN']??''):($_POST['csrf']??'');
            if(!hash_equals($csrf,(string)$sentCsrf))abortPortal('Bitte die Einrichtungsseite neu öffnen.',403);
            $lock=fopen($private.'/.setup.lock','c+');if(!$lock||!flock($lock,LOCK_EX))abortPortal('Die Einrichtung ist gerade belegt.',503);
            try{
                if(is_file($configPath))abortPortal('Der Portalzugang wurde bereits eingerichtet.',409);
                $grant=setupGrant($grantPath);
                if($json){$raw=file_get_contents('php://input',false,null,0,1025);if($raw===false||strlen($raw)>1024)abortPortal('Die Anfrage ist ungültig.');$input=json_decode($raw,true);setupUnlock($private,$grant,is_array($input)&&is_string($input['token']??null)?$input['token']:'');setupReply(['ok'=>true]);}
                setupCreate($private,$configPath,$grant,$_POST);header('Location: setup.php?erledigt=1',true,303);exit;
            }finally{flock($lock,LOCK_UN);fclose($lock);}
        }
    }
}catch(PortalError $e){if($json)setupReply(['error'=>$e->getMessage()],$e->status);http_response_code($e->status);$error=$e->getMessage();}
catch(Throwable $e){if($json)setupReply(['error'=>'Die Einrichtung ist momentan nicht verfügbar.'],503);http_response_code(503);$error='Die Einrichtung ist momentan nicht verfügbar.';}
header('Content-Type: text/html; charset=utf-8');
$esc=fn(string $s)=>htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
?><!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><meta name="setup-csrf" content="<?=$esc($csrf)?>"><title>Portalzugang einrichten · Sichtwerk – Neubauer</title><link rel="stylesheet" href="../style.css?v=20261106-zugang-1"><script type="module" src="../setup.mjs?v=20261106-zugang-1"></script></head><body><header class="brand"><span>SICHTWERK – NEUBAUER</span></header><main><section class="card"><p class="eyebrow">Einrichtung · nur für Sichtwerk</p>
<?php if($ready): ?><h1>Portalzugang eingerichtet</h1><p>Du kannst dich jetzt mit deinem selbst gewählten Passwort anmelden.</p><p class="notice">Kundenfreigaben bleiben bis zur Drive-Anbindung und zum abgeschlossenen Einrichtungstest gesperrt.</p><a class="primary wide" href="../?vorbereiten=1">Zur Anmeldung im Angebotsportal</a>
<?php else: ?><h1>Dein Portalpasswort festlegen</h1><p id="setup-status" role="status"><?=$esc($error?:($authorized?'Lege jetzt dein eigenes Passwort für die Angebotsverwaltung fest.':'Der persönliche Einrichtungszugang wird geprüft.'))?></p>
<?php if($authorized): ?><form method="post" action="setup.php"><input name="csrf" type="hidden" value="<?=$esc($csrf)?>"><label for="new-password">Neues Portalpasswort</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="16" maxlength="72" required><label for="repeat-password">Portalpasswort wiederholen</label><input id="repeat-password" name="repeat" type="password" autocomplete="new-password" minlength="16" maxlength="72" required><p class="hint">Mindestens 16 Zeichen. Bewahre das Passwort in deinem Passwortmanager auf. Dieses Passwort gilt für deine Angebotsverwaltung.</p><p class="notice">Deine Kunden erhalten diesen Verwaltungszugang nicht. Kundenfreigaben bleiben zunächst gesperrt. Die Verbindung mit Google Drive richten wir anschließend ein.</p><button class="primary wide" type="submit">Portalzugang einrichten</button></form>
<?php else: ?><p class="hint">Du benötigst den persönlichen, zeitlich begrenzten Einrichtungszugang. Ein öffentlicher Aufruf dieser Seite genügt nicht.</p><?php endif;endif; ?>
</section></main></body></html>
