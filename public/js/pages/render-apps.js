import { api } from '../api.js';
import { showToast, confirmDialog, confirmTypedWord, openModal, showLoader, showTableLoader, renderLoader } from '../utils.js';
import { tw, cx } from '../ui.js';

let pageState = {
  selectedIdRender: null,
  cuentaSearch: '',
  appSearch: '',
  globalAppSearch: '',
  globalAppResults: [],
  cuentas: [],
  apps: [],
};

const rowBase = 'cursor-pointer transition hover:bg-slate-50';
const rowSelected = 'bg-blue-50';
const tableCls = 'w-full border-collapse text-left text-[11px] leading-snug';
const thCls =
  'sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur';
const tdCls = 'border-b border-slate-100 px-2 py-1.5 align-middle text-slate-600';
const searchInput = cx(tw.input, 'max-w-xs px-2.5 py-1.5 text-xs');
const panelCls =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-3 shadow-sm backdrop-blur-xl sm:p-4';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function toAppHref(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function renderAppUrlLink(url, extraClass = '') {
  const href = toAppHref(url);
  if (!href) return '—';
  return `<a
    href="${escapeHtml(href)}"
    target="_blank"
    rel="noopener noreferrer"
    class="${cx('text-blue-600 underline decoration-blue-300 underline-offset-2 transition hover:text-blue-700', extraClass)}"
    title="${escapeHtml(url)}"
  >${escapeHtml(url)}</a>`;
}

function filterCuentas(rows, search) {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    return [r.EMAIL, String(r.IDRENDER)].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function getSelectedCuenta() {
  return pageState.cuentas.find((c) => String(c.IDRENDER) === String(pageState.selectedIdRender)) || null;
}

function bindForm(form, close, onSave, afterSave) {
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await onSave();
      close();
      if (afterSave) await afterSave();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function getCuentaFormHtml(record) {
  const data = record || {};
  const isEdit = Boolean(data.IDRENDER);

  return `
    <form id="render-cuenta-form" autocomplete="off" novalidate>
      <div class="${tw.formGrid}">
        ${isEdit ? `
          <div class="${tw.formGroup}">
            <label class="${tw.label}" for="cuenta-id">IDRENDER</label>
            <input class="${tw.input}" type="text" id="cuenta-id" value="${escapeHtml(data.IDRENDER)}" readonly tabindex="-1">
          </div>
        ` : ''}
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="cuenta-email">EMAIL</label>
          <input class="${tw.input}" type="text" id="cuenta-email" name="render-email" value="${escapeHtml(data.EMAIL || '')}" autocomplete="off" required>
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="cuenta-pass">PASS</label>
          <input class="${tw.input}" type="text" id="cuenta-pass" name="render-pass" value="${escapeHtml(data.PASS || '')}" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other">
        </div>
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="cuenta-apikey">APIKEY</label>
          <input class="${tw.input}" type="text" id="cuenta-apikey" name="render-apikey" value="${escapeHtml(data.APIKEY || '')}" placeholder="rnd_..." autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-form-type="other">
          <small class="mt-1 text-xs text-slate-500">API key de Render.com para consultar uso de horas</small>
        </div>
      </div>
      <div class="${tw.formActions}">
        <button type="submit" class="${tw.btnPrimary}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function openCuentaModal(record, reload) {
  const isEdit = Boolean(record?.IDRENDER);
  openModal(isEdit ? 'Editar cuenta Render' : 'Nueva cuenta Render', getCuentaFormHtml(record), (_root, close) => {
    const form = document.getElementById('render-cuenta-form');
    bindForm(form, close, async () => {
      const payload = {
        EMAIL: form.querySelector('#cuenta-email').value.trim(),
        PASS: form.querySelector('#cuenta-pass').value.trim(),
        APIKEY: form.querySelector('#cuenta-apikey').value.trim(),
      };
      if (!payload.EMAIL) throw new Error('EMAIL es obligatorio');
      if (isEdit) {
        await api.updateRenderCuenta(record.IDRENDER, payload);
        showToast('Cuenta actualizada', 'success');
      } else {
        await api.createRenderCuenta(payload);
        showToast('Cuenta creada', 'success');
      }
    }, reload);
  });
}

function renderApiKeyBadge(apikey) {
  const hasKey = Boolean(String(apikey || '').trim());
  return `<span class="${cx(
    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
    hasKey ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
  )}">${hasKey ? 'SI' : 'NO'}</span>`;
}

