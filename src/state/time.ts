// All daily logic runs on Beijing time (UTC+8, no DST).
const BJ_OFFSET_MS = 8 * 3600 * 1000;

let clockOffsetMs = 0;
/** Shift the local clock to match the server's (so shared chanting lines up across devices). */
export function setClockOffset(ms: number): void {
  clockOffsetMs = Number.isFinite(ms) ? ms : 0;
}
export function now(): number {
  return Date.now() + clockOffsetMs;
}

/** 'YYYY-MM-DD' in Beijing time. */
export function beijingDate(ts: number = now()): string {
  return new Date(ts + BJ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes since Beijing midnight. */
export function beijingMinutes(ts: number = now()): number {
  const d = new Date(ts + BJ_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}

/** Whole days between two 'YYYY-MM-DD' strings (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** Epoch ms of the next Beijing midnight. */
export function nextBeijingMidnight(ts: number = now()): number {
  const day = beijingDate(ts);
  return Date.parse(day + 'T00:00:00Z') - BJ_OFFSET_MS + 86400000;
}
