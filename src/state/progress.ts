// Pure progression rules: ranks, daily practices (日课), streaks, unlocks, and merging
// guest progress into an account. No DOM access here so it can be unit-tested and
// mirrored on the server.
import { beijingDate, daysBetween } from './time.ts';
import { randomName, type DharmaName } from './names.ts';

export type PracticeId = 'sweep' | 'water' | 'fish' | 'beads' | 'bow' | 'incense';
export const PRACTICES: { id: PracticeId; target: number; xp: number }[] = [
  { id: 'sweep', target: 5, xp: 20 }, // sweep 5 piles of fallen pine needles
  { id: 'water', target: 3, xp: 20 }, // carry 3 trips of spring water to the vat
  { id: 'fish', target: 33, xp: 15 }, // strike the wooden fish 33 times
  { id: 'beads', target: 108, xp: 30 }, // finish one round of 108 beads
  { id: 'bow', target: 3, xp: 15 }, // bow 3 times
  { id: 'incense', target: 1, xp: 20 }, // offer incense at the burner
];

export const RANKS = [
  { id: 'shami', zh: '沙弥', en: 'Novice', xp: 0 },
  { id: 'xingzhe', zh: '行者', en: 'Wayfarer', xp: 300 },
  { id: 'jushi', zh: '居士', en: 'Lay Devotee', xp: 900 },
  { id: 'biqiu', zh: '比丘', en: 'Bhikkhu', xp: 2000 },
  { id: 'fashi', zh: '法师', en: 'Dharma Teacher', xp: 4000 },
  { id: 'chanshi', zh: '禅师', en: 'Chan Master', xp: 7000 },
] as const;

export type AreaId = 'courtyard' | 'bell' | 'pond' | 'bamboo' | 'sutra' | 'summit';
/** Index i is unlocked at rank i. */
export const UNLOCKS = {
  robe: ['grey', 'ochre', 'indigo', 'apricot', 'crimson', 'golden'],
  beads: ['wood', 'bodhi', 'sandal', 'jade', 'crystal', 'amber'],
  accessory: ['none', 'hat', 'satchel', 'staff', 'lantern', 'whisk'],
  area: ['courtyard', 'bell', 'pond', 'bamboo', 'sutra', 'summit'] as AreaId[],
};
export type Slot = 'robe' | 'beads' | 'accessory';

export interface Progress {
  v: 1;
  id: string;
  name: DharmaName;
  xp: number;
  merit: number; // lifetime wooden-fish strikes (功德)
  bead: number; // position on the current round, 0..107
  rounds: number; // completed rounds of 108
  bows: number; // lifetime bows
  daily: { date: string; counts: Partial<Record<PracticeId, number>>; done: PracticeId[] };
  streak: { count: number; best: number; last: string | null }; // last = last Beijing date practised
  equip: Record<Slot, string>;
  updatedAt: number;
}

export function newProgress(rand: () => number = Math.random, ts = Date.now()): Progress {
  return {
    v: 1,
    id: 'g_' + Math.floor(rand() * 2 ** 48).toString(36),
    name: randomName(rand),
    xp: 0,
    merit: 0,
    bead: 0,
    rounds: 0,
    bows: 0,
    daily: { date: beijingDate(ts), counts: {}, done: [] },
    streak: { count: 0, best: 0, last: null },
    equip: { robe: 'grey', beads: 'wood', accessory: 'none' },
    updatedAt: ts,
  };
}

export function rankIndex(xp: number): number {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  return r;
}

/** 0..1 progress toward the next rank (1 at max rank). */
export function rankProgress(xp: number): number {
  const r = rankIndex(xp);
  if (r === RANKS.length - 1) return 1;
  return (xp - RANKS[r].xp) / (RANKS[r + 1].xp - RANKS[r].xp);
}

export function isUnlocked(xp: number, slot: Slot | 'area', value: string): boolean {
  const idx = (UNLOCKS[slot] as string[]).indexOf(value);
  return idx >= 0 && idx <= rankIndex(xp);
}

/** Roll the checklist over at Beijing midnight and break the streak after a missed day. */
export function rollover(p: Progress, ts = Date.now()): Progress {
  const today = beijingDate(ts);
  if (p.daily.date !== today) p.daily = { date: today, counts: {}, done: [] };
  if (p.streak.last && daysBetween(p.streak.last, today) > 1) p.streak.count = 0;
  return p;
}

export interface PracticeResult {
  completed: boolean; // this call finished the practice for today
  allDone: boolean; // this call finished the whole checklist
  xpGained: number;
  rankUp: number | null; // new rank index, if any
}

const STREAK_BONUS_PER_DAY = 5;
const STREAK_BONUS_CAP = 7;

