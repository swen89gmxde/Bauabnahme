<?php
// Synthetic Google HTTP responses. Never copied to production.
function syntheticDrive(string $method,string $url,array $headers,?string $body): array {
    global $config;
    $path=dirname($config['data_dir']).'/drive-mock.json';$s=readJson($path);
    $reply=static function(int $status,array|string $value)use($path,&$s):array{saveJson($path,$s);return ['status'=>$status,'body'=>is_array($value)?json_encode($value):$value];};
    if(str_contains($url,'oauth2.googleapis.com'))return $reply(200,['access_token'=>'synthetic-token']);
    parse_str(parse_url($url,PHP_URL_QUERY)??'',$q);
    if(str_contains($url,'generateIds')){$s['next']=($s['next']??0)+1;return $reply(200,['ids'=>['synthetic_drive_id_'.str_pad((string)$s['next'],10,'0',STR_PAD_LEFT)]]);}
    if($method==='POST'&&str_contains($url,'uploadType=resumable')){
        $meta=json_decode($body??'',true);$id=$meta['id'];if(isset($s['files'][$id]))return $reply(409,[]);
        $s['sessions'][$id]=$meta;saveJson($path,$s);return ['status'=>200,'body'=>'','headers'=>['location'=>'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id='.$id]];
    }
    if($method==='PUT'&&isset($q['upload_id'])){
        if(!empty($s['fail_upload']))return $reply(503,['error'=>'synthetic unavailable']);
        $id=$q['upload_id'];$meta=$s['sessions'][$id];$bytes=$body??'';
        if(isset($s['files'][$id]))return $reply(409,['error'=>'already exists']);
        $s['uploads']=($s['uploads']??0)+1;$s['files'][$id]=$meta+['size'=>(string)strlen($bytes),'sha256Checksum'=>hash('sha256',$bytes),'trashed'=>false,'shared'=>false];
        if(!empty($s['timeout_after_upload'])){$s['timeout_after_upload']=false;saveJson($path,$s);throw new RuntimeException('drive_connection');}
        return $reply(200,['id'=>$id]);
    }
    if($method==='POST'&&preg_match('~/drive/v3/files\?~',$url)){$m=json_decode($body??'',true);if(isset($s['files'][$m['id']]))return $reply(409,[]);$s['files'][$m['id']]=$m+['shared'=>false,'trashed'=>false];return $reply(200,['id'=>$m['id']]);}
    if($method==='GET'&&preg_match('~/files/([A-Za-z0-9_-]+)~',$url,$m)){
        if($m[1]===$config['drive_archive']['folder_id'])return $reply(200,['id'=>$m[1],'mimeType'=>'application/vnd.google-apps.folder','trashed'=>false,'shared'=>!empty($s['shared_root']),'capabilities'=>['canAddChildren'=>true]]);
        $f=$s['files'][$m[1]]??null;if(!$f)return $reply(404,[]);
        if(!empty($s['wrong_checksum'])&&isset($f['size']))$f['sha256Checksum']=str_repeat('0',64);
        if(!empty($s['wrong_parent'])&&isset($f['size']))$f['parents']=['wrong_parent_12345'];
        if(!empty($s['missing_file'])&&isset($f['size']))return $reply(404,[]);
        return $reply(200,$f);
    }
    throw new RuntimeException('unexpected_mock_request');
}
