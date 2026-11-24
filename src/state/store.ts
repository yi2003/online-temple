// Device-local persistence plus a tiny change emitter. Guest mode lives entirely here.
import {
  addXp, equip as equipItem, newProgress, practise, rollover, sanitize,
  type PracticeId, type PracticeResult, type Progress, type Slot,
} from './progress.ts';
import { now } from './time.ts';

const KEY = 'temple.progress.v1';

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode: progress lasts this session only */ }
}

export type StoreEvent =
  | { type: 'change' }
  | { type: 'practice'; id: PracticeId; result: PracticeResult }
  | { type: 'rankUp'; rank: number };

type Listener = (e: StoreEvent) => void;

class Store {
  progress: Progress;
  private listeners = new Set<Listener>();

  constructor() {
    const raw = safeGet(KEY);
    let parsed: unknown = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
    this.progress = parsed ? sanitize(parsed, now()) : newProgress(Math.random, now());
    rollover(this.progress, now());
    this.save();
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: StoreEvent) {
    for (const fn of this.listeners) fn(e);
  }

  save() {
    safeSet(KEY, JSON.stringify(this.progress));
  }

  /** Re-check the date (called periodically so the list resets at midnight while playing). */
  tick() {
    const before = this.progress.daily.date;
    rollover(this.progress, now());
    if (this.progress.daily.date !== before) {
      this.save();
      this.emit({ type: 'change' });
    }
  }

  practise(id: PracticeId, amount = 1): PracticeResult {
    const result = practise(this.progress, id, amount, now());
    this.save();
    this.emit({ type: 'practice', id, result });
    if (result.rankUp !== null) this.emit({ type: 'rankUp', rank: result.rankUp });
    this.emit({ type: 'change' });
    return result;
  }

  /** Mutate counters (merit, beads…) that aren't checklist items. */
  update(fn: (p: Progress) => void, bonusXp = 0) {
    fn(this.progress);
    this.progress.updatedAt = now();
    const rank = bonusXp ? addXp(this.progress, bonusXp, now()) : null;
    this.save();
    if (rank !== null) this.emit({ type: 'rankUp', rank });
    this.emit({ type: 'change' });
  }

  equip(slot: Slot, value: string): boolean {
    const ok = equipItem(this.progress, slot, value, now());
    if (ok) {
      this.save();
      this.emit({ type: 'change' });
    }
    return ok;
  }

  replace(p: Progress) {
    this.progress = sanitize(p, now());
    rollover(this.progress, now());
    this.save();
    this.emit({ type: 'change' });
  }
}

export const store = new Store();
export { safeGet, safeSet };
