// Focus management for the welcome splash overlay: marks background UI inert,
// gives the entry button initial focus once enabled, and keeps Tab inside.

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function isSplashOpen(doc: Document = document): boolean {
  const splash = doc.getElementById('splash');
  return !!splash && !splash.classList.contains('gone') && !splash.inert && !splash.hasAttribute('inert');
}

export function getFocusable(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('disabled') && !el.closest('[hidden], [inert]'),
  );
}

export interface SplashFocusController {
  focusEntry(): void;
  release(): void;
}

export function trapSplashFocus(
  splash: HTMLElement,
  background: Iterable<HTMLElement>,
  doc: Document = document,
): SplashFocusController {
  const bg = [...background];
  let active = true;

  const setInert = (el: HTMLElement, value: boolean) => {
    el.inert = value;
    if (value) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  };

  for (const el of bg) setInert(el, true);
  setInert(splash, false);

  const focusFirst = (fallbackToSplash: boolean) => {
    const items = getFocusable(splash);
    const target = items[0] ?? (fallbackToSplash ? splash : null);
    target?.focus();
    return target;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!active || e.key !== 'Tab') return;
    const items = getFocusable(splash);
    if (items.length === 0) {
      e.preventDefault();
      splash.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const cur = doc.activeElement as HTMLElement | null;
    if (!cur || !splash.contains(cur) || cur === splash) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey && cur === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && cur === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onFocusIn = (e: FocusEvent) => {
    if (!active) return;
    const target = e.target as Node | null;
    if (target && splash.contains(target)) return;
    focusFirst(true);
  };

  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('focusin', onFocusIn, true);

  return {
    focusEntry() {
      if (!active) return;
      focusFirst(false);
    },
    release() {
      if (!active) return;
      active = false;
      doc.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('focusin', onFocusIn, true);
      for (const el of bg) setInert(el, false);
      setInert(splash, true);
      splash.setAttribute('aria-hidden', 'true');
      const cur = doc.activeElement as HTMLElement | null;
      if (cur && splash.contains(cur)) cur.blur();
    },
  };
}
