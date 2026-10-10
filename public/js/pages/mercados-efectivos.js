import { api } from '../api.js';
import { showToast, confirmDialog, openModal, showLoader } from '../utils.js';
import { tw, cx } from '../ui.js';

const ME_TH = 'border-b border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500';
const ME_TD = 'border-b border-slate-100 px-2 py-1.5 align-middle text-slate-600 text-xs';

const COLOR_OPTIONS = [
  { value: '', label: '— Sin color —' },
  { value: 'primary', label: 'primary' },
  { value: 'secondary', label: 'secondary' },
  { value: 'success', label: 'success' },
  { value: 'danger', label: 'danger' },
  { value: 'warning', label: 'warning' },
  { value: 'info', label: 'info' },
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
];

const COLOR_BADGE_CLASS = {
  primary: 'bg-blue-600 text-white',
  secondary: 'bg-slate-500 text-white',
  success: 'bg-emerald-600 text-white',
  danger: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-amber-950',
  info: 'bg-sky-600 text-white',
  light: 'bg-slate-100 text-slate-800 ring-1 ring-slate-200',
  dark: 'bg-slate-800 text-white',
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function colorBadge(label, colorKey) {
  const text = String(label || '').trim() || '—';
  const key = String(colorKey || '').trim().toLowerCase();
  const cls = COLOR_BADGE_CLASS[key] || 'bg-slate-200 text-slate-700';
  return `<span class="inline-flex max-w-full truncate rounded-md px-2 py-0.5 text-[11px] font-semibold ${cls}">${escapeHtml(text)}</span>`;
}

function formatDate(value) {
  if (!value) return '';
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

function sucursalSelectOptions(sucursales, selected, { includeAll = false, allLabel = 'Todas las sucursales' } = {}) {
  let html = includeAll
    ? `<option value="" ${!selected ? 'selected' : ''}>${escapeHtml(allLabel)}</option>`
    : `<option value="">— Seleccionar sucursal —</option>`;
  for (const s of sucursales) {
    const cod = String(s.CODSUCURSAL || '');
    html += `<option value="${escapeHtml(cod)}" ${cod === selected ? 'selected' : ''}>${escapeHtml(cod)} — ${escapeHtml(s.NOMBRE || '')}</option>`;
  }
  return html;
}

const pageState = {
  conexion: null,
  tab: 'sucursales',
  sucursales: { rows: [], search: '' },
  usuarios: { rows: [], search: '', filterSucursal: '' },
};

function getSucursalFormHtml(record) {
  const data = record || {};
  const isEdit = Boolean(data.CODSUCURSAL);
  const colorOpts = COLOR_OPTIONS.map(
    (o) =>
      `<option value="${escapeHtml(o.value)}" ${data.COLOR === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`,
  ).join('');

  return `
    <form id="me-sucursal-form" novalidate>
      <div class="${tw.formGrid}">
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="me-cod">Código sucursal (CODSUCURSAL)</label>
          <input class="${tw.input}" type="text" id="me-cod" maxlength="50" value="${escapeHtml(data.CODSUCURSAL || '')}" ${isEdit ? 'readonly' : ''} required>
        </div>
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="me-nombre">Nombre</label>
          <input class="${tw.input}" type="text" id="me-nombre" maxlength="150" value="${escapeHtml(data.NOMBRE || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="me-encargado">Encargado</label>
          <input class="${tw.input}" type="text" id="me-encargado" maxlength="50" value="${escapeHtml(data.ENCARGADO || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="me-color">Color (UI)</label>
          <select class="${tw.input}" id="me-color">${colorOpts}</select>
        </div>
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="me-host">Host SQL</label>
          <input class="${tw.input}" type="text" id="me-host" maxlength="255" value="${escapeHtml(data.HOST || '')}" placeholder="servidor\\instancia">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="me-u">Usuario DB</label>
          <input class="${tw.input}" type="text" id="me-u" maxlength="50" value="${escapeHtml(data.U || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="me-p">Contraseña DB</label>
          <input class="${tw.input}" type="text" id="me-p" maxlength="50" value="${escapeHtml(data.P || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="me-db">Base de datos</label>
          <input class="${tw.input}" type="text" id="me-db" maxlength="50" value="${escapeHtml(data.DB || '')}">
        </div>
      </div>
      <div class="${tw.formActions}">
        <button type="submit" class="${tw.btnPrimary}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getSucursalFormData(form) {
  return {
    CODSUCURSAL: form.querySelector('#me-cod').value.trim(),
    NOMBRE: form.querySelector('#me-nombre').value.trim(),
    ENCARGADO: form.querySelector('#me-encargado').value.trim(),
    COLOR: form.querySelector('#me-color').value.trim(),
    HOST: form.querySelector('#me-host').value.trim(),
    U: form.querySelector('#me-u').value.trim(),
    P: form.querySelector('#me-p').value.trim(),
    DB: form.querySelector('#me-db').value.trim(),
  };
}

function bindSucursalForm(form, close, onSave, afterSave) {
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getSucursalFormData(form);
    if (!data.CODSUCURSAL) {
      showToast('El código de sucursal es obligatorio', 'error');
      return;
    }
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await onSave(data);
      close();
      if (afterSave) await afterSave();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function openSucursalModal(record, reload) {
  const isEdit = Boolean(record?.CODSUCURSAL);
  openModal(isEdit ? 'Editar sucursal' : 'Nueva sucursal', getSucursalFormHtml(record), (_root, close) => {
    const form = document.getElementById('me-sucursal-form');
    bindSucursalForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateMeSucursal(record.CODSUCURSAL, data);
        showToast('Sucursal actualizada', 'success');
      } else {
        await api.createMeSucursal(data);
        showToast('Sucursal creada', 'success');
      }
    }, reload);
  });
}

function getUsuarioFormHtml(record, sucursales) {
  const data = record || {};
  const isEdit = Boolean(data.ID);
  const sucOpts = sucursalSelectOptions(sucursales, data.CODSUCURSAL || '');

  return `
    <form id="me-usuario-form" novalidate>
      <p class="mb-3 text-xs text-slate-500">Al guardar, <strong>EMP_NIT</strong> se iguala al código de sucursal seleccionado.</p>
      <div class="${tw.formGrid}">
        ${isEdit ? `
        <div class="${tw.formGroup}">
          <label class="${tw.label}">ID</label>
          <input class="${tw.input}" type="text" value="${escapeHtml(data.ID)}" readonly tabindex="-1">
        </div>` : ''}
        <div class="${isEdit ? tw.formGroup : tw.formGroupFull}">
          <label class="${tw.label}" for="mu-sucursal">Sucursal</label>
          <select class="${tw.input}" id="mu-sucursal" required>${sucOpts}</select>
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-codusuario">CODUSUARIO</label>
          <input class="${tw.input}" type="number" id="mu-codusuario" value="${escapeHtml(data.CODUSUARIO ?? '')}">
        </div>
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="mu-nombre">Nombre</label>
          <input class="${tw.input}" type="text" id="mu-nombre" maxlength="50" value="${escapeHtml(data.NOMBRE || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-pass">Contraseña</label>
          <input class="${tw.input}" type="text" id="mu-pass" maxlength="50" value="${escapeHtml(data.PASS || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-tipo">Tipo</label>
          <input class="${tw.input}" type="text" id="mu-tipo" maxlength="10" value="${escapeHtml(data.TIPO || '')}" placeholder="GERENTE, REPARTIDOR…">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-telefono">Teléfono</label>
          <input class="${tw.input}" type="text" id="mu-telefono" maxlength="8" value="${escapeHtml(data.TELEFONO || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-coddoc">CODDOC</label>
          <input class="${tw.input}" type="text" id="mu-coddoc" maxlength="5" value="${escapeHtml(data.CODDOC || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-correlativo">Correlativo</label>
          <input class="${tw.input}" type="number" id="mu-correlativo" value="${escapeHtml(data.CORRELATIVO ?? '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-objetivo">Objetivo mes</label>
          <input class="${tw.input}" type="number" step="0.01" id="mu-objetivo" value="${escapeHtml(data.OBJETIVOMES ?? '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-fecha">Fecha</label>
          <input class="${tw.input}" type="date" id="mu-fecha" value="${escapeHtml(formatDate(data.FECHA))}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-codruta">CODRUTA</label>
          <input class="${tw.input}" type="number" id="mu-codruta" value="${escapeHtml(data.CODRUTA ?? '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="mu-codcatalogo">CODCATALOGO</label>
          <input class="${tw.input}" type="text" id="mu-codcatalogo" maxlength="5" value="${escapeHtml(data.CODCATALOGO || '')}">
        </div>
      </div>
      <div class="${tw.formActions}">
        <button type="submit" class="${tw.btnPrimary}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getUsuarioFormData(form) {
  const codsucursal = form.querySelector('#mu-sucursal').value.trim();
  return {
    CODSUCURSAL: codsucursal,
    EMP_NIT: codsucursal,
    CODUSUARIO: form.querySelector('#mu-codusuario').value,
    NOMBRE: form.querySelector('#mu-nombre').value.trim(),
    PASS: form.querySelector('#mu-pass').value.trim(),
    TIPO: form.querySelector('#mu-tipo').value.trim(),
    TELEFONO: form.querySelector('#mu-telefono').value.trim(),
    CODDOC: form.querySelector('#mu-coddoc').value.trim(),
    CORRELATIVO: form.querySelector('#mu-correlativo').value,
    OBJETIVOMES: form.querySelector('#mu-objetivo').value,
    FECHA: form.querySelector('#mu-fecha').value || null,
    CODRUTA: form.querySelector('#mu-codruta').value,
    CODCATALOGO: form.querySelector('#mu-codcatalogo').value.trim(),
  };
}

function bindUsuarioForm(form, close, onSave, afterSave) {
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getUsuarioFormData(form);
    if (!data.CODSUCURSAL) {
      showToast('Selecciona una sucursal', 'error');
      return;
    }
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await onSave(data);
      close();
      if (afterSave) await afterSave();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function openUsuarioModal(record, reload) {
  const isEdit = Boolean(record?.ID);
  const sucursales = pageState.sucursales.rows;
  if (!sucursales.length) {
    showToast('No hay sucursales en me_sucursales', 'error');
    return;
  }
  const defaultSuc = pageState.usuarios.filterSucursal || sucursales[0]?.CODSUCURSAL;
  openModal(isEdit ? 'Editar usuario' : 'Nuevo usuario', getUsuarioFormHtml(record || { CODSUCURSAL: defaultSuc }, sucursales), (_root, close) => {
    const form = document.getElementById('me-usuario-form');
    bindUsuarioForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateMeUsuario(record.ID, data);
        showToast('Usuario actualizado', 'success');
      } else {
        await api.createMeUsuario(data);
        showToast('Usuario creado', 'success');
      }
    }, reload);
  });
}

