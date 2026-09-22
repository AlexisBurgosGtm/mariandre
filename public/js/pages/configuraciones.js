import { api } from '../api.js';
import { showToast, showLoader } from '../utils.js';
import { tw, cx } from '../ui.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function renderConexionSelect({ id, selectedId, conexiones, label }) {
  if (!conexiones.length) {
    return `
      <div class="${cx(tw.empty, 'mt-4 !p-6')}">
        <p>No hay conexiones configuradas. Agrega una en la sección Conexiones.</p>
      </div>
    `;
  }

  return `
    <div class="${cx(tw.formGroupFull, 'mt-3')}">
      <label class="${tw.label}" for="${id}">${label}</label>
      <select class="${tw.input}" id="${id}">
        <option value="">— Seleccionar conexión —</option>
        ${conexiones.map((c) => `
          <option value="${escapeHtml(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>
            ${escapeHtml(c.nombre)} (${escapeHtml(c.tipo)} — ${escapeHtml(c.host)})
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

export async function renderConfiguraciones(container) {
  showLoader(container, 'Cargando configuración...');

  let config;
  let conexiones = [];

  try {
    [config, conexiones] = await Promise.all([
      api.getConfig(),
      api.getConexiones(),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const hostingId = config?.hosting?.principalConexionId || '';
  const mercadosId = config?.mercadosEfectivos?.ventasConexionId || '';

  container.innerHTML = `
    <div class="space-y-4">
      <div class="${tw.panel}">
        <div class="space-y-2">
          <h3 class="flex items-center gap-2 text-base font-semibold text-slate-800"><i class="fa-solid fa-server"></i> Hosting principal</h3>
          <p class="text-sm text-slate-500">
            Selecciona la conexión que usarán las secciones <strong>Soporte Clientes</strong>, <strong>Updater</strong>, <strong>Tokens</strong> y <strong>Render Apps</strong>.
          </p>
          ${renderConexionSelect({
            id: 'hosting-principal',
            selectedId: hostingId,
            conexiones,
            label: 'Conexión de hosting',
          })}
          ${conexiones.length ? `
            <div class="${tw.formActions}">
              <button type="button" class="${tw.btnPrimary}" id="btn-save-hosting">
                <i class="fa-solid fa-floppy-disk"></i> Guardar hosting
              </button>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="${tw.panel}">
        <div class="space-y-2">
          <h3 class="flex items-center gap-2 text-base font-semibold text-slate-800"><i class="fa-solid fa-store"></i> Mercados Efectivos Ventas</h3>
          <p class="text-sm text-slate-500">
            Selecciona la conexión que usará la sección <strong>MERCADOS EFECTIVOS</strong>.
          </p>
          ${renderConexionSelect({
            id: 'mercados-ventas',
            selectedId: mercadosId,
            conexiones,
            label: 'Conexión Mercados Efectivos Ventas',
          })}
          ${conexiones.length ? `
            <div class="${tw.formActions}">
              <button type="button" class="${tw.btnPrimary}" id="btn-save-mercados">
                <i class="fa-solid fa-floppy-disk"></i> Guardar mercados
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-save-hosting')?.addEventListener('click', async () => {
    const select = container.querySelector('#hosting-principal');
    const principalConexionId = select.value || null;
    if (!principalConexionId) {
      showToast('Selecciona una conexión de hosting', 'error');
      return;
    }
    const saveBtn = container.querySelector('#btn-save-hosting');
    saveBtn.disabled = true;
    try {
      await api.updateConfig({ hosting: { principalConexionId } });
      showToast('Hosting principal guardado', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  container.querySelector('#btn-save-mercados')?.addEventListener('click', async () => {
    const select = container.querySelector('#mercados-ventas');
    const ventasConexionId = select.value || null;
    if (!ventasConexionId) {
      showToast('Selecciona una conexión para Mercados Efectivos Ventas', 'error');
      return;
    }
    const saveBtn = container.querySelector('#btn-save-mercados');
    saveBtn.disabled = true;
    try {
      await api.updateConfig({ mercadosEfectivos: { ventasConexionId } });
      showToast('Mercados Efectivos Ventas guardado', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  await renderComandosVozCard(container);
}

async function renderComandosVozCard(container) {
  let comandos = [];
  try {
    comandos = await api.getComandosVoz();
  } catch (err) {
    container.insertAdjacentHTML(
      'beforeend',
      `<div class="${tw.panel} mt-4"><p class="text-sm text-red-600">${escapeHtml(err.message)}</p></div>`
    );
    return;
  }

  const host = document.createElement('div');
  host.className = `${tw.panel} mt-4`;
  host.innerHTML = `
    <div class="space-y-3">
      <h3 class="flex items-center gap-2 text-base font-semibold text-slate-800">
        <i class="fa-solid fa-microphone"></i> Comandos de voz
      </h3>
      <p class="text-sm text-slate-500">
        Activa el micrófono en el encabezado (badge verde). MariAndre solo escucha comandos
        después de decir <strong>Oye Mariandre</strong>. Cada comando llama un endpoint y lee el resultado en voz alta.
      </p>
      <div class="${tw.formGrid}">
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="voz-frase">Frase del comando</label>
          <input class="${tw.input}" id="voz-frase" type="text" placeholder="haz una prueba de conexión" maxlength="180">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="voz-url">Endpoint</label>
          <input class="${tw.input}" id="voz-url" type="url" placeholder="https://...">
        </div>
      </div>
      <div class="${tw.formActions} !mt-2">
        <button type="button" class="${tw.btnPrimary}" id="btn-voz-add">
          <i class="fa-solid fa-plus"></i> Agregar comando
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="${tw.table}">
          <thead>
            <tr>
              <th class="${tw.th}">Frase</th>
              <th class="${tw.th}">Endpoint</th>
              <th class="${tw.th}">Activo</th>
              <th class="${tw.th}"></th>
            </tr>
          </thead>
          <tbody id="voz-comandos-body">
            ${renderComandosRows(comandos)}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.appendChild(host);

  host.querySelector('#btn-voz-add')?.addEventListener('click', async () => {
    const frase = host.querySelector('#voz-frase')?.value?.trim();
    const url = host.querySelector('#voz-url')?.value?.trim();
    if (!frase || !url) {
      showToast('Indica la frase y el endpoint', 'error');
      return;
    }
    const btn = host.querySelector('#btn-voz-add');
    btn.disabled = true;
    try {
      await api.createComandoVoz({ frase, url, activo: true });
      host.querySelector('#voz-frase').value = '';
      host.querySelector('#voz-url').value = '';
      showToast('Comando guardado', 'success');
      window.dispatchEvent(new Event('mariandre:comandos-voz-updated'));
      await refreshComandosTable(host);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  bindComandosTable(host);
}

function renderComandosRows(comandos) {
  if (!comandos.length) {
    return `<tr><td class="${tw.tableEmpty}" colspan="4">Sin comandos. Agrega uno arriba.</td></tr>`;
  }
  return comandos.map((c) => `
    <tr data-id="${escapeHtml(c.id)}">
      <td class="${tw.td}">
        <input class="${tw.input} voz-frase-edit" type="text" value="${escapeHtml(c.frase || '')}">
      </td>
      <td class="${tw.td}">
        <input class="${tw.input} voz-url-edit" type="url" value="${escapeHtml(c.url || '')}">
      </td>
      <td class="${tw.td}">
        <label class="${tw.checkbox}">
          <input type="checkbox" class="voz-activo-edit" ${c.activo === false ? '' : 'checked'}>
          ${c.activo === false ? 'No' : 'Sí'}
        </label>
      </td>
      <td class="${tw.td}">
        <div class="${tw.tableActions}">
          <button type="button" class="${cx(tw.btnGhost, tw.btnSm)} voz-save" title="Guardar">
            <i class="fa-solid fa-floppy-disk"></i>
          </button>
          <button type="button" class="${cx(tw.btnGhost, tw.btnSm)} voz-test" title="Probar y leer">
            <i class="fa-solid fa-volume-high"></i>
          </button>
          <button type="button" class="${cx(tw.btnDanger, tw.btnSm)} voz-del" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function bindComandosTable(host) {
  host.querySelector('#voz-comandos-body')?.addEventListener('click', async (ev) => {
    const row = ev.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.getAttribute('data-id');
    if (ev.target.closest('.voz-save')) {
      await saveComandoRow(host, row, id);
    } else if (ev.target.closest('.voz-test')) {
      await testComandoRow(id);
    } else if (ev.target.closest('.voz-del')) {
      if (!window.confirm('¿Eliminar este comando de voz?')) return;
      try {
        await api.deleteComandoVoz(id);
        showToast('Comando eliminado', 'success');
        window.dispatchEvent(new Event('mariandre:comandos-voz-updated'));
        await refreshComandosTable(host);
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

async function saveComandoRow(host, row, id) {
  const frase = row.querySelector('.voz-frase-edit')?.value?.trim();
  const url = row.querySelector('.voz-url-edit')?.value?.trim();
  const activo = Boolean(row.querySelector('.voz-activo-edit')?.checked);
  try {
    await api.updateComandoVoz(id, { frase, url, activo });
    showToast('Comando actualizado', 'success');
    window.dispatchEvent(new Event('mariandre:comandos-voz-updated'));
    await refreshComandosTable(host);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function testComandoRow(id) {
  showToast('Consultando endpoint…', 'info');
  try {
    const result = await api.ejecutarComandoVoz(id);
    const texto = String(result?.texto || '').trim();
    if (!texto) {
      showToast('El endpoint no devolvió texto', 'error');
      return;
    }
    const { speak } = await import('../tts.js');
    await speak(texto);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function refreshComandosTable(host) {
  const body = host.querySelector('#voz-comandos-body');
  if (!body) return;
  const comandos = await api.getComandosVoz();
  body.innerHTML = renderComandosRows(comandos);
}
