export async function renderHome(container) {
  container.innerHTML = `
    <div class="flex h-[calc(100dvh-7.5rem)] min-h-0 w-full max-w-full items-center justify-center overflow-hidden px-2 sm:h-[calc(100dvh-8rem)]">
      <img
        src="/logo.png"
        alt="MariAndre"
        class="home-logo aspect-square h-auto w-[min(21rem,calc(100vw-2.5rem))] max-w-full rounded-[clamp(2rem,12vw,5.25rem)] object-contain sm:w-[min(24rem,70vw)]"
      >
    </div>
  `;
}
