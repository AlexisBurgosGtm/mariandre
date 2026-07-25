import { api } from '../api.js';
import { showToast, confirmDialog, openModal, showLoader } from '../utils.js';
import { refreshAlarmas } from '../services/alarmas.js';
import { tw, cx } from '../ui.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatAlarmDateTime(alarma) {
  if (!alarma?.fecha) return '—';
  return `${alarma.fecha} ${pad2(alarma.hora)}:${pad2(alarma.minuto)}`;
}

function getHourOptions(selected = 0) {
  return Array.from({ length: 24 }, (_, h) => `
    <option value="${h}" ${Number(selected) === h ? 'selected' : ''}>${pad2(h)}</option>
  `).join('');
}

function getMinuteOptions(selected = 0) {
  return Array.from({ length: 60 }, (_, m) => `
    <option value="${m}" ${Number(selected) === m ? 'selected' : ''}>${pad2(m)}</option>
  `).join('');
}

function getAlarmaFormHtml(alarma) {
  const a = alarma || {};
  const today = new Date().toISOString().slice(0, 10);

  return `
    <form id="alarma-form" novalidate>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_0.8fr_0.8fr]">
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="alarma-fecha">Fecha</label>
          <input class="${tw.input}" type="date" id="alarma-fecha" required value="${escapeHtml(a.fecha || today)}">
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="alarma-hora">Hora</label>
          <select class="${tw.input}" id="alarma-hora" required>${getHourOptions(a.hora ?? new Date().getHours())}</select>
        </div>
        <div class="${tw.formGroup}">
          <label class="${tw.label}" for="alarma-minuto">Min</label>
          <select class="${tw.input}" id="alarma-minuto" required>${getMinuteOptions(a.minuto ?? new Date().getMinutes())}</select>
        </div>
        <div class="${cx(tw.formGroupFull, 'sm:col-span-3')}">
          <label class="${tw.label}" for="alarma-descripcion">Descripción</label>
          <textarea class="${tw.input}" id="alarma-descripcion" rows="3" required placeholder="Motivo de la alarma">${escapeHtml(a.descripcion || '')}</textarea>
        </div>
      </div>
      <div class="${tw.formActions}">
        <button type="submit" class="${tw.btnPrimary}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>
      </div>
    </form>
  `;
}

function getFormData(form) {
  return {
    fecha: form.querySelector('#alarma-fecha').value,
    hora: Number(form.querySelector('#alarma-hora').value),
    minuto: Number(form.querySelector('#alarma-minuto').value),
    descripcion: form.querySelector('#alarma-descripcion').value.trim(),
  };
}

function bindAlarmaForm(form, close, onSave, afterSave) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getFormData(form);

    if (!data.fecha || !data.descripcion) {
      showToast('Completa fecha y descripción', 'error');
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

function openAlarmaModal(alarma, reload) {
  const isEdit = Boolean(alarma?.id);
  const isReactivate = Boolean(alarma?.disparada);
  const modalTitle = !isEdit ? 'Nueva alarma' : (isReactivate ? 'Reactivar alarma' : 'Editar alarma');

  openModal(modalTitle, getAlarmaFormHtml(alarma), (_root, close) => {
    const form = document.getElementById('alarma-form');
    bindAlarmaForm(form, close, async (data) => {
      if (isEdit) {
        await api.updateAlarma(alarma.id, data);
        showToast(isReactivate ? 'Alarma reactivada' : 'Alarma actualizada', 'success');
      } else {
        await api.createAlarma(data);
        showToast('Alarma creada', 'success');
      }
      await refreshAlarmas();
    }, reload);
  });
}

function bindTableEvents(container, reload) {
  container.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const alarmas = await api.getAlarmas();
        const alarma = alarmas.find((a) => a.id === btn.dataset.id);
        if (alarma) openAlarmaModal(alarma, reload);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  container.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Eliminar alarma',
        text: '¿Eliminar esta alarma?',
        icon: 'warning',
        confirmText: 'Sí, eliminar',
      });
      if (!confirmed) return;

      try {
        await api.deleteAlarma(btn.dataset.id);
        showToast('Alarma eliminada', 'success');
        await refreshAlarmas();
        await reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

export async function openNewAlarmaModal() {
  openAlarmaModal(null, () => window.__reloadAlarmas?.());
}

function renderAlarmasTable(alarmas) {
  const pending = alarmas.filter((a) => !a.disparada);
  const fired = alarmas.filter((a) => a.disparada);

  const renderRow = (alarma) => `
    <tr class="${alarma.disparada ? 'opacity-60' : ''}">
      <td class="${tw.td}">${escapeHtml(formatAlarmDateTime(alarma))}</td>
      <td class="${tw.td}">${escapeHtml(alarma.descripcion)}</td>
      <td class="${tw.td}">
        <span class="${alarma.disparada ? tw.tableTagMuted : tw.tableTagOk}">
          <i class="fa-solid ${alarma.disparada ? 'fa-bell-slash' : 'fa-bell'}"></i>
          ${alarma.disparada ? 'Disparada' : 'Pendiente'}
        </span>
      </td>
      <td class="${cx(tw.td, tw.tableActions)}">
        <button class="${cx(tw.btnGhost, tw.btnSm)} btn-edit" data-id="${alarma.id}" title="${alarma.disparada ? 'Reactivar' : 'Editar'}">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="${cx(tw.btnDanger, tw.btnSm)} btn-delete" data-id="${alarma.id}" title="Eliminar">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `;

  if (!alarmas.length) {
    return `
      <div class="${tw.empty}">
        <i class="fa-solid fa-bell text-3xl text-slate-400"></i>
        <h3 class="text-lg font-semibold text-slate-800">Sin alarmas</h3>
        <p class="text-sm text-slate-500">Agrega una alarma con fecha, hora y descripción. Al llegar el momento escucharás un aviso.</p>
        <button class="${tw.btnPrimary}" id="btn-first-alarma" type="button">
          <i class="fa-solid fa-plus"></i> Agregar alarma
        </button>
      </div>
    `;
  }

  return `
    <div class="${tw.tablePanel}">
      <table class="${tw.table}">
        <thead>
          <tr>
            <th class="${tw.th}">Fecha y hora</th>
            <th class="${tw.th}">Descripción</th>
            <th class="${tw.th}">Estado</th>
            <th class="${tw.th}">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${pending.map(renderRow).join('')}
          ${fired.map(renderRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAlarmas(container) {
  showLoader(container, 'Cargando alarmas...');

  let alarmas = [];
  try {
    alarmas = await api.getAlarmas();
  } catch (err) {
    container.innerHTML = `<div class="${tw.empty}"><p>${escapeHtml(err.message)}</p></div>`;
    return;
  }

  container.innerHTML = renderAlarmasTable(alarmas);

  document.getElementById('btn-first-alarma')?.addEventListener('click', openNewAlarmaModal);
  bindTableEvents(container, () => window.__reloadAlarmas?.());
}
