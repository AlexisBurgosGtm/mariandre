import { api } from '../api.js';
import { showToast, confirmDialog, openModal, getTipoBadge, getFormHtml, bindFormEvents, showLoader, showTableLoader } from '../utils.js';
import { runConnectionTest } from '../services/connections.js';
import { tw, cx } from '../ui.js';

const PING_INTERVAL_MS = 5 * 60 * 1000;

let pingTimer = null;
let autoPingEnabled = true;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function getCardEl(id) {
  return document.querySelector(`[data-conexion-id="${id}"]`);
}

function formatDbSizeMb(mb) {
  if (mb == null || Number.isNaN(Number(mb))) return null;
  return Number(mb).toLocaleString('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function applyCardStatus(id, status, meta = {}) {
  const card = getCardEl(id);
  if (!card) return;

  const ring =
    status === 'online' ? tw.cardRingOnline
      : status === 'offline' ? tw.cardRingOffline
        : status === 'checking' ? tw.cardRingChecking
          : '';
  card.className = cx(tw.card, ring);

  const statusEl = card.querySelector('[data-role="status"]');
  const sizeEl = card.querySelector('[data-role="db-size"]');
  if (!statusEl) return;

  if (status === 'online') {
    statusEl.textContent = 'Activa';
    statusEl.className = tw.statusOnline;
    if (sizeEl) {
      const formatted = formatDbSizeMb(meta.databaseSizeMb);
      if (formatted != null) {
        sizeEl.textContent = `${formatted} MB`;
        sizeEl.hidden = false;
      } else {
        sizeEl.textContent = '';
        sizeEl.hidden = true;
      }
    }
  } else if (status === 'offline') {
    statusEl.textContent = 'Inactiva';
    statusEl.className = tw.statusOffline;
    if (sizeEl) {
      sizeEl.textContent = '';
      sizeEl.hidden = true;
    }
  } else if (status === 'checking') {
    statusEl.textContent = 'Verificando...';
    statusEl.className = tw.statusChecking;
    if (sizeEl) {
      sizeEl.textContent = '';
      sizeEl.hidden = true;
    }
  } else {
    statusEl.textContent = 'Sin verificar';
    statusEl.className = tw.statusMuted;
    if (sizeEl) {
      sizeEl.textContent = '';
      sizeEl.hidden = true;
    }
  }
}

async function pingConnection(id) {
  applyCardStatus(id, 'checking');
  try {
    const result = await api.testConexion(id);
    applyCardStatus(id, 'online', { databaseSizeMb: result.databaseSizeMb });
    return { ok: true };
  } catch {
    applyCardStatus(id, 'offline');
    return { ok: false };
  }
}

async function pingAllConnections(ids) {
  await Promise.all(ids.map((id) => pingConnection(id)));
}

function startPingTimer(ids) {
  stopPingTimer();
  if (!autoPingEnabled || !ids.length) return;

  pingTimer = setInterval(() => {
    pingAllConnections(ids);
  }, PING_INTERVAL_MS);
}

function stopPingTimer() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function renderCard(conexion) {
  const puerto = conexion.puerto || (conexion.tipo === 'mssql' ? 1433 : 3306);
  return `
    <div class="${tw.card}" data-conexion-id="${conexion.id}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-base font-semibold text-slate-900">${escapeHtml(conexion.nombre)}</div>
          <div class="text-sm text-slate-500">${escapeHtml(conexion.host)}:${puerto}</div>
        </div>
        <div class="flex flex-col items-end gap-2">
          <div class="flex flex-col items-end gap-0.5 text-right">
            <span class="${tw.statusMuted}" data-role="status">Sin verificar</span>
            <span class="text-xs text-slate-500" data-role="db-size" hidden></span>
          </div>
          ${getTipoBadge(conexion.tipo)}
        </div>
      </div>
      <div class="flex flex-col gap-1.5 text-sm text-slate-600">
        <div class="flex items-center gap-2"><i class="fa-solid fa-database text-slate-400"></i> ${escapeHtml(conexion.baseDatos)}</div>
        <div class="flex items-center gap-2"><i class="fa-solid fa-user text-slate-400"></i> ${escapeHtml(conexion.usuario || '—')}</div>
        <div class="flex items-center gap-2"><i class="fa-solid fa-fingerprint text-slate-400"></i> ID: ${escapeHtml(conexion.id)}</div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="${cx(tw.btnGhost, tw.btnSm)} btn-query" data-id="${conexion.id}" data-nombre="${escapeHtml(conexion.nombre)}" title="Ejecutar consulta SQL">
          <i class="fa-solid fa-terminal"></i> Query
        </button>
        <button class="${cx(tw.btnGhost, tw.btnSm)} btn-test" data-id="${conexion.id}" data-nombre="${escapeHtml(conexion.nombre)}">
          <i class="fa-solid fa-plug"></i> Probar
        </button>
        <button class="${cx(tw.btnGhost, tw.btnSm)} btn-edit" data-id="${conexion.id}" title="Editar">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="${cx(tw.btnDanger, tw.btnSm)} btn-delete" data-id="${conexion.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function openQueryModal(conexion) {
  openModal(`Query SQL — ${escapeHtml(conexion.nombre)}`, `
    <div class="${tw.formGroupFull}">
      <label class="${tw.label}" for="sql-query-input">Consulta SQL</label>
      <textarea class="${tw.input}" id="sql-query-input" rows="8" placeholder="SELECT * FROM tabla LIMIT 10;"></textarea>
    </div>
    <div class="${tw.formActions}">
      <button type="button" class="${tw.btnPrimary}" id="btn-exec-query">
        <i class="fa-solid fa-play"></i> Ejecutar
      </button>
    </div>
    <pre id="sql-query-result" class="${tw.sqlResult}" hidden></pre>
  `, () => {
    const execBtn = document.getElementById('btn-exec-query');
    const input = document.getElementById('sql-query-input');
    const resultEl = document.getElementById('sql-query-result');

    execBtn.addEventListener('click', async () => {
      const query = input.value.trim();
      if (!query) {
        showToast('Escribe una consulta SQL', 'error');
        return;
      }

      execBtn.disabled = true;
      resultEl.hidden = false;
      showTableLoader(resultEl, 'Ejecutando consulta...');

      try {
        const result = await api.executeConexionQuery(conexion.id, query);
        showToast(result.mensaje || 'Query ejecutada', 'success');
        resultEl.textContent = JSON.stringify({
          mensaje: result.mensaje,
          filas: result.rowCount ?? result.rowsAffected,
          datos: result.rows || [],
        }, null, 2);
        resultEl.hidden = false;
      } catch (err) {
        showToast(err.message, 'error');
        resultEl.textContent = err.message;
        resultEl.hidden = false;
      } finally {
        execBtn.disabled = false;
      }
    });
  });
}

function bindCardEvents(container, conexiones, reload) {
  container.querySelectorAll('.btn-query').forEach((btn) => {
    btn.addEventListener('click', () => {
      const conexion = conexiones.find((c) => c.id === btn.dataset.id);
      if (conexion) openQueryModal(conexion);
    });
  });

  container.querySelectorAll('.btn-test').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await runConnectionTest(btn.dataset.id, btn.dataset.nombre, {
          onStatus: (status, meta = {}) => applyCardStatus(btn.dataset.id, status, meta),
        });
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const conexion = await api.getConexion(btn.dataset.id);
        openEditModal(conexion, reload);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar conexión',
        text: '¿Estás seguro de que deseas eliminar esta conexión? Esta acción no se puede deshacer.',
        icon: 'warning',
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
      });
      if (!confirmed) return;

      try {
        await api.deleteConexion(btn.dataset.id);
        showToast('Conexión eliminada', 'success');
        await reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function bindAutoPingToggle(conexiones) {
  const toggle = document.getElementById('auto-ping-toggle');
  if (!toggle) return;

  toggle.addEventListener('change', async () => {
    autoPingEnabled = toggle.checked;
    try {
      await api.updateConfig({ conexiones: { autoPing: autoPingEnabled } });
    } catch (err) {
      showToast(err.message, 'error');
      toggle.checked = !autoPingEnabled;
      autoPingEnabled = toggle.checked;
      return;
    }

    if (autoPingEnabled) {
      showToast('Monitoreo automático activado', 'info');
      await pingAllConnections(conexiones.map((c) => c.id));
      startPingTimer(conexiones.map((c) => c.id));
    } else {
      showToast('Monitoreo automático desactivado', 'info');
      stopPingTimer();
    }
  });
}

function openCreateModal(reload) {
  openModal('Nueva conexión', getFormHtml(), (_root, close) => {
    const form = document.getElementById('conexion-form');
    form.btnTestForm = document.getElementById('btn-test-form');
    bindFormEvents(form, close, async (data) => {
      await api.createConexion(data);
      showToast('Conexión creada', 'success');
    }, reload);
  });
}

function openEditModal(conexion, reload) {
  openModal('Editar conexión', getFormHtml(conexion), (_root, close) => {
    const form = document.getElementById('conexion-form');
    form.btnTestForm = document.getElementById('btn-test-form');
    bindFormEvents(form, close, async (data) => {
      await api.updateConexion(conexion.id, data);
      showToast('Conexión actualizada', 'success');
    }, reload);
  });
}

export function setupConexionesActions(onNew) {
  onNew(() => openCreateModal(window.__reloadConexiones));
}

export async function renderConexiones(container) {
  showLoader(container, 'Cargando conexiones...');

  let conexiones = [];
  try {
    conexiones = await api.getConexiones();
  } catch (err) {
    showToast(err.message, 'error');
  }

  try {
    const config = await api.getConfig();
    autoPingEnabled = config?.conexiones?.autoPing !== false;
  } catch {
    autoPingEnabled = true;
  }

  if (!conexiones.length) {
    stopPingTimer();
    container.innerHTML = `
      <div class="${tw.empty}">
        <i class="fa-solid fa-database text-3xl text-slate-400"></i>
        <h3 class="text-lg font-semibold text-slate-800">Sin conexiones configuradas</h3>
        <p class="text-sm text-slate-500">Agrega tu primera conexión a SQL Server o MySQL para comenzar.</p>
        <button class="${tw.btnPrimary}" id="btn-first-add">
          <i class="fa-solid fa-plus"></i> Agregar conexión
        </button>
      </div>
    `;
    document.getElementById('btn-first-add').addEventListener('click', () => {
      openCreateModal(() => window.__reloadConexiones?.());
    });
    return;
  }

  const ids = conexiones.map((c) => c.id);

  container.innerHTML = `
    <div class="${cx(tw.glass, 'mb-4 rounded-2xl px-4 py-3')}">
      <label class="${tw.checkbox}">
        <input type="checkbox" id="auto-ping-toggle" ${autoPingEnabled ? 'checked' : ''}>
        Monitoreo automático de conexiones (cada 5 min)
      </label>
    </div>
    <div class="${tw.cardGrid}" id="conexiones-grid">
      ${conexiones.map((c) => renderCard(c)).join('')}
    </div>
  `;

  const reload = () => window.__reloadConexiones?.();
  const grid = document.getElementById('conexiones-grid');

  bindCardEvents(grid, conexiones, reload);
  bindAutoPingToggle(conexiones);

  if (autoPingEnabled) {
    await pingAllConnections(ids);
    startPingTimer(ids);
  }
}

export function cleanupConexionesPage() {
  stopPingTimer();
}

export function openNewConexionModal() {
  openCreateModal(() => window.__reloadConexiones?.());
}
