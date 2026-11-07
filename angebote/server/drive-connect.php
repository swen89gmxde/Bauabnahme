<?php
declare(strict_types=1);
require __DIR__.'/drive-connect-store.php';
header('Cache-Control: no-store, private, max-age=0');header('Referrer-Policy: same-origin');header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$error='';$owner=false;$stored=false;$verified=false;$email='';$redirect='';$csrf='';$folder='';$authURL='';
try{
    driveConnectLoad();driveConnectOwner();$owner=true;$csrf=$_SESSION['csrf'];$redirect=driveConnectRedirect();
    if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
        $lock=driveConnectLock();
        try{
            if(!portalOwnerAuthenticated())abortPortal('Bitte zuerst in der Angebotsverwaltung anmelden.',401);
            $action=$_POST['action']??'';
            if($action==='import')driveConnectImport($_FILES['credentials']??[],$_POST['google_email']??null);
            elseif($action==='authorize')$authURL=driveConnectStart();
            elseif($action==='folder')driveConnectFolder();
            else abortPortal('Diese Aktion ist nicht verfügbar.',405);
        }finally{releasePortal($lock);}
        if($authURL===''){header('Location: drive-connect.php',true,303);exit;}
    }
}catch(PortalError $e){http_response_code($e->status);$error=$e->getMessage();}
catch(Throwable){http_response_code(503);$error='Die Google-Verbindung konnte gerade nicht fertiggestellt werden. Bitte später erneut versuchen.';}
if($owner){$d=$config['drive_archive']??[];$stored=!empty($d['client_id']);$verified=($d['connection_verified']??false)===true;$email=$d['account_email']??'';$folder=$d['folder_id']??'';}
$h=static fn($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><title>Google Drive verbinden · Sichtwerk – Neubauer</title><link rel="stylesheet" href="../style.css?v=20261107-drive-1"></head><body><header class="brand"><span>SICHTWERK – NEUBAUER</span></header><main><section class="card"><p class="eyebrow">Einrichtung · nur für Sichtwerk</p><h1>Google Drive verbinden</h1>
<?php if($error): ?><p role="alert" class="notice"><?=$h($error)?></p><?php endif; ?>
<?php if($owner): ?>
<p>Hier verbindest du die private Angebotsablage mit deinem Google-Konto. Die Kundenfreigaben bleiben bis zum vollständigen Einrichtungstest gesperrt.</p><p class="hint">Bitte vor dem Verbinden die <a href="../datenschutz.html">Datenschutzhinweise zum Angebotsportal und zum Google-Zugriff</a> lesen. Für Kundenunterlagen müssen auch der eingesetzte Google-Vertrag und die erforderlichen Datenschutzvereinbarungen geklärt sein.</p>
<?php if($verified): ?><h2>Google-Verbindung bestätigt</h2><p id="drive-account">Google-Konto: <?=$h($email)?></p><p>Der private Archivordner wurde erstellt und zurückgeprüft. Ein vollständiger Testabschluss steht noch aus.</p><a class="secondary wide" href="https://drive.google.com/drive/folders/<?=$h($folder)?>" target="_blank" rel="noopener noreferrer">Archivordner in Google Drive öffnen</a><p class="hint">Den Ordner „Angebotsarchiv Sichtwerk“ kannst du in Drive in deinen privaten Ordner „01 Sichtwerk“ verschieben. Seine Verbindung zum Portal bleibt dabei erhalten. Danach den Ordnerzugriff im Gesamttest erneut prüfen.</p>
<?php elseif(!empty($d['refresh_token'])): ?><h2>Google-Freigabe hinterlegt</h2><p>Der Archivordner muss noch fertig erstellt und geprüft werden. Ein erneuter Versuch verwendet dieselbe Ordnerkennung.</p><form method="post" action="drive-connect.php"><input type="hidden" name="csrf" value="<?=$h($csrf)?>"><input type="hidden" name="action" value="folder"><button class="primary wide">Archivordner fertig einrichten</button></form>
<?php else: ?>
<h2>1. Google-Zugang vorbereiten</h2><p>In deinem Google-Projekt unter „Clients“ einen OAuth-Client vom Typ „Webanwendung“ anlegen. Als autorisierte Weiterleitungs-URI genau diese Adresse verwenden:</p><label for="drive-redirect-uri">Autorisierte Weiterleitungs-URI</label><input id="drive-redirect-uri" readonly value="<?=$h($redirect)?>">
<p>Die Google-JSON-Datei anschließend hier auswählen. Sie wird direkt über HTTPS in der privaten STRATO-Konfiguration gespeichert. Die Datei gehört nicht in diesen Chat.</p>
<form method="post" action="drive-connect.php" enctype="multipart/form-data"><input type="hidden" name="csrf" value="<?=$h($csrf)?>"><input type="hidden" name="action" value="import"><label for="google-email">Google-Konto für dein Archiv</label><input id="google-email" name="google_email" type="email" autocomplete="email" value="<?=$h($email)?>" required><label for="google-credentials">Google-JSON-Datei auswählen</label><input id="google-credentials" name="credentials" type="file" accept=".json,application/json" required><button class="secondary wide">Google-Zugang privat hinterlegen</button></form>
<?php if($stored): ?><h2>2. Bei Google freigeben</h2><p>Google-Zugang hinterlegt für <?=$h($email)?>. Erlaubt wird ausschließlich der Zugriff auf Dateien, die diese Anwendung erstellt oder die du für sie auswählst.</p><p class="notice">Vor dem dauerhaften Archivbetrieb muss dein Google-Projekt für den Produktivbetrieb eingerichtet sein. Eine externe App im Google-Testmodus erhält für Drive einen nach sieben Tagen ablaufenden Zugang.</p><?php if($authURL): ?><p>Die Google-Freigabe ist für zehn Minuten vorbereitet. Melde dich mit dem oben genannten Google-Konto an.</p><a class="primary wide" id="google-authorization" href="<?=$h($authURL)?>" rel="noreferrer">Google-Freigabe öffnen</a><?php else: ?><form method="post" action="drive-connect.php"><input type="hidden" name="csrf" value="<?=$h($csrf)?>"><input type="hidden" name="action" value="authorize"><button class="primary wide">Google-Freigabe vorbereiten</button></form><?php endif;endif; ?>
<?php endif;endif; ?>
<p><a class="secondary wide" href="../?vorbereiten=1">Zur Angebotsverwaltung</a></p></section></main></body></html>
