import { api } from '../api.js';
import { showToast, confirmDialog, openModal, showLoader } from '../utils.js';
import { tw, cx } from '../ui.js';

const pingTimers = new Map();

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function getIntervalOptions(selected = 5) {
  let html = '';
  for (let minutes = 5; minutes <= 120; minutes += 5) {
    html += `<option value="${minutes}" ${minutes === selected ? 'selected' : ''}>Cada ${minutes} min</option>`;
  }
  return html;
}

function getRowEl(id) {
  return document.querySelector(`tr[data-servicio-id="${id}"]`);
}

function applyRowStatus(id, status) {
  const row = getRowEl(id);
  if (!row) return;

  row.className = cx(
    'border-b border-slate-100',
    status === 'online' && 'bg-green-50/50',
    status === 'offline' && 'bg-red-50/50',
    status === 'checking' && 'bg-amber-50/50',
  );

  const statusEl = row.querySelector('[data-role="status"]');
  if (!statusEl) return;

  if (status === 'online') {
    statusEl.textContent = 'En línea';
    statusEl.className = tw.statusOnline;
  } else if (status === 'offline') {
    statusEl.textContent = 'Fuera de línea';
    statusEl.className = tw.statusOffline;
  } else if (status === 'checking') {
    statusEl.innerHTML = '<span class="inline-flex items-center gap-1.5"><i class="fa-solid fa-spinner fa-spin"></i> Verificando...</span>';
    statusEl.className = tw.statusChecking;
  } else {
    statusEl.textContent = 'Sin verificar';
    statusEl.className = tw.statusMuted;
  }

  row.querySelectorAll('.btn-ping').forEach((btn) => {
    btn.disabled = status === 'checking';
  });
}

async function pingServicio(id, { silent = false } = {}) {
  applyRowStatus(id, 'checking');
  try {
    const result = await api.pingServicioOnline(id);
    applyRowStatus(id, 'online');
    if (!silent) showToast(result.mensaje || 'Servicio en línea', 'success');
    return { ok: true, result };
  } catch (err) {
    applyRowStatus(id, 'offline');
    if (!silent) showToast(err.message, 'error');
    return { ok: false, error: err };
  }
}

function clearServicePing(id) {
  const timer = pingTimers.get(id);
  if (timer) {
    clearInterval(timer);
    pingTimers.delete(id);
  }
}

function scheduleServicePing(servicio) {
  clearServicePing(servicio.id);
  const minutes = servicio.pingIntervalMinutes || 5;
  const ms = minutes * 60 * 1000;

  pingServicio(servicio.id, { silent: true });
  const timer = setInterval(() => {
    pingServicio(servicio.id, { silent: true });
  }, ms);
  pingTimers.set(servicio.id, timer);
}

function scheduleAllPings(servicios) {
  stopAllPings();
  servicios.forEach((servicio) => scheduleServicePing(servicio));
}

function stopAllPings() {
  pingTimers.forEach((timer) => clearInterval(timer));
  pingTimers.clear();
}

