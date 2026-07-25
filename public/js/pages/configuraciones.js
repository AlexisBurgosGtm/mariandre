import { api } from '../api.js';
import { showToast, showLoader } from '../utils.js';
import { getStoredTheme, renderThemeSelector, bindThemeSelector } from '../themes.js';
import { tw, cx } from '../ui.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
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

  const selectedId = config?.hosting?.principalConexionId || '';

  container.innerHTML = `
    <div class="space-y-4">
      <div class="${tw.panel}">
        <div class="space-y-2">
          <h3 class="flex items-center gap-2 text-base font-semibold text-slate-800"><i class="fa-solid fa-server"></i> Hosting principal</h3>
          <p class="text-sm text-slate-500">
            Selecciona la conexión que usarán las secciones <strong>Soporte Clientes</strong> y <strong>Updater</strong>.
          </p>

          ${!conexiones.length ? `
            <div class="${cx(tw.empty, 'mt-4 !p-6')}">
              <p>No hay conexiones configuradas. Agrega una en la sección Conexiones.</p>
            </div>
          ` : `
            <div class="${cx(tw.formGroupFull, 'mt-3')}">
              <label class="${tw.label}" for="hosting-principal">Conexión de hosting</label>
              <select class="${tw.input}" id="hosting-principal">
                <option value="">— Seleccionar conexión —</option>
                ${conexiones.map((c) => `
                  <option value="${escapeHtml(c.id)}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>
                    ${escapeHtml(c.nombre)} (${escapeHtml(c.tipo)} — ${escapeHtml(c.host)})
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="${tw.formActions}">
              <button type="button" class="${tw.btnPrimary}" id="btn-save-hosting">
                <i class="fa-solid fa-floppy-disk"></i> Guardar configuración
              </button>
            </div>
          `}
        </div>
      </div>

      ${renderThemeSelector(getStoredTheme())}
    </div>
  `;

  bindThemeSelector(container);

  const saveBtn = container.querySelector('#btn-save-hosting');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', async () => {
    const select = container.querySelector('#hosting-principal');
    const principalConexionId = select.value || null;

    if (!principalConexionId) {
      showToast('Selecciona una conexión de hosting', 'error');
      return;
    }

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
}