function filterSucursalRows(rows, search) {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const fields = [r.CODSUCURSAL, r.NOMBRE, r.ENCARGADO, r.COLOR, r.HOST, r.U, r.DB].map((v) =>
      String(v || '').toLowerCase(),
    );
    return fields.some((f) => f.includes(q));
  });
}

function filterUsuarioRows(rows, search) {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const fields = [
      r.ID,
      r.CODSUCURSAL,
      r.EMP_NIT,
      r.CODUSUARIO,
      r.NOMBRE,
      r.TIPO,
      r.TELEFONO,
      r.CODDOC,
      r.CORRELATIVO,
      r.CODCATALOGO,
    ].map((v) => String(v ?? '').toLowerCase());
    return fields.some((f) => f.includes(q));
  });
}

function sucursalColorMap() {
  const map = {};
  for (const s of pageState.sucursales.rows) {
    map[String(s.CODSUCURSAL)] = s.COLOR;
  }
  return map;
}

function renderSucursalTableRows(rows) {
  if (!rows.length) {
    const msg = pageState.sucursales.rows.length ? 'No hay sucursales que coincidan' : 'No hay registros en me_sucursales';
    return `<tr><td colspan="8" class="${cx(ME_TD, tw.tableEmpty)}">${msg}</td></tr>`;
  }
  return rows
    .map(
      (r) => `
    <tr class="hover:bg-slate-50/80">
      <td class="${ME_TD} font-mono">${escapeHtml(r.CODSUCURSAL)}</td>
      <td class="${ME_TD}">${colorBadge(r.NOMBRE || r.CODSUCURSAL, r.COLOR)}</td>
      <td class="${ME_TD}">${escapeHtml(r.ENCARGADO)}</td>
      <td class="${ME_TD} max-w-[180px] truncate" title="${escapeHtml(r.HOST)}">${escapeHtml(r.HOST)}</td>
      <td class="${ME_TD}">${escapeHtml(r.U)}</td>
      <td class="${ME_TD} font-mono">${r.P ? '••••' : ''}</td>
      <td class="${ME_TD}">${escapeHtml(r.DB)}</td>
      <td class="${cx(ME_TD, tw.tableActions)}">
        <button type="button" class="${cx(tw.btnGhost, tw.btnSm)}" data-suc-edit="${escapeHtml(r.CODSUCURSAL)}" title="Editar"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="${cx(tw.btnDanger, tw.btnSm)}" data-suc-del="${escapeHtml(r.CODSUCURSAL)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`,
    )
    .join('');
}

