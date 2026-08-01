import { api } from '../api.js';
import { showToast, showLoader } from '../utils.js';
import { tw, cx } from '../ui.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function syncModuleState(modEl) {
  const modCb = modEl.querySelector('input[name=module]');
  const viewCbs = [...modEl.querySelectorAll('input[name=menu]')];
  if (!modCb || !viewCbs.length) return;
  const checked = viewCbs.filter((c) => c.checked).length;
  modCb.checked = checked === viewCbs.length;
  modCb.indeterminate = checked > 0 && checked < viewCbs.length;
}

function selectedMenus(container) {
  return [...container.querySelectorAll('input[name=menu]:checked')].map((el) => el.value);
}

function renderModules(modules) {
  return (modules || [])
    .map((m) => {
      const views = (m.menuLabels || [])
        .map(
          (x) => `
          <label class="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <input type="checkbox" name="menu" value="${escapeHtml(x.key)}" data-module="${escapeHtml(m.id)}" checked
              class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30">
            <span>${escapeHtml(x.label)}</span>
          </label>`
        )
        .join('');
      return `
        <div class="${cx(tw.card, 'mod-card')}" data-module="${escapeHtml(m.id)}">
          <label class="flex cursor-pointer items-start gap-3 border-b border-slate-100 pb-3">
            <input type="checkbox" name="module" value="${escapeHtml(m.id)}" checked
              class="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30">
            <span>
              <strong class="block text-sm text-slate-800">${escapeHtml(m.title)}</strong>
              <small class="text-xs text-slate-500">${(m.menus || []).length} vistas — marque/desmarque individualmente</small>
            </span>
          </label>
          <div class="mt-2 grid grid-cols-1 gap-0.5 sm:grid-cols-2">${views}</div>
        </div>`;
    })
    .join('');
}

function getFormPayload(container, modulesRoot) {
  const tokenSel = container.querySelector('#lic-gen-token');
  const token = tokenSel?.value?.trim() || '';
  const selected = tokenSel?.selectedOptions?.[0];
  const empresa =
    selected?.dataset?.empresa?.trim() ||
    selected?.textContent?.split('—')[0]?.trim() ||
    token;
  return {
    token,
    customer: empresa || token,
    expiresAt: container.querySelector('#lic-gen-expires')?.value || null,
    notes: container.querySelector('#lic-gen-notes')?.value.trim() || '',
    menus: selectedMenus(modulesRoot),
  };
}

