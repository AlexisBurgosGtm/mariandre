import { NAV_ITEMS, navIconClass } from '../nav-items.js';

export async function renderHome(container) {
  const items = NAV_ITEMS.filter((item) => item.path !== '/');

  container.innerHTML = `
    <div class="flex h-[calc(100dvh-4.5rem)] min-h-0 w-full max-w-full items-stretch gap-2 overflow-hidden sm:h-[calc(100dvh-5rem)] sm:gap-4">
      <div class="grid min-h-0 min-w-0 flex-1 grid-cols-2 content-stretch gap-1.5 sm:gap-2">
        ${items.map((item) => `
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
        `).join('')}
      </div>
      <div class="flex min-h-0 w-[38%] max-w-sm shrink-0 items-center justify-center sm:w-[42%] sm:max-w-md">
        <img
          src="/inicio.png"
          alt="MariAndre"
          class="home-hero h-full w-auto max-h-full max-w-full rounded-[1.15rem] object-contain object-center sm:rounded-[1.5rem]"
        >
      </div>
    </div>
  `;

  container.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.__maNavigate?.(btn.dataset.route);
    });
  });
}
