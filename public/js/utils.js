import { tw, cx } from './ui.js';

const SWAL_BASE = {
  background: 'rgba(255, 255, 255, 0.96)',
  color: '#0f172a',
  backdrop: 'rgba(15, 23, 42, 0.35)',
  buttonsStyling: true,
  confirmButtonColor: '#2563eb',
  cancelButtonColor: '#94a3b8',
};

export async function confirmDialog({
  title = '¿Confirmar?',
  text = '',
  icon = 'warning',
  confirmText = 'Sí, continuar',
  cancelText = 'Cancelar',
} = {}) {
  const result = await Swal.fire({
    ...SWAL_BASE,
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    focusCancel: true,
  });

  return result.isConfirmed;
}

export function renderLoader(message = 'Cargando...', { compact = false } = {}) {
  const box = compact ? tw.loaderCompact : tw.loader;
  return `
    <div class="${box}" role="status" aria-live="polite">
      <i class="fa-solid fa-spinner fa-spin text-2xl text-blue-600" aria-hidden="true"></i>
      <span class="text-sm font-medium text-slate-600">${message}</span>
    </div>
  `;
}

export function showLoader(container, message = 'Cargando...') {
  if (container) container.innerHTML = renderLoader(message);
}

export function showTableLoader(element, message = 'Cargando...') {
  if (element) element.innerHTML = renderLoader(message, { compact: true });
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = {
    success: 'fa-circle-check text-green-600',
    error: 'fa-circle-xmark text-red-600',
    info: 'fa-circle-info text-blue-600',
    warning: 'fa-bell text-amber-600',
  };

  const toast = document.createElement('div');
  toast.className = cx(tw.toast, 'animate-toast-in');
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  const duration = type === 'warning' ? 10000 : 4000;
  setTimeout(() => toast.remove(), duration);
}

export function openModal(title, contentHtml, onMount) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="${tw.modalOverlay}" id="modal-overlay">
      <div class="${tw.modal}">
        <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 class="text-base font-semibold text-slate-900 sm:text-lg">${title}</h2>
          <button class="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" id="modal-close" type="button">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="overflow-y-auto p-4 sm:p-5" id="modal-body">${contentHtml}</div>
      </div>
    </div>
  `;

  const overlay = document.getElementById('modal-overlay');
  const modal = overlay.firstElementChild;

  const close = () => { root.innerHTML = ''; };

  document.getElementById('modal-close').addEventListener('click', close);

  // Solo cerrar si mousedown y mouseup ocurrieron en el fondo
  // (evita cierre al seleccionar texto y soltar fuera del modal)
  let pointerDownOnOverlay = false;
  overlay.addEventListener('mousedown', (e) => {
    pointerDownOnOverlay = e.target === overlay;
  });
  overlay.addEventListener('mouseup', (e) => {
    if (pointerDownOnOverlay && e.target === overlay) close();
    pointerDownOnOverlay = false;
  });

  if (onMount) onMount(root, close);
  return close;
}

export function getTipoLabel(tipo) {
  return tipo === 'mssql' ? 'SQL Server' : 'MySQL';
}

export function getTipoBadge(tipo) {
  const label = getTipoLabel(tipo);
  const icon = tipo === 'mssql' ? 'fa-server' : 'fa-dolphin';
  const color = tipo === 'mssql' ? tw.badgeMssql : tw.badgeMysql;
  return `<span class="${cx(tw.badge, color)}"><i class="fa-solid ${icon}"></i> ${label}</span>`;
}

export function getFormHtml(conexion = {}) {
  const isMssql = (conexion.tipo || 'mysql') === 'mssql';
  return `
    <form id="conexion-form" novalidate>
      <div class="${tw.formGrid}">
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="nombre">Nombre</label>
          <input class="${tw.input}" type="text" id="nombre" name="nombre" value="${conexion.nombre || ''}" required placeholder="Mi conexión">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="tipo">Tipo de base de datos</label>
          <select class="${tw.input}" id="tipo" name="tipo" required>
            <option value="mysql" ${conexion.tipo === 'mysql' ? 'selected' : ''}>MySQL</option>
            <option value="mssql" ${conexion.tipo === 'mssql' ? 'selected' : ''}>SQL Server</option>
          </select>
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="host">Host</label>
          <input class="${tw.input}" type="text" id="host" name="host" value="${conexion.host || 'localhost'}" required>
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="puerto">Puerto</label>
          <input class="${tw.input}" type="number" id="puerto" name="puerto" value="${conexion.puerto || ''}" placeholder="3306 / 1433">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="usuario">Usuario</label>
          <input class="${tw.input}" type="text" id="usuario" name="usuario" value="${conexion.usuario || ''}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="password">Contraseña</label>
          <input class="${tw.input}" type="password" id="password" name="password" value="${conexion.password || ''}">
        </div>
        <div class="${tw.formGroupFull}">
          <label class="${tw.label}" for="baseDatos">Base de datos</label>
          <input class="${tw.input}" type="text" id="baseDatos" name="baseDatos" value="${conexion.baseDatos || ''}" required>
        </div>
        <div class="${tw.formGroupFull} mssql-options flex-col gap-2" style="display: ${isMssql ? 'flex' : 'none'}">
          <label class="${tw.checkbox}">
            <input type="checkbox" class="h-4 w-4 accent-blue-600" id="encrypt" ${conexion.opciones?.encrypt ? 'checked' : ''}>
            Encriptar conexión
          </label>
          <label class="${tw.checkbox}">
            <input type="checkbox" class="h-4 w-4 accent-blue-600" id="trustCert" ${conexion.opciones?.trustServerCertificate !== false ? 'checked' : ''}>
            Confiar en certificado del servidor
          </label>
        </div>
      </div>
      <div class="${tw.formActions}">
        <button type="button" class="${tw.btnGhost}" id="btn-test-form"><i class="fa-solid fa-plug"></i> Probar</button>
        <button type="submit" class="${tw.btnPrimary}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

