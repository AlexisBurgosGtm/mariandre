import { api } from './api.js';
import { NAV_ITEMS, navIconClass, hashForRoute } from './nav-items.js';
import { renderHome } from './pages/home.js';
import { renderConexiones, openNewConexionModal, cleanupConexionesPage } from './pages/conexiones.js';
import { renderMantenimiento, openNewComandoModal } from './pages/mantenimiento.js';
import { renderWhatsapp, cleanupWhatsappPage } from './pages/whatsapp.js';
import { renderServiciosOnline, openNewServicioModal, cleanupServiciosOnlinePage } from './pages/servicios-online.js';
import { renderRenderApps, openNewRenderCuentaModal } from './pages/render-apps.js';
import { renderSoporteClientes, openNewSoporteModal, exportSoporteExcel } from './pages/soporte-clientes.js';
import { renderUpdater, openNewUpdaterModal } from './pages/updater.js';
import { renderTokens, openNewTokenModal, openNewCommunityModal } from './pages/tokens.js';
import { renderConfiguraciones } from './pages/configuraciones.js';
import { initVoz } from './services/voz.js';
import { renderAlarmas, openNewAlarmaModal } from './pages/alarmas.js';
import { renderGeneradorLicencias } from './pages/generador-licencias.js';
import { renderGeneradorLicenciasFserp } from './pages/generador-licencias-fserp.js';
import { renderMercadosEfectivos } from './pages/mercados-efectivos.js';
import { renderNotas } from './pages/notas.js';
import { initWhatsAppListener } from './services/whatsapp.js';
import { initAlarmas } from './services/alarmas.js';
import { initTts } from './tts.js';
import { renderLoader } from './utils.js';
import { tw, cx } from './ui.js';

const renders = {
  '/': renderHome,
  '/generador-licencias': renderGeneradorLicencias,
  '/licencias-fserp': renderGeneradorLicenciasFserp,
  '/conexiones': renderConexiones,
  '/servicios-online': renderServiciosOnline,
  '/render-apps': renderRenderApps,
  '/mercados-efectivos': renderMercadosEfectivos,
  '/soporte-clientes': renderSoporteClientes,
  '/updater': renderUpdater,
  '/tokens': renderTokens,
  '/mantenimiento': renderMantenimiento,
  '/alarmas': renderAlarmas,
  '/whatsapp': renderWhatsapp,
  '/configuraciones': renderConfiguraciones,
  '/notas': renderNotas,
};

const routes = Object.fromEntries(
  NAV_ITEMS.map((item) => [
    item.path,
    { title: item.title, icon: item.icon, render: renders[item.path] },
  ])
);

/** Rutas abiertas como pestañas (única instancia por vista). */
const openTabs = [];
let activeTabPath = '/';
/** Compatibilidad con recargas globales. */
let currentRoute = '/';

const tabRenderGeneration = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const path = hash.startsWith('/') ? hash : `/${hash}`;
  return routes[path] ? path : '/';
}

function getTabPanel(path) {
  return document.querySelector(`.ma-tab-panel[data-path="${CSS.escape(path)}"]`);
}

function setSidebarOpen(open) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const fab = document.getElementById('btn-open-sidebar');
  if (!sidebar || !backdrop) return;

  if (open) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    sidebar.setAttribute('aria-hidden', 'false');
    backdrop.classList.remove('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
    fab?.classList.add('is-hidden');
    fab?.setAttribute('aria-expanded', 'true');
  } else {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    sidebar.setAttribute('aria-hidden', 'true');
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    fab?.classList.remove('is-hidden');
    fab?.setAttribute('aria-expanded', 'false');
  }

  document.body.classList.toggle('overflow-hidden', open);
}

function closeSidebar() {
  setSidebarOpen(false);
}

function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;

  nav.innerHTML = Object.entries(routes).map(([path, route]) => {
    const isOpen = openTabs.includes(path);
    const isActive = activeTabPath === path;
    return `
    <a
      class="${cx(tw.navLink, isActive && tw.navLinkActive, isOpen && !isActive && 'opacity-80')}"
      data-route="${path}"
      href="${hashForRoute(path)}"
      title="${route.title}"
    >
      <i class="${navIconClass(route.icon)} w-5 text-center"></i>
      <span class="min-w-0 truncate">${route.title}</span>
      ${isOpen ? '<span class="ma-nav-open-dot" aria-hidden="true"></span>' : ''}
    </a>`;
  }).join('');

  nav.querySelectorAll('[data-route]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      openTab(link.dataset.route);
    });
  });
}

