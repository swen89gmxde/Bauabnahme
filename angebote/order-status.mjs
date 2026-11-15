const LINK_TOKEN = /^[a-f0-9]{64}\.[a-f0-9]{64}$/;
const INVOICE_LABELS = {
  advance: 'Vorauszahlungsrechnung',
  interim: 'Zwischenrechnung',
  invoice: 'Rechnung',
  final: 'Schlussrechnung',
};
const DATE_FIELDS = {
  ordered_on: 'Bestelldatum',
  delivery_date: 'Liefertermin',
  installation_date: 'Montagetermin',
};
const STATUS_REFRESH_INTERVAL = 15000;

function formatDate(value) {
  return value.split('-').reverse().join('.');
}

function enteredDate(input, label) {
  const value = input.trim();
  if (!value) return '';
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value) || /^(\d{2})(\d{2})(\d{4})$/.exec(value);
  const iso = german ? german[3] + '-' + german[2].padStart(2, '0') + '-' + german[1].padStart(2, '0') : value;
  const date = new Date(iso + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso.startsWith('0000-') || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw Error('Bitte für „' + label + '“ ein gültiges Datum im Format TT.MM.JJJJ eingeben.');
  }
  return iso;
}

function enteredWeek(input) {
  const value = input.trim();
  if (!value) return '';
  const german = /^(?:KW\s*)?(\d{1,2})\s*\/\s*([1-9]\d{3})$/i.exec(value);
  const iso = german ? german[2] + '-W' + german[1].padStart(2, '0') : value;
  if (!/^[1-9]\d{3}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(iso)) {
    throw Error('Bitte die Lieferwoche mit Jahr eingeben, zum Beispiel 50/2026.');
  }
  return iso;
}

function enteredTime(input, installationDate) {
  const value = input.trim();
  if (!value) return '';
  const parts = /^(\d{1,2}):?(\d{2})$/.exec(value);
  const time = parts ? parts[1].padStart(2, '0') + ':' + parts[2] : '';
  if (!installationDate) throw Error('Bitte zur Montageuhrzeit auch den Montagetermin eintragen.');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Bitte die Montageuhrzeit im Format HH:MM eingeben.');
  return time;
}

function scheduleEntries(schedule) {
  const entries = [];
  if (schedule.advance_received) entries.push(['Vorauszahlung', 'Eingegangen']);
  if (schedule.ordered_on) entries.push(['Bestellung beim Hersteller', formatDate(schedule.ordered_on)]);
  if (schedule.delivery_week) {
    const [year, week] = schedule.delivery_week.split('-W');
    entries.push(['Voraussichtliche Lieferwoche', 'KW ' + week + '/' + year]);
  }
  if (schedule.delivery_date) entries.push(['Liefertermin', formatDate(schedule.delivery_date)]);
  if (schedule.installation_date) {
    const time = schedule.installation_time ? ' um ' + schedule.installation_time + ' Uhr' : '';
    entries.push(['Montagetermin', formatDate(schedule.installation_date) + time]);
  }
  return entries;
}

export function orderStatusURL(token, href) {
  if (!LINK_TOKEN.test(token ?? '')) throw Error('Der persönliche Statuslink ist nicht verfügbar.');
  const url = new URL('status.html', href);
  url.hash = token;
  return url.href;
}

export function orderStatusMessage(status, audience, href) {
  const link = orderStatusURL(status.tokens[audience], href);
  if (audience === 'insurer') {
    const claim = status.claim_number ? ' zum Schadenfall ' + status.claim_number : ' zum vereinbarten Schadenfall';
    return [
      'Guten Tag,',
      'die Rechnung' + claim + ' steht zur vereinbarten Direktabrechnung bereit. Sie können sie hier herunterladen.',
      link,
      'Mit freundlichen Grüßen\nSwen Neubauer\nSichtwerk – Neubauer',
    ].join('\n\n');
  }

  const notice = status.insurance
    ? 'Über diesen persönlichen Link sehen Sie die Lieferwoche und Ihren Montagetermin, sobald diese feststehen.'
    : 'Über diesen persönlichen Link sehen Sie den Stand Ihres Auftrags und können Ihre bereitgestellten Rechnungen herunterladen.';
  const ownInvoice = status.files.find(file => file.audience === 'customer');
  const details = scheduleEntries(status.schedule).map(([label, value]) => label + ' – ' + value);
  if (ownInvoice) details.push('Ihre ' + INVOICE_LABELS[ownInvoice.kind] + ' steht zum Download bereit.');
  return [
    'Guten Tag ' + status.customer_name + ',',
    notice,
    link,
    ...(details.length ? [details.join('\n')] : []),
    'Bei Neuigkeiten melde ich mich per Nachricht.',
    'Viele Grüße\nSwen Neubauer',
  ].join('\n\n');
}

function appendText(parent, name, text, className = '') {
  const el = parent.ownerDocument.createElement(name);
  if (className) el.className = className;
  el.textContent = text;
  parent.append(el);
  return el;
}

