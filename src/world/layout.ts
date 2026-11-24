// The temple's walkable map: rectangular zones with height functions, gated areas,
// and solid obstacles. Units are metres; north is -Z, the gate is at +Z.
import type { AreaId } from '../state/progress.ts';

export interface Zone {
  name: string;
  x0: number; x1: number; z0: number; z1: number;
  h: (x: number, z: number) => number;
  area: AreaId;
}

const flat = (y: number) => () => y;
const rampZ = (zA: number, yA: number, zB: number, yB: number) => (_x: number, z: number) => {
  const t = Math.min(1, Math.max(0, (z - zA) / (zB - zA)));
  return yA + (yB - yA) * t;
};

export const HALL_FLOOR = 1.0;
export const TERRACE_Y = 3;
export const SUMMIT_Y = 12;
export const PLAZA_Y = -3.5;

// First match wins, so raised areas come before the courtyard they sit in.
export const ZONES: Zone[] = [
  { name: 'hallSteps', x0: -3, x1: 3, z0: -9, z1: -6.5, h: rampZ(-9, HALL_FLOOR, -6.5, 0), area: 'courtyard' },
  { name: 'hall', x0: -7.4, x1: 7.4, z0: -18.6, z1: -9, h: flat(HALL_FLOOR), area: 'courtyard' },
  { name: 'courtyard', x0: -22, x1: 22, z0: -24, z1: 20, h: flat(0), area: 'courtyard' },
  { name: 'steps', x0: -3, x1: 3, z0: 20, z1: 34, h: rampZ(20, 0, 34, PLAZA_Y), area: 'courtyard' },
  { name: 'plaza', x0: -8, x1: 8, z0: 34, z1: 46, h: flat(PLAZA_Y), area: 'courtyard' },
  { name: 'bellPass', x0: 22, x1: 27, z0: -4, z1: 1, h: flat(0), area: 'bell' },
  { name: 'bell', x0: 27, x1: 38, z0: -12, z1: 8, h: flat(0), area: 'bell' },
  { name: 'pondPass', x0: -27, x1: -22, z0: -4, z1: 1, h: flat(0), area: 'pond' },
  { name: 'pond', x0: -47, x1: -27, z0: -18, z1: 12, h: flat(0), area: 'pond' },
  { name: 'bambooPass', x0: -40, x1: -34, z0: 12, z1: 17, h: flat(0), area: 'bamboo' },
  { name: 'bamboo', x0: -48, x1: -26, z0: 17, z1: 40, h: flat(0), area: 'bamboo' },
  { name: 'sutraPass', x0: 10, x1: 14, z0: -36, z1: -24, h: rampZ(-24, 0, -36, TERRACE_Y), area: 'sutra' },
  { name: 'sutra', x0: -14, x1: 16, z0: -50, z1: -36, h: flat(TERRACE_Y), area: 'sutra' },
  { name: 'summitPass', x0: 8, x1: 12, z0: -72, z1: -50, h: rampZ(-50, TERRACE_Y, -72, SUMMIT_Y), area: 'summit' },
  { name: 'summit', x0: 0, x1: 20, z0: -86, z1: -72, h: flat(SUMMIT_Y), area: 'summit' },
];

/** Where each locked area's barrier stands (the entrance of its pass). */
export const GATES: { area: AreaId; x: number; z: number; ry: number; w: number }[] = [
  { area: 'bell', x: 23, z: -1.5, ry: Math.PI / 2, w: 5 },
  { area: 'pond', x: -23, z: -1.5, ry: Math.PI / 2, w: 5 },
  { area: 'bamboo', x: -37, z: 13, ry: 0, w: 6 },
  { area: 'sutra', x: 12, z: -25, ry: 0, w: 4 },
  { area: 'summit', x: 10, z: -51, ry: 0, w: 4 },
];

export function zoneAt(x: number, z: number): Zone | null {
  for (const zn of ZONES) if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
  return null;
}

export type Obstacle = { kind: 'circle'; x: number; z: number; r: number } | { kind: 'box'; x0: number; x1: number; z0: number; z1: number };
export const OBSTACLES: Obstacle[] = [];
export function circle(x: number, z: number, r: number) {
  OBSTACLES.push({ kind: 'circle', x, z, r });
}
export function box(x0: number, x1: number, z0: number, z1: number) {
  OBSTACLES.push({ kind: 'box', x0, x1, z0, z1 });
}

