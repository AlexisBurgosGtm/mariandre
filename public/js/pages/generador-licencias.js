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

function applyMenusSelection(modulesRoot, menus) {
  const set = new Set((menus || []).map((m) => String(m)));
  modulesRoot?.querySelectorAll('input[name=menu]').forEach((el) => {
    el.checked = set.has(el.value);
  });
  modulesRoot?.querySelectorAll('.mod-card').forEach((card) => syncModuleState(card));
}

/** YYYY-MM-DD para input[type=date] desde ISO de la licencia. */
function expiresInputValue(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function applyCloudLicenseToForm(container, modulesRoot, data) {
  const menus = data?.menus || data?.license?.payload?.menus || [];
  applyMenusSelection(modulesRoot, menus);
  const expiresEl = container.querySelector('#lic-gen-expires');
  if (expiresEl) expiresEl.value = expiresInputValue(data?.expiresAt || data?.license?.payload?.expiresAt);
  const notesEl = container.querySelector('#lic-gen-notes');
  if (notesEl) notesEl.value = String(data?.notes || data?.license?.payload?.notes || '').trim();
  return menus;
}

function renderTemplatesList(templates) {
  if (!templates?.length) {
    return `<p class="px-1 py-2 text-sm text-slate-500">No hay plantillas guardadas.</p>`;
  }
  return `
    <div class="overflow-auto rounded-xl border border-slate-200">
      <table class="min-w-full text-left text-sm">
        <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-3 py-2 font-semibold">Nombre</th>
            <th class="px-3 py-2 font-semibold text-right">Vistas</th>
            <th class="px-3 py-2 font-semibold text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          ${templates
            .map(
              (t) => `
            <tr data-template-id="${escapeHtml(t.id)}">
              <td class="px-3 py-2">
                <button type="button" class="lic-tpl-apply text-left font-medium text-slate-800 hover:text-blue-700"
                  data-template-id="${escapeHtml(t.id)}" title="Aplicar plantilla">
                  ${escapeHtml(t.name)}
                </button>
              </td>
              <td class="px-3 py-2 text-right tabular-nums text-slate-500">${(t.menus || []).length}</td>
              <td class="px-3 py-2">
                <div class="flex justify-end gap-1">
                  <button type="button" class="lic-tpl-apply ${cx(tw.btnGhost, tw.btnSm)}"
                    data-template-id="${escapeHtml(t.id)}" title="Aplicar">
                    <i class="fa-solid fa-check"></i>
                  </button>
                  <button type="button" class="lic-tpl-delete ${cx(tw.btnGhost, tw.btnSm)} text-red-600"
                    data-template-id="${escapeHtml(t.id)}" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

export async function renderGeneradorLicencias(container) {
  showLoader(container, 'Cargando catálogo y tokens…');

  let catalog;
  let tokens = [];
  let templates = [];
  try {
    [catalog, tokens, templates] = await Promise.all([
      api.getLicenseGenCatalog(),
      api.getTokensAdmin().catch((err) => {
        throw new Error(err.message || 'No se pudieron cargar los tokens (Hosting principal)');
      }),
      api.getLicenseTemplates().catch(() => []),
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
      return `<option value="${escapeHtml(token)}" data-empresa="${escapeHtml(empresa)}" data-has-licencia="${t.HAS_LICENCIA ? '1' : '0'}">${escapeHtml(label)}</option>`;
    })
    .join('');

  container.innerHTML = `
    <div class="space-y-4">
      ${integrityWarn}

      <form id="lic-gen-form" class="space-y-4">
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
          <div class="${tw.panel}">
            <h3 class="mb-3 text-base font-semibold text-slate-800">Licencia</h3>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-end">
              <div class="${tw.formGroup}">
                <label class="${tw.label}" for="lic-gen-token">Cliente / instalación (TOKEN)</label>
                <select class="${tw.input}" id="lic-gen-token" required>
                  <option value="">— Seleccione token / instalación —</option>
                  ${tokenOptions || '<option value="" disabled>No hay tokens</option>'}
                </select>
              </div>
              <div class="${tw.formGroup}">
                <label class="${tw.label}" for="lic-gen-expires">Vence (opcional)</label>
                <input class="${tw.input}" type="date" id="lic-gen-expires">
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" class="${tw.btnGhost}" id="lic-gen-load-cloud" disabled title="Leer TOKENS.LICENCIA y marcar módulos/vistas">
                <i class="fa-solid fa-cloud-arrow-down"></i> Cargar licencia de nube
              </button>
            </div>
            <div class="${cx(tw.formGroup, 'mt-3')}">
              <label class="${tw.label}" for="lic-gen-notes">Notas</label>
              <input class="${tw.input}" type="text" id="lic-gen-notes" placeholder="Contrato, contacto, etc.">
            </div>
            <p class="mt-2 text-xs text-slate-500">
              Catálogo en vivo desde OnneB (<code class="${tw.code}">MENU_GROUPS</code>).
              Use <strong>Cargar licencia de nube</strong> para recuperar los checks del token sin volver a marcarlos.
            </p>
          </div>

          <div class="${tw.panel}">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-base font-semibold text-slate-800">Plantillas</h3>
            </div>
            <div class="mb-3 flex flex-wrap items-end gap-2">
              <div class="min-w-[10rem] flex-1">
                <label class="${tw.label}" for="lic-gen-tpl-name">Nombre</label>
                <input class="${tw.input}" type="text" id="lic-gen-tpl-name" placeholder="Ej. POS básico…">
              </div>
              <button type="button" class="${tw.btnGhost}" id="lic-gen-tpl-save">
                <i class="fa-solid fa-floppy-disk"></i> Guardar
              </button>
            </div>
            <div id="lic-gen-templates" class="max-h-56 overflow-auto">${renderTemplatesList(templates)}</div>
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
          <li>Seleccione el TOKEN del cliente.</li>
          <li><strong>Cargar licencia de nube</strong> marca las vistas ya subidas (útil tras agregar módulos en OnneB).</li>
          <li>Ajuste checks si hace falta y use <strong>Generar y Subir</strong> para actualizar <code class="${tw.code}">TOKENS.LICENCIA</code>.</li>
          <li>En el POS: <strong>Configuraciones → Licencia</strong> → descargar desde la nube y activar.</li>
        </ol>
      </aside>
    </div>
  `;

  const modulesRoot = container.querySelector('#lic-gen-modules');
  const uploadBtn = container.querySelector('#lic-gen-upload');
  const loadCloudBtn = container.querySelector('#lic-gen-load-cloud');
  const tokenSel = container.querySelector('#lic-gen-token');

  const syncUploadEnabled = () => {
    if (!uploadBtn) return;
    if (uploadBtn.dataset.uploading === '1') {
      uploadBtn.disabled = true;
      return;
    }
    uploadBtn.disabled = !tokenSel?.value;
  };

  const syncLoadCloudEnabled = () => {
    if (!loadCloudBtn) return;
    if (loadCloudBtn.dataset.loading === '1') {
      loadCloudBtn.disabled = true;
      return;
    }
    loadCloudBtn.disabled = !tokenSel?.value;
  };

  tokenSel?.addEventListener('change', () => {
    syncUploadEnabled();
    syncLoadCloudEnabled();
  });
  syncUploadEnabled();
  syncLoadCloudEnabled();

  const loadLicenseFromCloud = async () => {
    const token = String(tokenSel?.value || '').trim();
    if (!token) {
      showToast('Seleccione un token', 'error');
      return;
    }
    loadCloudBtn.dataset.loading = '1';
    loadCloudBtn.disabled = true;
    const prevHtml = loadCloudBtn.innerHTML;
    loadCloudBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando…';
    setStatus('');
    try {
      const data = await api.getTokenLicense(token);
      const menus = applyCloudLicenseToForm(container, modulesRoot, data);
      const known = new Set(
        [...(modulesRoot?.querySelectorAll('input[name=menu]') || [])].map((el) => el.value)
      );
      const matched = menus.filter((m) => known.has(m)).length;
      const unknown = menus.filter((m) => !known.has(m)).length;
      const extra =
        unknown > 0
          ? ` · ${unknown} vista(s) de la licencia ya no están en el catálogo OnneB`
          : '';
      setStatus(
        `Licencia nube cargada (${data.licenseId || 'ok'}): ${matched} vista(s) marcadas${extra}`
      );
      showToast('Checks actualizados desde la nube', 'success');
    } catch (err) {
      setStatus(err.message || 'No se pudo cargar la licencia', true);
      showToast(err.message || 'No se pudo cargar la licencia', 'error');
    } finally {
      loadCloudBtn.dataset.loading = '0';
      loadCloudBtn.innerHTML = prevHtml;
      syncLoadCloudEnabled();
    }
  };

  loadCloudBtn?.addEventListener('click', () => {
    loadLicenseFromCloud();
  });

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

  const templatesRoot = container.querySelector('#lic-gen-templates');
  const refreshTemplates = async () => {
    try {
      templates = await api.getLicenseTemplates();
      if (templatesRoot) templatesRoot.innerHTML = renderTemplatesList(templates);
    } catch (err) {
      showToast(err.message || 'No se pudieron cargar plantillas', 'error');
    }
  };

  container.querySelector('#lic-gen-tpl-save')?.addEventListener('click', async () => {
    const name = String(container.querySelector('#lic-gen-tpl-name')?.value || '').trim();
    const menus = selectedMenus(modulesRoot);
    if (!name) {
      showToast('Indique el nombre de la plantilla', 'error');
      return;
    }
    if (!menus.length) {
      showToast('Seleccione al menos una vista', 'error');
      return;
    }
    try {
      await api.saveLicenseTemplate({ name, menus });
      const nameInput = container.querySelector('#lic-gen-tpl-name');
      if (nameInput) nameInput.value = '';
      await refreshTemplates();
      showToast('Plantilla guardada', 'success');
    } catch (err) {
      showToast(err.message || 'No se pudo guardar', 'error');
    }
  });

  templatesRoot?.addEventListener('click', async (e) => {
    const applyBtn = e.target.closest('.lic-tpl-apply');
    if (applyBtn) {
      const id = applyBtn.getAttribute('data-template-id');
      const tpl = templates.find((t) => String(t.id) === String(id));
      if (!tpl) return;
      applyMenusSelection(modulesRoot, tpl.menus || []);
      showToast(`Plantilla «${tpl.name}» aplicada`, 'success');
      return;
    }
    const delBtn = e.target.closest('.lic-tpl-delete');
    if (delBtn) {
      const id = delBtn.getAttribute('data-template-id');
      const tpl = templates.find((t) => String(t.id) === String(id));
      if (!tpl) return;
      if (!window.confirm(`¿Eliminar la plantilla «${tpl.name}»?`)) return;
      try {
        await api.deleteLicenseTemplate(id);
        await refreshTemplates();
        showToast('Plantilla eliminada', 'success');
      } catch (err) {
        showToast(err.message || 'No se pudo eliminar', 'error');
      }
    }
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
      const opt = tokenSel?.selectedOptions?.[0];
      if (opt) opt.dataset.hasLicencia = '1';
      const label = opt?.textContent || '';
      if (opt && label && !/con licencia/i.test(label)) {
        opt.textContent = label.replace(/\)$/, ' · con licencia)');
      }
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
