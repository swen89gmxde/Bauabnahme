import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { orderStatusMessage, orderStatusURL } from '../angebote/order-status.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = process.env.PHP_WASM_MODULE_ROOT || path.join(root, 'node_modules');
const { PHP, PHPRequestHandler } = await import(pathToFileURL(path.join(modules, '@php-wasm/universal/index.js')));
const { loadNodeRuntime, useHostFilesystem } = await import(pathToFileURL(path.join(modules, '@php-wasm/node/index.js')));
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sichtwerk-order-status-'));
const web = path.join(fixture, 'public');
const privateDir = path.join(fixture, 'sichtwerk-signieren-private');
const data = path.join(privateDir, 'data');
const origin = 'https://status.test';
const password = randomBytes(24).toString('hex');
const pdf = fs.readFileSync(path.join(root, 'angebote/musterangebot.pdf'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const recordPath = id => path.join(data, 'records', id);
let checks = 0;

function sampleRecord(label, { insurance = false, test = false, state = 'completed', provider = 'strato' } = {}) {
  const id = sha(label);
  const scope = sha('scope' + label);
  const record = {
    id, scope, state, archive_provider: provider, archive_mode: 'signed_pdf_only',
    title: 'Musterangebot ' + label, customer_id: label, customer_name: 'Muster ' + label,
    commission: label, filename: 'angebot.pdf', sha256: sha(pdf), attachments: [],
    completion: { sha256: sha(pdf) },
    archive: { state: state === 'completed' ? 'verified' : 'pending' },
    archive_test: test,
  };
  if (insurance) {
    record.insurance = { state: 'accepted', receipt: { claim_number: 'MUSTER-SCHADEN-17' } };
  }
  fs.mkdirSync(recordPath(id), { recursive: true });
  fs.writeFileSync(path.join(recordPath(id), 'record.json'), JSON.stringify(record));
  fs.writeFileSync(path.join(recordPath(id), 'signed.pdf'), pdf);
  fs.mkdirSync(path.join(data, 'scopes'), { recursive: true });
  fs.writeFileSync(path.join(data, 'scopes', scope + '.json'), JSON.stringify({ active_id: id }));
  return record;
}

fs.cpSync(path.join(root, 'angebote'), web, { recursive: true });
fs.mkdirSync(privateDir, { recursive: true });
const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: process.pid } }));
useHostFilesystem(php);
const hash = await php.run({ code: '<?php echo password_hash(' + JSON.stringify(password) + ', PASSWORD_DEFAULT);' });
const config = path.join(privateDir, 'config.php');
fs.writeFileSync(config, `<?php return [
    'origin'=>'${origin}', 'password_hash'=>'${hash.text.trim()}', 'data_dir'=>'${data}',
    'completion_notification'=>['enabled'=>false],
];`);
const handler = new PHPRequestHandler({ php, documentRoot: web, absoluteUrl: origin, cookieStore: false });
const owner = { cookies: {}, csrf: '' };
const guest = { cookies: {}, csrf: '' };

async function expect(client, action, status, { body, method = body === undefined ? 'GET' : 'POST', token, csrf } = {}) {
  const headers = {};
  if (method === 'POST') {
    headers.Origin = origin;
    headers['X-CSRF-Token'] = csrf ?? client.csrf;
  }
  if (token) headers['X-Order-Status-Token'] = token;
  if (Object.keys(client.cookies).length) {
    headers.Cookie = Object.entries(client.cookies).map(([key, value]) => key + '=' + value).join('; ');
  }
  if (body && !(body.invoice instanceof File)) {
    headers['Content-Type'] = 'application/json';
    body = new TextEncoder().encode(JSON.stringify(body));
  }
  const response = await handler.request({ url: '/server/api.php?action=' + action, method, headers, body });
  for (const [name, values] of Object.entries(response.headers)) {
    if (name.toLowerCase() !== 'set-cookie') continue;
    for (const value of values) {
      const cookie = value.split(';')[0];
      const at = cookie.indexOf('=');
      client.cookies[cookie.slice(0, at)] = cookie.slice(at + 1);
    }
  }
  assert.equal(response.httpStatusCode, status, action + ': ' + response.text.slice(0, 280) + ' ' + response.errors);
  checks++;
  return response;
}

