import { tw, cx } from './ui.js';

const THEME_KEY = 'mariandre-theme';

const THEME_PREVIEW = {
  default: 'bg-gradient-to-br from-slate-100 via-white to-blue-100',
  black: 'bg-black',
  white: 'bg-white border border-slate-200',
  purple: 'bg-gradient-to-br from-purple-900 to-violet-600',
  'white-purple': 'bg-gradient-to-br from-white to-purple-200',
  'white-sky': 'bg-gradient-to-br from-white to-sky-200',
  carbon: 'bg-gradient-to-br from-zinc-800 to-zinc-600',
  construccion: 'bg-gradient-to-br from-amber-400 via-white to-zinc-900',
};

const themeCardBase =
  'flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/40';
const themeCardActive = 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/30';

export const THEMES = [
  { id: 'default', label: 'Claro', icon: 'fa-sun', desc: 'Fondos claros y texto oscuro' },
  { id: 'black', label: 'Negro', icon: 'fa-circle', desc: 'Negro puro' },
  { id: 'white', label: 'Blanco', icon: 'fa-sun', desc: 'Claro neutro' },
  { id: 'purple', label: 'Morado', icon: 'fa-wand-magic-sparkles', desc: 'Oscuro morado' },
  { id: 'white-purple', label: 'Blanco · Morado', icon: 'fa-palette', desc: 'Claro con acentos morados' },
  { id: 'white-sky', label: 'Blanco · Celeste', icon: 'fa-cloud', desc: 'Claro con acentos celestes' },
  { id: 'carbon', label: 'Carbon', icon: 'fa-layer-group', desc: 'Estilo IBM Carbon' },
  { id: 'construccion', label: 'Construcción', icon: 'fa-helmet-safety', desc: 'Mostaza, blanco y negro' },
];

export function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return THEMES.some((t) => t.id === stored) ? stored : 'default';
}

export function applyTheme(themeId) {
  const id = THEMES.some((t) => t.id === themeId) ? themeId : 'default';
  document.documentElement.dataset.theme = id === 'default' ? '' : id;
  if (id === 'default') {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem(THEME_KEY, id);
  return id;
}

export function initTheme() {
  applyTheme(getStoredTheme());
}

function themeCardClass(active) {
  return cx(themeCardBase, active && themeCardActive);
}

export function renderThemeSelector(activeId = getStoredTheme()) {
  return `
    <div class="${cx(tw.panel, 'space-y-3')}">
      <h3 class="flex items-center gap-2 text-base font-semibold text-slate-800"><i class="fa-solid fa-palette"></i> Tema de la aplicación</h3>
      <p class="text-sm text-slate-500">Elige un estilo visual. La preferencia se guarda automáticamente.</p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        ${THEMES.map((theme) => `
          <button type="button" class="${themeCardClass(activeId === theme.id)}" data-theme="${theme.id}">
            <span class="${cx('block h-12 w-full rounded-xl', THEME_PREVIEW[theme.id] || 'bg-slate-100')}"></span>
            <span class="text-sm font-medium text-slate-800"><i class="fa-solid ${theme.icon}"></i> ${theme.label}</span>
            <span class="text-xs text-slate-500">${theme.desc}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

export function bindThemeSelector(container, onChange) {
  container.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = applyTheme(btn.dataset.theme);
      container.querySelectorAll('[data-theme]').forEach((el) => {
        el.className = themeCardClass(el.dataset.theme === id);
      });
      if (onChange) onChange(id);
    });
  });
}
