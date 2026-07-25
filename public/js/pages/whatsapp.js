import { api } from '../api.js';
import { showToast, confirmDialog, showLoader } from '../utils.js';
import { speakQueued } from '../tts.js';
import {
  isWhatsAppTtsEnabled,
  setWhatsAppTtsEnabled,
  onWhatsAppTtsChange,
  isWhatsAppTtsSenderOnly,
  setWhatsAppTtsSenderOnly,
  onWhatsAppTtsSenderOnlyChange,
  loadWhatsAppConfig,
  refreshWhatsAppListener,
  syncWhatsAppMessagesToPage,
  getContactDisplayName,
  formatMessageForSpeech,
  getWhatsAppOmitConfig,
  setWhatsAppOmittedWords,
} from '../services/whatsapp.js';
import { tw, cx } from '../ui.js';

let pollTimer = null;
let unsubscribeTts = null;
let unsubscribeSenderOnly = null;
let omitSaveTimer = null;
let cachedMessages = [];
let cachedState = { status: 'idle', qr: null, error: null, info: null };
let pageContainer = null;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function formatTime(ts) {
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status) {
  const labels = {
    idle: 'Sin iniciar',
    initializing: 'Iniciando...',
    qr: 'Escanea el código QR',
    authenticated: 'Autenticando...',
    ready: 'Conectado',
    disconnected: 'Desconectado',
    error: 'Error',
  };
  return labels[status] || status;
}

function statusClass(status) {
  const map = {
    ready: tw.statusOnline,
    authenticated: 'font-semibold text-blue-600',
    qr: tw.statusChecking,
    initializing: tw.statusChecking,
    error: tw.statusOffline,
    disconnected: tw.statusOffline,
    idle: tw.statusMuted,
  };
  return cx('text-sm', map[status] || tw.statusMuted);
}

function extractState(data = {}) {
  return {
    status: data.status ?? cachedState.status,
    qr: data.qr ?? cachedState.qr,
    error: data.error ?? cachedState.error,
    info: data.info ?? cachedState.info,
  };
}