function renderTabBar() {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;

  if (!openTabs.length) {
    bar.innerHTML = '';
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML = openTabs.map((path) => {
    const route = routes[path];
    if (!route) return '';
    const isActive = activeTabPath === path;
    const title = route.title;
    return `
      <div
        class="${cx(tw.tab, isActive && tw.tabActive, isActive && 'ma-tab-active')}"
        data-tab-path="${path}"
        role="tab"
        aria-selected="${isActive}"
        title="${title}"
      >
        <button type="button" class="ma-tab-select" data-tab-select="${path}" aria-label="${title}">
          <i class="${navIconClass(route.icon)} ma-tab-icon" aria-hidden="true"></i>
          <span class="ma-tab-label">${title}</span>
        </button>
        <button
          type="button"
          class="ma-tab-close"
          data-tab-close="${path}"
          aria-label="Cerrar ${title}"
          title="Cerrar"
        >
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>`;
  }).join('');

  bar.querySelectorAll('[data-tab-select]').forEach((btn) => {
    btn.addEventListener('click', () => switchToTab(btn.dataset.tabSelect));
  });

  bar.querySelectorAll('[data-tab-close]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(btn.dataset.tabClose);
    });
  });
}

function actionBtn(id, label, icon = 'fa-plus', variant = 'primary') {
  let cls;
  if (variant === 'ghost') cls = 'ma-btn-header-ghost inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition sm:px-4 sm:py-2 sm:text-sm';
  else cls = 'ma-btn-header-primary inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition sm:px-4 sm:py-2 sm:text-sm';
  return `<button class="${cls}" id="${id}" type="button"><i class="fa-solid ${icon}"></i> <span class="hidden sm:inline">${label}</span></button>`;
}

function renderTopbarActions(routePath = activeTabPath) {
  const actions = document.getElementById('topbar-actions');
  if (!actions) return;
  let extra = '';

  if (routePath === '/conexiones') extra = actionBtn('btn-add-conexion', 'Nueva conexión');
  else if (routePath === '/servicios-online') extra = actionBtn('btn-add-servicio', 'Nuevo servicio');
  else if (routePath === '/render-apps') {
    extra = actionBtn('btn-add-render-cuenta', 'Nueva cuenta');
  } else if (routePath === '/soporte-clientes') {
    extra = `${actionBtn('btn-export-soporte', 'Exportar Excel', 'fa-file-excel', 'ghost')} ${actionBtn('btn-add-soporte', 'Nuevo registro')}`;
  } else if (routePath === '/updater') extra = actionBtn('btn-add-updater', 'Nueva query');
  else if (routePath === '/tokens') {
    extra = `${actionBtn('btn-add-token', 'Nuevo token')} ${actionBtn('btn-add-community-top', 'Nueva empresa', 'fa-building', 'ghost')}`;
  } else if (routePath === '/mantenimiento') extra = actionBtn('btn-add-comando', 'Nuevo comando');
  else if (routePath === '/alarmas') extra = actionBtn('btn-add-alarma', 'Nueva alarma');

  actions.innerHTML = extra;

  if (routePath === '/conexiones') document.getElementById('btn-add-conexion')?.addEventListener('click', openNewConexionModal);
  else if (routePath === '/servicios-online') document.getElementById('btn-add-servicio')?.addEventListener('click', openNewServicioModal);
  else if (routePath === '/render-apps') {
    document.getElementById('btn-add-render-cuenta')?.addEventListener('click', openNewRenderCuentaModal);
  } else if (routePath === '/soporte-clientes') {
    document.getElementById('btn-export-soporte')?.addEventListener('click', exportSoporteExcel);
    document.getElementById('btn-add-soporte')?.addEventListener('click', openNewSoporteModal);
  } else if (routePath === '/updater') document.getElementById('btn-add-updater')?.addEventListener('click', openNewUpdaterModal);
  else if (routePath === '/tokens') {
    document.getElementById('btn-add-token')?.addEventListener('click', openNewTokenModal);
    document.getElementById('btn-add-community-top')?.addEventListener('click', openNewCommunityModal);
  } else if (routePath === '/mantenimiento') document.getElementById('btn-add-comando')?.addEventListener('click', openNewComandoModal);
  else if (routePath === '/alarmas') document.getElementById('btn-add-alarma')?.addEventListener('click', openNewAlarmaModal);
}

function cleanupPage(path) {
  if (path === '/whatsapp') cleanupWhatsappPage();
  if (path === '/conexiones') cleanupConexionesPage();
  if (path === '/servicios-online') cleanupServiciosOnlinePage();
  if (path === '/tokens') window.__tokensContainer = null;
  if (path === '/render-apps') window.__renderAppsContainer = null;
  tabRenderGeneration.delete(path);
}

function showTabPanels() {
  document.querySelectorAll('.ma-tab-panel').forEach((panel) => {
    const isActive = panel.dataset.path === activeTabPath;
    panel.classList.toggle('hidden', !isActive);
    panel.classList.toggle('ma-tab-panel-active', isActive);
  });
}

function switchToTab(path) {
  if (!routes[path] || !openTabs.includes(path)) return;

  activeTabPath = path;
  currentRoute = path;
  showTabPanels();
  renderTabBar();
  renderNav();
  renderTopbarActions(path);
}

