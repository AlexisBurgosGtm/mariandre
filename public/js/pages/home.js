export async function renderHome(container) {
  container.innerHTML = `
    <div class="flex h-[calc(100dvh-7.5rem)] min-h-0 items-center justify-center sm:h-[calc(100dvh-8rem)]">
      <img
        src="/logo.png"
        alt="MariAndre"
        class="home-logo h-[21rem] w-[21rem] rounded-[5.25rem] object-contain sm:h-[24rem] sm:w-[24rem]"
      >
    </div>
  `;
}
