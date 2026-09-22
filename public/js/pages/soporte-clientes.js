import { api } from '../api.js';
import { showToast, confirmDialog, openModal, showLoader } from '../utils.js';
import { tw, cx } from '../ui.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function getSoporteFormHtml(record, tokens) {
  const data = record || {};
  const tokenOptions = tokens.map((t) => `
    <option value="${escapeHtml(t.TOKEN)}" ${data.TOKEN === t.TOKEN ? 'selected' : ''}>
      ${escapeHtml(t.EMPRESA || t.TOKEN)}
    </option>
  `).join('');

  return `
    <form id="soporte-form" novalidate>
      <div class="${tw.formGrid}">
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="soporte-token">Empresa (TOKEN)</label>
          <select class="${tw.input}" id="soporte-token" required>
            <option value="">— Seleccionar empresa —</option>
            ${tokenOptions}
          </select>
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="soporte-sucursal">Sucursal</label>
          <input class="${tw.input}" type="text" id="soporte-sucursal" value="${escapeHtml(data.SUCURSAL || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="soporte-tipo">Tipo</label>
          <select class="${tw.input}" id="soporte-tipo">
            <option value="">— Seleccionar —</option>
            <option value="SERVER" ${data.TIPO === 'SERVER' ? 'selected' : ''}>SERVER</option>
            <option value="OPER" ${data.TIPO === 'OPER' ? 'selected' : ''}>OPER</option>
          </select>
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="soporte-anydesk">AnyDesk</label>
          <input class="${tw.input}" type="text" id="soporte-anydesk" value="${escapeHtml(data.ANYDESK || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="soporte-pass">Contraseña</label>
          <input class="${tw.input}" type="text" id="soporte-pass" value="${escapeHtml(data.PASS || '')}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="soporte-vendedor">Vendedor</label>
          <input class="${tw.input}" type="text" id="soporte-vendedor" value="${escapeHtml(data.VENDEDOR || '')}">
        </div>
      </div>
      <div class="${tw.formActions}">
        <button type="submit" class="${tw.btnPrimary}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getSoporteFormData(form) {
  return {
    TOKEN: form.querySelector('#soporte-token').value,
    SUCURSAL: form.querySelector('#soporte-sucursal').value.trim(),
    TIPO: form.querySelector('#soporte-tipo').value.trim(),
    ANYDESK: form.querySelector('#soporte-anydesk').value.trim(),
    PASS: form.querySelector('#soporte-pass').value.trim(),
    VENDEDOR: form.querySelector('#soporte-vendedor').value.trim(),
  };
}

function bindSoporteForm(form, close, onSave, afterSave) {
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getSoporteFormData(form);

    if (!data.TOKEN) {
      showToast('Selecciona una empresa', 'error');
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

function openSoporteModal(record, tokens, reload) {
  const isEdit = Boolean(record?.ID);
  openModal(isEdit ? 'Editar soporte AnyDesk' : 'Nuevo soporte AnyDesk', getSoporteFormHtml(record, tokens), (_root, close) => {
    const form = document.getElementById('soporte-form');
    bindSoporteForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateSoporteAnydesk(record.ID, data);
        showToast('Registro actualizado', 'success');
      } else {
        await api.createSoporteAnydesk(data);
        showToast('Registro creado', 'success');
      }
    }, reload);
  });
}

let soporteState = { records: [], search: '', tokenMap: {} };

function formatLastUpdate(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function todayLocalIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportSoporteExcel() {
  const tokenMap = soporteState.tokenMap || {};
  const filtered = filterSoporteRecords(soporteState.records, soporteState.search, tokenMap);
  if (!filtered.length) {
    showToast('No hay filas para exportar', 'error');
    return;
  }

  const headers = ['Empresa', 'Token', 'Sucursal', 'Tipo', 'AnyDesk', 'Pass', 'Vendedor', 'LastUpdate'];
  const rows = filtered.map((r) => [
    tokenMap[r.TOKEN] || '',
    r.TOKEN || '',
    r.SUCURSAL || '',
    r.TIPO || '',
    r.ANYDESK || '',
    r.PASS || '',
    r.VENDEDOR || '',
    formatLastUpdate(r.LASTUPDATE),
  ]);

  const headerXml = `<Row>${headers.map((h) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join('')}</Row>`;
  const rowsXml = rows.map((row) => (
    `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`).join('')}</Row>`
  )).join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Soporte AnyDesk">
    <Table>
      ${headerXml}
      ${rowsXml}
    </Table>
  </Worksheet>
