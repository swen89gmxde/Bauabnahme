<?php
// Synthetic Google service for isolated tests only. Never deploy this file.
function syntheticConnectHTTP(string $method,string $url,array $headers,?string $body): array {
    $root=dirname($GLOBALS['drive_connect_config_path']);$path=$root.'/google-mock.json';$s=readJson($path);
    $s['calls'][]=[$method,$url];$status=200;$out=[];$mode=$s['mode']??'';
    if($url==='https://oauth2.googleapis.com/token'){
        parse_str($body??'',$params);
        if(($params['grant_type']??'')==='authorization_code'){
            $s['exchanges']=($s['exchanges']??0)+1;$s['verifier']=$params['code_verifier']??'';
            $out=['access_token'=>'synthetic-access','refresh_token'=>'synthetic-refresh','scope'=>$mode==='broad'?'https://www.googleapis.com/auth/drive':DRIVE_CONNECT_SCOPE];
            if($mode==='missing-refresh')unset($out['refresh_token']);
            if($mode==='failure'){$status=401;$out=['error'=>'PRIVATE_REMOTE_ERROR_DO_NOT_ECHO'];}
        }else $out=['access_token'=>'synthetic-access'];
    }elseif(str_contains($url,'/about?'))$out=['user'=>['emailAddress'=>$mode==='wrong-account'?'other@example.test':'owner@example.test']];
    elseif(str_contains($url,'/files/generateIds?')){$s['reserved']=($s['reserved']??0)+1;$out=['ids'=>['synthetic_archive_root_001']];}
    elseif($method==='POST'&&$url==='https://www.googleapis.com/drive/v3/files'){
        if(!in_array('Content-Type: application/json',$headers,true))throw new RuntimeException('mock_missing_json_header');
        $s['created']=($s['created']??0)+1;
        if($mode==='folder-failure'&&$s['created']===1){$status=503;$out=['error'=>'synthetic'];}
        else{$s['folder']=json_decode($body??'',true);$status=201;$out=$s['folder'];}
    }elseif(str_contains($url,'/files/synthetic_archive_root_001?')){
        if(empty($s['folder']))$status=404;
        else $out=$s['folder']+['trashed'=>false,'shared'=>$mode==='shared','capabilities'=>['canAddChildren'=>true]];
    }else throw new RuntimeException('mock_unexpected_request');
    saveJson($path,$s);return ['status'=>$status,'body'=>json_encode($out,JSON_THROW_ON_ERROR),'headers'=>[]];
}
