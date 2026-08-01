const root = document.getElementById('services');
const banner = document.getElementById('banner');
const deviceAccess = document.getElementById('device-access');
const deviceRows = document.getElementById('device-rows');
const deviceSnippet = document.getElementById('device-snippet');
const deviceSnippetPre = document.getElementById('device-snippet-pre');
const openLogs = new Set();
const pending = new Set();

/** @type {{ lanIp: string | null, services: object[] }} */
let lastPayload = { lanIp: null, services: [] };

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

function apiLocalStorageSnippet(lanIp) {
  return [
    `localStorage.setItem('rayenz-hub-api-url', 'http://${lanIp}:3000');`,
    `localStorage.setItem('rayenz-hub-api-key', 'test-api-key-local');`,
  ].join('\n');
}

function renderDeviceAccess(lanIp, services) {
  if (!lanIp) {
    deviceAccess.hidden = true;
    return;
  }

  deviceAccess.hidden = false;
  const byId = Object.fromEntries(services.map((s) => [s.id, s]));
  const webUrl = `http://${lanIp}:5173`;
  const apiUrl = `http://${lanIp}:3000`;
  const webRunning = byId.web?.status === 'running';
  const apiRunning = byId.api?.status === 'running';

  deviceRows.innerHTML = `
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

  if (apiRunning) {
    deviceSnippet.hidden = false;
    deviceSnippetPre.textContent = apiLocalStorageSnippet(lanIp);
  } else {
    deviceSnippet.hidden = true;
  }
}

function renderCard(svc) {
  const busy = pending.has(svc.id) || svc.status === 'starting' || svc.status === 'stopping';
  const startDisabled = busy || svc.status === 'running';
  const stopDisabled = busy || svc.status === 'stopped';
  const restartDisabled = busy || svc.status === 'stopped';

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

  const logsOpen = openLogs.has(svc.id);

  return `
    <article class="card" data-id="${svc.id}">
      <div class="card-head">
        <div class="card-title">
          <h2>${escapeHtml(svc.name)}</h2>
          <p class="meta">${open}${lan}port ${svc.port} · ${svc.kind}${
            svc.ownedPid ? ` · pid ${svc.ownedPid}` : ''
          }${svc.containerStatus ? ` · docker ${svc.containerStatus}` : ''}</p>
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

async function refreshLogs(id) {
  if (!openLogs.has(id)) return;
  try {
    const data = await api(`/api/services/${id}/logs?lines=100`);
    const pre = root.querySelector(`[data-logs="${id}"] pre`);
    if (pre) {
      pre.textContent = data.logs || '(no log output yet)';
      pre.scrollTop = pre.scrollHeight;
    }
  } catch {
    /* ignore */
  }
}

function render(payload) {
  lastPayload = payload;
  const services = payload.services || [];
  renderDeviceAccess(payload.lanIp || null, services);
  root.innerHTML = services.map(renderCard).join('');
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
    if (openLogs.has(id)) openLogs.delete(id);
    else openLogs.add(id);
    poll();
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

document.getElementById('btn-copy-snippet').addEventListener('click', () => {
  const lanIp = lastPayload.lanIp;
  if (!lanIp) return;
  copyText(apiLocalStorageSnippet(lanIp));
});

document.getElementById('btn-start-all').addEventListener('click', () => runStack('start'));
document.getElementById('btn-stop-all').addEventListener('click', () => runStack('stop'));

poll();
setInterval(poll, 2000);