</Workbook>`;

  const today = todayLocalIso();
  downloadBlob(
    `soporte-anydesk-${today}.xls`,
    xml,
    'application/vnd.ms-excel'
  );
  showToast(`Exportadas ${filtered.length} fila(s)`, 'success');
}

function filterSoporteRecords(records, search, tokenMap) {
  const q = search.trim().toLowerCase();
  if (!q) return records;
  return records.filter((r) => {
    const fields = [
      tokenMap[r.TOKEN] || '',
      r.TOKEN,
      r.SUCURSAL,
      r.TIPO,
      r.ANYDESK,
      r.PASS,
      r.VENDEDOR,
      formatLastUpdate(r.LASTUPDATE),
    ].map((v) => String(v || '').toLowerCase());
    return fields.some((f) => f.includes(q));
  });
}

function renderSoporteRows(records, tokenMap) {
  if (!records.length) {
    const msg = soporteState.records.length ? 'No hay registros que coincidan' : 'No hay registros en SOPORTE_ANYDESK';
    return `<tr><td colspan="9" class="${cx(tw.td, tw.tableEmpty)}">${msg}</td></tr>`;
  }

  return records.map((r) => `
    <tr>
      <td class="${tw.td}">${escapeHtml(tokenMap[r.TOKEN] || '—')}</td>
      <td class="${tw.td}"><code class="${tw.code}">${escapeHtml(r.TOKEN || '')}</code></td>
      <td class="${tw.td}">${escapeHtml(r.SUCURSAL || '')}</td>
      <td class="${tw.td}">${escapeHtml(r.TIPO || '')}</td>
      <td class="${tw.td}">${escapeHtml(r.ANYDESK || '')}</td>
      <td class="${tw.td}">${escapeHtml(r.PASS || '')}</td>
      <td class="${tw.td}">${escapeHtml(r.VENDEDOR || '')}</td>
      <td class="${tw.td}">${escapeHtml(formatLastUpdate(r.LASTUPDATE) || '—')}</td>
      <td class="${cx(tw.td, tw.tableActions)}">
        <button class="${cx(tw.btnGhost, tw.btnSm)} btn-conectar-anydesk" data-id="${escapeHtml(r.ID)}" title="Abrir AnyDesk" ${String(r.ANYDESK || '').trim() ? '' : 'disabled'}>
          <i class="fa-solid fa-desktop"></i>
        </button>
        <button class="${cx(tw.btnGhost, tw.btnSm)} btn-edit-soporte" data-id="${escapeHtml(r.ID)}" title="Editar">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="${cx(tw.btnDanger, tw.btnSm)} btn-delete-soporte" data-id="${escapeHtml(r.ID)}" title="Eliminar">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function refreshSoporteTable(container, tokenMap, reload) {
  const tbody = container.querySelector('#soporte-tbody');
  if (!tbody) return;
  const filtered = filterSoporteRecords(soporteState.records, soporteState.search, tokenMap);
  tbody.innerHTML = renderSoporteRows(filtered, tokenMap);
  bindSoporteEvents(container, soporteState.records, window.__soporteTokens || [], reload);
}

