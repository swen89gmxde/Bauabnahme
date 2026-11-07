<?php
// Synthetic mail only: never deploy this file or copy it into a real config.
function syntheticNotification(array $message): bool {
    global $config;
    $path=dirname($config['data_dir']).'/mail-mock.json';$s=readJson($path);
    $s['messages'][]=$message;saveJson($path,$s);
    if(($s['mode']??'')==='throw')throw new RuntimeException('synthetic_uncertain');
    return ($s['mode']??'')!=='reject';
}
