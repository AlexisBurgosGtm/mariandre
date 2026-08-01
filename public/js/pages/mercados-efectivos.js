import { tw } from '../ui.js';

export async function renderMercadosEfectivos(container) {
  container.innerHTML = `
    <div class="${tw.empty}">
      <i class="fa-solid fa-store text-3xl text-slate-300"></i>
      <h3 class="text-lg font-semibold text-slate-800">MERCADOS EFECTIVOS</h3>
      <p class="text-sm text-slate-500">Sección pendiente de implementar.</p>
      <p class="text-xs text-slate-400">Configura la conexión en Configuraciones → Mercados Efectivos Ventas.</p>
    </div>
  `;
}