function renderCuentasTable(rows, selectedId) {
  if (!rows.length) {
    return `<p class="px-2 py-6 text-center text-xs text-slate-500">No hay cuentas Render</p>`;
  }

  return `
    <table class="${tableCls}">
      <thead>
        <tr>
          <th class="${thCls}">Email</th>
          <th class="${thCls}">Pass</th>
          <th class="${thCls}">API Key</th>
          <th class="${thCls}"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((c) => `
          <tr class="${cx(rowBase, String(selectedId) === String(c.IDRENDER) && rowSelected)} cuenta-row" data-id="${escapeHtml(c.IDRENDER)}">
            <td class="${tdCls}">${escapeHtml(c.EMAIL || '')}</td>
            <td class="${tdCls}"><code class="break-all font-mono text-[10px] text-slate-700">${escapeHtml(c.PASS || '—')}</code></td>
            <td class="${tdCls}">${renderApiKeyBadge(c.APIKEY)}</td>
            <td class="${cx(tdCls, tw.tableActions)}">
              <button type="button" class="${cx(tw.btnGhost, 'px-2 py-1 text-[10px]')} btn-load-webapps" data-id="${escapeHtml(c.IDRENDER)}" title="Cargar webapps desde Render"><i class="fa-solid fa-cloud-arrow-down"></i> Cargar webapps</button>
              <button type="button" class="${cx(tw.btnGhost, 'px-2 py-1 text-[10px]')} btn-usage-cuenta" data-id="${escapeHtml(c.IDRENDER)}" title="Consultar uso de horas"><i class="fa-solid fa-clock"></i></button>
              <button type="button" class="${cx(tw.btnGhost, 'px-2 py-1 text-[10px]')} btn-edit-cuenta" data-id="${escapeHtml(c.IDRENDER)}" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="${cx(tw.btnDanger, 'px-2 py-1 text-[10px]')} btn-delete-cuenta" data-id="${escapeHtml(c.IDRENDER)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderAppsTable(rows) {
  if (!pageState.selectedIdRender) {
    return `<p class="px-2 py-6 text-center text-xs text-slate-500">Selecciona una cuenta para ver sus apps</p>`;
  }
  if (!rows.length) {
    return `<p class="px-2 py-6 text-center text-xs text-slate-500">Sin apps para esta cuenta</p>`;
  }

  return `
    <table class="${tableCls}">
      <thead>
        <tr>
          <th class="${thCls}">URL</th>
          <th class="${thCls}">Service ID</th>
          <th class="${thCls}">Usage</th>
          <th class="${thCls}"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td class="${tdCls}"><span class="block max-w-[16rem] truncate">${renderAppUrlLink(r.URL, 'block truncate')}</span></td>
            <td class="${tdCls}"><code class="break-all font-mono text-[10px] text-slate-700">${escapeHtml(r.SERVICEID || '—')}</code></td>
            <td class="${tdCls} tabular-nums">${escapeHtml(r.USAGE ?? 0)}</td>
            <td class="${cx(tdCls, tw.tableActions)}">
              <button type="button" class="${cx(tw.btnDanger, 'px-2 py-1 text-[10px]')} btn-delete-app" data-id="${escapeHtml(r.IDSERVICIO)}" title="Eliminar en Render y en la base"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderGlobalAppsResults(rows, search) {
  const q = (search || '').trim();
  if (!q) {
    return `<p class="px-2 py-3 text-center text-xs text-slate-400">Escribe para buscar apps en todas las cuentas</p>`;
  }
  if (!rows.length) {
    return `<p class="px-2 py-3 text-center text-xs text-slate-500">Sin resultados para “${escapeHtml(q)}”</p>`;
  }

  return `
    <table class="${tableCls}">
      <thead>
        <tr>
          <th class="${thCls}">URL</th>
          <th class="${thCls}">Cuenta</th>
          <th class="${thCls}">Usage</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr class="${cx(rowBase, 'global-app-row')}" data-idrender="${escapeHtml(r.IDRENDER)}" title="Ver cuenta">
            <td class="${tdCls}"><span class="block max-w-xl truncate">${renderAppUrlLink(r.URL, 'block truncate')}</span></td>
            <td class="${tdCls}">${escapeHtml(r.CUENTA_EMAIL || `ID ${r.IDRENDER}`)}</td>
            <td class="${tdCls} tabular-nums">${escapeHtml(r.USAGE ?? 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function runGlobalAppSearch(container) {
  const panel = container.querySelector('#global-apps-results');
  if (!panel) return;

  const q = pageState.globalAppSearch.trim();
  if (!q) {
    pageState.globalAppResults = [];
    panel.innerHTML = renderGlobalAppsResults([], '');
    return;
  }

  showTableLoader(panel, 'Buscando apps...');
  try {
    pageState.globalAppResults = await api.searchRenderApps(q);
    panel.innerHTML = renderGlobalAppsResults(pageState.globalAppResults, q);
    bindGlobalAppResults(container);
  } catch (err) {
    panel.innerHTML = `<p class="px-2 py-3 text-center text-xs text-red-600">${escapeHtml(err.message)}</p>`;
  }
}

function bindGlobalAppResults(container) {
  container.querySelectorAll('.global-app-row').forEach((row) => {
    row.addEventListener('click', async (e) => {
      if (e.target.closest('a')) return;
      const idRender = row.dataset.idrender;
      if (!idRender) return;
      pageState.selectedIdRender = idRender;
      container.querySelectorAll('.cuenta-row').forEach((r) => {
        r.className = cx(rowBase, 'cuenta-row', String(r.dataset.id) === String(idRender) && rowSelected);
      });
      updateAppsPanelHeader(container);
      await loadApps(container);
    });
  });
}

function updateAppsPanelHeader(container) {
  const title = container.querySelector('#apps-panel-title');
  const cuenta = getSelectedCuenta();
  if (title) {
    title.textContent = cuenta
      ? `RENDER_APPS — ${cuenta.EMAIL || `ID ${cuenta.IDRENDER}`}`
      : 'RENDER_APPS';
  }
}

async function loadApps(container) {
  const panel = container.querySelector('#apps-table-wrap');
  if (!panel) return;

  if (!pageState.selectedIdRender) {
    pageState.apps = [];
    panel.innerHTML = renderAppsTable([]);
    return;
  }

  showTableLoader(panel, 'Cargando apps...');
  try {
    pageState.apps = await api.getRenderApps(pageState.selectedIdRender, pageState.appSearch);
    panel.innerHTML = renderAppsTable(pageState.apps);
    bindAppEvents(container);
  } catch (err) {
    panel.innerHTML = `<p class="px-2 py-6 text-center text-xs text-slate-500">${escapeHtml(err.message)}</p>`;
  }
}

function showUsageModal(usage) {
  const free = usage.freeInstanceHours || {};
  const services = usage.services || [];
  const owner = usage.owner;
  const unavailable = usage.measurement?.unavailableServices || 0;

  const methodLabel = {
    metrics: 'métricas',
    events: 'eventos',
    unavailable: 'sin datos API',
    skipped: 'omitido',
  };

  const html = `
    <div class="space-y-4 text-sm text-slate-600">
      ${unavailable > 0 ? `
        <div class="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Render no expone Free instance hours del Billing por API (plan free suele devolver métricas vacías).
          Revisa el valor exacto en <strong>Dashboard → Billing</strong>.
        </div>
      ` : ''}

      <div class="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-blue-700">Horas medibles (mes UTC)</p>
            <p class="mt-1 text-3xl font-semibold tabular-nums text-slate-900">${escapeHtml(free.used ?? 0)}h</p>
            <p class="text-xs text-slate-500">límite Free ${escapeHtml(free.limit ?? 750)}h · restantes estimados ${escapeHtml(free.remaining ?? 0)}h</p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-semibold tabular-nums text-blue-600">${escapeHtml(free.percentUsed ?? 0)}%</p>
            <p class="text-xs text-slate-500">estimado</p>
          </div>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
          <div class="h-full rounded-full bg-blue-500" style="width:${Math.min(100, Number(free.percentUsed) || 0)}%"></div>
        </div>
      </div>

      ${owner ? `
        <p class="text-xs text-slate-500">
          Workspace: <strong class="text-slate-700">${escapeHtml(owner.name || owner.id)}</strong>
          ${owner.email ? ` · ${escapeHtml(owner.email)}` : ''}
        </p>
      ` : ''}

      <div class="max-h-56 overflow-auto rounded-2xl border border-slate-200">
        <table class="${tw.table}">
          <thead>
            <tr>
              <th class="${tw.th}">Servicio</th>
              <th class="${tw.th}">Plan</th>
              <th class="${tw.th}">Fuente</th>
              <th class="${tw.th}">Horas</th>
            </tr>
          </thead>
          <tbody>
            ${services.length ? services.map((s) => `
              <tr>
                <td class="${tw.td}">
                  <div class="font-medium text-slate-800">${escapeHtml(s.name)}</div>
                  <div class="text-xs text-slate-400">${escapeHtml(s.type || '')} · ${escapeHtml(s.id || '')}</div>
                </td>
                <td class="${tw.td}">${escapeHtml(s.plan || '—')}</td>
                <td class="${tw.td} text-xs">${escapeHtml(methodLabel[s.method] || s.method || '—')}</td>
                <td class="${tw.td} tabular-nums">${escapeHtml(s.hours)}h</td>
              </tr>
            `).join('') : `<tr><td class="${tw.td}" colspan="4">Sin servicios</td></tr>`}
          </tbody>
        </table>
      </div>

      <p class="text-[11px] leading-relaxed text-slate-400">${escapeHtml(usage.note || '')}</p>
    </div>
  `;

  openModal(`Uso de horas — ${usage.cuenta?.EMAIL || 'Render'}`, html);
}

async function consultUsage(idRender, button) {
  if (button?.disabled) return;

  const originalHtml = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    button.title = 'Consultando...';
  }

  try {
    const usage = await api.getRenderCuentaUsage(idRender);
    showUsageModal(usage);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml || '<i class="fa-solid fa-clock"></i>';
      button.title = 'Consultar uso de horas';
    }
  }
}

function bindAppEvents(container) {
  container.querySelectorAll('.btn-delete-app').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const record = pageState.apps.find((r) => String(r.IDSERVICIO) === String(btn.dataset.id));
      const label = record?.URL || record?.SERVICEID || btn.dataset.id;
      const first = await confirmDialog({
        title: 'Eliminar webapp',
        text: `Se eliminará "${label}" de la base de datos y también del servicio en Render.com. Esta acción no se puede deshacer.`,
        confirmText: 'Continuar',
      });
      if (!first) return;

      const typed = await confirmTypedWord({
        title: 'Escriba CONFIRMAR',
        text: 'Para eliminar la webapp en Render y en Mariandre, escriba CONFIRMAR.',
        word: 'CONFIRMAR',
        confirmText: 'Eliminar definitivamente',
      });
      if (!typed) return;

      try {
        btn.disabled = true;
        await api.deleteRenderApp(btn.dataset.id);
        showToast('Webapp eliminada en Render y en la base', 'success');
        await refreshPage(container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

async function loadWebappsForCuenta(idRender, button, container) {
  if (button?.disabled) return;

  const confirmed = await confirmDialog({
    title: 'Cargar webapps',
    text: 'Se eliminarán las apps registradas de esta cuenta y se reemplazarán con las webapps actuales de Render.com (URL + Service ID).',
    confirmText: 'Sí, cargar',
  });
  if (!confirmed) return;

  const originalHtml = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';
  }

  try {
    const result = await api.syncRenderWebapps(idRender);
    pageState.selectedIdRender = String(idRender);
    showToast(`${result.loaded ?? 0} webapp(s) cargada(s)`, 'success');
    await refreshPage(container);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHtml || '<i class="fa-solid fa-cloud-arrow-down"></i> Cargar webapps';
    }
  }
}

function bindCuentaEvents(container) {
  container.querySelectorAll('.cuenta-row').forEach((row) => {
    row.addEventListener('click', async (e) => {
      if (e.target.closest('button')) return;
      pageState.selectedIdRender = row.dataset.id;
      container.querySelectorAll('.cuenta-row').forEach((r) => {
        r.className = cx(rowBase, 'cuenta-row', String(r.dataset.id) === String(pageState.selectedIdRender) && rowSelected);
      });
      updateAppsPanelHeader(container);
      await loadApps(container);
    });
  });

  container.querySelectorAll('.btn-load-webapps').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadWebappsForCuenta(btn.dataset.id, btn, container);
    });
  });

  container.querySelectorAll('.btn-usage-cuenta').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      consultUsage(btn.dataset.id, btn);
    });
  });

  container.querySelectorAll('.btn-edit-cuenta').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const record = pageState.cuentas.find((c) => String(c.IDRENDER) === String(btn.dataset.id));
      if (record) openCuentaModal(record, () => refreshPage(container));
    });
  });

  container.querySelectorAll('.btn-delete-cuenta').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await confirmDialog({
        title: 'Eliminar cuenta',
        text: '¿Eliminar la cuenta y sus apps asociadas?',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;
      try {
        await api.deleteRenderCuenta(btn.dataset.id);
        if (String(pageState.selectedIdRender) === String(btn.dataset.id)) {
          pageState.selectedIdRender = null;
        }
        showToast('Cuenta eliminada', 'success');
        await refreshPage(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

async function refreshPage(container) {
  const cuentasPanel = container.querySelector('#cuentas-table-wrap');
  if (cuentasPanel) showTableLoader(cuentasPanel, 'Cargando cuentas...');

  pageState.cuentas = await api.getRenderCuentas();

  if (pageState.selectedIdRender && !pageState.cuentas.find((c) => String(c.IDRENDER) === String(pageState.selectedIdRender))) {
    pageState.selectedIdRender = null;
    pageState.apps = [];
  }

  if (cuentasPanel) {
    cuentasPanel.innerHTML = renderCuentasTable(
      filterCuentas(pageState.cuentas, pageState.cuentaSearch),
      pageState.selectedIdRender
    );
    bindCuentaEvents(container);
  }
  updateAppsPanelHeader(container);
  await loadApps(container);
}

function renderHostingBanner(hosting) {
  if (!hosting?.conexion) {
    return `<div class="${cx(tw.hostingBannerWarn, '!mb-0')}"><i class="fa-solid fa-triangle-exclamation"></i><span>Configura el <strong>Hosting principal</strong> en Configuraciones.</span></div>`;
  }
  return `<div class="${cx(tw.hostingBanner, '!mb-0')}"><i class="fa-solid fa-server"></i><span>Hosting: <strong>${escapeHtml(hosting.conexion.nombre)}</strong></span></div>`;
}

export async function openNewRenderCuentaModal() {
  try {
    const hosting = await api.getHostingStatus();
    if (!hosting.principalConexionId) {
      showToast('Configura el Hosting principal en Configuraciones', 'error');
      return;
    }
    openCuentaModal(null, () => window.__reloadRenderApps?.());
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function renderRenderApps(container) {
  showLoader(container, 'Cargando Render Apps...');

  let hosting;
  try {
    hosting = await api.getHostingStatus();
  } catch (err) {
    container.innerHTML = `<div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (!hosting.principalConexionId) {
    container.innerHTML = `${renderHostingBanner(hosting)}<div class="${tw.empty}"><h3 class="text-lg font-semibold text-slate-800">Hosting principal no configurado</h3></div>`;
    return;
  }

  try {
    pageState.cuentas = await api.getRenderCuentas();
    if (pageState.selectedIdRender && !pageState.cuentas.find((c) => String(c.IDRENDER) === String(pageState.selectedIdRender))) {
      pageState.selectedIdRender = null;
      pageState.apps = [];
    }
    if (!pageState.selectedIdRender) pageState.apps = [];
  } catch (err) {
    container.innerHTML = `${renderHostingBanner(hosting)}<div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const selected = getSelectedCuenta();

  container.innerHTML = `
    <div class="flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-2 overflow-hidden sm:h-[calc(100dvh-8rem)]">
      <div class="shrink-0 space-y-2">
        ${renderHostingBanner(hosting)}
        <div class="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm backdrop-blur-xl">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 class="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <i class="fa-solid fa-magnifying-glass text-xs"></i> Buscar Render Apps
            </h3>
            <input
              type="search"
              id="global-app-search"
              class="${cx(tw.input, 'max-w-md px-2.5 py-1.5 text-xs')}"
              placeholder="Buscar URL o cuenta en todas las apps..."
              value="${escapeHtml(pageState.globalAppSearch)}"
            >
          </div>
          <div id="global-apps-results" class="max-h-40 overflow-auto">${renderGlobalAppsResults(pageState.globalAppResults, pageState.globalAppSearch)}</div>
        </div>
      </div>
      <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-3 xl:grid-cols-12 xl:grid-rows-1">
        <section class="${cx(panelCls, 'xl:col-span-8')}">
          <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h3 class="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><i class="fa-solid fa-cloud text-xs"></i> RENDER_CUENTAS</h3>
            <input type="search" id="cuenta-search" class="${searchInput}" placeholder="Buscar email..." value="${escapeHtml(pageState.cuentaSearch)}">
          </div>
          <div id="cuentas-table-wrap" class="min-h-0 flex-1 overflow-auto">${renderCuentasTable(filterCuentas(pageState.cuentas, pageState.cuentaSearch), pageState.selectedIdRender)}</div>
        </section>
        <section class="${cx(panelCls, 'xl:col-span-4')}">
          <div class="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h3 id="apps-panel-title" class="min-w-0 truncate text-sm font-semibold text-slate-800">RENDER_APPS${selected ? ` — ${escapeHtml(selected.EMAIL || selected.IDRENDER)}` : ''}</h3>
            <input type="search" id="app-search" class="${searchInput}" placeholder="Buscar URL..." value="${escapeHtml(pageState.appSearch)}">
          </div>
          <div id="apps-table-wrap" class="min-h-0 flex-1 overflow-auto">${pageState.selectedIdRender ? renderLoader('Cargando apps...', { compact: true }) : renderAppsTable([])}</div>
        </section>
      </div>
    </div>
  `;

  bindCuentaEvents(container);
  bindAppEvents(container);
  bindGlobalAppResults(container);

  let globalSearchTimer = null;
  container.querySelector('#global-app-search')?.addEventListener('input', (e) => {
    pageState.globalAppSearch = e.target.value;
    clearTimeout(globalSearchTimer);
    globalSearchTimer = setTimeout(() => runGlobalAppSearch(container), 280);
  });

  container.querySelector('#cuenta-search')?.addEventListener('input', (e) => {
    pageState.cuentaSearch = e.target.value;
    const panel = container.querySelector('#cuentas-table-wrap');
    if (panel) {
      panel.innerHTML = renderCuentasTable(
        filterCuentas(pageState.cuentas, pageState.cuentaSearch),
        pageState.selectedIdRender
      );
      bindCuentaEvents(container);
    }
  });

  container.querySelector('#app-search')?.addEventListener('input', async (e) => {
    pageState.appSearch = e.target.value;
    await loadApps(container);
  });

  if (pageState.selectedIdRender) {
    await loadApps(container);
  }

  if (pageState.globalAppSearch.trim()) {
    await runGlobalAppSearch(container);
  }

  window.__renderAppsContainer = container;
}

window.__reloadRenderAppsPage = async () => {
  if (window.__renderAppsContainer) await refreshPage(window.__renderAppsContainer);
};
