<?php
declare(strict_types=1);
// Invoke via the STRATO scheduled CLI job, never through a public URL.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/store.php';
$configFile=getenv('SICHTWERK_SIGN_CONFIG');
if(!$configFile||!is_file($configFile)){fwrite(STDERR,"Private Konfiguration über SICHTWERK_SIGN_CONFIG angeben.\n");exit(1);}
$config=require $configFile;$dataDir=realpath($config['data_dir']??'');
if(!$dataDir){fwrite(STDERR,"Private Datenablage fehlt.\n");exit(1);}
umask(0077);
echo json_encode(runArchiveQueue(),JSON_THROW_ON_ERROR)."\n";