export function mountOrderStatusEditor(card, record, api) {
  const template = card.ownerDocument.getElementById('order-status-editor');
  if (!template || !record.order_status_available) return;
  const editor = template.content.firstElementChild.cloneNode(true);
  const $ = key => editor.querySelector('[data-order="' + key + '"]');
  const fields = $('schedule');
  const upload = $('upload');
  const saveFeedback = $('save-feedback') || $('feedback');
  let view;
  let scheduleRevision;
  let scheduleEdited = false;
  let busy = false;

  function render(data, keepDraft) {
    const scheduleUnchanged = JSON.stringify(view?.schedule) === JSON.stringify(data.schedule);
    view = data;
    $('active').hidden = !view.active;
    $('closed').hidden = !view.closed;
    $('inactive').hidden = view.closed || view.active;
    $('insurance-actions').hidden = !view.tokens.insurer;
    $('audience').hidden = !view.insurance;
    $('advance').hidden = view.insurance;
    upload.elements.kind.querySelector('[value="advance"]').hidden = view.insurance;
    if (!view.insurance) upload.elements.audience.value = 'customer';

    if (!keepDraft) {
      for (const [key, value] of Object.entries(view.schedule)) {
        const field = fields.elements.namedItem(key);
        if (key === 'advance_received') field.checked = value;
        else if (value && key in DATE_FIELDS && field.type !== 'date') field.value = formatDate(value);
        else if (value && key === 'delivery_week' && field.type !== 'week') {
          const [year, week] = value.split('-W');
          field.value = week + '/' + year;
        } else field.value = value;
      }
      scheduleEdited = false;
    }
    if (!keepDraft || scheduleUnchanged) scheduleRevision = view.revision;
    $('files').replaceChildren();
    for (const file of view.files) {
      const audience = file.audience === 'insurer' ? 'Versicherung' : 'Kunde';
      appendText($('files'), 'li', INVOICE_LABELS[file.kind] + ' · ' + file.name + ' · ' + audience);
    }
    $('invoice-heading').hidden = !view.files.length;
    $('close').hidden = view.closed && !view.cleanup_pending;
    $('close').textContent = view.cleanup_pending ? 'Rechnungskopien erneut entfernen' : 'Auftrag abschließen';
    $('fallback').hidden = true;
  }

  async function run(action, body, message = '', feedback = $('feedback')) {
    if (busy) return;
    busy = true;
    feedback.textContent = 'Wird geladen …';
    const controls = editor.querySelectorAll('button[type="submit"], [data-order="close"], input, select');
    controls.forEach(control => { control.disabled = true; });
    try {
      const result = await api(action, { method: 'POST', body });
      render(result, action === 'order-status-invoice' && scheduleEdited);
      $('panel').hidden = false;
      if (action === 'order-status-owner') saveFeedback.textContent = '';
      feedback.textContent = result.cleanup_pending
        ? 'Die Links sind gesperrt. Die Rechnungskopien konnten noch nicht vollständig entfernt werden.'
        : message;
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      controls.forEach(control => { control.disabled = false; });
      busy = false;
    }
  }

  async function copyText(audience, withMessage) {
    if (!view?.tokens[audience] || busy) return;
    if (audience === 'customer' && withMessage && scheduleEdited) {
      saveFeedback.textContent = 'Bitte zuerst die Terminänderungen speichern.';
      fields.querySelector('button[type="submit"]').focus();
      return;
    }
    const href = card.ownerDocument.location.href;
    const text = withMessage
      ? orderStatusMessage(view, audience, href)
      : orderStatusURL(view.tokens[audience], href);
    try {
      await navigator.clipboard.writeText(text);
      $('fallback').hidden = true;
      $('feedback').textContent = withMessage ? 'Nachricht mit Link kopiert.' : 'Link kopiert.';
    } catch {
      const fallback = $('fallback');
      fallback.value = text;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      $('feedback').textContent = 'Der Text ist markiert und kann kopiert werden.';
    }
  }

  editor.addEventListener('toggle', () => {
    if (editor.open) run('order-status-owner', { id: record.id });
  });
  $('copy-message').onclick = () => copyText('customer', true);
  $('copy-link').onclick = () => copyText('customer', false);
  $('copy-insurer-message').onclick = () => copyText('insurer', true);
  $('copy-insurer-link').onclick = () => copyText('insurer', false);

  fields.addEventListener('input', () => {
    scheduleEdited = true;
    saveFeedback.textContent = 'Änderungen noch nicht gespeichert.';
  });
  fields.onsubmit = event => {
    event.preventDefault();
    if (busy || !view) return;
    const data = Object.fromEntries(new FormData(fields));
    data.advance_received = fields.elements.advance_received.checked;
    try {
      for (const [key, label] of Object.entries(DATE_FIELDS)) data[key] = enteredDate(data[key], label);
      data.delivery_week = enteredWeek(data.delivery_week);
      data.installation_time = enteredTime(data.installation_time, data.installation_date);
    } catch (error) {
      saveFeedback.textContent = error.message;
      return;
    }
    run('order-status-save', { id: record.id, revision: scheduleRevision, schedule: data }, 'Auftragsstatus gespeichert. Die Änderungen sind über den Statuslink abrufbar.', saveFeedback);
  };
  upload.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(upload);
    data.set('id', record.id);
    const current = view.revision;
    await run('order-status-invoice', data, 'Rechnung bereitgestellt.');
    if (view.revision !== current) upload.elements.invoice.value = '';
  };
  $('close').onclick = () => {
    if (busy) return;
    const confirmed = view.cleanup_pending || globalThis.confirm(
      'Auftrag abschließen? Die Status- und Rechnungslinks werden gesperrt. Alle hier bereitgestellten Rechnungskopien werden gelöscht.'
    );
    if (confirmed) run('order-status-close', { id: record.id, confirmed: true }, 'Auftrag abgeschlossen. Links gesperrt und Rechnungskopien entfernt.');
  };
  card.append(editor);
}

