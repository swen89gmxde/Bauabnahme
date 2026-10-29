<?php
declare(strict_types=1);
// Customer PDFs, tokens and credentials must never be placed in the public repository.
header('Cache-Control: no-store, private, max-age=0');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
function reply(array $data, int $status = 200): never { http_response_code($status); header('Content-Type: application/json; charset=utf-8'); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); exit; }
function stop(string $message, int $status = 400): never { reply(['error' => $message], $status); }
function outside(string $path, string $root): bool { return $path !== $root && !str_starts_with($path . '/', rtrim($root, '/') . '/'); }
if (PHP_VERSION_ID < 80100) stop('Die Angebotsablage benötigt PHP 8.1 oder neuer.', 503);
$documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
$configPath = getenv('SICHTWERK_SIGN_CONFIG') ?: dirname($documentRoot) . '/sichtwerk-signieren-private/config.php';
$configReal = realpath($configPath);
if (!$documentRoot || !$configReal || !outside($configReal, $documentRoot)) stop('Die geschützte Angebotsablage ist noch nicht eingerichtet.', 503);
$config = require $configReal;
if (!is_array($config) || empty($config['password_hash']) || empty($config['origin']) || empty($config['data_dir'])) stop('Die Angebotsablage ist noch nicht vollständig eingerichtet.', 503);
$origin = rtrim((string)$config['origin'], '/');
$localTest = getenv('SICHTWERK_TEST_HTTP') === '1' && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if (!$localTest && (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off' || !str_starts_with($origin, 'https://'))) stop('Bitte den sicheren HTTPS-Link verwenden.', 400);
umask(0077);
if (!is_dir($config['data_dir']) && !mkdir($config['data_dir'], 0700, true)) stop('Die Angebotsablage ist nicht verfügbar.', 503);
$dataDir = realpath($config['data_dir']);
if (!$dataDir || !outside($dataDir, $documentRoot)) stop('Die Angebotsablage muss außerhalb des öffentlichen Webverzeichnisses liegen.', 503);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';
$allowed = ['status' => 'GET', 'login' => 'POST', 'create' => 'POST', 'offer' => 'GET', 'document' => 'GET', 'revoke' => 'POST', 'logout' => 'POST'];
if (!isset($allowed[$action]) || $allowed[$action] !== $method) stop('Diese Aktion ist nicht verfügbar.', 405);
if ($method === 'POST' && ($_SERVER['HTTP_ORIGIN'] ?? '') !== $origin) stop('Diese Anfrage wurde nicht über die Angebotsseite gestellt.', 403);
function tokenPath(string $token): string { global $dataDir; if (!preg_match('/^[a-f0-9]{64}$/D', $token)) stop('Dieser Angebotslink ist ungültig.', 404); return $dataDir . '/' . hash('sha256', $token); }
function jsonInput(): array { $raw = file_get_contents('php://input', false, null, 0, 8193); if ($raw === false || strlen($raw) > 8192) stop('Die Anfrage ist zu groß.'); try { $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); } catch (Throwable $e) { stop('Die Anfrage konnte nicht gelesen werden.'); } if (!is_array($data)) stop('Die Anfrage ist ungültig.'); return $data; }
function readOffer(string $token): array { $path = tokenPath($token); if (!is_file($path . '.json')) stop('Dieser Angebotslink ist nicht mehr gültig. Bitte Swen Neubauer um einen neuen Link bitten.', 404); $offer = json_decode((string)file_get_contents($path . '.json'), true); if (!is_array($offer) || ($offer['expires'] ?? 0) < time()) stop('Dieser Angebotslink ist abgelaufen. Bitte Swen Neubauer um einen neuen Link bitten.', 410); if (!is_file($path . '.pdf')) stop('Das Angebot ist momentan nicht verfügbar.', 404); return $offer; }
if (in_array($action, ['offer', 'document'], true)) {
    $token = (string)($_SERVER['HTTP_X_OFFER_TOKEN'] ?? '');
    $offer = readOffer($token);
    if ($action === 'offer') reply(array_intersect_key($offer, array_flip(['title', 'filename', 'layout', 'sha256', 'expires', 'pageCount'])));
    $path = tokenPath($token) . '.pdf'; header('Content-Type: application/pdf'); header('Content-Disposition: inline; filename="angebot.pdf"'); header('Content-Length: ' . filesize($path)); readfile($path); exit;
}
$sessionDir = $dataDir . '/sessions';
if (!is_dir($sessionDir) && !mkdir($sessionDir, 0700)) stop('Die Anmeldung ist momentan nicht verfügbar.', 503);
session_save_path($sessionDir);
session_name('sichtwerk_signieren');
session_set_cookie_params(['lifetime' => 0, 'path' => rtrim(dirname($_SERVER['SCRIPT_NAME'], 2), '/') . '/', 'secure' => !$localTest, 'httponly' => true, 'samesite' => 'Strict']);
ini_set('session.use_strict_mode', '1');
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
$authenticated = !empty($_SESSION['authenticated_at']) && time() - (int)$_SESSION['authenticated_at'] < 3600;
if ($action === 'status') reply(['configured' => true, 'authenticated' => $authenticated, 'csrf' => $_SESSION['csrf']]);
if (!hash_equals((string)$_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) stop('Bitte die Seite neu laden und erneut anmelden.', 403);
if ($action === 'login') {
    $input = jsonInput();
    $password = (string)($input['password'] ?? '');
    if (strlen($password) > 512) stop('Die Anmeldung ist fehlgeschlagen.', 401);
    $rateKey = hash_hmac('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? ''), (string)$config['password_hash']);
    $ratePath = $dataDir . '/rate-' . $rateKey . '.json';
    $handle = fopen($ratePath, 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) stop('Die Anmeldung ist momentan nicht verfügbar.', 503);
    $rate = json_decode(stream_get_contents($handle) ?: '{}', true) ?: [];
    if (time() - (int)($rate['start'] ?? 0) >= 900) $rate = ['start' => time(), 'attempts' => 0];
    if (($rate['attempts'] ?? 0) >= 6) { flock($handle, LOCK_UN); fclose($handle); stop('Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.', 429); }
    $ok = password_verify($password, (string)$config['password_hash']);
    $rate['attempts'] = $ok ? 0 : (int)($rate['attempts'] ?? 0) + 1;
    ftruncate($handle, 0); rewind($handle); fwrite($handle, json_encode($rate, JSON_THROW_ON_ERROR)); fflush($handle); flock($handle, LOCK_UN); fclose($handle);
    if (!$ok) stop('Das Passwort stimmt nicht.', 401);
    session_regenerate_id(true); $_SESSION['authenticated_at'] = time(); $_SESSION['csrf'] = bin2hex(random_bytes(32)); reply(['csrf' => $_SESSION['csrf']]);
}
if (!$authenticated) stop('Bitte zuerst als Sichtwerk anmelden.', 401);
if ($action === 'logout') { $_SESSION = []; session_destroy(); reply(['ok' => true]); }
if ($action === 'revoke') { $input = jsonInput(); $base = tokenPath((string)($input['token'] ?? '')); foreach (['.json', '.pdf'] as $extension) if (is_file($base . $extension) && !unlink($base . $extension)) stop('Der Link konnte nicht vollständig gesperrt werden.', 500); reply(['ok' => true]); }
if ($action === 'create') {
    $file = $_FILES['pdf'] ?? null;
    if (!$file || $file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) stop('Die PDF konnte nicht hochgeladen werden. Bitte die Größenbegrenzung des Webspace prüfen.');
    if ($file['size'] < 8 || $file['size'] > 20 * 1024 * 1024) stop('Bitte eine PDF mit höchstens 20 MB hochladen.');
    $stream = fopen($file['tmp_name'], 'rb'); $header = $stream ? fread($stream, 1024) : ''; if ($stream) fclose($stream);
    if (!str_contains((string)$header, '%PDF-')) stop('Die ausgewählte Datei ist keine PDF.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    if (!in_array($mime, ['application/pdf', 'application/x-pdf'], true)) stop('Die ausgewählte Datei ist keine PDF.');
    $raw = (string)($_POST['metadata'] ?? ''); if (strlen($raw) > 8192) stop('Die Angebotsangaben sind zu lang.');
    try { $meta = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); } catch (Throwable $e) { stop('Die Angebotsangaben sind ungültig.'); }
    if (!is_array($meta) || empty($meta['title']) || !is_string($meta['title']) || strlen($meta['title']) > 500) stop('Bitte eine Angebotsbezeichnung angeben.');
    $layout = $meta['layout'] ?? null; $pageCount = $meta['pageCount'] ?? 0;
    if (!is_int($pageCount) || $pageCount < 1 || $pageCount > 100 || !is_array($layout) || !isset($layout['page']) || !is_int($layout['page']) || $layout['page'] < 0 || $layout['page'] >= $pageCount) stop('Die Unterschriftsseite ist ungültig.');
    $safeLayout = ['page' => $layout['page']];
    foreach (['signature', 'date'] as $key) { $r = $layout[$key] ?? null; if (!is_array($r)) stop('Die Unterschriftsflächen fehlen.'); $safe = []; foreach (['x', 'y', 'w', 'h'] as $axis) { $v = $r[$axis] ?? null; if ((!is_int($v) && !is_float($v)) || !is_finite((float)$v) || $v < 0 || $v > 4000) stop('Eine Unterschriftsfläche ist ungültig.'); $safe[$axis] = $v; } if ($safe['w'] < 40 || $safe['h'] < ($key === 'signature' ? 25 : 12)) stop('Eine Unterschriftsfläche ist zu klein.'); $safeLayout[$key] = $safe; }
    // Limit stored data to the configured lifetime. No customer signatures are stored here.
    foreach (glob($dataDir . '/*.json') ?: [] as $old) { if (!preg_match('/\/[a-f0-9]{64}\.json$/D', $old)) continue; $m = json_decode((string)file_get_contents($old), true); if (is_array($m) && ($m['expires'] ?? PHP_INT_MAX) < time()) { @unlink(substr($old, 0, -5) . '.pdf'); @unlink($old); } }
    $token = bin2hex(random_bytes(32)); $base = tokenPath($token);
    $filename = preg_replace('/[\x00-\x1F\x7F]/', '', basename((string)$file['name']));
    $days = max(1, min(30, (int)($config['lifetime_days'] ?? 14)));
    $saved = ['title' => trim($meta['title']), 'filename' => substr($filename, 0, 200), 'layout' => $safeLayout, 'sha256' => hash_file('sha256', $file['tmp_name']), 'pageCount' => $pageCount, 'created' => time(), 'expires' => time() + $days * 86400];
    if (!move_uploaded_file($file['tmp_name'], $base . '.pdf')) stop('Die PDF konnte nicht gespeichert werden.', 500);
    if (file_put_contents($base . '.json', json_encode($saved, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), LOCK_EX) === false) { @unlink($base . '.pdf'); stop('Der Angebotslink konnte nicht erstellt werden.', 500); }
    reply(['token' => $token, 'expires' => $saved['expires']], 201);
}