function renderMessageRows(messages) {
  return messages.map((m) => `
    <tr data-id="${escapeHtml(m.id)}">
      <td class="${tw.td}">${escapeHtml(getContactDisplayName(m))}</td>
      <td class="${tw.td}">${escapeHtml(m.body || `[${m.type || 'mensaje'}]`)}</td>
      <td class="${tw.td}">${formatTime(m.timestamp)}</td>
      <td class="${tw.td}">
        <button class="${cx(tw.btnGhost, tw.btnSm)} btn-speak-msg" type="button" data-id="${escapeHtml(m.id)}" title="Escuchar">
          <i class="fa-solid fa-volume-high"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function updateMessagesTable(container, messages) {
  const list = Array.isArray(messages) ? messages : [];
  const tbody = container.querySelector('#wa-messages-tbody');
  const table = container.querySelector('#wa-messages-table');
  const empty = container.querySelector('#wa-messages-empty');
  const loading = container.querySelector('#wa-messages-loading');

  if (loading) loading.hidden = true;

  if (!list.length) {
    if (table) table.hidden = true;
    if (empty) empty.hidden = false;
    if (tbody) tbody.innerHTML = '';
    return;
  }

  if (table) table.hidden = false;
  if (empty) empty.hidden = true;
  if (tbody) tbody.innerHTML = renderMessageRows(list);
  bindMessageEvents(container);
}

function bindMessageEvents(container) {
  container.querySelectorAll('.btn-speak-msg').forEach((btn) => {
    btn.addEventListener('click', () => {
      const msg = cachedMessages.find((m) => m.id === btn.dataset.id);
      if (!msg) return;
      const speech = formatMessageForSpeech(msg);
      if (speech) speakQueued(speech);
    });
  });
}

function updateQrInSidebar(container, state) {
  const qrBox = container.querySelector('#wa-sidebar-qr');
  if (!qrBox) return;

  const showQr = state.status === 'qr' && state.qr;

  if (showQr) {
    qrBox.hidden = false;
    qrBox.innerHTML = `
      <div class="space-y-3 text-center">
        <h3 class="flex items-center justify-center gap-2 text-sm font-semibold text-slate-800"><i class="fa-solid fa-qrcode"></i> Escanea con WhatsApp</h3>
        <p class="text-xs text-slate-500">WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
        <img src="${state.qr}" alt="Código QR WhatsApp" class="mx-auto max-w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      </div>
    `;
  } else {
    qrBox.hidden = true;
    qrBox.innerHTML = '';
  }
}

function updateView(container, state, messages) {
  if (!container?.isConnected) return;

  const list = Array.isArray(messages) ? messages : [];

  cachedState = state;
  cachedMessages = list;

  const statusEl = container.querySelector('#wa-connection-status');
  const userEl = container.querySelector('#wa-user-info');
  const startBtn = container.querySelector('#wa-start-btn');
  const logoutBtn = container.querySelector('#wa-logout-btn');

  if (statusEl) {
    statusEl.textContent = statusLabel(state.status);
    statusEl.className = statusClass(state.status);
  }

  if (userEl) {
    if (state.status === 'error' && state.error) {
      userEl.textContent = `Error: ${state.error}`;
      userEl.className = 'text-sm text-red-600';
    } else {
      userEl.className = 'text-sm text-slate-500';
      userEl.textContent = state.info?.pushname
        ? `Sesión: ${state.info.pushname} (${state.info.wid || ''})`
        : '';
    }
  }

  updateQrInSidebar(container, state);
  updateMessagesTable(container, list);

  if (startBtn) {
    startBtn.disabled = ['initializing', 'authenticated', 'ready'].includes(state.status);
    startBtn.innerHTML = state.status === 'ready'
      ? '<i class="fa-solid fa-circle-check"></i> Conectado'
      : '<i class="fa-brands fa-whatsapp"></i> Iniciar sesión';
  }

  if (logoutBtn) {
    logoutBtn.hidden = !['ready', 'authenticated', 'qr', 'disconnected', 'error'].includes(state.status)
      || state.status === 'idle';
  }
}

async function refreshState(container, { showMessagesLoader = false } = {}) {
  if (!container?.isConnected) return;

  const loading = container.querySelector('#wa-messages-loading');

  if (showMessagesLoader) {
    updateQrInSidebar(container, cachedState);
    if (loading) loading.hidden = false;
  }

  try {
    const [state, messages] = await Promise.all([
      api.getWhatsAppStatus(),
      api.getWhatsAppMessages(),
    ]);
    updateView(container, state, Array.isArray(messages) ? messages : []);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function upsertMessage(message) {
  if (!message?.id) return;
  const index = cachedMessages.findIndex((m) => m.id === message.id);
  if (index >= 0) {
    cachedMessages[index] = { ...cachedMessages[index], ...message };
  } else {
    cachedMessages.unshift(message);
  }
}

function handleWhatsAppEvent(data) {
  const container = pageContainer;
  if (!container?.isConnected || !data) return;

  if (data.type === 'init' || data.type === 'messages_sync') {
    cachedMessages = [...(Array.isArray(data.messages) ? data.messages : [])];
    updateView(container, extractState(data), cachedMessages);
    return;
  }

  if (data.type === 'status') {
    updateView(container, extractState(data), cachedMessages);
    return;
  }

  if (data.type === 'message' && data.message) {
    upsertMessage(data.message);
    updateView(container, cachedState, cachedMessages);
    return;
  }

  if (data.type === 'message_update' && data.message) {
    upsertMessage(data.message);
    updateView(container, cachedState, cachedMessages);
    return;
  }
}

function scheduleOmitSave(fn) {
  clearTimeout(omitSaveTimer);
  omitSaveTimer = setTimeout(fn, 500);
}

export async function renderWhatsapp(container) {
  pageContainer = container;
  showLoader(container, 'Cargando WhatsApp...');
  await loadWhatsAppConfig();
  const ttsOn = isWhatsAppTtsEnabled();
  const senderOnly = isWhatsAppTtsSenderOnly();
  const omitConfig = getWhatsAppOmitConfig();

  container.innerHTML = `
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <div class="${cx(tw.panel, 'space-y-4')}">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="flex items-center gap-2 text-lg font-semibold text-slate-800"><i class="fa-brands fa-whatsapp text-green-600"></i> WhatsApp</h2>
          <span class="${statusClass('idle')}" id="wa-connection-status">Sin iniciar</span>
        </div>
        <p class="text-sm text-slate-500" id="wa-user-info"></p>

        <div class="flex flex-wrap gap-2">
          <button class="${tw.btnPrimary}" id="wa-start-btn" type="button">
            <i class="fa-brands fa-whatsapp"></i> Iniciar sesión
          </button>
          <button class="${tw.btnDanger}" id="wa-logout-btn" type="button" hidden>
            <i class="fa-solid fa-right-from-bracket"></i> Cerrar sesión
          </button>
        </div>

        <label class="${tw.checkbox}">
          <input type="checkbox" id="wa-tts-toggle" ${ttsOn ? 'checked' : ''}>
          Leer mensajes entrantes en voz alta
        </label>

        <label class="${tw.checkbox}">
          <input type="checkbox" id="wa-tts-sender-only" ${senderOnly ? 'checked' : ''}>
          Solo anunciar remitente (sin leer el mensaje)
        </label>

        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="wa-omit-words">Palabras omitidas</label>
          <input class="${tw.input}" type="text" id="wa-omit-words" value="${escapeHtml(omitConfig.omittedWords)}" placeholder="promo, oferta, descuento">
          <small class="mt-1 text-xs text-slate-500">Separadas por coma. No se leerán al anunciar mensajes.</small>
        </div>

        <div id="wa-sidebar-qr" class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4" hidden></div>
      </div>

      <div class="${cx(tw.panel, 'flex min-h-[28rem] flex-col')}">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 class="flex items-center gap-2 text-base font-semibold text-slate-800"><i class="fa-solid fa-inbox"></i> Mensajes sin leer</h3>
          <button class="${cx(tw.btnGhost, tw.btnSm)}" id="wa-refresh-btn" type="button" title="Refrescar">
            <i class="fa-solid fa-rotate"></i> Refrescar
          </button>
        </div>
        <div class="relative min-h-0 flex-1 overflow-auto">
          <div id="wa-messages-loading" class="flex flex-col items-center justify-center gap-3 py-12 text-slate-500" hidden>
            <i class="fa-solid fa-spinner fa-spin text-2xl"></i>
            <span class="text-sm">Cargando mensajes...</span>
          </div>
          <div id="wa-messages-empty" class="flex flex-col items-center justify-center gap-3 py-16 text-center text-slate-500">
            <i class="fa-brands fa-whatsapp text-3xl text-slate-300"></i>
            <p class="text-sm">Los mensajes sin leer aparecerán aquí</p>
          </div>
          <table id="wa-messages-table" class="${tw.table}" hidden>
            <thead>
              <tr>
                <th class="${tw.th}">Remitente</th>
                <th class="${tw.th}">Mensaje</th>
                <th class="${tw.th}">Fecha</th>
                <th class="${tw.th}"></th>
              </tr>
            </thead>
            <tbody id="wa-messages-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const ttsToggle = container.querySelector('#wa-tts-toggle');
  ttsToggle.addEventListener('change', () => {
    setWhatsAppTtsEnabled(ttsToggle.checked);
    showToast(ttsToggle.checked ? 'Lectura en voz alta activada' : 'Lectura en voz alta desactivada', 'info');
  });

  const senderOnlyToggle = container.querySelector('#wa-tts-sender-only');
  senderOnlyToggle.addEventListener('change', async () => {
    await setWhatsAppTtsSenderOnly(senderOnlyToggle.checked);
    showToast(
      senderOnlyToggle.checked
        ? 'Solo se anunciará el remitente'
        : 'Se leerá el mensaje completo',
      'info'
    );
  });

  unsubscribeTts = onWhatsAppTtsChange((enabled) => {
    ttsToggle.checked = enabled;
  });

  unsubscribeSenderOnly = onWhatsAppTtsSenderOnlyChange((enabled) => {
    senderOnlyToggle.checked = enabled;
  });

  container.querySelector('#wa-omit-words')?.addEventListener('input', (e) => {
    scheduleOmitSave(() => setWhatsAppOmittedWords(e.target.value));
  });

  container.querySelector('#wa-refresh-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#wa-refresh-btn');
    btn.disabled = true;
    try {
      await refreshWhatsAppListener();
      await refreshState(container, { showMessagesLoader: true });
      showToast('WhatsApp refrescado', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  container.querySelector('#wa-start-btn').addEventListener('click', async () => {
    try {
      const result = await api.startWhatsApp();
      if (result.status === 'error' && result.error) {
        showToast(result.error, 'error');
      } else {
        showToast('Iniciando WhatsApp, espera el código QR', 'info');
      }
      await refreshState(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelector('#wa-logout-btn').addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Cerrar sesión',
      text: '¿Deseas cerrar la sesión de WhatsApp en este dispositivo?',
      confirmText: 'Sí, cerrar',
    });
    if (!confirmed) return;

    try {
      await api.logoutWhatsApp();
      showToast('Sesión cerrada', 'success');
      await refreshState(container);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  window.__onWhatsAppEvent = handleWhatsAppEvent;

  await syncWhatsAppMessagesToPage();
  await refreshState(container, { showMessagesLoader: true });

  pollTimer = setInterval(() => refreshState(container), 5000);
}

export function cleanupWhatsappPage() {
  if (omitSaveTimer) {
    clearTimeout(omitSaveTimer);
    omitSaveTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (unsubscribeTts) {
    unsubscribeTts();
    unsubscribeTts = null;
  }
  if (unsubscribeSenderOnly) {
    unsubscribeSenderOnly();
    unsubscribeSenderOnly = null;
  }
  window.__onWhatsAppEvent = null;
  pageContainer = null;
}