function getServicioFormHtml(servicio) {
  const data = servicio || {};
  return `
    <form id="servicio-form" novalidate>
      <div class="${tw.formGrid}">
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="servicio-nombre">Nombre del servicio</label>
          <input class="${tw.input}" type="text" id="servicio-nombre" name="nombre" value="${escapeHtml(data.nombre || '')}" required placeholder="Mi API">
        </div>
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="servicio-url">URL</label>
          <input class="${tw.input}" type="text" id="servicio-url" name="url" value="${escapeHtml(data.url || '')}" required placeholder="ejemplo.com/health o https://...">
        </div>
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="servicio-interval">Ping automático</label>
          <select class="${tw.input}" id="servicio-interval" name="pingIntervalMinutes">
            ${getIntervalOptions(data.pingIntervalMinutes || 5)}
          </select>
        </div>
      </div>
      <div class="${tw.formActions}">
        <button type="submit" class="${tw.btnPrimary}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getServicioFormData(form) {
  return {
    nombre: form.querySelector('#servicio-nombre').value.trim(),
    url: form.querySelector('#servicio-url').value.trim(),
    pingIntervalMinutes: parseInt(form.querySelector('#servicio-interval').value, 10),
  };
}

function bindServicioForm(form, close, onSave, afterSave) {
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getServicioFormData(form);

    if (!data.nombre || !data.url) {
      showToast('Completa nombre y URL', 'error');
      return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await onSave(data);
      close();
      if (afterSave) await afterSave();
    } catch (err) {
      showToast(err.message || 'No se pudo guardar el servicio', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function openServicioModal(servicio, reload) {
  const isEdit = Boolean(servicio?.id);
  openModal(isEdit ? 'Editar servicio' : 'Nuevo servicio', getServicioFormHtml(servicio), (_root, close) => {
    const form = document.getElementById('servicio-form');
    bindServicioForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateServicioOnline(servicio.id, data);
        showToast('Servicio actualizado', 'success');
      } else {
        await api.createServicioOnline(data);
        showToast('Servicio creado', 'success');
      }
    }, reload);
    form?.querySelector('#servicio-nombre')?.focus();
  });
}

function bindTableEvents(container, servicios, reload) {
  container.querySelectorAll('.btn-ping').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await pingServicio(btn.dataset.id);
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.servicio-interval-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const id = select.dataset.id;
      const minutes = parseInt(select.value, 10);

      try {
        await api.updateServicioOnline(id, { pingIntervalMinutes: minutes });
        const servicio = servicios.find((s) => s.id === id);
        if (servicio) {
          servicio.pingIntervalMinutes = minutes;
          scheduleServicePing(servicio);
        }
        showToast(`Ping automático cada ${minutes} min`, 'info');
      } catch (err) {
        showToast(err.message, 'error');
        await reload();
      }
    });
  });

  container.querySelectorAll('.btn-edit-servicio').forEach((btn) => {
    btn.addEventListener('click', () => {
      const servicio = servicios.find((s) => String(s.id) === String(btn.dataset.id));
      if (servicio) openServicioModal(servicio, reload);
    });
  });

  container.querySelectorAll('.btn-delete-servicio').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar servicio',
        text: '¿Eliminar este servicio online?',
        icon: 'warning',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;

      try {
        clearServicePing(btn.dataset.id);
        await api.deleteServicioOnline(btn.dataset.id);
        showToast('Servicio eliminado', 'success');
        await reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function renderHostingBanner(hosting) {
  if (!hosting?.conexion) {
    return `
      <div class="${tw.hostingBannerWarn}">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Configura el <strong>Hosting principal</strong> en Configuraciones para usar esta sección.</span>
      </div>
    `;
  }
  return '';
}

export async function openNewServicioModal() {
  try {
    const hosting = await api.getHostingStatus();
    if (!hosting.principalConexionId) {
      showToast('Configura el Hosting principal en Configuraciones', 'error');
      return;
    }
    openServicioModal(null, () => window.__reloadServiciosOnline?.());
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function renderServiciosOnline(container) {
  showLoader(container, 'Cargando servicios...');

  let hosting;
  let servicios = [];

  try {
    hosting = await api.getHostingStatus();
  } catch (err) {
    container.innerHTML = `<div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (!hosting.principalConexionId) {
    stopAllPings();
    container.innerHTML = `
      ${renderHostingBanner(hosting)}
      <div class="${tw.empty}">
        <i class="fa-solid fa-globe text-3xl text-slate-400"></i>
        <h3 class="text-lg font-semibold text-slate-800">Hosting principal no configurado</h3>
        <p class="text-sm text-slate-500">Ve a Configuraciones y selecciona la conexión del hosting.</p>
      </div>
    `;
    return;
  }

  try {
    servicios = await api.getServiciosOnline();
  } catch (err) {
    container.innerHTML = `
      ${renderHostingBanner(hosting)}
      <div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>
    `;
    return;
  }

  if (!servicios.length) {
    stopAllPings();
    container.innerHTML = `
      ${renderHostingBanner(hosting)}
      <div class="${tw.empty}">
        <i class="fa-solid fa-globe text-3xl text-slate-400"></i>
        <h3 class="text-lg font-semibold text-slate-800">Sin servicios online</h3>
        <p class="text-sm text-slate-500">Agrega URLs para monitorear su disponibilidad con ping manual o automático.</p>
        <button class="${tw.btnPrimary}" id="btn-first-servicio" type="button">
          <i class="fa-solid fa-plus"></i> Agregar servicio
        </button>
      </div>
    `;
    document.getElementById('btn-first-servicio').addEventListener('click', openNewServicioModal);
    return;
  }

  container.innerHTML = `
    ${renderHostingBanner(hosting)}
    <div class="${tw.tablePanel}">
      <table class="${tw.table}">
        <thead>
          <tr>
            <th class="${tw.th}">Servicio</th>
            <th class="${tw.th}">URL</th>
            <th class="${tw.th}">Estado</th>
            <th class="${tw.th}">Ping automático</th>
            <th class="${tw.th}">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${servicios.map((s) => `
            <tr data-servicio-id="${escapeHtml(s.id)}">
              <td class="${cx(tw.td, 'font-medium text-slate-800')}">${escapeHtml(s.nombre)}</td>
              <td class="${tw.td}"><a class="text-blue-600 underline-offset-2 hover:underline" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.url)}</a></td>
              <td class="${tw.td}"><span class="${tw.statusMuted}" data-role="status">Sin verificar</span></td>
              <td class="${tw.td}">
                <select class="${cx(tw.input, 'servicio-interval-select max-w-40')}" data-id="${escapeHtml(s.id)}" title="Intervalo de ping automático">
                  ${getIntervalOptions(s.pingIntervalMinutes || 5)}
                </select>
              </td>
              <td class="${cx(tw.td, tw.tableActions)}">
                <button class="${cx(tw.btnGhost, tw.btnSm)} btn-ping" data-id="${escapeHtml(s.id)}" title="Hacer ping">
                  <i class="fa-solid fa-signal"></i> Ping
                </button>
                <button class="${cx(tw.btnGhost, tw.btnSm)} btn-edit-servicio" data-id="${escapeHtml(s.id)}" title="Editar">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="${cx(tw.btnDanger, tw.btnSm)} btn-delete-servicio" data-id="${escapeHtml(s.id)}" title="Eliminar">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const reload = () => window.__reloadServiciosOnline?.();
  bindTableEvents(container, servicios, reload);
  scheduleAllPings(servicios);
}

export function cleanupServiciosOnlinePage() {
  stopAllPings();
}