function bindSoporteEvents(container, records, tokens, reload) {
  container.querySelectorAll('.btn-conectar-anydesk').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const result = await api.conectarSoporteAnydesk(btn.dataset.id);
        showToast(
          result?.conPassword ? 'AnyDesk abierto con contraseña' : 'AnyDesk abierto (sin contraseña en el registro)',
          'success'
        );
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('.btn-edit-soporte').forEach((btn) => {
    btn.addEventListener('click', () => {
      const record = records.find((r) => String(r.ID) === String(btn.dataset.id));
      if (record) openSoporteModal(record, tokens, reload);
    });
  });

  container.querySelectorAll('.btn-delete-soporte').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar registro',
        text: '¿Eliminar este registro de soporte AnyDesk?',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;

      try {
        await api.deleteSoporteAnydesk(btn.dataset.id);
        showToast('Registro eliminado', 'success');
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

  return `
    <div class="${tw.hostingBanner}">
      <i class="fa-solid fa-server"></i>
      <span>Hosting: <strong>${escapeHtml(hosting.conexion.nombre)}</strong> (${escapeHtml(hosting.conexion.host)})</span>
    </div>
  `;
}

export async function openNewSoporteModal() {
  try {
    const hosting = await api.getHostingStatus();
    if (!hosting.principalConexionId) {
      showToast('Configura el Hosting principal en Configuraciones', 'error');
      return;
    }

    let tokens = window.__soporteTokens || [];
    if (!tokens.length) {
      tokens = await api.getSoporteTokens();
      window.__soporteTokens = tokens;
    }

    if (!tokens.length) {
      showToast('No hay empresas en la tabla TOKENS', 'error');
      return;
    }

    openSoporteModal(null, tokens, () => window.__reloadSoporte?.());
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function renderSoporteClientes(container) {
  showLoader(container, 'Cargando soporte...');

  let hosting;
  let records = [];
  let tokens = [];

  try {
    hosting = await api.getHostingStatus();
  } catch (err) {
    container.innerHTML = `<div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  if (!hosting.principalConexionId) {
    container.innerHTML = `
      ${renderHostingBanner(hosting)}
      <div class="${tw.empty}">
        <i class="fa-solid fa-headset text-3xl text-slate-400"></i>
        <h3 class="text-lg font-semibold text-slate-800">Hosting principal no configurado</h3>
        <p class="text-sm text-slate-500">Ve a Configuraciones y selecciona la conexión del hosting.</p>
      </div>
    `;
    return;
  }

  try {
    [records, tokens] = await Promise.all([
      api.getSoporteAnydesk(),
      api.getSoporteTokens(),
    ]);
  } catch (err) {
    container.innerHTML = `
      ${renderHostingBanner(hosting)}
      <div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>
    `;
    return;
  }

  window.__soporteTokens = tokens;
  const tokenMap = Object.fromEntries(tokens.map((t) => [t.TOKEN, t.EMPRESA || t.TOKEN]));
  soporteState.records = records;
  soporteState.tokenMap = tokenMap;
  const reload = () => window.__reloadSoporte?.();

  container.innerHTML = `
    ${renderHostingBanner(hosting)}
    <div class="${tw.tablePanel}">
      <div class="${tw.tableToolbar}">
        <input type="search" id="soporte-search" class="${cx(tw.input, 'max-w-md')}" placeholder="Buscar en soporte..." value="${escapeHtml(soporteState.search)}">
      </div>
      <table class="${tw.table}">
        <thead>
          <tr>
            <th class="${tw.th}">Empresa</th>
            <th class="${tw.th}">Token</th>
            <th class="${tw.th}">Sucursal</th>
            <th class="${tw.th}">Tipo</th>
            <th class="${tw.th}">AnyDesk</th>
            <th class="${tw.th}">Pass</th>
            <th class="${tw.th}">Vendedor</th>
            <th class="${tw.th}">LastUpdate</th>
            <th class="${tw.th}">Acciones</th>
          </tr>
        </thead>
        <tbody id="soporte-tbody">
          ${renderSoporteRows(filterSoporteRecords(records, soporteState.search, tokenMap), tokenMap)}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#soporte-search')?.addEventListener('input', (e) => {
    soporteState.search = e.target.value;
    refreshSoporteTable(container, tokenMap, reload);
  });

  bindSoporteEvents(container, records, tokens, reload);
}
