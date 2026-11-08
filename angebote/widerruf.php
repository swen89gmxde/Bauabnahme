<?php
declare(strict_types=1);
require __DIR__.'/server/store.php';
header('Cache-Control: no-store, private, max-age=0');header('Referrer-Policy: same-origin');header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');header("Content-Security-Policy: default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$h=static fn($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');$error='';$preview=null;$receipt=null;$available=false;
try{
    $web=realpath($_SERVER['DOCUMENT_ROOT']??'')?:'';$path=getenv('SICHTWERK_SIGN_CONFIG')?:dirname($web).'/sichtwerk-signieren-private/config.php';$cr=realpath($path);
    if(!$web||!$cr||str_starts_with($cr,rtrim($web,'/').'/'))abortPortal('Die Widerrufsfunktion ist derzeit nicht verfügbar. Bitte nutzen Sie E-Mail oder Post.',503);
    $config=require $cr;$dataDir=realpath($config['data_dir']??'');if(!$dataDir||str_starts_with($dataDir.'/',rtrim($web,'/').'/'))abortPortal('Die geschützte Ablage ist nicht verfügbar.',503);
    $origin=rtrim($config['origin']??'','/');$localTest=getenv('SICHTWERK_TEST_HTTP')==='1'&&in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true);
    if(!$localTest&&((empty($_SERVER['HTTPS'])||$_SERVER['HTTPS']==='off')||!str_starts_with($origin,'https://')))abortPortal('Bitte die sichere HTTPS-Adresse verwenden.',400);
    umask(0077);directory($dataDir.'/withdrawal-sessions');session_save_path($dataDir.'/withdrawal-sessions');session_name('sichtwerk_widerruf');session_set_cookie_params(['lifetime'=>0,'path'=>rtrim(dirname($_SERVER['SCRIPT_NAME']),'/').'/','secure'=>!$localTest,'httponly'=>true,'samesite'=>'Strict']);ini_set('session.use_strict_mode','1');session_start();
    $_SESSION['csrf']??=bin2hex(random_bytes(32));$_SESSION['request']??=bin2hex(random_bytes(16));$available=true;
    if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
        if(($_SERVER['HTTP_ORIGIN']??'')!==$origin||!hash_equals($_SESSION['csrf'],(string)($_POST['csrf']??'')))abortPortal('Bitte die Widerrufsfunktion neu öffnen und erneut versuchen.',403);
        $action=$_POST['action']??'';
        if($action==='new'){unset($_SESSION['preview'],$_SESSION['receipt']);$_SESSION['request']=bin2hex(random_bytes(16));}
        elseif($action==='preview'){if(!empty($_SESSION['receipt']))abortPortal('Bitte zunächst eine neue Erklärung beginnen.',409);$_SESSION['preview']=validateWithdrawal($_POST);$preview=$_SESSION['preview'];}
        elseif($action==='send'){
            if(!hash_equals($_SESSION['request'],(string)($_POST['request']??'')))abortPortal('Bitte die Angaben erneut prüfen.',409);
            if(!empty($_SESSION['receipt']))$receipt=readJson(withdrawalPath($_SESSION['receipt']));
            elseif(!empty($_SESSION['preview']))$receipt=acceptWithdrawal($_SESSION['preview'],$_SESSION['request']);
            else abortPortal('Bitte die Angaben erneut prüfen.',409);$_SESSION['receipt']=$receipt['id'];unset($_SESSION['preview']);
        }elseif($action==='edit'){$preview=null;}
        else abortPortal('Diese Aktion ist nicht verfügbar.',405);
    }elseif(($_SERVER['REQUEST_METHOD']??'GET')!=='GET')abortPortal('Diese Aktion ist nicht verfügbar.',405);
    if(!$preview&&!$receipt&&isset($_SESSION['receipt']))$receipt=readJson(withdrawalPath($_SESSION['receipt']));
    if($receipt&&isset($_GET['bestaetigung'])){header('Content-Type: text/plain; charset=UTF-8');header('Content-Disposition: attachment; filename="Widerruf_Eingangsbestatigung.txt"');echo withdrawalBody($receipt);exit;}
}catch(PortalError $e){http_response_code($e->status);$error=$e->getMessage();}catch(Throwable){http_response_code(503);$error='Die Funktion ist momentan nicht verfügbar. Bitte nutzen Sie E-Mail oder Post.';}
?><!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vertrag widerrufen | Sichtwerk - Neubauer</title><link rel="stylesheet" href="style.css?v=20261108-vertrag-1"></head><body>
<header class="brand"><a href="./"><span class="brandmark">S</span><span>SICHTWERK <b>NEUBAUER</b><small>Vertrag widerrufen</small></span></a></header><main><section class="card">
<p class="eyebrow">Unabhängig vom Angebotslink</p><h1>Vertrag widerrufen</h1><p>Hier können Sie eine Widerrufserklärung übermitteln. Ein Angebotslink, Kundencode oder eine Anmeldung sind dafür nicht erforderlich. Ob ein gesetzliches Widerrufsrecht besteht, richtet sich nach Ihrem Vertrag und der Abschlusssituation. Andere zulässige Widerrufswege bleiben bestehen.</p>
<?php if($error):?><p class="notice" role="alert"><?=$h($error)?></p><?php endif;?>
<?php if($receipt):?><h2>Ihre Erklärung ist eingegangen</h2><p>Empfangen am <?=$h($receipt['received_at'])?>. Kennung: <?=$h($receipt['id'])?>.</p><pre class="receipt-text"><?=$h(withdrawalBody($receipt))?></pre>
<p><?=($receipt['mail']['customer']['state']??'')==='submitted'?'Die Eingangsbestätigung wurde an den E-Mail-Dienst übergeben. Bitte prüfen Sie Ihr Postfach einschließlich Spam.':'Ihre Erklärung ist gespeichert. Die E-Mail-Bestätigung ist noch ausstehend oder ihr Versandstatus ist unklar; bitte speichern Sie die Bestätigung hier und kontaktieren Sie uns bei ausbleibender E-Mail.'?></p><a class="primary wide" href="?bestaetigung=1">Eingangsbestätigung speichern</a><form method="post"><input type="hidden" name="csrf" value="<?=$h($_SESSION['csrf'])?>"><button class="secondary wide" name="action" value="new">Neue Erklärung erfassen</button></form>
<?php elseif($available):?>
<?php if($preview):?><h2>Bitte Angaben prüfen</h2><p>Mit der folgenden Schaltfläche übermitteln Sie diese Erklärung:</p><p><b>Hiermit widerrufe ich den nachfolgend bezeichneten Vertrag beziehungsweise Vertragsteil.</b></p><dl><dt>Name</dt><dd><?=$h($preview['name'])?></dd><dt>Vertrag / Vertragsteil</dt><dd><?=$h($preview['contract'])?></dd><dt>E-Mail für die Eingangsbestätigung</dt><dd><?=$h($preview['email'])?></dd></dl>
<form method="post"><input type="hidden" name="csrf" value="<?=$h($_SESSION['csrf'])?>"><input type="hidden" name="request" value="<?=$h($_SESSION['request'])?>"><button class="primary wide" name="action" value="send">Widerruf bestätigen</button><button class="secondary wide" name="action" value="edit">Angaben korrigieren</button></form>
<?php else:$v=$_SESSION['preview']??[];?><form method="post"><input type="hidden" name="csrf" value="<?=$h($_SESSION['csrf'])?>"><input type="hidden" name="action" value="preview"><label for="withdraw-name">Ihr Name</label><input id="withdraw-name" name="name" autocomplete="name" maxlength="150" required value="<?=$h($v['name']??'')?>"><label for="withdraw-contract">Vertrag oder Vertragsteil</label><textarea id="withdraw-contract" name="contract" maxlength="500" rows="4" required placeholder="Zum Beispiel Angebotsnummer, Auftragsdatum und die betroffene Leistung"><?=$h($v['contract']??'')?></textarea><label for="withdraw-email">E-Mail für die Eingangsbestätigung</label><input id="withdraw-email" name="email" type="email" autocomplete="email" maxlength="254" required value="<?=$h($v['email']??'')?>"><p class="hint">Die Angaben werden zur Entgegennahme und Bearbeitung Ihrer Erklärung sowie für die Eingangsbestätigung verwendet. <a href="datenschutz.html">Datenschutzhinweise</a></p><button class="primary wide">Weiter zur Prüfung</button></form><?php endif;?>
<?php endif;?>
<p>Sie erreichen uns auch unter <a href="mailto:sichtwerk.neubauer@gmx.de">sichtwerk.neubauer@gmx.de</a> oder postalisch: Swen Neubauer, Sichtwerk - Neubauer, Winterberg 2, 96361 Steinbach am Wald.</p></section></main><footer><a href="https://www.sichtwerk-neubauer.de/impressum.html">Impressum</a> · <a href="datenschutz.html">Datenschutz des Angebotsportals</a></footer></body></html>