function renderUsuarioTableRows(rows) {
  const colors = sucursalColorMap();
  if (!rows.length) {
    const msg = pageState.usuarios.rows.length ? 'No hay usuarios que coincidan' : 'No hay registros (elige sucursal o deja Todas)';
    return `<tr><td colspan="10" class="${cx(ME_TD, tw.tableEmpty)}">${msg}</td></tr>`;
  }
  return rows
    .map((r) => {
      const cod = String(r.CODSUCURSAL || '');
      return `
    <tr class="hover:bg-slate-50/80">
      <td class="${ME_TD} tabular-nums">${escapeHtml(r.ID)}</td>
      <td class="${ME_TD}">${colorBadge(cod, colors[cod])}</td>
      <td class="${ME_TD} tabular-nums">${escapeHtml(r.CODUSUARIO ?? '')}</td>
      <td class="${ME_TD}">${escapeHtml(r.NOMBRE)}</td>
      <td class="${ME_TD}">${escapeHtml(r.TIPO)}</td>
      <td class="${ME_TD}">${escapeHtml(r.TELEFONO)}</td>
      <td class="${ME_TD}">${escapeHtml(r.CODDOC)}</td>
      <td class="${ME_TD} tabular-nums">${escapeHtml(r.CORRELATIVO ?? '')}</td>
      <td class="${ME_TD} tabular-nums">${escapeHtml(r.OBJETIVOMES ?? '')}</td>
      <td class="${cx(ME_TD, tw.tableActions)}">
        <button type="button" class="${cx(tw.btnGhost, tw.btnSm)}" data-user-edit="${escapeHtml(r.ID)}" title="Editar"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="${cx(tw.btnDanger, tw.btnSm)}" data-user-del="${escapeHtml(r.ID)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
    })
    .join('');
}

function tabButton(id, label, active) {
  return `
    <button type="button" data-me-tab="${id}" class="${cx(
      'rounded-md px-3 py-1 text-xs font-semibold transition',
      active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
    )}">${escapeHtml(label)}</button>`;
}