export function getFormData(form) {
  const tipo = form.tipo.value;
  const data = {
    nombre: form.nombre.value.trim(),
    tipo,
    host: form.host.value.trim(),
    puerto: form.puerto.value ? parseInt(form.puerto.value, 10) : undefined,
    usuario: form.usuario.value,
    password: form.password.value,
    baseDatos: form.baseDatos.value.trim(),
  };

  if (tipo === 'mssql') {
    data.opciones = {
      encrypt: form.querySelector('#encrypt')?.checked ?? false,
      trustServerCertificate: form.querySelector('#trustCert')?.checked ?? true,
    };
  }

  return data;
}

export function bindFormEvents(form, close, onSave, afterSave) {
  const tipoSelect = form.tipo;
  const mssqlOptions = form.closest('#modal-body')?.querySelector('.mssql-options')
    || document.querySelector('.mssql-options');

  tipoSelect.addEventListener('change', () => {
    if (mssqlOptions) {
      mssqlOptions.style.display = tipoSelect.value === 'mssql' ? 'flex' : 'none';
    }
    if (!form.puerto.value) {
      form.puerto.placeholder = tipoSelect.value === 'mssql' ? '1433' : '3306';
    }
  });

  form.btnTestForm?.addEventListener('click', async () => {
    try {
      form.btnTestForm.disabled = true;
      const { api } = await import('./api.js');
      const { speak } = await import('./tts.js');
      const data = getFormData(form);
      const result = await api.testConexionData(data);
      showToast(result.mensaje, 'success');
      speak(result.mensaje);
    } catch (err) {
      const { speak } = await import('./tts.js');
      showToast(err.message, 'error');
      speak(err.message);
    } finally {
      form.btnTestForm.disabled = false;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = getFormData(form);
    if (!data.nombre || !data.host || !data.baseDatos) {
      showToast('Completa los campos obligatorios', 'error');
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