/** Record `amount` units of a practice. Mutates and returns the outcome. */
export function practise(p: Progress, id: PracticeId, amount = 1, ts = Date.now()): PracticeResult {
  rollover(p, ts);
  const def = PRACTICES.find((d) => d.id === id)!;
  const before = rankIndex(p.xp);
  const res: PracticeResult = { completed: false, allDone: false, xpGained: 0, rankUp: null };
  const today = p.daily.date;

  p.daily.counts[id] = (p.daily.counts[id] ?? 0) + amount;

  // Any practice keeps the streak alive for the day.
  if (p.streak.last !== today) {
    p.streak.count = p.streak.last && daysBetween(p.streak.last, today) === 1 ? p.streak.count + 1 : 1;
    p.streak.last = today;
    p.streak.best = Math.max(p.streak.best, p.streak.count);
  }

  if (!p.daily.done.includes(id) && p.daily.counts[id]! >= def.target) {
    p.daily.done.push(id);
    res.completed = true;
    res.xpGained += def.xp;
    if (p.daily.done.length === PRACTICES.length) {
      res.allDone = true;
      res.xpGained += STREAK_BONUS_PER_DAY * Math.min(p.streak.count, STREAK_BONUS_CAP);
    }
  }
  p.xp += res.xpGained;
  const after = rankIndex(p.xp);
  if (after > before) res.rankUp = after;
  p.updatedAt = ts;
  return res;
}

/** Small XP that keeps flowing after the daily checklist (e.g. each extra round of beads). */
export function addXp(p: Progress, amount: number, ts = Date.now()): number | null {
  const before = rankIndex(p.xp);
  p.xp += amount;
  p.updatedAt = ts;
  const after = rankIndex(p.xp);
  return after > before ? after : null;
}

export function equip(p: Progress, slot: Slot, value: string, ts = Date.now()): boolean {
  if (!isUnlocked(p.xp, slot, value)) return false;
  p.equip[slot] = value;
  p.updatedAt = ts;
  return true;
}

/** Accept anything shaped roughly like Progress (old saves, server data) and repair it. */
export function sanitize(raw: unknown, ts = Date.now()): Progress {
  const base = newProgress(Math.random, ts);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Progress>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  const p: Progress = {
    ...base,
    id: typeof r.id === 'string' ? r.id : base.id,
    name: r.name && typeof r.name.zh === 'string' && typeof r.name.en === 'string' ? r.name : base.name,
    xp: num(r.xp, 0),
    merit: num(r.merit, 0),
    bead: num(r.bead, 0) % 108,
    rounds: num(r.rounds, 0),
    bows: num(r.bows, 0),
    updatedAt: num(r.updatedAt, ts),
  };
  if (r.daily && typeof r.daily.date === 'string') {
    const done = Array.isArray(r.daily.done) ? r.daily.done.filter((d) => PRACTICES.some((x) => x.id === d)) : [];
    p.daily = { date: r.daily.date, counts: { ...(r.daily.counts ?? {}) }, done: [...new Set(done)] };
  }
  if (r.streak) {
    p.streak = {
      count: num(r.streak.count, 0),
      best: num(r.streak.best, 0),
      last: typeof r.streak.last === 'string' ? r.streak.last : null,
    };
  }
  if (r.equip) {
    for (const slot of ['robe', 'beads', 'accessory'] as Slot[]) {
      const v = r.equip[slot];
      if (typeof v === 'string' && isUnlocked(p.xp, slot, v)) p.equip[slot] = v;
    }
  }
  return p;
}

/**
 * Merge two progress records (e.g. this device's guest progress into the account).
 * Totals take the larger side, today's checklist is
 * unioned, and the account keeps its identity and name.
 */
export function merge(account: Progress, local: Progress): Progress {
  const newer = local.updatedAt > account.updatedAt ? local : account;
  const out: Progress = {
    ...account,
    xp: Math.max(account.xp, local.xp),
    merit: Math.max(account.merit, local.merit),
    rounds: Math.max(account.rounds, local.rounds),
    bead: newer.bead,
    bows: Math.max(account.bows, local.bows),
    equip: { ...newer.equip },
    updatedAt: Math.max(account.updatedAt, local.updatedAt),
  };

  if (account.daily.date === local.daily.date) {
    const counts: Partial<Record<PracticeId, number>> = {};
    for (const { id } of PRACTICES) {
      const c = Math.max(account.daily.counts[id] ?? 0, local.daily.counts[id] ?? 0);
      if (c) counts[id] = c;
    }
    out.daily = {
      date: account.daily.date,
      counts,
      done: [...new Set([...account.daily.done, ...local.daily.done])],
    };
  } else {
    out.daily = structuredClone(account.daily.date > local.daily.date ? account.daily : local.daily);
  }

  const a = account.streak;
  const b = local.streak;
  const latest = !a.last ? b : !b.last ? a : a.last > b.last ? a : b.last > a.last ? b : a.count >= b.count ? a : b;
  out.streak = { count: latest.count, last: latest.last, best: Math.max(a.best, b.best, latest.count) };
  return out;
}