function renderCompactHeader() {
  const conn = pageState.conexion;
  const connLabel = conn
    ? `${conn.nombre} · ${conn.host}${conn.baseDatos ? ` / ${conn.baseDatos}` : ''}`
    : 'Sin conexión';

  return `
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100/80 bg-white/95 px-3 py-2 shadow-sm">
      <div class="flex min-w-0 flex-wrap items-center gap-3">
        <p class="truncate text-[11px] text-slate-600" title="${escapeHtml(connLabel)}">
          <i class="fa-solid fa-database mr-1 text-slate-400"></i>${escapeHtml(connLabel)}
        </p>
        <div class="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
          ${tabButton('sucursales', 'Sucursales', pageState.tab === 'sucursales')}
          ${tabButton('usuarios', 'Usuarios', pageState.tab === 'usuarios')}
        </div>
      </div>
      <div id="me-tab-toolbar" class="flex flex-wrap items-center gap-2"></div>
    </div>`;
}

function renderSucursalesPanel() {
  const filtered = filterSucursalRows(pageState.sucursales.rows, pageState.sucursales.search);
  return `
    <div class="${cx(tw.panel, 'min-h-0 flex-1 overflow-auto !p-0')}">
      <table class="${tw.table} text-xs">
        <thead>
          <tr>
            <th class="${ME_TH}">Código</th>
            <th class="${ME_TH}">Nombre</th>
            <th class="${ME_TH}">Encargado</th>
            <th class="${ME_TH}">Host</th>
            <th class="${ME_TH}">Usuario</th>
            <th class="${ME_TH}">Pass</th>
            <th class="${ME_TH}">DB</th>
            <th class="${ME_TH} w-20"></th>
          </tr>
        </thead>
        <tbody id="me-suc-tbody">${renderSucursalTableRows(filtered)}</tbody>
      </table>
      <p class="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">${filtered.length} de ${pageState.sucursales.rows.length} sucursal(es)</p>
    </div>`;
}

