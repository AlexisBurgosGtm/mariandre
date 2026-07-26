import { api } from './api.js';
import { renderHome } from './pages/home.js';
import { renderConexiones, openNewConexionModal, cleanupConexionesPage } from './pages/conexiones.js';
import { renderMantenimiento, openNewComandoModal } from './pages/mantenimiento.js';
import { renderWhatsapp, cleanupWhatsappPage } from './pages/whatsapp.js';
import { renderServiciosOnline, openNewServicioModal, cleanupServiciosOnlinePage } from './pages/servicios-online.js';
import { renderRenderApps, openNewRenderCuentaModal, openNewRenderAppModal } from './pages/render-apps.js';
import { renderSoporteClientes, openNewSoporteModal } from './pages/soporte-clientes.js';
import { renderUpdater, openNewUpdaterModal } from './pages/updater.js';
import { renderTokens, openNewTokenModal, openNewCommunityModal } from './pages/tokens.js';
import { renderConfiguraciones } from './pages/configuraciones.js';
import { renderAlarmas, openNewAlarmaModal } from './pages/alarmas.js';
import { initWhatsAppListener } from './services/whatsapp.js';
import { initAlarmas } from './services/alarmas.js';
import { initTts } from './tts.js';
import { renderLoader } from './utils.js';
import { tw, cx } from './ui.js';

const routes = {
  '/': { title: 'Inicio', icon: 'fa-house', render: renderHome },
  '/conexiones': { title: 'Conexiones', icon: 'fa-plug', render: renderConexiones },
  '/servicios-online': { title: 'Servicios Online', icon: 'fa-globe', render: renderServiciosOnline },
  '/render-apps': { title: 'Render Apps', icon: 'fa-cloud', render: renderRenderApps },
  '/soporte-clientes': { title: 'Soporte Clientes', icon: 'fa-headset', render: renderSoporteClientes },
  '/updater': { title: 'Updater', icon: 'fa-database', render: renderUpdater },
  '/tokens': { title: 'Tokens', icon: 'fa-key', render: renderTokens },
  '/mantenimiento': { title: 'Mantenimiento DB', icon: 'fa-screwdriver-wrench', render: renderMantenimiento },
  '/alarmas': { title: 'Alarmas', icon: 'fa-bell', render: renderAlarmas },
  '/whatsapp': { title: 'Whatsapp', icon: 'fa-brands fa-whatsapp', render: renderWhatsapp },
  '/configuraciones': { title: 'Configuraciones', icon: 'fa-gear', render: renderConfiguraciones },
};

let currentRoute = '/';
let renderGeneration = 0;

const VIEW_TRANSITION_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRoute() {
  const hash = window.location.hash.slice(1) || '/';
  const path = hash.startsWith('/') ? hash : `/${hash}`;
  return routes[path] ? path : '/';
}

function hashForRoute(path) {
  return path === '/' ? '#/' : `#${path}`;
}

function setSidebarOpen(open) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar || !backdrop) return;

  if (open) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    backdrop.classList.add('hidden');
  }

  document.body.classList.toggle('overflow-hidden', open && window.matchMedia('(max-width: 1023px)').matches);
}

function closeSidebar() {
  setSidebarOpen(false);
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = Object.entries(routes).map(([path, route]) => `
    <a
      class="${cx(tw.navLink, currentRoute === path && tw.navLinkActive)}"
      data-route="${path}"
      href="${hashForRoute(path)}"
    >
      <i class="fa-solid ${route.icon} w-5 text-center"></i>
      <span>${route.title}</span>
    </a>
  `).join('');

  nav.querySelectorAll('[data-route]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
      navigate(link.dataset.route);
    });
  });
}

function actionBtn(id, label, icon = 'fa-plus', variant = 'primary') {
  const cls = variant === 'ghost' ? tw.btnGhost : tw.btnPrimary;
  return `<button class="${cls}" id="${id}" type="button"><i class="fa-solid ${icon}"></i> <span class="hidden sm:inline">${label}</span></button>`;
}

function renderTopbarActions(routePath = currentRoute) {
  const actions = document.getElementById('topbar-actions');
  let extra = '';

  if (routePath === '/conexiones') extra = actionBtn('btn-add-conexion', 'Nueva conexión');
  else if (routePath === '/servicios-online') extra = actionBtn('btn-add-servicio', 'Nuevo servicio');
  else if (routePath === '/render-apps') {
    extra = `${actionBtn('btn-add-render-cuenta', 'Nueva cuenta')} ${actionBtn('btn-add-render-app-top', 'Nueva app', 'fa-cube', 'ghost')}`;
  }
  else if (routePath === '/soporte-clientes') extra = actionBtn('btn-add-soporte', 'Nuevo registro');
  else if (routePath === '/updater') extra = actionBtn('btn-add-updater', 'Nueva query');
  else if (routePath === '/tokens') {
    extra = `${actionBtn('btn-add-token', 'Nuevo token')} ${actionBtn('btn-add-community-top', 'Nueva empresa', 'fa-building', 'ghost')}`;
  } else if (routePath === '/mantenimiento') extra = actionBtn('btn-add-comando', 'Nuevo comando');
  else if (routePath === '/alarmas') extra = actionBtn('btn-add-alarma', 'Nueva alarma');

  actions.innerHTML = extra;

  if (routePath === '/conexiones') document.getElementById('btn-add-conexion')?.addEventListener('click', openNewConexionModal);
  else if (routePath === '/servicios-online') document.getElementById('btn-add-servicio')?.addEventListener('click', openNewServicioModal);
  else if (routePath === '/render-apps') {
    document.getElementById('btn-add-render-cuenta')?.addEventListener('click', openNewRenderCuentaModal);
    document.getElementById('btn-add-render-app-top')?.addEventListener('click', openNewRenderAppModal);
  }
  else if (routePath === '/soporte-clientes') document.getElementById('btn-add-soporte')?.addEventListener('click', openNewSoporteModal);
  else if (routePath === '/updater') document.getElementById('btn-add-updater')?.addEventListener('click', openNewUpdaterModal);
  else if (routePath === '/tokens') {
    document.getElementById('btn-add-token')?.addEventListener('click', openNewTokenModal);
    document.getElementById('btn-add-community-top')?.addEventListener('click', openNewCommunityModal);
  } else if (routePath === '/mantenimiento') document.getElementById('btn-add-comando')?.addEventListener('click', openNewComandoModal);
  else if (routePath === '/alarmas') document.getElementById('btn-add-alarma')?.addEventListener('click', openNewAlarmaModal);
}

