const root = document.getElementById('services');
const banner = document.getElementById('banner');
const openLogs = new Set();
const pending = new Set();

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

function renderCard(svc) {
  const busy = pending.has(svc.id) || svc.status === 'starting' || svc.status === 'stopping';
  const startDisabled = busy || svc.status === 'running';
  const stopDisabled = busy || svc.status === 'stopped';
  const restartDisabled = busy || svc.status === 'stopped';

  const open = svc.openUrl
    ? `<a href="${svc.openUrl}" target="_blank" rel="noreferrer">open</a> · `
    : '';

  const logsOpen = openLogs.has(svc.id);

  return `
    <article class="card" data-id="${svc.id}">
      <div class="card-head">
        <div class="card-title">
          <h2>${escapeHtml(svc.name)}</h2>
          <p class="meta">${open}port ${svc.port} · ${svc.kind}${
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function render(services) {
  root.innerHTML = services.map(renderCard).join('');
  for (const id of openLogs) refreshLogs(id);
}

async function poll() {
  try {
    const data = await api('/api/services');
    render(data.services || []);
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

document.getElementById('btn-start-all').addEventListener('click', () => runStack('start'));
document.getElementById('btn-stop-all').addEventListener('click', () => runStack('stop'));

poll();
setInterval(poll, 2000);