function renderUsuariosPanel() {
  const filtered = filterUsuarioRows(pageState.usuarios.rows, pageState.usuarios.search);
  return `
    <div class="${cx(tw.panel, 'min-h-0 flex-1 overflow-auto !p-0')}">
      <table class="${tw.table} text-xs">
        <thead>
          <tr>
            <th class="${ME_TH}">ID</th>
            <th class="${ME_TH}">Sucursal</th>
            <th class="${ME_TH}">Cod. usuario</th>
            <th class="${ME_TH}">Nombre</th>
            <th class="${ME_TH}">Tipo</th>
            <th class="${ME_TH}">Tel.</th>
            <th class="${ME_TH}">CODDOC</th>
            <th class="${ME_TH}">Correl.</th>
            <th class="${ME_TH}">Obj. mes</th>
            <th class="${ME_TH} w-20"></th>
          </tr>
        </thead>
        <tbody id="me-user-tbody">${renderUsuarioTableRows(filtered)}</tbody>
      </table>
      <p class="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">${filtered.length} de ${pageState.usuarios.rows.length} usuario(s)</p>
    </div>`;
}

function renderToolbar(container) {
  const toolbar = container.querySelector('#me-tab-toolbar');
  if (!toolbar) return;

  if (pageState.tab === 'sucursales') {
    toolbar.innerHTML = `
      <input type="search" class="${cx(tw.input, 'max-w-[11rem] !py-1.5 !text-xs')}" id="me-suc-search" placeholder="Buscar…" value="${escapeHtml(pageState.sucursales.search)}">
      <button type="button" class="${cx(tw.btnPrimary, '!py-1.5 !text-xs')}" id="me-suc-new"><i class="fa-solid fa-plus"></i> Nueva</button>`;
    toolbar.querySelector('#me-suc-search')?.addEventListener('input', (e) => {
      pageState.sucursales.search = e.target.value;
      const tbody = container.querySelector('#me-suc-tbody');
      if (tbody) {
        tbody.innerHTML = renderSucursalTableRows(
          filterSucursalRows(pageState.sucursales.rows, pageState.sucursales.search),
        );
      }
    });
    toolbar.querySelector('#me-suc-new')?.addEventListener('click', () => {
      openSucursalModal(null, () => reloadSucursales(container));
    });
    return;
  }

  toolbar.innerHTML = `
    <select class="${cx(tw.input, 'max-w-[14rem] !py-1.5 !text-xs')}" id="me-user-filter">
      ${sucursalSelectOptions(pageState.sucursales.rows, pageState.usuarios.filterSucursal, { includeAll: true })}
    </select>
    <input type="search" class="${cx(tw.input, 'max-w-[11rem] !py-1.5 !text-xs')}" id="me-user-search" placeholder="Buscar…" value="${escapeHtml(pageState.usuarios.search)}">
    <button type="button" class="${cx(tw.btnPrimary, '!py-1.5 !text-xs')}" id="me-user-new"><i class="fa-solid fa-plus"></i> Nuevo</button>`;

  toolbar.querySelector('#me-user-filter')?.addEventListener('change', async (e) => {
    pageState.usuarios.filterSucursal = e.target.value;
    await reloadUsuarios(container);
  });
  toolbar.querySelector('#me-user-search')?.addEventListener('input', (e) => {
    pageState.usuarios.search = e.target.value;
    const tbody = container.querySelector('#me-user-tbody');
    if (tbody) {
      tbody.innerHTML = renderUsuarioTableRows(
        filterUsuarioRows(pageState.usuarios.rows, pageState.usuarios.search),
      );
    }
  });
  toolbar.querySelector('#me-user-new')?.addEventListener('click', () => {
    openUsuarioModal(null, () => reloadUsuarios(container));
  });
}