export async function renderGeneradorLicencias(container) {
  showLoader(container, 'Cargando catálogo y tokens…');

  let catalog;
  let tokens = [];
  try {
    [catalog, tokens] = await Promise.all([
      api.getLicenseGenCatalog(),
      api.getTokensAdmin().catch((err) => {
        throw new Error(err.message || 'No se pudieron cargar los tokens (Hosting principal)');
      }),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const integrityWarn =
    catalog.integrity && !catalog.integrity.ok
      ? `<div class="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
           ${(catalog.integrity.problems || []).map((p) => escapeHtml(p)).join(' · ')}
         </div>`
      : '';

  const tokenOptions = tokens
    .map((t) => {
      const token = String(t.TOKEN || '').trim();
      const empresa = String(t.EMPRESA || '').trim();
      const activo = String(t.ACTIVO || '').toUpperCase() === 'SI' ? 'Activo' : 'Inactivo';
      const lic = t.HAS_LICENCIA ? ' · con licencia' : '';
      const label = empresa
        ? `${empresa} — ${token} (${activo}${lic})`
        : `${token} (${activo}${lic})`;
      return `<option value="${escapeHtml(token)}" data-empresa="${escapeHtml(empresa)}">${escapeHtml(label)}</option>`;
    })
    .join('');

  container.innerHTML = `
    <div class="space-y-4">
      ${integrityWarn}

      <form id="lic-gen-form" class="space-y-4">
        <div class="${tw.panel}">
          <div class="${tw.formGrid}">
            <div class="${tw.formGroupFull}">
              <label class="${tw.label}" for="lic-gen-token">Cliente / instalación (TOKEN)</label>
              <select class="${tw.input}" id="lic-gen-token" required>
                <option value="">— Seleccione token / instalación —</option>
                ${tokenOptions || '<option value="" disabled>No hay tokens</option>'}
              </select>
              <p class="mt-1.5 text-xs text-slate-500">Lista de TOKENS del Hosting principal (activos e inactivos).</p>
            </div>
            <div class="${tw.formGroup}">
              <label class="${tw.label}" for="lic-gen-expires">Vence (opcional)</label>
              <input class="${tw.input}" type="date" id="lic-gen-expires">
            </div>
            <div class="${tw.formGroupFull}">
              <label class="${tw.label}" for="lic-gen-notes">Notas</label>
              <textarea class="${tw.input}" id="lic-gen-notes" rows="2" placeholder="Contrato, contacto, etc."></textarea>
            </div>
          </div>
        </div>

        <div class="${tw.panel}">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-base font-semibold text-slate-800">Módulos</h3>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="${cx(tw.btnGhost, tw.btnSm)}" id="lic-gen-reload" title="Recargar catálogo desde OnneB">
                <i class="fa-solid fa-arrows-rotate"></i> Recargar
              </button>
              <button type="button" class="${cx(tw.btnGhost, tw.btnSm)}" id="lic-gen-all">Marcar todos</button>
              <button type="button" class="${cx(tw.btnGhost, tw.btnSm)}" id="lic-gen-none">Ninguno</button>
            </div>
          </div>
          <div id="lic-gen-modules" class="${cx(tw.cardGrid, 'gap-3')}">${renderModules(catalog.modules)}</div>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <button type="submit" class="${tw.btnPrimary}" id="lic-gen-issue">
              <i class="fa-solid fa-download"></i> Generar y descargar
            </button>
            <button type="button" class="${tw.btnGhost}" id="lic-gen-upload" disabled>
              <i class="fa-solid fa-cloud-arrow-up"></i> Generar y Subir licencia
            </button>
          </div>
          <p id="lic-gen-status" class="text-sm text-slate-500" hidden></p>
        </div>
      </form>

      <aside class="${tw.panel}">
        <h3 class="mb-2 text-base font-semibold text-slate-800">Cómo usarlo</h3>
        <ol class="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Seleccione el TOKEN del cliente e indique módulos/vistas.</li>
          <li><strong>Generar y Subir</strong> guarda el JSON firmado en <code class="${tw.code}">TOKENS.LICENCIA</code>.</li>
          <li>En el POS: <strong>Configuraciones → Licencia</strong> → descargar desde la nube y activar.</li>
        </ol>
      </aside>
    </div>
  `;

  const modulesRoot = container.querySelector('#lic-gen-modules');
  const uploadBtn = container.querySelector('#lic-gen-upload');
  const tokenSel = container.querySelector('#lic-gen-token');

  const syncUploadEnabled = () => {
    if (!uploadBtn) return;
    // Solo habilitar si hay token; se vuelve a deshabilitar durante la subida.
    if (uploadBtn.dataset.uploading === '1') {
      uploadBtn.disabled = true;
      return;
    }
    uploadBtn.disabled = !tokenSel?.value;
  };

  tokenSel?.addEventListener('change', syncUploadEnabled);
  syncUploadEnabled();

  container.querySelector('#lic-gen-reload')?.addEventListener('click', () => {
    renderGeneradorLicencias(container);
  });

  modulesRoot?.querySelectorAll('.mod-card').forEach((card) => {
    syncModuleState(card);
    const modCb = card.querySelector('input[name=module]');
    modCb?.addEventListener('change', () => {
      card.querySelectorAll('input[name=menu]').forEach((c) => {
        c.checked = modCb.checked;
      });
      modCb.indeterminate = false;
    });
    card.querySelectorAll('input[name=menu]').forEach((c) => {
      c.addEventListener('change', () => syncModuleState(card));
    });
  });

  const setStatus = (msg, isErr = false) => {
    const el = container.querySelector('#lic-gen-status');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
    el.className = cx('text-sm', isErr ? 'text-red-600' : 'text-slate-500');
  };

  container.querySelector('#lic-gen-all')?.addEventListener('click', () => {
    modulesRoot?.querySelectorAll('input[type=checkbox]').forEach((el) => {
      el.checked = true;
      el.indeterminate = false;
    });
  });

  container.querySelector('#lic-gen-none')?.addEventListener('click', () => {
    modulesRoot?.querySelectorAll('input[type=checkbox]').forEach((el) => {
      el.checked = false;
      el.indeterminate = false;
    });
  });

  container.querySelector('#lic-gen-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus('');
    const payload = getFormPayload(container, modulesRoot);
    if (!payload.token) {
      showToast('Seleccione un token', 'error');
      return;
    }

    const btn = container.querySelector('#lic-gen-issue');
    if (btn) btn.disabled = true;
    try {
      const data = await api.issueLicense({
        customer: payload.customer,
        expiresAt: payload.expiresAt,
        notes: payload.notes,
        menus: payload.menus,
      });
      const blob = new Blob([JSON.stringify(data.license, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `onneb-license-${payload.token}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(
        `Licencia generada: ${data.preview?.licenseId || ''} · ${payload.menus.length} vista(s) · ${(data.modules || []).length} módulo(s)`
      );
      showToast('Licencia descargada', 'success');
    } catch (err) {
      setStatus(err.message || 'Error', true);
      showToast(err.message || 'Error al generar', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  uploadBtn?.addEventListener('click', async () => {
    setStatus('');
    const payload = getFormPayload(container, modulesRoot);
    if (!payload.token) {
      showToast('Seleccione un token', 'error');
      return;
    }

    uploadBtn.dataset.uploading = '1';
    uploadBtn.disabled = true;
    const issueBtn = container.querySelector('#lic-gen-issue');
    if (issueBtn) issueBtn.disabled = true;
    const prevHtml = uploadBtn.innerHTML;
    uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Subiendo licencia…';

    try {
      const data = await api.issueAndUploadLicense({
        token: payload.token,
        expiresAt: payload.expiresAt,
        notes: payload.notes,
        menus: payload.menus,
      });
      setStatus(
        `Licencia subida a TOKENS (${data.token || payload.token}) · ${data.preview?.licenseId || ''} · ${payload.menus.length} vista(s)`
      );
      showToast('Licencia generada y subida a la nube', 'success');
    } catch (err) {
      setStatus(err.message || 'Error', true);
      showToast(err.message || 'Error al subir', 'error');
    } finally {
      uploadBtn.dataset.uploading = '0';
      uploadBtn.innerHTML = prevHtml;
      if (issueBtn) issueBtn.disabled = false;
      syncUploadEnabled();
    }
  });
}
