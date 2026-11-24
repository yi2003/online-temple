import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSplashOpen, trapSplashFocus } from '../src/ui/splashFocus.ts';

class FakeElement {
  id = '';
  tagName: string;
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  attrs = new Map<string, string>();
  classes = new Set<string>();
  inert = false;
  doc: FakeDocument;

  constructor(doc: FakeDocument, tag: string, id = '') {
    this.doc = doc;
    this.tagName = tag.toUpperCase();
    this.id = id;
  }

  get classList() {
    return {
      add: (...cs: string[]) => cs.forEach((c) => this.classes.add(c)),
      remove: (...cs: string[]) => cs.forEach((c) => this.classes.delete(c)),
      contains: (c: string) => this.classes.has(c),
    };
  }

  get disabled(): boolean {
    return this.attrs.has('disabled');
  }

  set disabled(v: boolean) {
    if (v) this.attrs.set('disabled', '');
    else this.attrs.delete('disabled');
  }

  append(...nodes: FakeElement[]) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
    if (name === 'inert') this.inert = true;
  }

  removeAttribute(name: string) {
    this.attrs.delete(name);
    if (name === 'inert') this.inert = false;
  }

  hasAttribute(name: string) {
    return this.attrs.has(name);
  }

  contains(node: FakeElement | null): boolean {
    let cur: FakeElement | null = node;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parent;
    }
    return false;
  }

  closest(selector: string): FakeElement | null {
    const parts = selector.split(',').map((s) => s.trim());
    let cur: FakeElement | null = this;
    while (cur) {
      for (const p of parts) {
        if (p === '[hidden]' && cur.hasAttribute('hidden')) return cur;
        if (p === '[inert]' && (cur.inert || cur.hasAttribute('inert'))) return cur;
      }
      cur = cur.parent;
    }
    return null;
  }

  querySelectorAll(_selector: string): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (node: FakeElement) => {
      for (const child of node.children) {
        const tab = child.attrs.get('tabindex');
        const focusable =
          (child.tagName === 'BUTTON' && !child.disabled) ||
          (child.tagName === 'A' && child.hasAttribute('href')) ||
          (tab !== undefined && tab !== '-1');
        if (focusable) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  focus() {
    this.doc.activeElement = this;
    this.doc.dispatch('focusin', { target: this });
  }

  blur() {
    if (this.doc.activeElement === this) this.doc.activeElement = this.doc.body;
  }
}

class FakeDocument {
  body: FakeElement;
  activeElement: FakeElement | null;
  private listeners = new Map<string, Set<(e: unknown) => void>>();

  constructor() {
    this.body = new FakeElement(this, 'body');
    this.activeElement = this.body;
  }

  getElementById(id: string): FakeElement | null {
    const walk = (node: FakeElement): FakeElement | null => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(this.body);
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners.get(type)?.delete(fn);
  }

  dispatch(type: string, event: Record<string, unknown>) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
}

function makeFixture() {
  const doc = new FakeDocument();
  const hud = new FakeElement(doc, 'div', 'hud');
  const monkBtn = new FakeElement(doc, 'button', 'me');
  hud.append(monkBtn);

  const sheet = new FakeElement(doc, 'div', 'sheet');
  sheet.setAttribute('hidden', '');

  const splash = new FakeElement(doc, 'div', 'splash');
  splash.setAttribute('tabindex', '-1');
  const enter = new FakeElement(doc, 'button', 'enter');
  enter.disabled = true;
  splash.append(enter);

  doc.body.append(hud, sheet, splash);
  return { doc, hud, monkBtn, sheet, splash, enter };
}

function tabEvent(shiftKey = false) {
  let prevented = false;
  return {
    key: 'Tab',
    shiftKey,
    preventDefault() {
      prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  };
}

test('entry button gets initial focus once enabled and Tab stays inside splash', () => {
  const { doc, hud, sheet, splash, enter } = makeFixture();
  const ctl = trapSplashFocus(
    splash as unknown as HTMLElement,
    [hud, sheet] as unknown as HTMLElement[],
    doc as unknown as Document,
  );

  assert.equal(hud.inert, true);
  assert.equal(sheet.inert, true);
  assert.equal(isSplashOpen(doc as unknown as Document), true);

  // While loading (#enter disabled), Tab cannot escape to #hud
  const loadingTab = tabEvent();
  doc.dispatch('keydown', loadingTab);
  assert.equal(loadingTab.defaultPrevented, true);
  assert.equal(doc.activeElement, splash);

  // Once enabled, focusEntry() focuses #enter first
  enter.disabled = false;
  ctl.focusEntry();
  assert.equal(doc.activeElement, enter);

  // Pressing Tab or Shift+Tab keeps focus on #enter inside #splash
  const fwd = tabEvent(false);
  doc.dispatch('keydown', fwd);
  assert.equal(fwd.defaultPrevented, true);
  assert.equal(doc.activeElement, enter);

  const rev = tabEvent(true);
  doc.dispatch('keydown', rev);
  assert.equal(rev.defaultPrevented, true);
  assert.equal(doc.activeElement, enter);

  // Even if focus leaves to body, Tab focuses #enter first
  doc.activeElement = doc.body;
  const fromBody = tabEvent(false);
  doc.dispatch('keydown', fromBody);
  assert.equal(fromBody.defaultPrevented, true);
  assert.equal(doc.activeElement, enter);
});

test('focusin outside splash redirects back to entry button while open', () => {
  const { doc, hud, monkBtn, sheet, splash, enter } = makeFixture();
  const ctl = trapSplashFocus(
    splash as unknown as HTMLElement,
    [hud, sheet] as unknown as HTMLElement[],
    doc as unknown as Document,
  );
  enter.disabled = false;
  ctl.focusEntry();

  monkBtn.focus();
  assert.equal(doc.activeElement, enter);
});

test('multi-control splash wraps Tab cleanly between first and last focusable', () => {
  const { doc, hud, sheet, splash, enter } = makeFixture();
  const second = new FakeElement(doc, 'button', 'extra');
  splash.append(second);
  enter.disabled = false;

  const ctl = trapSplashFocus(
    splash as unknown as HTMLElement,
    [hud, sheet] as unknown as HTMLElement[],
    doc as unknown as Document,
  );
  ctl.focusEntry();
  assert.equal(doc.activeElement, enter);

  // Forward Tab from first moves naturally (not prevented)
  const midTab = tabEvent(false);
  doc.dispatch('keydown', midTab);
  assert.equal(midTab.defaultPrevented, false);

  // Forward Tab from last wraps to first
  second.focus();
  const wrapFwd = tabEvent(false);
  doc.dispatch('keydown', wrapFwd);
  assert.equal(wrapFwd.defaultPrevented, true);
  assert.equal(doc.activeElement, enter);

  // Shift+Tab from first wraps to last
  const wrapRev = tabEvent(true);
  doc.dispatch('keydown', wrapRev);
  assert.equal(wrapRev.defaultPrevented, true);
  assert.equal(doc.activeElement, second);
});

test('release restores background inert state and disables focus trap', () => {
  const { doc, hud, monkBtn, sheet, splash, enter } = makeFixture();
  const ctl = trapSplashFocus(
    splash as unknown as HTMLElement,
    [hud, sheet] as unknown as HTMLElement[],
    doc as unknown as Document,
  );
  enter.disabled = false;
  ctl.focusEntry();

  ctl.release();
  assert.equal(hud.inert, false);
  assert.equal(sheet.inert, false);
  assert.equal(splash.inert, true);
  assert.equal(splash.hasAttribute('aria-hidden'), true);
  assert.equal(isSplashOpen(doc as unknown as Document), false);
  assert.equal(doc.activeElement, doc.body);

  // Tab and focusin on HUD now work freely
  monkBtn.focus();
  assert.equal(doc.activeElement, monkBtn);
  const afterTab = tabEvent(false);
  doc.dispatch('keydown', afterTab);
  assert.equal(afterTab.defaultPrevented, false);
});