async function fetchOrderStatus(action, token, fileId) {
  const url = new URL('server/api.php', location.href);
  url.searchParams.set('action', action);
  if (fileId) url.searchParams.set('file', fileId);
  const response = await fetch(url, {
    headers: { 'X-Order-Status-Token': token },
    cache: 'no-store',
    credentials: 'omit',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = Error(data.error || 'Der Auftragsstatus ist momentan nicht verfügbar.');
    error.status = response.status;
    throw error;
  }
  return response;
}

function showOrderStatusPage() {
  const heading = document.getElementById('order-status-title');
  const content = document.getElementById('order-status-content');
  const feedback = document.getElementById('order-status-feedback');
  const token = location.hash.slice(1);
  window.addEventListener('hashchange', () => location.reload());

  if (!LINK_TOKEN.test(token)) {
    feedback.textContent = 'Bitte öffnen Sie den persönlichen Link, den Sie von Sichtwerk erhalten haben.';
    return;
  }

  let lastView;
  let inFlight = false;
  let closed = false;
  let refreshTimer;

  function render(state) {
    content.replaceChildren();
    if (state.audience === 'insurer') {
      heading.textContent = 'Rechnung zur Direktabrechnung';
      if (state.claim_number) appendText(content, 'p', 'Schadennummer ' + state.claim_number);
    } else {
      heading.textContent = 'Auftragsstatus';
      const entries = scheduleEntries(state.schedule);
      if (!entries.length) {
        appendText(content, 'p', 'Ihr Auftrag ist angenommen. Wir informieren Sie, sobald es Neuigkeiten gibt.');
      } else {
        const list = document.createElement('dl');
        list.className = 'order-schedule-list';
        for (const [label, value] of entries) {
          appendText(list, 'dt', label);
          appendText(list, 'dd', value);
        }
        content.append(list);
      }
    }
    if (state.files.length) {
      appendText(content, 'h2', 'Rechnungen');
      const files = document.createElement('div');
      files.className = 'download-list';
      content.append(files);
      const downloadFeedback = appendText(content, 'p', '', 'hint');
      downloadFeedback.setAttribute('role', 'status');
      downloadFeedback.hidden = true;
      for (const file of state.files) {
        const button = appendText(files, 'button', INVOICE_LABELS[file.kind] + ' herunterladen', 'secondary');
        appendText(button, 'small', file.name);
        button.type = 'button';
        button.onclick = async () => {
          button.disabled = true;
          downloadFeedback.hidden = true;
          try {
            const response = await fetchOrderStatus('order-status-download', token, file.id);
            const href = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = href;
            link.download = file.name;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(href), 60000);
          } catch (error) {
            downloadFeedback.hidden = false;
            downloadFeedback.textContent = error.message;
            if (error.status === 410) refresh();
          } finally {
            button.disabled = false;
          }
        };
      }
      appendText(content, 'p', 'Bitte speichern Sie die Rechnungen für Ihre Unterlagen.', 'hint');
    }
    content.hidden = false;
  }

  async function refresh() {
    if (closed || inFlight || document.hidden) return;
    clearTimeout(refreshTimer);
    inFlight = true;
    try {
      const state = await (await fetchOrderStatus('order-status-view', token)).json();
      const currentView = JSON.stringify(state);
      if (currentView !== lastView) {
        render(state);
        lastView = currentView;
      }
      feedback.hidden = true;
    } catch (error) {
      if (error.status === 410) {
        closed = true;
        heading.textContent = 'Auftragsstatus';
        content.hidden = true;
        content.replaceChildren();
      }
      feedback.textContent = !closed && lastView
        ? 'Der Auftragsstatus konnte gerade nicht aktualisiert werden.'
        : error.message;
      feedback.hidden = false;
    } finally {
      inFlight = false;
      if (!closed && !document.hidden) refreshTimer = setTimeout(refresh, STATUS_REFRESH_INTERVAL);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(refreshTimer);
    else refresh();
  });
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', event => {
    if (event.persisted) refresh();
  });
  refresh();
}

if (typeof document !== 'undefined' && document.getElementById('order-status-page')) showOrderStatusPage();
