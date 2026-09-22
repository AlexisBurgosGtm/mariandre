import { NAV_ITEMS, navIconClass } from '../nav-items.js';
import { api } from '../api.js';
import { showToast } from '../utils.js';

let homeImageVersion = Date.now();

function getHomeImageSrc() {
  return `/inicio.png?v=${homeImageVersion}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function renderNavButtons(items) {
  return items.map((item) => `
    <button
      type="button"
      data-route="${item.path}"
      title="${item.title}"
      class="home-nav-card"
    >
      <span class="home-nav-card-icon">
        <i class="${navIconClass(item.icon)}" aria-hidden="true"></i>
      </span>
      <span class="home-nav-card-label">${item.title}</span>
    </button>
  `).join('');
}

function bindRouteButtons(container) {
  container.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.__maNavigate?.(btn.dataset.route);
    });
  });
}

function refreshHomeImage(container) {
  const src = getHomeImageSrc();
  container.querySelector('.home-page-bg')?.style.setProperty('background-image', `url('${src}')`);
  container.querySelector('.home-hero-img')?.setAttribute('src', src);
}

function bindHomeImageUpload(container) {
  const input = container.querySelector('#home-image-input');
  const triggers = container.querySelectorAll('[data-home-image-change]');

  triggers.forEach((btn) => {
    btn.addEventListener('click', () => input?.click());
  });

  input?.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      showToast('Solo PNG, JPG o WebP', 'error');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('La imagen no puede superar 5 MB', 'error');
      input.value = '';
      return;
    }

    triggers.forEach((btn) => { btn.disabled = true; });

    try {
      const image = await readFileAsDataUrl(file);
      await api.uploadHomeImage(image);
      homeImageVersion = Date.now();
      refreshHomeImage(container);
      showToast('Imagen de inicio actualizada', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      input.value = '';
      triggers.forEach((btn) => { btn.disabled = false; });
    }
  });
}

export async function renderHome(container) {
  const items = NAV_ITEMS.filter((item) => item.path !== '/');
  const imgSrc = getHomeImageSrc();

  container.innerHTML = `
    <div class="home-page">
      <div class="home-page-bg" style="background-image:url('${imgSrc}')" aria-hidden="true"></div>
      <div class="home-page-overlay" aria-hidden="true"></div>

      <div class="home-page-body">
        <div class="home-nav-grid">
          ${renderNavButtons(items)}
        </div>

        <aside class="home-hero-aside">
          <div class="home-hero-frame">
            <img
              src="${imgSrc}"
              alt="MariAndre"
              class="home-hero-img"
            >
          </div>
          <button
            type="button"
            class="home-image-change-btn"
            data-home-image-change
          >
            <i class="fa-solid fa-image" aria-hidden="true"></i>
            Cambiar imagen
          </button>
        </aside>
      </div>

      <button
        type="button"
        class="home-image-change-btn home-image-change-btn--mobile"
        data-home-image-change
      >
        <i class="fa-solid fa-image" aria-hidden="true"></i>
        Cambiar imagen
      </button>

      <input
        type="file"
        id="home-image-input"
        accept="image/png,image/jpeg,image/webp"
        hidden
      >
    </div>
  `;

  bindRouteButtons(container);
  bindHomeImageUpload(container);
}
