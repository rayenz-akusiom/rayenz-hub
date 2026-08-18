const root = document.getElementById('services');
const banner = document.getElementById('banner');
const deviceAccess = document.getElementById('device-access');
const deviceRows = document.getElementById('device-rows');
const openLogs = new Set();
const pending = new Set();
const lastMetaHtml = new WeakMap();
const FOLLOW_PX = 32;
let lastDeviceHtml = '';

function showBanner(message, isError = false) {
  banner.hidden = false;
  banner.textContent = message;
  banner.classList.toggle('error', isError);
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => {
    banner.hidden = true;
  }, 4500);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || 'Request failed');
  return data;
}

function statusLabel(s) {
  return s.status;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showBanner('Copied to clipboard');
  } catch {
    showBanner('Copy failed — select and copy manually', true);
  }
}

function lanOrigin(lanUrl) {
  if (!lanUrl) return null;
  try {
    return new URL(lanUrl).origin;
  } catch {
    return null;
  }
}

function deviceRowsHtml(lanIp, services) {
  const byId = Object.fromEntries(services.map((s) => [s.id, s]));
  const webUrl = `http://${lanIp}:5173`;
  const apiUrl = `http://${lanIp}:3000`;
  const webRunning = byId.web?.status === 'running';
  const apiRunning = byId.api?.status === 'running';

  return `
    <div class="device-row">
      <span class="device-label">Hub Web</span>
      <a class="device-url" href="${escapeHtml(webUrl)}" target="_blank" rel="noreferrer">${escapeHtml(webUrl)}</a>
      <span class="device-state ${webRunning ? 'on' : ''}">${webRunning ? 'running' : 'stopped'}</span>
      <button type="button" class="btn ghost" data-copy="${escapeHtml(webUrl)}">Copy</button>
    </div>
    <div class="device-row">
      <span class="device-label">Hub API</span>
      <a class="device-url" href="${escapeHtml(apiUrl)}" target="_blank" rel="noreferrer">${escapeHtml(apiUrl)}</a>
      <span class="device-state ${apiRunning ? 'on' : ''}">${apiRunning ? 'running' : 'stopped'}</span>
      <button type="button" class="btn ghost" data-copy="${escapeHtml(apiUrl)}">Copy</button>
    </div>
  `;
}

function renderDeviceAccess(lanIp, services) {
  if (!lanIp) {
    deviceAccess.hidden = true;
    lastDeviceHtml = '';
    return;
  }

  deviceAccess.hidden = false;
  const html = deviceRowsHtml(lanIp, services);
  if (html === lastDeviceHtml) return;
  lastDeviceHtml = html;
  deviceRows.innerHTML = html;
}

function buttonStates(svc) {
  const busy = pending.has(svc.id) || svc.status === 'starting' || svc.status === 'stopping';
  return {
    startDisabled: busy || svc.status === 'running',
    stopDisabled: busy || svc.status === 'stopped',
    restartDisabled: busy || svc.status === 'stopped',
  };
}

function metaHtml(svc) {
  const open = svc.openUrl
    ? `<a href="${escapeHtml(svc.openUrl)}" target="_blank" rel="noreferrer">open</a> · `
    : '';
  const lanOriginUrl = lanOrigin(svc.lanUrl);
  const lan = svc.lanUrl
    ? `<a href="${escapeHtml(svc.lanUrl)}" target="_blank" rel="noreferrer">LAN</a>` +
      (lanOriginUrl
        ? ` <button type="button" class="linkish" data-copy="${escapeHtml(lanOriginUrl)}">copy</button> · `
        : ' · ')
    : '';
  return `${open}${lan}port ${svc.port} · ${svc.kind}${
    svc.ownedPid ? ` · pid ${svc.ownedPid}` : ''
  }${svc.containerStatus ? ` · docker ${svc.containerStatus}` : ''}`;
}

function setDisabled(el, disabled) {
  if (!el) return;
  if (disabled) el.setAttribute('disabled', '');
  else el.removeAttribute('disabled');
}

function applyCard(card, svc) {
  const { startDisabled, stopDisabled, restartDisabled } = buttonStates(svc);
  const logsOpen = openLogs.has(svc.id);
  const nextMeta = metaHtml(svc);
  const meta = card.querySelector('.meta');
  if (meta && lastMetaHtml.get(card) !== nextMeta) {
    lastMetaHtml.set(card, nextMeta);
    meta.innerHTML = nextMeta;
  }

  const pill = card.querySelector('.pill');
  if (pill) {
    pill.className = `pill ${svc.status}`;
    const label = statusLabel(svc);
    if (pill.textContent !== label) pill.textContent = label;
  }

  setDisabled(card.querySelector('[data-act="start"]'), startDisabled);
  setDisabled(card.querySelector('[data-act="stop"]'), stopDisabled);
  setDisabled(card.querySelector('[data-act="restart"]'), restartDisabled);

  const logsBtn = card.querySelector('[data-act="toggle-logs"]');
  const logsLabel = logsOpen ? 'Hide logs' : 'Logs';
  if (logsBtn && logsBtn.textContent.trim() !== logsLabel) logsBtn.textContent = logsLabel;

  card.querySelector(`[data-logs="${svc.id}"]`)?.classList.toggle('open', logsOpen);
}