const BODY_R = 0.32;
export function blocked(x: number, z: number): boolean {
  for (const o of OBSTACLES) {
    if (o.kind === 'circle') {
      const dx = x - o.x, dz = z - o.z;
      if (dx * dx + dz * dz < (o.r + BODY_R) ** 2) return true;
    } else if (x > o.x0 - BODY_R && x < o.x1 + BODY_R && z > o.z0 - BODY_R && z < o.z1 + BODY_R) return true;
  }
  return false;
}

/**
 * Can a monk standing at height `fromY` step to (x, z)?
 * `allowed` decides whether a gated area is open to this walker.
 */
export function canStep(x: number, z: number, fromY: number, allowed: (a: AreaId) => boolean): { ok: boolean; y: number; zone: Zone | null } {
  const zn = zoneAt(x, z);
  if (!zn || !allowed(zn.area)) return { ok: false, y: fromY, zone: zn };
  const y = zn.h(x, z);
  if (Math.abs(y - fromY) > 0.45) return { ok: false, y, zone: zn };
  if (blocked(x, z)) return { ok: false, y, zone: zn };
  return { ok: true, y, zone: zn };
}

export function walkHeight(x: number, z: number): number {
  const zn = zoneAt(x, z);
  return zn ? zn.h(x, z) : 0;
}

/** Distance from a point to the nearest zone, and that zone's height at the nearest point. */
export function nearestZone(x: number, z: number): { d: number; y: number } {
  let best = Infinity, by = 0;
  for (const zn of ZONES) {
    const cx = Math.min(zn.x1, Math.max(zn.x0, x));
    const cz = Math.min(zn.z1, Math.max(zn.z0, z));
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) {
      best = d;
      by = zn.h(cx, cz);
    }
  }
  return { d: best, y: by };
}

// ---- named spots used by interactions, NPCs and scenery ----
export const SPOTS = {
  spawn: { x: 0, z: 42 },
  burner: { x: 0, z: 3 },
  well: { x: -14, z: 10 },
  vat: { x: 11, z: -6 },
  buddha: { x: 0, z: -17 },
  cushions: [-2.6, 0, 2.6].flatMap((x) => [{ x, z: -13.2 }, { x, z: -11 }]),
  bell: { x: 32, z: -2 },
  bellStriker: { x: 29.6, z: -2 },
  lectern: { x: 0, z: -40.5 },
  pondBench: { x: -36, z: 7.5 },
  bambooSeat: { x: -37, z: 31 },
  summitSeat: { x: 10, z: -76.5 },
  pond: { x: -37, z: -4, r: 6.5 },
  // candidate places for fallen pine needles in the courtyard
  leafSpots: [
    { x: -9, z: 12 }, { x: 7, z: 14 }, { x: -16, z: -2 }, { x: 15, z: 4 }, { x: -5, z: -3 },
    { x: 9, z: -2 }, { x: -18, z: -16 }, { x: 18, z: -14 }, { x: -11, z: 4 }, { x: 4, z: 9 },
    { x: 13, z: 16 }, { x: -14, z: 17 },
  ],
};

// Solid things in the walkable map
box(-7.4, 7.4, -18.6, -18.1); // hall back wall
box(-7.4, -6.9, -18.6, -9.6); // hall side walls
box(6.9, 7.4, -18.6, -9.6);
for (const x of [-6.6, -3.8, 3.8, 6.6]) circle(x, -9.4, 0.3); // front columns
box(-3.2, 3.2, -18.1, -15.0); // altar + Buddha
circle(SPOTS.burner.x, SPOTS.burner.z, 1.25);
circle(SPOTS.well.x, SPOTS.well.z, 1.0);
circle(SPOTS.vat.x, SPOTS.vat.z, 0.85);
for (const [x, z] of [[-17, -19], [17, -19], [-17, 13], [17, 13], [-19, 0], [19, 6]]) circle(x, z, 0.55); // courtyard pines
for (const x of [-5.2, -2.2, 2.2, 5.2]) circle(x, 40, 0.3); // mountain gate pillars
for (const [x, z] of [[29.8, -4.8], [34.2, -4.8], [29.8, 0.8], [34.2, 0.8]]) circle(x, z, 0.3); // bell tower posts
circle(SPOTS.bell.x, SPOTS.bell.z, 1.0);
circle(SPOTS.pond.x, SPOTS.pond.z, SPOTS.pond.r);
box(-6.5, 6.5, -48, -42.5); // sutra pavilion
circle(0, -41.5, 0.35); // lectern
circle(10, -82, 1.6); // summit stupa
