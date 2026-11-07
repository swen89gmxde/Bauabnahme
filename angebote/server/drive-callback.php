<?php
declare(strict_types=1);
require __DIR__.'/drive-connect-store.php';
header('Cache-Control: no-store, private, max-age=0');header('Referrer-Policy: no-referrer');header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
$ok=false;$message='';
try{driveConnectLoad();driveConnectCallback();$ok=true;$message='Deine Google-Freigabe und der private Archivordner sind bestätigt. Kundenfreigaben bleiben bis zum vollständigen Einrichtungstest gesperrt.';}
catch(PortalError $e){http_response_code($e->status);$message=$e->getMessage();}
catch(Throwable){http_response_code(503);$message='Die Google-Verbindung konnte gerade nicht fertiggestellt werden. Öffne die Verbindungsseite erneut. Eine bereits erhaltene Freigabe bleibt privat gespeichert.';}
$h=static fn($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Google-Freigabe · Sichtwerk – Neubauer</title><link rel="stylesheet" href="../style.css?v=20261107-drive-1"></head><body><header class="brand"><span>SICHTWERK – NEUBAUER</span></header><main><section class="card"><p class="eyebrow">Einrichtung · nur für Sichtwerk</p><h1><?=$ok?'Google Drive verbunden':'Google-Verbindung prüfen'?></h1><p role="status"><?=$h($message)?></p><a class="primary wide" href="drive-connect.php">Zur privaten Verbindungsseite</a><p><a href="../?vorbereiten=1">Zur Angebotsverwaltung</a></p></section></main></body></html>
