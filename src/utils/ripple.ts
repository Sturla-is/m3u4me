/**
 * Lightweight Material-style ripple. `.md-btn` (already applied to every clickable surface
 * across the app) gets a hover/press state-layer purely from CSS; this adds the classic
 * expanding-circle ripple that starts at the pointer position. It's a single document-level
 * listener rather than a component so nothing has to opt in — any element with `.md-btn`
 * gets it automatically, including ones added later.
 */
export function initRipples() {
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>('.md-btn');
    if (!target || target.hasAttribute('disabled')) return;

    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.7;
    const ripple = document.createElement('span');
    ripple.className = 'md-ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  };

  document.addEventListener('pointerdown', onPointerDown);
  return () => document.removeEventListener('pointerdown', onPointerDown);
}