function renderCard(svc) {
  const { startDisabled, stopDisabled, restartDisabled } = buttonStates(svc);
  const logsOpen = openLogs.has(svc.id);

  return `
    <article class="card" data-id="${svc.id}">
      <div class="card-head">
        <div class="card-title">
          <h2>${escapeHtml(svc.name)}</h2>
          <p class="meta">${metaHtml(svc)}</p>
        </div>
        <span class="pill ${svc.status}">${statusLabel(svc)}</span>
        <div class="actions">
          <button type="button" class="btn" data-act="start" data-id="${svc.id}" ${
            startDisabled ? 'disabled' : ''
          }>Start</button>
          <button type="button" class="btn" data-act="stop" data-id="${svc.id}" ${
            stopDisabled ? 'disabled' : ''
          }>Stop</button>
          <button type="button" class="btn" data-act="restart" data-id="${svc.id}" ${
            restartDisabled ? 'disabled' : ''
          }>Restart</button>
          <button type="button" class="btn ghost" data-act="toggle-logs" data-id="${svc.id}">
            ${logsOpen ? 'Hide logs' : 'Logs'}
          </button>
        </div>
      </div>
      <div class="logs ${logsOpen ? 'open' : ''}" data-logs="${svc.id}">
        <pre></pre>
      </div>
    </article>
  `;
}

function cardFromHtml(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function nearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_PX;
}

async function refreshLogs(id) {
  if (!openLogs.has(id)) return;
  try {
    const data = await api(`/api/services/${id}/logs?lines=100`);
    const pre = root.querySelector(`[data-logs="${id}"] pre`);
    if (!pre) return;
    const next = data.logs || '(no log output yet)';
    if (pre.textContent === next) return;
    const follow = !pre.textContent || nearBottom(pre);
    const saved = pre.scrollTop;
    pre.textContent = next;
    pre.scrollTop = follow ? pre.scrollHeight : saved;
  } catch {
    /* ignore */
  }
}

function setLogsOpen(id, open) {
  const panel = root.querySelector(`[data-logs="${id}"]`);
  const btn = root.querySelector(`[data-act="toggle-logs"][data-id="${id}"]`);
  panel?.classList.toggle('open', open);
  if (btn) btn.textContent = open ? 'Hide logs' : 'Logs';
}

function render(payload) {
  const services = payload.services || [];
  renderDeviceAccess(payload.lanIp || null, services);

  const existing = new Map([...root.querySelectorAll('.card')].map((el) => [el.dataset.id, el]));
  const keep = new Set(services.map((s) => s.id));

  let next = root.firstElementChild;
  for (const svc of services) {
    let card = existing.get(svc.id);
    if (!card) {
      card = cardFromHtml(renderCard(svc));
      lastMetaHtml.set(card, metaHtml(svc));
    } else {
      applyCard(card, svc);
    }
    if (next !== card) root.insertBefore(card, next);
    next = card.nextElementSibling;
  }

  for (const [id, card] of existing) {
    if (!keep.has(id)) card.remove();
  }

  for (const id of openLogs) refreshLogs(id);
}

async function poll() {
  try {
    const data = await api('/api/services');
    render(data);
  } catch (err) {
    showBanner(`Status poll failed: ${err.message}`, true);
  }
}

async function runAction(id, action) {
  pending.add(id);
  await poll();
  try {
    const data = await api(`/api/services/${id}/${action}`, { method: 'POST' });
    showBanner(`${id}: ${data.message || action + ' ok'}`);
  } catch (err) {
    showBanner(`${id}: ${err.message}`, true);
  } finally {
    pending.delete(id);
    await poll();
  }
}

async function runStack(action) {
  document.body.classList.add('busy');
  ['dynamodb', 'minio', 'api', 'web'].forEach((id) => pending.add(id));
  await poll();
  try {
    const data = await api(`/api/stack/${action}`, { method: 'POST' });
    const failed = (data.results || []).find((r) => !r.ok);
    if (failed) showBanner(`Stack ${action} failed on ${failed.id}: ${failed.error}`, true);
    else showBanner(`Stack ${action} finished`);
  } catch (err) {
    showBanner(err.message, true);
  } finally {
    pending.clear();
    document.body.classList.remove('busy');
    await poll();
  }
}

root.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn && root.contains(copyBtn)) {
    copyText(copyBtn.dataset.copy);
    return;
  }
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  if (act === 'toggle-logs') {
    if (openLogs.has(id)) {
      openLogs.delete(id);
      setLogsOpen(id, false);
    } else {
      openLogs.add(id);
      setLogsOpen(id, true);
      refreshLogs(id);
    }
    return;
  }
  if (act === 'start' || act === 'stop' || act === 'restart') {
    runAction(id, act);
  }
});

deviceAccess.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    copyText(copyBtn.dataset.copy);
    return;
  }
});

document.getElementById('btn-start-all').addEventListener('click', () => runStack('start'));
document.getElementById('btn-stop-all').addEventListener('click', () => runStack('stop'));

poll();
setInterval(poll, 2000);
