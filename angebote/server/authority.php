<?php
declare(strict_types=1);
function authorityDefinition(string $principal,bool $business=false): array {
    if($business)return ['version'=>2,'principal_name'=>$principal,'roles'=>['business_authorized'=>'Ich bin als Inhaber oder vertretungsberechtigte Person befugt, das Angebot für den genannten Geschäftskunden anzunehmen.'],'notice'=>'Der im Angebot genannte Geschäftskunde ist Auftraggeber. Der Auftrag wird in Ausübung seiner gewerblichen oder selbständigen beruflichen Tätigkeit erteilt. Erforderliche Eigentümerzustimmungen und Vertretungsnachweise sind vor Herstellerbestellung beziehungsweise Ausführung vorzulegen. Die Erklärung ersetzt keinen erforderlichen Nachweis und begründet keine persönliche Bürgschaft der unterzeichnenden Person.','confirmation'=>'Ich bestätige die geschäftliche Beauftragung und meine Befugnis zur Annahme für den genannten Auftraggeber.'];
    return ['version'=>1,'principal_name'=>$principal,'roles'=>['sole_owner'=>'Im eigenen Namen als Alleineigentümer.','co_owner'=>'Im eigenen Namen bei Miteigentum.','non_owner'=>'Im eigenen Namen ohne Eigentümerstellung.','representative'=>'Als bevollmächtigter Vertreter des im Angebot genannten Auftraggebers.'],'notice'=>'Erforderliche Eigentümerzustimmungen und Vertretungsnachweise sind vor Herstellerbestellung beziehungsweise Ausführung vorzulegen. Wer im eigenen Namen beauftragt, bleibt Vertragspartner und Zahlungsschuldner. Bei wirksamer Vertretung wird der im Angebot genannte Vertretene Vertragspartner. Diese Auswahl ersetzt keinen erforderlichen Zustimmungs- oder Vollmachtsnachweis.','confirmation'=>'Ich bestätige meine gewählte Erklärung zu Eigentum und Beauftragung.'];
}
function requireAuthority(array $r,array $meta): ?array {
    if(empty($r['authority']))return null;
    $d=$r['authority'];$a=$meta['authority']??null;$role=is_array($a)?($a['role']??null):null;
    if(!is_array($a)||array_diff(array_keys($a),['version','role','principal_name','accepted'])||($a['version']??null)!==$d['version']||($a['accepted']??null)!==true||!is_string($role)||!isset($d['roles'][$role])||($a['principal_name']??null)!==$d['principal_name'])abortPortal('Bitte genau eine Erklärung zu Eigentum und Beauftragung wählen und bestätigen.',400,'authority_required');
    return ['version'=>$d['version'],'role'=>$role,'role_text'=>$d['roles'][$role],'principal_name'=>$d['principal_name'],'signer_name'=>cleanText($meta['name']??'',100),'date'=>(string)($meta['date']??''),'notice'=>$d['notice'],'confirmation'=>$d['confirmation'],'accepted'=>true];
}
function authoritySummaryText(array $r): string {
    $a=$r['completion']['authority']??null;if(!$a)return '';
    return "\nEigentum und Beauftragung:\n".$a['role_text']."\nAuftraggeber laut Angebot: ".$a['principal_name']."\nUnterzeichner: ".$a['signer_name']."\nDatum: ".$a['date']."\n".$a['notice']."\n".$a['confirmation']."\n";
}
