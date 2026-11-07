<?php
declare(strict_types=1);
require __DIR__.'/drive-connect-store.php';
header('Cache-Control: no-store, private, max-age=0');header('Referrer-Policy: same-origin');header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$owner=false;$error='';$csrf='';
try{
    driveConnectLoad();driveConnectOwner();$owner=true;$csrf=$_SESSION['csrf'];
    if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
        $lock=driveConnectLock();
        try{
            if(!portalOwnerAuthenticated())abortPortal('Bitte mit dem aktuellen Passwort erneut anmelden.',401);
            $old=$_POST['current_password']??null;
            if(!rateLimit('password-change',fn()=>is_string($old)&&strlen($old)<=72&&password_verify($old,$config['password_hash'])))abortPortal('Das bisherige Passwort stimmt nicht.',403);
            $password=portalPassword($_POST['password']??null,$_POST['repeat']??null);
            $fresh=$config;$fresh['password_hash']=password_hash($password,PASSWORD_DEFAULT);$fresh['password_changed_at']=gmdate(DATE_ATOM);
            savePrivateConfig($GLOBALS['drive_connect_config_path'],$fresh);$config=$fresh;
            unset($_SESSION['authenticated_at'],$_SESSION['password_fingerprint'],$_SESSION['drive_connect_started']);
            session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));
            header('Location: ../?vorbereiten=1&passwort=geaendert',true,303);exit;
        }finally{releasePortal($lock);}
    }
}catch(PortalError $e){http_response_code($e->status);$error=$e->getMessage();if($e->status===401)$owner=false;}
catch(Throwable){http_response_code(503);$error='Das Passwort konnte momentan nicht geändert werden. Bitte erneut versuchen.';}
header('Content-Type: text/html; charset=utf-8');
$h=static fn($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
?><!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>Passwort ändern · Sichtwerk – Neubauer</title><link rel="stylesheet" href="../style.css?v=20261107-passwort-1"></head><body><header class="brand"><a href="../?vorbereiten=1"><span class="brandmark" aria-hidden="true">S</span><span>SICHTWERK <b>NEUBAUER</b><small>Angebotsverwaltung</small></span></a></header><main><section class="card"><p class="eyebrow">Nur für Sichtwerk</p><h1>Passwort ändern</h1>
<?php if($error): ?><p role="alert" class="notice"><?=$h($error)?></p><?php endif; ?>
<?php if($owner): ?><p>Hier legst du ein neues Passwort für deine Angebotsverwaltung fest.</p><form method="post" action="password.php"><input type="hidden" name="csrf" value="<?=$h($csrf)?>"><label for="current-password">Bisheriges Passwort</label><input id="current-password" name="current_password" type="password" autocomplete="current-password" maxlength="72" required><label for="new-password">Neues Passwort</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="72" required aria-describedby="password-hint"><label for="repeat-password">Neues Passwort wiederholen</label><input id="repeat-password" name="repeat" type="password" autocomplete="new-password" minlength="10" maxlength="72" required><p class="hint" id="password-hint">Mindestens 10 Zeichen. Bewahre dein neues Passwort in deinem Passwortmanager auf.</p><p class="notice">Nach dem Speichern meldest du dich mit dem neuen Passwort erneut an. Andere Verwaltungsanmeldungen werden beendet.</p><button type="submit" class="primary wide">Neues Passwort speichern</button></form><?php endif; ?>
<p><a class="secondary wide" href="../?vorbereiten=1">Zur Angebotsverwaltung</a></p></section></main></body></html>
