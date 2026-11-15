<?php
declare(strict_types=1);

function orderStatusEligible(array $record): bool {
    return ($record['state'] ?? '') === 'completed'
        && ($record['archive']['state'] ?? '') === 'verified'
        && archiveProvider($record) === 'strato'
        && empty($record['archive_test']);
}

function orderStatusCurrent(array $record): bool {
    global $dataDir;
    if (!orderStatusEligible($record) || !empty($record['access_revoked'])) return false;
    $scope = readJson($dataDir.'/scopes/'.$record['scope'].'.json');
    return ($scope['active_id'] ?? '') === $record['id'];
}

function orderStatusDirectory(string $id): string {
    $folder = recordPath($id).'/order-status';
    if (is_link($folder)) abortPortal('Die geschützte Statusablage ist nicht verfügbar.', 503);
    return $folder;
}

function loadOrderStatus(string $id): array {
    $path = orderStatusDirectory($id).'/status.json';
    if (is_link($path)) abortPortal('Die geschützte Statusablage ist nicht verfügbar.', 503);
    $status = readJson($path);
    if (!$status && is_file($path)) abortPortal('Der Auftragsstatus kann nicht gelesen werden.', 503);
    return $status;
}

function saveOrderStatus(string $id, array $status): void {
    $dir = orderStatusDirectory($id);
    directory($dir);
    saveJson($dir.'/status.json', $status);
}

function saveOrderStatusChange(string $id, array $status): array {
    $status['revision']++;
    $status['updated_at'] = gmdate(DATE_ATOM);
    saveOrderStatus($id, $status);
    return $status;
}

function emptyOrderSchedule(): array {
    return [
        'advance_received' => false,
        'ordered_on' => '',
        'delivery_week' => '',
        'delivery_date' => '',
        'installation_date' => '',
        'installation_time' => '',
    ];
}

// Only called with the same scope and record locks that protect the archive.
function initializeOrderStatus(array $record): array {
    $id = $record['id'];
    $status = loadOrderStatus($id);
    if ($status || !orderStatusCurrent($record)) return $status;
    $status = [
        'customer_secret' => bin2hex(random_bytes(32)),
        'insurer_secret' => '',
        'schedule' => emptyOrderSchedule(),
        'files' => [],
        'revision' => 1,
        'created_at' => gmdate(DATE_ATOM),
        'updated_at' => gmdate(DATE_ATOM),
    ];
    saveOrderStatus($id, $status);
    return $status;
}

function orderStatusAfterArchive(array $record): void {
    if (!orderStatusEligible($record)) return;
    try {
        initializeOrderStatus($record);
    } catch (Throwable) {
        error_log('Sichtwerk portal: Auftragsstatus konnte nach Archivierung nicht angelegt werden.');
        // The owner can initialize the status later without repeating the signature.
    }
}

function orderStatusVisibleToOwner(array $record): bool {
    if (!orderStatusEligible($record)) return false;
    return orderStatusCurrent($record) || is_file(recordPath($record['id']).'/order-status/status.json');
}

function orderStatusHasInsurer(array $record): bool {
    return !empty($record['insurance']['receipt']);
}

function orderStatusFiles(array $status, ?string $audience = null): array {
    $files = [];
    foreach ($status['files'] ?? [] as $file) {
        if ($audience !== null && $file['audience'] !== $audience) continue;
        $files[] = array_intersect_key($file, array_flip(['id','name','kind','audience','uploaded_at','due_date']));
    }
    return array_reverse($files);
}

function ownerOrderStatusView(array $record, array $status): array {
    $closed = !empty($status['closed_at']);
    $active = !$closed && orderStatusCurrent($record);
    $tokens = [];
    if ($active) {
        $tokens['customer'] = $record['id'].'.'.$status['customer_secret'];
        if (!empty($status['insurer_secret'])) {
            $tokens['insurer'] = $record['id'].'.'.$status['insurer_secret'];
        }
    }
    return [
        'active' => $active,
        'closed' => $closed,
        'cleanup_pending' => ($status['cleanup_pending'] ?? false) === true,
        'tokens' => $tokens,
        'schedule' => $status['schedule'] ?? emptyOrderSchedule(),
        'files' => orderStatusFiles($status),
        'revision' => $status['revision'] ?? 0,
        'insurance' => orderStatusHasInsurer($record),
        'claim_number' => $record['insurance']['receipt']['claim_number'] ?? '',
        'customer_name' => $record['customer_name'],
        'updated_at' => $status['updated_at'] ?? null,
    ];
}

