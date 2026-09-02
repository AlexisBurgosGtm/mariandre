export const NAV_ITEMS = [
  { path: '/', title: 'Inicio', icon: 'fa-house' },
  { path: '/generador-licencias', title: 'Licencias OnneB', icon: 'fa-certificate' },
  { path: '/licencias-fserp', title: 'Licencias FS ERP', icon: 'fa-stamp' },
  { path: '/conexiones', title: 'Conexiones', icon: 'fa-plug' },
  { path: '/servicios-online', title: 'Servicios Online', icon: 'fa-globe' },
  { path: '/render-apps', title: 'Render Apps', icon: 'fa-cloud' },
  { path: '/mercados-efectivos', title: 'MERCADOS EFECTIVOS', icon: 'fa-store' },
  { path: '/soporte-clientes', title: 'Soporte Clientes', icon: 'fa-headset' },
  { path: '/updater', title: 'Updater', icon: 'fa-database' },
  { path: '/tokens', title: 'Tokens', icon: 'fa-key' },
  { path: '/mantenimiento', title: 'Mantenimiento DB', icon: 'fa-screwdriver-wrench' },
  { path: '/alarmas', title: 'Alarmas', icon: 'fa-bell' },
  { path: '/whatsapp', title: 'Whatsapp', icon: 'fa-brands fa-whatsapp' },
  { path: '/configuraciones', title: 'Configuraciones', icon: 'fa-gear' },
  { path: '/notas', title: 'Notas', icon: 'fa-sticky-note' },
];

export function navIconClass(icon) {
  return String(icon || '').includes('fa-brands') ? icon : `fa-solid ${icon}`;
}

export function hashForRoute(path) {
  return path === '/' ? '#/' : `#${path}`;
}
