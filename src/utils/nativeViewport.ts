const TEXT_FIELD = 'textarea, input:not([type]), input:is([type="text"], [type="email"], [type="password"], [type="search"], [type="tel"], [type="url"], [type="number"])';
const SCROLL_AREA = '.app-public-viewport, .app-content, .app-modal-scroll';
const KEYBOARD_MIN_HEIGHT = 80;

export function trackNativeViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let fullHeight = 0;
  let lastWidth = 0;
  let keyboardOpen = false;
  let pendingFrame: number | undefined;

  function update() {
    pendingFrame = undefined;
    const height = viewport?.height ?? window.innerHeight;
    const top = viewport?.offsetTop ?? 0;
    const width = window.innerWidth;
    const active = document.activeElement;
    const field = active instanceof HTMLElement && active.matches(TEXT_FIELD) &&
      !active.matches('[readonly], [disabled], [inputmode="none"]') ? active : null;

    // Android can resize both viewports, so keep the height from before the keyboard opened.
    if (width !== lastWidth) fullHeight = window.innerHeight;
    lastWidth = width;
    fullHeight = Math.max(fullHeight, window.innerHeight, height);
    keyboardOpen = Boolean(field || keyboardOpen) && fullHeight - height >= KEYBOARD_MIN_HEIGHT;
    if (!field && !keyboardOpen) fullHeight = height;

    root.style.setProperty('--app-viewport-height', `${height}px`);
    root.style.setProperty('--app-viewport-top', `${top}px`);
    root.toggleAttribute('data-app-keyboard', keyboardOpen);

    if (keyboardOpen && field) {
      const scrollArea = field.closest<HTMLElement>(SCROLL_AREA);
      if (!scrollArea) return;
      const area = scrollArea.getBoundingClientRect();
      const input = field.getBoundingClientRect();
      const margin = 12;
      if (input.bottom > area.bottom - margin) {
        scrollArea.scrollTop += input.bottom - area.bottom + margin;
      } else if (input.top < area.top + margin) {
        scrollArea.scrollTop -= area.top + margin - input.top;
      }
    }
  }

  function scheduleUpdate() {
    pendingFrame ??= window.requestAnimationFrame(update);
  }

  update();
  window.addEventListener('resize', scheduleUpdate);
  viewport?.addEventListener('resize', scheduleUpdate);
  viewport?.addEventListener('scroll', scheduleUpdate);
  document.addEventListener('focusin', scheduleUpdate);
  document.addEventListener('focusout', scheduleUpdate);
}
