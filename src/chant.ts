// Group chanting (共修) at set Beijing times. Every client derives the same syllable
// from the shared clock, so everyone online hears the chant in step.
import { now } from './state/time.ts';

export const SESSIONS = [6 * 60, 12 * 60, 18 * 60, 21 * 60]; // minutes after Beijing midnight
export const SESSION_MIN = 10;
const SYL = 0.72; // seconds per syllable
const REST = 2; // syllables of rest after each phrase

export interface Phrase { zh: string; py: string[]; vowels: string }
export const PHRASES: Phrase[] = [
  { zh: '南无阿弥陀佛', py: ['nā', 'mó', 'ē', 'mí', 'tuó', 'fó'], vowels: 'aoeioo' },
  { zh: '观自在菩萨', py: ['guān', 'zì', 'zài', 'pú', 'sà'], vowels: 'aiaua' },
  { zh: '行深般若波罗蜜多时', py: ['xíng', 'shēn', 'bō', 'rě', 'bō', 'luó', 'mì', 'duō', 'shí'], vowels: 'ieoeooioi' },
  { zh: '照见五蕴皆空', py: ['zhào', 'jiàn', 'wǔ', 'yùn', 'jiē', 'kōng'], vowels: 'aauueo' },
  { zh: '度一切苦厄', py: ['dù', 'yí', 'qiè', 'kǔ', 'è'], vowels: 'uieue' },
  { zh: '南无阿弥陀佛', py: ['nā', 'mó', 'ē', 'mí', 'tuó', 'fó'], vowels: 'aoeioo' },
];
const CYCLE = PHRASES.reduce((s, p) => s + p.zh.length + REST, 0);

export interface ChantState {
  active: boolean;
  phrase: number;
  syllable: number; // -1 during the rest between phrases
  beat: number; // global beat counter, increases by one per syllable slot
  nextStart: number; // epoch ms of the next session start
}

const BJ = 8 * 3600e3;
const DAY = 86400e3;
let forcedUntil = 0;
let forcedStart = 0;

/** Play a short local preview (not synchronised with anyone). */
export function previewChant(seconds = 40) {
  forcedStart = now();
  forcedUntil = forcedStart + seconds * 1000;
}
if (new URLSearchParams(location.search).has('chant')) previewChant(SESSION_MIN * 60);

export function chantState(ts = now()): ChantState {
  const dayMs = (((ts + BJ) % DAY) + DAY) % DAY;
  let elapsed = -1;
  for (const s of SESSIONS) {
    const e = dayMs - s * 60000;
    if (e >= 0 && e < SESSION_MIN * 60000) elapsed = e;
  }
  if (elapsed < 0 && ts < forcedUntil) elapsed = ts - forcedStart;

  // next session start
  let next = Infinity;
  for (const s of SESSIONS) {
    let d = s * 60000 - dayMs;
    if (d <= 0) d += DAY;
    next = Math.min(next, d);
  }
  const base: ChantState = { active: elapsed >= 0, phrase: 0, syllable: -1, beat: -1, nextStart: ts + next };
  if (elapsed < 0) return base;

  const beat = Math.floor(elapsed / 1000 / SYL);
  let k = beat % CYCLE;
  for (let i = 0; i < PHRASES.length; i++) {
    const len = PHRASES[i].zh.length;
    if (k < len) return { ...base, phrase: i, syllable: k, beat };
    k -= len;
    if (k < REST) return { ...base, phrase: i, syllable: -1, beat };
    k -= REST;
  }
  return base;
}

export const SYLLABLE_SECONDS = SYL;