function parseOrderDate(mixed $date): string {
    if ($date === '') return '';
    if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date)) {
        abortPortal('Bitte ein gültiges Datum angeben.');
    }
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    if (!$parsed || $parsed->format('Y-m-d') !== $date || substr($date, 0, 4) === '0000') {
        abortPortal('Bitte ein gültiges Datum angeben.');
    }
    return $date;
}

function parseOrderSchedule(array $input, bool $insurance): array {
    $week = $input['delivery_week'] ?? '';
    if ($week !== '') {
        if (!is_string($week) || !preg_match('/^([1-9]\d{3})-W(0[1-9]|[1-4]\d|5[0-3])$/D', $week, $parts)) {
            abortPortal('Bitte eine gültige Lieferwoche mit Jahr angeben.');
        }
        if ((new DateTimeImmutable())->setISODate((int)$parts[1], (int)$parts[2])->format('o-\WW') !== $week) {
            abortPortal('Diese Kalenderwoche gibt es in diesem Jahr nicht.');
        }
    }
    $installation = parseOrderDate($input['installation_date'] ?? '');
    $time = $input['installation_time'] ?? '';
    if ($time !== '' && (!$installation || !is_string($time) || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/D', $time))) {
        abortPortal('Bitte eine gültige Montageuhrzeit mit Datum angeben.');
    }
    return [
        'advance_received' => !$insurance && ($input['advance_received'] ?? false) === true,
        'ordered_on' => parseOrderDate($input['ordered_on'] ?? ''),
        'delivery_week' => $week,
        'delivery_date' => parseOrderDate($input['delivery_date'] ?? ''),
        'installation_date' => $installation,
        'installation_time' => $time,
    ];
}

function checkOrderInvoice(array $upload): array {
    $name = cleanText(basename(str_replace('\\', '/', (string)($upload['name'] ?? ''))), 180);
    if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== 'xml') return checkUpload($upload, true);
    if (($upload['error'] ?? -1) !== UPLOAD_ERR_OK || !is_uploaded_file($upload['tmp_name'] ?? '')) {
        abortPortal('Die E-Rechnung konnte nicht hochgeladen werden.');
    }
    $tmp = $upload['tmp_name'];
    $size = filesize($tmp);
    if (!$size || $size > 20 * 1024 * 1024) abortPortal('Eine Rechnung darf höchstens 20 MB groß sein.');
    if (!class_exists('DOMDocument')) abortPortal('XML-Rechnungen benötigen die XML-Erweiterung des Webspaces.', 503);
    $doc = new DOMDocument();
    $valid = $doc->load($tmp, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    $root = $doc->documentElement;
    $invoiceRoots = [
        'Invoice' => 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
        'CreditNote' => 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
        'CrossIndustryInvoice' => 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
    ];
    if (!$valid || $doc->doctype || !$root || ($invoiceRoots[$root->localName] ?? null) !== $root->namespaceURI
        || !isset($invoiceRoots[$root->localName])) {
        abortPortal('Bitte die Originaldatei einer XML-E-Rechnung oder eine PDF hochladen.');
    }
    return ['name'=>$name,'mime'=>'application/xml','size'=>$size,'sha256'=>hash_file('sha256',$tmp),'tmp'=>$tmp];
}

function orderStatusInvoicePath(string $id, string $fileId): string {
    if (!preg_match('/^[a-f0-9]{32}$/D', $fileId)) abortPortal('Diese Rechnung ist nicht verfügbar.', 404);
    $dir = orderStatusDirectory($id).'/files';
    if (is_link($dir)) abortPortal('Die geschützte Rechnungsablage ist nicht verfügbar.', 503);
    return $dir.'/'.$fileId;
}

function addOrderStatusInvoice(array $record, array $status, array $input, array $upload): array {
    $insurance = orderStatusHasInsurer($record);
    $audience = $input['audience'] ?? '';
    $kind = $input['kind'] ?? '';
    if (!in_array($audience, ['customer','insurer'], true) || ($audience === 'insurer' && !$insurance)) {
        abortPortal('Bitte den Empfänger dieser Rechnung auswählen.');
    }
    if (!in_array($kind, ['advance','interim','invoice','final'], true) || ($insurance && $kind === 'advance')) {
        abortPortal('Bitte eine zum Auftrag passende Rechnungsart auswählen.');
    }
    $dueDate = parseOrderDate($input['due_date'] ?? '');
    $file = checkOrderInvoice($upload);
    $total = $file['size'];
    foreach ($status['files'] as $index => $existing) {
        if ($existing['audience'] === $audience && $existing['kind'] === $kind && hash_equals($existing['sha256'], $file['sha256'])) {
            $previous = $existing['due_date'] ?? '';
            if ($dueDate !== '' && $previous !== $dueDate) {
                if ($previous !== '') abortPortal('Diese Rechnung ist schon bereitgestellt. Bitte die Fälligkeit bei der vorhandenen Datei ändern.', 409);
                $status['files'][$index]['due_date'] = $dueDate;
                return saveOrderStatusChange($record['id'], $status);
            }
            return $status;
        }
        $total += $existing['size'];
    }
    if ($total > 60 * 1024 * 1024 || count($status['files']) >= 12) {
        abortPortal('Bitte höchstens zwölf Rechnungsdateien mit insgesamt 60 MB pro Auftrag bereitstellen.');
    }
    $fileId = bin2hex(random_bytes(16));
    $path = orderStatusInvoicePath($record['id'], $fileId);
    directory(dirname($path));
    if (!move_uploaded_file($file['tmp'], $path)) abortPortal('Die Rechnung konnte nicht gespeichert werden.', 503);
    try {
        if (filesize($path) !== $file['size'] || !hash_equals($file['sha256'], hash_file('sha256', $path))) {
            abortPortal('Die gespeicherte Rechnung konnte nicht geprüft werden.', 503);
        }
        unset($file['tmp']);
        $status['files'][] = $file + ['id'=>$fileId,'audience'=>$audience,'kind'=>$kind,'uploaded_at'=>gmdate(DATE_ATOM),'due_date'=>$dueDate];
        if ($audience === 'insurer' && empty($status['insurer_secret'])) {
            $status['insurer_secret'] = bin2hex(random_bytes(32));
        }
        return saveOrderStatusChange($record['id'], $status);
    } catch (Throwable $error) {
        if (is_file($path)) unlink($path);
        throw $error;
    }
}

function updateOrderInvoiceDueDate(array $record, array $status, array $input): array {
    $fileId = $input['file_id'] ?? '';
    if (!is_string($fileId) || !preg_match('/^[a-f0-9]{32}$/D', $fileId)) {
        abortPortal('Diese Rechnung ist nicht verfügbar.', 404);
    }
    if (!array_key_exists('due_date', $input)) abortPortal('Bitte ein Fälligkeitsdatum angeben oder das Feld leeren.');
    $dueDate = parseOrderDate($input['due_date']);
    foreach ($status['files'] as $index => $file) {
        if ($file['id'] !== $fileId) continue;
        $previous = $file['due_date'] ?? '';
        if ($previous === $dueDate) return $status;
        if (($input['previous_due_date'] ?? null) !== $previous) {
            abortPortal('Die Fälligkeit wurde bereits geändert. Bitte den Auftragsstatus erneut öffnen.', 409);
        }
        $status['files'][$index]['due_date'] = $dueDate;
        return saveOrderStatusChange($record['id'], $status);
    }
    abortPortal('Diese Rechnung ist hier nicht verfügbar.', 404);
}

function closeOrderStatus(string $id, array $status, array $input): array {
    if (($input['confirmed'] ?? false) !== true) abortPortal('Bitte das Schließen bestätigen.');
    if (empty($status['closed_at'])) {
        // Revoke both links durably before deleting any file.
        $status = [
            'closed_at' => gmdate(DATE_ATOM),
            'cleanup_pending' => true,
            'revision' => ($status['revision'] ?? 0) + 1,
        ];
        saveOrderStatus($id, $status);
    }
    if (($status['cleanup_pending'] ?? false) === true) {
        try {
            removePrivateRecordTree(orderStatusDirectory($id).'/files');
            $finished = $status;
            $finished['cleanup_pending'] = false;
            saveOrderStatus($id, $finished);
            return $finished;
        } catch (Throwable) {
            error_log('Sichtwerk portal: Rechnungskopien aus geschlossenem Status konnten nicht vollständig entfernt werden.');
        }
    }
    return $status;
}

function handleOwnerOrderStatus(string $action, array $input, array $upload = []): array {
    $id = is_string($input['id'] ?? null) ? $input['id'] : '';
    $record = recordById($id);
    lockPortal('scope:'.$record['scope']);
    lockPortal('record:'.$id);
    $record = recordById($id);
    if (!orderStatusVisibleToOwner($record)) abortPortal('Der Auftragsstatus setzt eine bestätigte STRATO-Archivierung voraus.', 409);
    $status = initializeOrderStatus($record);
    if ($action === 'order-status-close') {
        return ownerOrderStatusView($record, closeOrderStatus($id, $status, $input));
    }
    if ($action === 'order-status-owner') return ownerOrderStatusView($record, $status);
    if (!orderStatusCurrent($record) || !empty($status['closed_at'])) {
        abortPortal('Dieser Auftragsstatus ist geschlossen.', 410);
    }
    if ($action === 'order-status-invoice') {
        return ownerOrderStatusView($record, addOrderStatusInvoice($record, $status, $input, $upload));
    }
    if ($action === 'order-status-invoice-due') {
        return ownerOrderStatusView($record, updateOrderInvoiceDueDate($record, $status, $input));
    }
    if (($input['revision'] ?? null) !== $status['revision']) {
        abortPortal('Der Stand wurde bereits geändert. Bitte den Auftragsstatus erneut öffnen.', 409);
    }
    if (!is_array($input['schedule'] ?? null)) abortPortal('Bitte gültige Terminangaben senden.');
    $schedule = parseOrderSchedule($input['schedule'], orderStatusHasInsurer($record));
    if ($status['schedule'] !== $schedule) {
        $status['schedule'] = $schedule;
        $status = saveOrderStatusChange($id, $status);
    }
    return ownerOrderStatusView($record, $status);
}

function orderStatusInvalid(): never {
    abortPortal('Dieser Statuslink ist geschlossen oder ungültig.', 410, 'status_link_closed');
}

function orderStatusAccess(string $token): array {
    if (!preg_match('/^([a-f0-9]{64})\.([a-f0-9]{64})$/D', $token, $parts)) orderStatusInvalid();
    [, $id, $secret] = $parts;
    $record = readJson(recordPath($id).'/record.json');
    if (!$record) orderStatusInvalid();
    lockPortal('scope:'.$record['scope'], LOCK_SH);
    lockPortal('record:'.$id, LOCK_SH);
    $record = readJson(recordPath($id).'/record.json');
    if (!$record || !orderStatusCurrent($record)) orderStatusInvalid();
    $status = loadOrderStatus($id);
    if (!$status || !empty($status['closed_at'])) orderStatusInvalid();
    if (hash_equals($status['customer_secret'], $secret)) return [$record, $status, 'customer'];
    if (!empty($status['insurer_secret']) && hash_equals($status['insurer_secret'], $secret)) {
        return [$record, $status, 'insurer'];
    }
    orderStatusInvalid();
}

function publicOrderStatus(array $record, array $status, string $audience): array {
    $view = ['audience'=>$audience,'files'=>orderStatusFiles($status, $audience)];
    if ($audience === 'insurer') {
        $view['claim_number'] = $record['insurance']['receipt']['claim_number'] ?? '';
    } else {
        $view['schedule'] = $status['schedule'];
    }
    return $view;
}

function orderStatusDownload(array $record, array $status, string $audience, string $requested): never {
    foreach ($status['files'] as $file) {
        if ($file['audience'] !== $audience || !hash_equals($file['id'], $requested)) continue;
        $path = orderStatusInvoicePath($record['id'], $file['id']);
        if (is_link($path) || !is_file($path) || filesize($path) !== $file['size']
            || !hash_equals($file['sha256'], hash_file('sha256', $path))) {
            abortPortal('Diese Rechnung konnte nicht geprüft werden.', 503);
        }
        downloadFile($path, $file['name'], $file['mime']);
    }
    abortPortal('Diese Rechnung ist hier nicht verfügbar.', 404);
}