const json = response => JSON.parse(response.text);
const read = (id, code = 200) => expect(owner, 'order-status-owner', code, { body: { id } }).then(json);
const statusView = (token, code = 200) => expect(guest, 'order-status-view', code, { token }).then(json);
const download = (token, file, code = 200) => expect(guest, 'order-status-download&file=' + file, code, { token });
const pdfUpload = (id, audience, kind, bytes = pdf, filename = 'musterrechnung.pdf') =>
  ({ body: { id, kind, audience, invoice: new File([bytes], filename, { type: 'application/pdf' }) } });

try {
  const lint = await php.run({ code: "<?php token_get_all(file_get_contents('" + web + "/server/order-status.php'), TOKEN_PARSE); echo 'OK';" });
  assert.equal(lint.text, 'OK', lint.errors);
  owner.csrf = json(await expect(owner, 'status', 200)).csrf;
  owner.csrf = json(await expect(owner, 'login', 200, { body: { password } })).csrf;
  guest.csrf = json(await expect(guest, 'status', 200)).csrf;
  const normal = sampleRecord('Normal', { state: 'archive_pending' });
  const insurance = sampleRecord('Versicherung', { insurance: true });
  const drive = sampleRecord('Alt', { provider: 'drive' });
  const internal = sampleRecord('Archivtest', { test: true });

  await expect(guest, 'order-status-owner', 401, { body: { id: normal.id } });
  await expect(owner, 'order-status-owner', 403, { body: { id: normal.id }, csrf: 'invalid' });
  await read(normal.id, 409);
  await read(drive.id, 409);
  await read(internal.id, 409);
  await statusView(normal.id + '.' + '1'.repeat(64), 410);

  const archive = await php.run({ code: `<?php
    require '${web}/server/store.php';
    $config = require '${config}'; $dataDir = '${data}';
    $r = recordById('${normal.id}');
    lockPortal('scope:'.$r['scope']); lockPortal('record:'.$r['id']);
    $r = runStratoArchive($r); echo $r['state'];
  ` });
  assert.equal(archive.text, 'completed', archive.errors);
  const autoPath = path.join(recordPath(normal.id), 'order-status/status.json');
  assert.ok(fs.existsSync(autoPath), 'Created automatically at confirmed archive');
  const archivePDF = path.join(recordPath(normal.id), 'archive/signed.pdf');
  assert.equal(sha(fs.readFileSync(archivePDF)), sha(pdf));

  let first = await read(normal.id);
  let second = await read(insurance.id);
  assert.ok(first.active);
  assert.ok(second.active);
  assert.ok(!second.tokens.insurer);
  const customer = first.tokens.customer;
  const insuranceCustomer = second.tokens.customer;
  assert.notEqual(customer, insuranceCustomer);
  assert.deepEqual((await statusView(customer)).files, []);
  assert.equal((await statusView(customer)).schedule.delivery_week, '');
  assert.equal((await read(normal.id)).tokens.customer, customer);
  assert.ok(orderStatusURL(customer, origin + '/angebote/?vorbereiten=1').includes('/angebote/status.html#'));

  const schedule = {
    advance_received: true, ordered_on: '2026-11-23', delivery_week: '2026-W49',
    delivery_date: '2026-12-01', installation_date: '2026-12-14', installation_time: '08:30',
  };
  await expect(owner, 'order-status-save', 400, { body: { id: normal.id, revision: first.revision, schedule: { delivery_week: '2026-W00' } } });
  first = json(await expect(owner, 'order-status-save', 200, { body: { id: normal.id, revision: first.revision, schedule } }));
  assert.deepEqual((await statusView(customer)).schedule, schedule);
  await expect(owner, 'order-status-save', 409, { body: { id: normal.id, revision: first.revision - 1, schedule: {} } });
  await expect(owner, 'order-status-invoice', 400, pdfUpload(normal.id, 'insurer', 'final'));
  await expect(owner, 'order-status-invoice', 400, pdfUpload(normal.id, 'customer', 'final', Buffer.from('<html/>'), 'keine-rechnung.pdf'));

  first = json(await expect(owner, 'order-status-invoice', 201, pdfUpload(normal.id, 'customer', 'advance')));
  const advance = first.files[0].id;
  assert.equal(first.tokens.customer, customer);
  assert.match(orderStatusMessage(first, 'customer', origin + '/angebote/'), /Vorauszahlungsrechnung.*Download/);
  assert.match(orderStatusMessage(first, 'customer', origin + '/angebote/'), /14\.12\.2026 um 08:30 Uhr/);
  assert.equal((await statusView(customer)).files[0].kind, 'advance');
  assert.equal(sha((await download(customer, advance)).bytes), sha(pdf));
  await download(insuranceCustomer, advance, 404);
  const duplicate = json(await expect(owner, 'order-status-invoice', 201, pdfUpload(normal.id, 'customer', 'advance')));
  assert.equal(duplicate.files.length, 1);

  const xml = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>TEST-1</ID></Invoice>';
  const xmlResponse = json(await expect(owner, 'order-status-invoice', 201, {
    body: { id: normal.id, audience: 'customer', kind: 'final', invoice: new File([xml], 'muster.xml', { type: 'application/xml' }) },
  }));
  const xmlFile = xmlResponse.files.find(file => file.name === 'muster.xml');
  assert.equal((await download(customer, xmlFile.id)).text, xml);
  await expect(owner, 'order-status-invoice', 400, {
    body: { id: normal.id, audience: 'customer', kind: 'final', invoice: new File(['<!DOCTYPE Invoice><Invoice/>'], 'falsch.xml') },
  });

  await expect(owner, 'order-status-invoice', 400, pdfUpload(insurance.id, 'insurer', 'advance'));
  second = json(await expect(owner, 'order-status-save', 200, { body: { id: insurance.id, revision: second.revision, schedule } }));
  assert.equal((await statusView(insuranceCustomer)).schedule.advance_received, false);
  second = json(await expect(owner, 'order-status-invoice', 201, pdfUpload(insurance.id, 'insurer', 'final')));
  const insurer = second.tokens.insurer;
  const insuranceFile = second.files.find(file => file.audience === 'insurer').id;
  assert.notEqual(insurer, insuranceCustomer);
  second = json(await expect(owner, 'order-status-invoice', 201, pdfUpload(insurance.id, 'customer', 'invoice')));
  const customerFile = second.files.find(file => file.audience === 'customer').id;
  assert.match(orderStatusMessage(second, 'insurer', origin + '/angebote/'), /MUSTER-SCHADEN-17/);
  assert.ok(!orderStatusMessage(second, 'insurer', origin + '/angebote/').includes(insuranceCustomer));
  assert.deepEqual(Object.keys(await statusView(insurer)).sort(), ['audience','claim_number','files']);
  assert.equal((await statusView(insurer)).files[0].id, insuranceFile);
  assert.equal((await statusView(insuranceCustomer)).files[0].id, customerFile);
  await download(insurer, customerFile, 404);
  await download(insuranceCustomer, insuranceFile, 404);

  await expect(owner, 'order-status-close', 400, { body: { id: normal.id } });
  const closed = json(await expect(owner, 'order-status-close', 200, { body: { id: normal.id, confirmed: true } }));
  assert.ok(closed.closed && !closed.cleanup_pending);
  assert.deepEqual(closed.tokens, []);
  assert.ok(!fs.existsSync(path.join(recordPath(normal.id), 'order-status/files')));
  assert.equal(sha(fs.readFileSync(archivePDF)), sha(pdf));
  await statusView(customer, 410);
  await download(customer, advance, 410);
  await expect(owner, 'order-status-close', 200, { body: { id: normal.id, confirmed: true } });
  await expect(owner, 'order-status-invoice', 410, pdfUpload(normal.id, 'customer', 'final'));

  await expect(owner, 'record-trash', 200, { body: { id: insurance.id, confirmed: true } });
  await statusView(insuranceCustomer, 410);
  await statusView(insurer, 410);
  await expect(owner, 'record-restore', 200, { body: { id: insurance.id, confirmed: true } });
  await statusView(insurer, 410);
  assert.equal((await read(insurance.id)).active, false);
  await expect(owner, 'order-status-close', 200, { body: { id: insurance.id, confirmed: true } });
  assert.ok(!fs.existsSync(path.join(recordPath(insurance.id), 'order-status/files')));

  const replaced = sampleRecord('Ersetzt');
  const replacedToken = (await read(replaced.id)).tokens.customer;
  fs.writeFileSync(path.join(data, 'scopes', replaced.scope + '.json'), JSON.stringify({ active_id: normal.id }));
  await statusView(replacedToken, 410);
  assert.equal((await read(replaced.id)).active, false);

  console.log(JSON.stringify({ checks, result: 'passed', coverage: 'automatic links, stable updates, role-specific invoices, PDF/XML, closure, archive preservation' }));
} finally {
  await php.exit();
  fs.rmSync(fixture, { recursive: true, force: true });
}