function cleanupOtherPages(routePath) {
  if (routePath !== '/whatsapp') cleanupWhatsappPage();
  if (routePath !== '/conexiones') cleanupConexionesPage();
  if (routePath !== '/servicios-online') cleanupServiciosOnlinePage();
}

async function renderPage() {
  const generation = ++renderGeneration;
  const routePath = currentRoute;
  const route = routes[routePath];
  if (!route) return;

  cleanupOtherPages(routePath);
  document.getElementById('page-title').textContent = route.title;
  renderTopbarActions(routePath);

  const content = document.getElementById('content');
  content.classList.add('opacity-0', 'transition-opacity', 'duration-150');
  await sleep(VIEW_TRANSITION_MS);
  if (generation !== renderGeneration) return;

  content.classList.remove('opacity-0');
  content.innerHTML = renderLoader('Cargando datos...');
  await sleep(0);
  if (generation !== renderGeneration) return;

  try {
    await route.render(content);
  } catch (err) {
    if (generation !== renderGeneration) return;
    content.innerHTML = `<div class="${tw.empty}"><p>${err.message}</p></div>`;
    renderTopbarActions(routePath);
    return;
  }

  if (generation !== renderGeneration) return;

  content.classList.add('opacity-0');
  await sleep(16);
  if (generation !== renderGeneration) return;
  content.classList.remove('opacity-0');
}

async function reloadCurrentPage() {
  if (!routes[currentRoute]) return;
  if (currentRoute === '/tokens' && window.__reloadTokensPage) {
    await window.__reloadTokensPage();
    return;
  }
  if (currentRoute === '/render-apps' && window.__reloadRenderAppsPage) {
    await window.__reloadRenderAppsPage();
    return;
  }
  await renderPage();
}

function navigate(path) {
  const target = routes[path] ? path : '/';
  currentRoute = target;
  const nextHash = hashForRoute(target);

  if (window.location.hash === nextHash) {
    renderNav();
    renderPage();
    return;
  }

  window.location.hash = target === '/' ? '/' : target;
}

async function checkServerStatus() {
  const statusEl = document.getElementById('server-status');
  const dot = document.getElementById('status-dot');
  try {
    const status = await api.getStatus();
    statusEl.textContent = `Servidor :${status.puerto}`;
    dot.className = 'h-2 w-2 shrink-0 rounded-full bg-green-500';
  } catch {
    statusEl.textContent = 'Servidor offline';
    dot.className = 'h-2 w-2 shrink-0 rounded-full bg-amber-400';
  }
}

window.__reloadConexiones = async () => {
  if (currentRoute === '/conexiones') await reloadCurrentPage();
};
window.__reloadServiciosOnline = async () => {
  if (currentRoute === '/servicios-online') await reloadCurrentPage();
};
window.__reloadMantenimiento = async () => {
  if (currentRoute === '/mantenimiento') await reloadCurrentPage();
};
window.__reloadSoporte = async () => {
  if (currentRoute === '/soporte-clientes') await reloadCurrentPage();
};
window.__reloadUpdater = async () => {
  if (currentRoute === '/updater') await reloadCurrentPage();
};
window.__reloadTokens = async () => {
  if (currentRoute === '/tokens') await reloadCurrentPage();
};
window.__reloadRenderApps = async () => {
  if (currentRoute === '/render-apps') await reloadCurrentPage();
};
window.__reloadAlarmas = async () => {
  if (currentRoute === '/alarmas') await reloadCurrentPage();
};

window.addEventListener('hashchange', () => {
  currentRoute = getRoute();
  renderNav();
  renderPage();
});

document.getElementById('btn-open-sidebar')?.addEventListener('click', () => setSidebarOpen(true));
document.getElementById('btn-close-sidebar')?.addEventListener('click', closeSidebar);
document.getElementById('sidebar-backdrop')?.addEventListener('click', closeSidebar);
window.addEventListener('resize', () => {
  if (window.matchMedia('(min-width: 1024px)').matches) closeSidebar();
});

document.documentElement.removeAttribute('data-theme');
currentRoute = getRoute();
renderNav();
renderPage();
checkServerStatus();
setInterval(checkServerStatus, 30000);
initTts();
initWhatsAppListener();
initAlarmas();