function updateHash(path) {
  const nextHash = hashForRoute(path);
  if (window.location.hash !== nextHash) {
    window.location.hash = path === '/' ? '/' : path;
  }
}

async function mountTab(path) {
  const route = routes[path];
  if (!route) return;

  const panelsRoot = document.getElementById('tab-panels');
  if (!panelsRoot) return;

  const panel = document.createElement('section');
  panel.className = 'ma-tab-panel hidden min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-3 sm:p-5';
  panel.dataset.path = path;
  panelsRoot.appendChild(panel);

  const generation = (tabRenderGeneration.get(path) || 0) + 1;
  tabRenderGeneration.set(path, generation);

  panel.innerHTML = renderLoader('Cargando datos...');

  try {
    await route.render(panel);
  } catch (err) {
    if (tabRenderGeneration.get(path) !== generation) return;
    panel.innerHTML = `<div class="${tw.empty}"><p>${err.message}</p></div>`;
  }
}

function openTab(path) {
  const target = routes[path] ? path : '/';

  if (!openTabs.includes(target)) {
    openTabs.push(target);
    mountTab(target);
  }

  switchToTab(target);
  updateHash(target);
}

function closeTab(path) {
  const idx = openTabs.indexOf(path);
  if (idx === -1) return;

  cleanupPage(path);

  const panel = getTabPanel(path);
  panel?.remove();

  openTabs.splice(idx, 1);

  if (!openTabs.length) {
    openTab('/');
    return;
  }

  if (activeTabPath === path) {
    const next = openTabs[idx] ?? openTabs[idx - 1] ?? openTabs[0];
    switchToTab(next);
    updateHash(next);
  } else {
    renderTabBar();
    renderNav();
  }
}

async function reloadCurrentPage() {
  const path = activeTabPath;
  if (!routes[path]) return;

  if (path === '/tokens' && window.__reloadTokensPage) {
    await window.__reloadTokensPage();
    return;
  }
  if (path === '/render-apps' && window.__reloadRenderAppsPage) {
    await window.__reloadRenderAppsPage();
    return;
  }

  const panel = getTabPanel(path);
  if (!panel) return;

  cleanupPage(path);
  const generation = (tabRenderGeneration.get(path) || 0) + 1;
  tabRenderGeneration.set(path, generation);

  panel.innerHTML = renderLoader('Cargando datos...');

  try {
    await routes[path].render(panel);
  } catch (err) {
    if (tabRenderGeneration.get(path) !== generation) return;
    panel.innerHTML = `<div class="${tw.empty}"><p>${err.message}</p></div>`;
  }
}

function navigate(path) {
  openTab(path);
}

async function checkServerStatus() {
  const statusEl = document.getElementById('server-status');
  const dot = document.getElementById('status-dot');
  if (!statusEl || !dot) return;
  try {
    const status = await api.getStatus();
    statusEl.textContent = `Servidor :${status.puerto}`;
    dot.className = 'h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50';
  } catch {
    statusEl.textContent = 'Servidor offline';
    dot.className = 'h-2 w-2 shrink-0 rounded-full bg-amber-400';
  }
}

window.__maNavigate = openTab;
window.__reloadConexiones = async () => {
  if (activeTabPath === '/conexiones') await reloadCurrentPage();
};
window.__reloadServiciosOnline = async () => {
  if (activeTabPath === '/servicios-online') await reloadCurrentPage();
};
window.__reloadMantenimiento = async () => {
  if (activeTabPath === '/mantenimiento') await reloadCurrentPage();
};
window.__reloadSoporte = async () => {
  if (activeTabPath === '/soporte-clientes') await reloadCurrentPage();
};
window.__reloadUpdater = async () => {
  if (activeTabPath === '/updater') await reloadCurrentPage();
};
window.__reloadTokens = async () => {
  if (activeTabPath === '/tokens') await reloadCurrentPage();
};
window.__reloadRenderApps = async () => {
  if (activeTabPath === '/render-apps') await reloadCurrentPage();
};
window.__reloadAlarmas = async () => {
  if (activeTabPath === '/alarmas') await reloadCurrentPage();
};

window.addEventListener('hashchange', () => {
  const path = getRoute();
  if (openTabs.includes(path)) {
    switchToTab(path);
    return;
  }
  openTab(path);
});

document.getElementById('btn-open-sidebar')?.addEventListener('click', () => setSidebarOpen(true));
document.getElementById('btn-close-sidebar')?.addEventListener('click', closeSidebar);
document.getElementById('sidebar-backdrop')?.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSidebar();
});

document.documentElement.removeAttribute('data-theme');

const initialPath = getRoute();
openTab(initialPath);

checkServerStatus();
setInterval(checkServerStatus, 30000);
initTts();
initWhatsAppListener();
initAlarmas();
initVoz();
