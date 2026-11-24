// Talks to /api/*. Everything here is optional: if the API is missing or storage
// isn't configured, the game silently stays in guest mode with simulated monks.
import { merge, sanitize, type Progress } from './state/progress.ts';
import { nameToIndices } from './state/names.ts';
import { safeGet, safeSet, store } from './state/store.ts';
import { setClockOffset } from './state/time.ts';

const SESSION_KEY = 'temple.session';
const EMAIL_KEY = 'temple.email';

async function call<T>(op: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(`/api/${op}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

export const net = {
  online: false, // API reachable with storage configured
  email: safeGet(EMAIL_KEY),
  session: safeGet(SESSION_KEY),
  lastSync: 0,
  lastJson: '',

  async init(): Promise<void> {
    const t0 = Date.now();
    const r = await call<{ now?: number; storage?: boolean }>('time');
    if (r.ok && typeof r.data.now === 'number') {
      setClockOffset(r.data.now - (t0 + Date.now()) / 2);
      this.online = !!r.data.storage;
    }
  },

  async requestLink(email: string, lang: string): Promise<{ status: 'sent' | 'dev' | 'error'; error?: string; link?: string }> {
    const r = await call<{ sent?: boolean; devLink?: string; error?: string }>('request-link', { email, lang });
    if (r.ok && r.data.devLink) return { status: 'dev', link: r.data.devLink };
    if (r.ok && r.data.sent) return { status: 'sent' };
    return { status: 'error', error: r.data.error ?? (r.status === 0 ? 'offline' : 'server') };
  },

  /** Finish a magic-link login (token from ?login=…), then merge this device's progress. */
  async verify(token: string): Promise<boolean> {
    const r = await call<{ session?: string; email?: string }>('verify', { token });
    if (!r.ok || !r.data.session) return false;
    this.session = r.data.session;
    this.email = r.data.email ?? null;
    safeSet(SESSION_KEY, this.session);
    safeSet(EMAIL_KEY, this.email ?? '');
    await this.sync();
    return true;
  },

  logout() {
    void call('logout', { session: this.session });
    this.session = null;
    this.email = null;
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(EMAIL_KEY);
    } catch { /* ignore */ }
  },

  /**
   * Pull the account copy, merge it with this device, push the result.
   * Uses a revision number so two devices syncing at once don't overwrite each other.
   */
  async sync(): Promise<boolean> {
    if (!this.session) return false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const load = await call<{ progress?: unknown; rev?: number; error?: string }>('load', { session: this.session });
      if (load.status === 401) {
        this.logout();
        return false;
      }
      if (!load.ok) return false;
      const local = store.progress;
      const merged: Progress = load.data.progress ? merge(sanitize(load.data.progress), local) : local;
      const save = await call<{ rev?: number }>('save', { session: this.session, rev: load.data.rev ?? 0, progress: merged });
      if (save.status === 409) continue; // someone else saved in between: reload and merge again
      if (!save.ok) return false;
      store.replace(merged);
      this.lastSync = Date.now();
      this.lastJson = JSON.stringify(store.progress);
      return true;
    }
    return false;
  },

  async presence(state: { x: number; z: number; ry: number; act: string; robe: string; rank: number }) {
    const n = nameToIndices(store.progress.name);
    if (!n || !this.online) return null;
    const r = await call<{ players?: unknown[]; now?: number }>('presence', { id: store.progress.id, n, ...state });
    if (!r.ok) return null;
    return (r.data.players ?? []) as never[];
  },
};