function bindTabEvents(container) {
  container.querySelectorAll('[data-me-tab]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = btn.getAttribute('data-me-tab');
      if (tab === pageState.tab) return;
      pageState.tab = tab;
      renderShell(container);
      if (tab === 'usuarios' && !pageState.usuarios.rows.length && pageState.conexion) {
        await reloadUsuarios(container);
      }
    });
  });
}

function bindTableEvents(container) {
  container.querySelector('#me-suc-tbody')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-suc-edit]');
    const delBtn = e.target.closest('[data-suc-del]');
    if (editBtn) {
      const cod = editBtn.getAttribute('data-suc-edit');
      const row = pageState.sucursales.rows.find((r) => String(r.CODSUCURSAL) === cod);
      openSucursalModal(row || { CODSUCURSAL: cod }, () => reloadSucursales(container));
      return;
    }
    if (delBtn) {
      const cod = delBtn.getAttribute('data-suc-del');
      const ok = await confirmDialog({
        title: 'Eliminar sucursal',
        text: `¿Eliminar la sucursal ${cod}?`,
        confirmText: 'Sí, eliminar',
      });
      if (!ok) return;
      try {
        await api.deleteMeSucursal(cod);
        showToast('Sucursal eliminada', 'success');
        await reloadSucursales(container);
        if (pageState.tab === 'usuarios') await reloadUsuarios(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });

  container.querySelector('#me-user-tbody')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-user-edit]');
    const delBtn = e.target.closest('[data-user-del]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-user-edit');
      const row = pageState.usuarios.rows.find((r) => String(r.ID) === String(id));
      openUsuarioModal(row || { ID: id }, () => reloadUsuarios(container));
      return;
    }
    if (delBtn) {
      const id = delBtn.getAttribute('data-user-del');
      const ok = await confirmDialog({
        title: 'Eliminar usuario',
        text: `¿Eliminar el usuario ID ${id}?`,
        confirmText: 'Sí, eliminar',
      });
      if (!ok) return;
      try {
        await api.deleteMeUsuario(id);
        showToast('Usuario eliminado', 'success');
        await reloadUsuarios(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

function renderShell(container) {
  const body = pageState.tab === 'usuarios' ? renderUsuariosPanel() : renderSucursalesPanel();
  container.innerHTML = `
    <div class="flex min-h-0 flex-1 flex-col gap-2">
      ${renderCompactHeader()}
      ${body}
    </div>`;
  bindTabEvents(container);
  renderToolbar(container);
  bindTableEvents(container);
}

async function reloadSucursales(container) {
  const rows = await api.getMeSucursales();
  pageState.sucursales.rows = Array.isArray(rows) ? rows : [];
  renderShell(container);
}

async function reloadUsuarios(container) {
  const rows = await api.getMeUsuarios(pageState.usuarios.filterSucursal);
  pageState.usuarios.rows = Array.isArray(rows) ? rows : [];
  if (pageState.tab === 'usuarios') {
    renderShell(container);
  }
}

async function loadInitial(container) {
  showLoader(container, 'Cargando mercados efectivos…');
  try {
    const [status, sucursales] = await Promise.all([api.getMercadosEfectivosStatus(), api.getMeSucursales()]);
    pageState.conexion = status.conexion;
    pageState.sucursales.rows = Array.isArray(sucursales) ? sucursales : [];

    if (!status.conexion) {
      container.innerHTML = `
        <div class="${tw.empty}">
          <i class="fa-solid fa-plug-circle-xmark text-3xl text-slate-300"></i>
          <p class="text-sm text-slate-500">Configura la conexión en <strong>Configuraciones → Mercados Efectivos Ventas</strong>.</p>
        </div>`;
      return;
    }

    renderShell(container);
    if (pageState.tab === 'usuarios') {
      await reloadUsuarios(container);
    }
  } catch (err) {
    container.innerHTML = `<div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

export async function renderMercadosEfectivos(container) {
  pageState.tab = 'sucursales';
  pageState.sucursales.search = '';
  pageState.usuarios.search = '';
  pageState.usuarios.filterSucursal = '';
  pageState.usuarios.rows = [];
  await loadInitial(container);
}
