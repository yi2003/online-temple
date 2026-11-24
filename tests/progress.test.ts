import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newProgress, practise, rollover, rankIndex, merge, equip, sanitize, PRACTICES, RANKS,
} from '../src/state/progress.ts';
import { beijingDate, nextBeijingMidnight } from '../src/state/time.ts';
import { mulberry32 } from '../src/state/names.ts';

// 2026-11-24 10:00 Beijing = 02:00 UTC
const DAY1 = Date.parse('2026-11-24T02:00:00Z');
const H = 3600e3;

test('Beijing date rolls at 16:00 UTC', () => {
  assert.equal(beijingDate(Date.parse('2026-11-24T15:59:00Z')), '2026-11-24');
  assert.equal(beijingDate(Date.parse('2026-11-24T16:00:00Z')), '2026-11-25');
  assert.equal(nextBeijingMidnight(DAY1), Date.parse('2026-11-24T16:00:00Z'));
});

test('a practice completes at its target and awards XP once', () => {
  const p = newProgress(mulberry32(1), DAY1);
  for (let i = 0; i < 2; i++) assert.equal(practise(p, 'bow', 1, DAY1).completed, false);
  const r = practise(p, 'bow', 1, DAY1);
  assert.equal(r.completed, true);
  assert.equal(r.xpGained, 15);
  assert.equal(practise(p, 'bow', 1, DAY1).xpGained, 0);
  assert.equal(p.xp, 15);
});

test('finishing the whole checklist adds a streak bonus', () => {
  const p = newProgress(mulberry32(2), DAY1);
  let last;
  for (const d of PRACTICES) last = practise(p, d.id, d.target, DAY1);
  assert.equal(last!.allDone, true);
  const base = PRACTICES.reduce((s, d) => s + d.xp, 0);
  assert.equal(p.xp, base + 5); // streak of 1 day
});

test('checklist resets at Beijing midnight; streak grows and breaks', () => {
  const p = newProgress(mulberry32(3), DAY1);
  practise(p, 'incense', 1, DAY1);
  assert.equal(p.streak.count, 1);
  const day2 = DAY1 + 24 * H;
  rollover(p, day2);
  assert.deepEqual(p.daily.done, []);
  practise(p, 'incense', 1, day2);
  assert.equal(p.streak.count, 2);
  const day4 = DAY1 + 72 * H;
  rollover(p, day4);
  assert.equal(p.streak.count, 0);
  assert.equal(p.streak.best, 2);
  practise(p, 'bow', 1, day4);
  assert.equal(p.streak.count, 1);
});

test('rank thresholds and gated equipment', () => {
  assert.equal(rankIndex(0), 0);
  assert.equal(rankIndex(299), 0);
  assert.equal(rankIndex(300), 1);
  assert.equal(rankIndex(RANKS[5].xp), 5);
  const p = newProgress(mulberry32(4), DAY1);
  assert.equal(equip(p, 'robe', 'indigo'), false);
  p.xp = 900;
  assert.equal(equip(p, 'robe', 'indigo'), true);
  assert.equal(p.equip.robe, 'indigo');
});

test('merge keeps the account identity and unions today', () => {
  const acct = newProgress(mulberry32(5), DAY1);
  const guest = newProgress(mulberry32(6), DAY1 + 1000);
  practise(acct, 'bow', 3, DAY1);
  practise(guest, 'incense', 1, DAY1 + 1000);
  guest.merit = 500;
  const m = merge(acct, guest);
  assert.equal(m.id, acct.id);
  assert.deepEqual(m.name, acct.name);
  assert.deepEqual([...m.daily.done].sort(), ['bow', 'incense']);
  assert.equal(m.merit, 500);
  assert.equal(m.streak.count, 1);
});

test('merge takes the newer day when dates differ', () => {
  const acct = newProgress(mulberry32(7), DAY1);
  practise(acct, 'bow', 3, DAY1);
  const guest = newProgress(mulberry32(8), DAY1 + 24 * H);
  practise(guest, 'water', 1, DAY1 + 24 * H);
  const m = merge(acct, guest);
  assert.equal(m.daily.date, beijingDate(DAY1 + 24 * H));
  assert.deepEqual(m.daily.counts, { water: 1 });
  assert.equal(m.streak.count, 1);
});

test('sanitize repairs junk and locks out unearned items', () => {
  const p = sanitize({ xp: -5, equip: { robe: 'golden' }, daily: { date: '2026-11-24', done: ['bow', 'hack'] } }, DAY1);
  assert.equal(p.xp, 0);
  assert.equal(p.equip.robe, 'grey');
  assert.deepEqual(p.daily.done, ['bow']);
  assert.equal(sanitize(null).v, 1);
});
