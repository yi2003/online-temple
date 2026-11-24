// Temple architecture and props, built from primitives. Everything here is original geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AreaId } from '../state/progress.ts';
import { RANKS, UNLOCKS } from '../state/progress.ts';
import { mulberry32 } from '../state/names.ts';
import { GATES, HALL_FLOOR, PLAZA_Y, SPOTS, SUMMIT_Y, TERRACE_Y, circle } from './layout.ts';
import { clean } from './nature.ts';
import { latticeTexture, pavingTexture, plaqueTexture, softTexture, stoneTexture, woodFloorTexture } from './textures.ts';

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

const stoneTex = stoneTexture();
const M = {
  red: std('#9a2d22', { roughness: 0.55 }),
  redDark: std('#6e2219', { roughness: 0.6 }),
  wood: std('#6a4630'),
  stone: std('#e2dccd', { map: stoneTex }),
  stoneDark: std('#b3ad9f', { map: stoneTex }),
  plaster: std('#e6dccb', { roughness: 0.95 }),
  tileCap: std('#4c5452', { roughness: 0.7 }),
  teal: std('#2f6b66', { roughness: 0.6 }),
  blue: std('#2b4a73', { roughness: 0.6 }),
  gold: std('#d5a64a', { metalness: 0.85, roughness: 0.32 }),
  bronze: std('#6f5a3a', { metalness: 0.7, roughness: 0.45 }),
  bamboo: std('#b89a5e'),
  cushion: std('#c98b2b', { roughness: 0.95 }),
  white: std('#f2ede2'),
  lantern: std('#d8331f', { emissive: '#ff4a1c', emissiveIntensity: 0.6, roughness: 0.6 }),
  flame: new THREE.MeshBasicMaterial({ color: '#ffcf6b' }),
  ember: new THREE.MeshBasicMaterial({ color: '#ff5a1f' }),
  dark: std('#2a2622'),
  water: std('#4c7c84', { roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.82 }),
  pinkPetal: std('#f1a6b8', { roughness: 0.7 }),
  pad: std('#4f8a43', { roughness: 0.7, side: THREE.DoubleSide }),
  leafPile: std('#a4733c', { roughness: 1 }),
};

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, ry = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
/** Box whose bottom sits at y. */
function block(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) {
  return add(parent, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, ry);
}
function column(parent: THREE.Object3D, x: number, y: number, z: number, h: number, r = 0.3, mat = M.red) {
  add(parent, new THREE.CylinderGeometry(r * 1.45, r * 1.5, 0.25, 12), M.stone, x, y + 0.125, z);
  add(parent, new THREE.CylinderGeometry(r, r * 1.05, h, 12), mat, x, y + h / 2, z);
}

// ---------- curved roofs ----------
function roofMaterial(W: number, D: number, R: number, color: string): THREE.MeshStandardMaterial {
  const mat = std(color, { roughness: 0.65 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWDR = { value: new THREE.Vector3(W, D, R) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoofPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoofPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoofPos;\nuniform vec3 uWDR;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ax = clamp((abs(vRoofPos.x) - uWDR.z) / max(uWDR.x - uWDR.z, 0.001), 0.0, 1.0);
        float az = abs(vRoofPos.z) / uWDR.y;
        float coord = az > ax ? vRoofPos.x : vRoofPos.z;
        float s = abs(fract(coord * 3.0) - 0.5);
        diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.06, 0.2, s));
        float edge = max(ax, az);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.76, 0.7), smoothstep(0.965, 0.985, edge) * 0.7);`,
      );
  };
  mat.customProgramCacheKey = () => `roof-${W}-${D}-${R}`;
  return mat;
}

/**
 * Hip roof with concave slopes and upturned corners, the shape of a Chinese temple roof.
 * W/D are half extents including the overhang; R is half the ridge length; the eave sits at y=0.
 */
export function makeRoof(W: number, D: number, H: number, R: number, lift: number, color = '#4b5552'): THREE.Group {
  const g = new THREE.Group();
  const prof = (x: number, z: number) => {
    const ax = Math.min(1, Math.max(0, (Math.abs(x) - R) / (W - R)));
    const az = Math.min(1, Math.abs(z) / D);
    const t = Math.max(ax, az);
    return H * Math.pow(1 - t, 1.8) + lift * Math.pow(ax, 3) * Math.pow(az, 3) + lift * 0.25 * Math.pow(t, 6);
  };
  const geo = new THREE.PlaneGeometry(W * 2, D * 2, 56, 40);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, prof(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const top = add(g, geo, roofMaterial(W, D, R, color));
  top.userData.noMerge = true;
  top.userData.occluder = true;
  const soffit = add(g, geo.clone(), M.redDark, 0, -0.16, 0, 0, false);
  (soffit.material as THREE.Material) = M.redDark.clone();
  (soffit.material as THREE.MeshStandardMaterial).side = THREE.BackSide;
  soffit.userData.noMerge = true;

  // ridges
  const ridgeMat = std('#3b4341', { roughness: 0.7 });
  if (R > 0.05) {
    const ridge = add(g, new THREE.BoxGeometry(R * 2 + 0.4, 0.4, 0.32), ridgeMat, 0, H + 0.12, 0);
    ridge.userData.noMerge = true;
    for (const s of [-1, 1]) {
      const orn = add(g, new THREE.ConeGeometry(0.22, 0.9, 6), ridgeMat, s * (R + 0.15), H + 0.55, 0);
      orn.rotation.z = -s * 0.35;
      orn.userData.noMerge = true;
    }
  } else {
    const fin = add(g, new THREE.SphereGeometry(0.25, 10, 8), M.gold, 0, H + 0.15, 0);
    fin.userData.noMerge = true;
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const s = k / 12;
        const x = sx * (R + s * (W - R)), z = sz * s * D;
        pts.push(new THREE.Vector3(x, prof(x, z) + 0.07, z));
      }
      const hip = add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.09, 5), ridgeMat);
      hip.userData.noMerge = true;
    }
  }
  return g;
}

function plaque(parent: THREE.Object3D, text: string, x: number, y: number, z: number, w: number, h: number, ry = 0, vertical = false) {
  const mat = new THREE.MeshStandardMaterial({ map: plaqueTexture(text, vertical), roughness: 0.6 });
  const m = add(parent, new THREE.BoxGeometry(w, h, 0.12), [M.wood, M.wood, M.wood, M.wood, mat, M.wood] as unknown as THREE.Material, x, y, z, ry, false);
  m.userData.noMerge = true;
  return m;
}

function hangingLantern(parent: THREE.Object3D, x: number, y: number, z: number) {
  add(parent, new THREE.CylinderGeometry(0.01, 0.01, 0.8), M.dark, x, y + 0.75, z, 0, false);
  const l = add(parent, new THREE.SphereGeometry(0.32, 14, 10), M.lantern, x, y, z, 0, false);
  l.scale.set(1, 1.15, 1);
  l.userData.noMerge = true;
  add(parent, new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), M.gold, x, y + 0.36, z, 0, false);
  add(parent, new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), M.gold, x, y - 0.36, z, 0, false);
  add(parent, new THREE.CylinderGeometry(0.02, 0.06, 0.35, 6), M.lantern, x, y - 0.55, z, 0, false);
}

function stoneLantern(parent: THREE.Object3D, x: number, y: number, z: number, s = 1) {
  add(parent, new THREE.CylinderGeometry(0.32 * s, 0.4 * s, 0.25 * s, 6), M.stone, x, y + 0.12 * s, z);
  add(parent, new THREE.CylinderGeometry(0.12 * s, 0.14 * s, 0.8 * s, 8), M.stone, x, y + 0.65 * s, z);
  add(parent, new THREE.BoxGeometry(0.5 * s, 0.4 * s, 0.5 * s), M.stone, x, y + 1.25 * s, z);
  const glow = add(parent, new THREE.BoxGeometry(0.3 * s, 0.24 * s, 0.52 * s), new THREE.MeshBasicMaterial({ color: '#ffd89a' }), x, y + 1.25 * s, z, 0, false);
  glow.userData.noMerge = true;
  add(parent, new THREE.ConeGeometry(0.5 * s, 0.35 * s, 4), M.stone, x, y + 1.62 * s, z, Math.PI / 4);
  add(parent, new THREE.SphereGeometry(0.08 * s, 6, 5), M.stone, x, y + 1.85 * s, z);
}

function stairs(parent: THREE.Object3D, x0: number, x1: number, zA: number, yA: number, zB: number, yB: number, n: number) {
  const dz = (zB - zA) / n;
  for (let i = 0; i < n; i++) {
    const top = yA + ((yB - yA) * (i + 0.5)) / n + 0.08;
    const bottom = Math.min(yA, yB) - 2;
    block(parent, x1 - x0, top - bottom, Math.abs(dz) + 0.02, M.stone, (x0 + x1) / 2, bottom, zA + dz * (i + 0.5));
  }
  // side kerbs
  const len = Math.hypot(zB - zA, yB - yA);
  const ang = Math.atan2(yB - yA, Math.abs(zB - zA)) * Math.sign(zB - zA);
  for (const x of [x0 - 0.2, x1 + 0.2]) {
    const k = add(parent, new THREE.BoxGeometry(0.4, 0.5, len + 0.4), M.stoneDark, x, (yA + yB) / 2 + 0.2, (zA + zB) / 2);
    k.rotation.x = -ang;
  }
}

function paving(parent: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, y: number, tileSize = 4) {
  const t = pavingTexture();
  t.repeat.set((x1 - x0) / tileSize, (z1 - z0) / tileSize);
  const m = add(parent, new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), (x0 + x1) / 2, y, (z0 + z1) / 2, 0, false);
  m.rotation.x = -Math.PI / 2;
  m.userData.noMerge = true;
  return m;
}

function wall(parent: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, h = 1.7) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  block(parent, 0.45, 0.3, len, M.stoneDark, cx, -0.3, cz, ry);
  block(parent, 0.4, h, len, M.plaster, cx, 0, cz, ry);
  const cap = add(parent, new THREE.BoxGeometry(0.85, 0.16, len + 0.3), M.tileCap, cx, h + 0.08, cz, ry);
  cap.castShadow = true;
  add(parent, new THREE.BoxGeometry(0.3, 0.22, len + 0.3), M.tileCap, cx, h + 0.24, cz, ry);
}

// ---------- the temple ----------
export interface LeafPile { mesh: THREE.Object3D; x: number; z: number; index: number }

export class Temple {
  group = new THREE.Group();
  occluders: THREE.Object3D[] = [];
  gates = new Map<AreaId, THREE.Group>();
  leafPiles: LeafPile[] = [];
  private smoke!: THREE.Points;
  private smokeData: { x: number; y: number; z: number; vx: number; vz: number; life: number; max: number }[] = [];
  private offerSticks: THREE.Group = new THREE.Group();
  private vatWater!: THREE.Mesh;
  private vatLevel = 0.4;
  private vatTarget = 0.4;
  private striker!: THREE.Group;
  private strikeT = -1;
  private koi: { mesh: THREE.Object3D; r: number; speed: number; ph: number }[] = [];
  private candleLight!: THREE.PointLight;
  private time = 0;

  constructor() {
    const static_ = new THREE.Group();
    this.buildCourtyard(static_);
    this.buildHall(static_);
    this.buildGateAndSteps(static_);
    this.buildBellTower(static_);
    this.buildPond(static_);
    this.buildSutraTerrace(static_);
    this.buildSummit(static_);
    this.buildGates();
    this.group.add(static_);
    mergeStatic(static_);
    this.group.traverse((o) => { if (o.userData.occluder) this.occluders.push(o); });
    this.group.add(this.offerSticks);
    this.buildSmoke();
  }

  // ---------- courtyard ----------
  private buildCourtyard(g: THREE.Group) {
    paving(g, -22, 22, -24, 20, 0.01, 3.5);
    // central path of long slabs
    const slab = pavingTexture();
    slab.repeat.set(1, 7);
    const path = add(g, new THREE.BoxGeometry(3.6, 0.06, 26.5), std('#fbf6ea', { map: slab }), 0, 0.02, 6.75, 0, false);
    path.userData.noMerge = true;
    // walls with openings for the passes
    wall(g, -22.4, -24.4, 10, -24.4);
    wall(g, 14, -24.4, 22.4, -24.4);
    wall(g, 22.4, -24.4, 22.4, -4);
    wall(g, 22.4, 1, 22.4, 20.4);
    wall(g, -22.4, -24.4, -22.4, -4);
    wall(g, -22.4, 1, -22.4, 20.4);
    wall(g, -22.4, 20.4, -3.3, 20.4);
    wall(g, 3.3, 20.4, 22.4, 20.4);
    // side gateways (moon-gate frames)
    for (const s of [-1, 1]) {
      const x = s * 22.4;
      for (const z of [-4.3, 1.3]) block(g, 0.6, 2.6, 0.6, M.plaster, x, 0, z);
      block(g, 0.7, 0.5, 6.2, M.plaster, x, 2.6, -1.5);
      const r = makeRoof(0.9, 3.6, 0.6, 2.7, 0.25);
      r.rotation.y = Math.PI / 2;
      r.position.set(x, 3.1, -1.5);
      g.add(r);
    }

    this.buildBurner(g);

    // well
    const { well, vat } = SPOTS;
    add(g, new THREE.CylinderGeometry(0.95, 1.0, 0.75, 16, 1, true), M.stone, well.x, 0.37, well.z);
    add(g, new THREE.CylinderGeometry(0.72, 0.72, 0.75, 16, 1, true), M.stoneDark, well.x, 0.37, well.z);
    const rim = add(g, new THREE.RingGeometry(0.72, 1.0, 16), M.stone, well.x, 0.75, well.z);
    rim.rotation.x = -Math.PI / 2;
    const ww = add(g, new THREE.CircleGeometry(0.72, 16), M.water, well.x, 0.3, well.z, 0, false);
    ww.rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) block(g, 0.14, 2.0, 0.14, M.wood, well.x + s * 1.05, 0, well.z);
    add(g, new THREE.CylinderGeometry(0.07, 0.07, 2.3, 8), M.wood, well.x, 1.8, well.z).rotation.z = Math.PI / 2;
    const wr = makeRoof(1.5, 0.8, 0.5, 0.9, 0.15);
    wr.position.set(well.x, 2.05, well.z);
    g.add(wr);
    add(g, new THREE.CylinderGeometry(0.22, 0.18, 0.3, 10), M.wood, well.x + 0.8, 0.9, well.z + 0.3);

    // water vat — its level rises with today's water practice
    const vatProfile = [[0, 0], [0.5, 0.02], [0.78, 0.35], [0.82, 0.7], [0.72, 1.02], [0.76, 1.08], [0.7, 1.1]].map(([r, y]) => new THREE.Vector2(r, y));
    const vatMesh = add(g, new THREE.LatheGeometry(vatProfile, 20), std('#3e3027', { roughness: 0.3, side: THREE.DoubleSide }), vat.x, 0, vat.z);
    vatMesh.userData.noMerge = true;
    this.vatWater = add(this.group, new THREE.CircleGeometry(0.7, 20), M.water, vat.x, 0.4, vat.z, 0, false);
    this.vatWater.rotation.x = -Math.PI / 2;

    for (const [x, z] of [[-6, -4.5], [6, -4.5], [-6, 16], [6, 16]]) stoneLantern(g, x, 0, z);
    // a stone bench under the east pine
    block(g, 1.8, 0.45, 0.6, M.stone, 15.5, 0, 9.5);
  }

  private buildBurner(g: THREE.Group) {
    const { x, z } = SPOTS.burner;
    add(g, new THREE.CylinderGeometry(1.15, 1.25, 0.45, 8), M.stone, x, 0.22, z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const leg = add(g, new THREE.CylinderGeometry(0.1, 0.07, 0.6, 6), M.bronze, x + Math.cos(a) * 0.62, 0.72, z + Math.sin(a) * 0.62);
      leg.rotation.z = Math.cos(a) * 0.15;
    }
    const prof = [[0, 0], [0.65, 0.05], [0.9, 0.35], [0.92, 0.7], [1.02, 0.78], [1.02, 0.84], [0.9, 0.84]].map(([r, y]) => new THREE.Vector2(r, y));
    add(g, new THREE.LatheGeometry(prof, 24), std('#5c4a2f', { metalness: 0.75, roughness: 0.4, side: THREE.DoubleSide }), x, 0.92, z).userData.noMerge = true;
    const ash = add(g, new THREE.CircleGeometry(0.88, 20), std('#8e8678'), x, 1.66, z, 0, false);
    ash.rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) {
      const h = add(g, new THREE.TorusGeometry(0.22, 0.05, 6, 12, Math.PI), M.bronze, x + s * 0.95, 1.8, z);
      h.rotation.y = Math.PI / 2;
    }
    // resident incense sticks
    for (let i = 0; i < 7; i++) this.addStick(x + (Math.random() - 0.5) * 0.9, z + (Math.random() - 0.5) * 0.9, g);
  }

  private addStick(x: number, z: number, parent: THREE.Object3D) {
    const h = 0.55 + Math.random() * 0.15;
    add(parent, new THREE.CylinderGeometry(0.012, 0.012, h, 4), std('#b34a2a'), x, 1.66 + h / 2, z, 0, false);
    add(parent, new THREE.SphereGeometry(0.022, 5, 4), M.ember, x, 1.66 + h, z, 0, false);
  }

  /** A freshly offered bundle of three sticks; it burns down over a few minutes. */
  offerIncense() {
    const { x, z } = SPOTS.burner;
    const bundle = new THREE.Group();
    for (let i = -1; i <= 1; i++) this.addStick(x + i * 0.05, z + 0.25, bundle);
    bundle.userData.born = this.time;
    this.offerSticks.add(bundle);
    if (this.offerSticks.children.length > 6) this.offerSticks.remove(this.offerSticks.children[0]);
  }

  // ---------- main hall ----------
  private buildHall(g: THREE.Group) {
    const cz = -14, F = HALL_FLOOR;
    block(g, 16.4, F, 10.8, M.stone, 0, 0, cz);
    // wooden floor inside
    const fl = woodFloorTexture();
    fl.repeat.set(4, 3);
    const floor = add(g, new THREE.PlaneGeometry(14.2, 9.2), new THREE.MeshStandardMaterial({ map: fl, roughness: 0.7 }), 0, F + 0.01, -14, 0, false);
    floor.rotation.x = -Math.PI / 2;
    floor.userData.noMerge = true;
    stairs(g, -3, 3, -6.5, 0, -9, F, 4);
    // balustrade along the platform front
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 5; i++) block(g, 0.18, 0.7, 0.18, M.white, s * (3.4 + i * 0.95), F, -8.75);
      block(g, 4.9, 0.12, 0.12, M.white, s * 5.8, F + 0.55, -8.75);
    }
    // columns
    const H = 5.0;
    for (const x of [-6.6, -3.8, 3.8, 6.6]) column(g, x, F, -9.4, H);
    for (const x of [-6.6, -3.8, 3.8, 6.6]) column(g, x, F, -18.3, H);
    for (const z of [-12.4, -15.4]) for (const x of [-7.1, 7.1]) column(g, x, F, z, H);
    // walls
    const back = block(g, 14.8, H, 0.5, M.red, 0, F, -18.35);
    const left = block(g, 0.5, H, 9.0, M.red, -7.15, F, -14.1);
    const right = block(g, 0.5, H, 9.0, M.red, 7.15, F, -14.1);
    for (const m of [back, left, right]) m.userData.occluder = true;
    // lattice doors in the outer bays
    const lat = latticeTexture();
    lat.repeat.set(2, 1);
    const latMat = new THREE.MeshStandardMaterial({ map: lat, roughness: 0.7 });
    for (const s of [-1, 1]) block(g, 2.5, 4.6, 0.12, latMat, s * 5.2, F, -9.45).userData.noMerge = true;
    // lintels, painted band and bracket sets
    block(g, 15.2, 0.5, 0.45, M.red, 0, F + H - 0.5, -9.4);
    block(g, 15.2, 0.32, 0.47, M.teal, 0, F + H - 0.82, -9.4);
    block(g, 15.2, 0.12, 0.48, M.gold, 0, F + H - 0.9, -9.4);
    for (const z of [-9.4, -18.3]) {
      for (let x = -7.2; x <= 7.21; x += 0.8) {
        block(g, 0.34, 0.22, 0.6, M.teal, x, F + H, z);
        block(g, 0.5, 0.14, 0.5, M.gold, x, F + H + 0.22, z);
      }
    }
    for (const x of [-7.15, 7.15]) {
      for (let z = -17.6; z <= -10; z += 0.8) {
        block(g, 0.6, 0.22, 0.34, M.teal, x, F + H, z);
        block(g, 0.5, 0.14, 0.5, M.gold, x, F + H + 0.22, z);
      }
    }
    // double-eaved roof
    const low = makeRoof(9.9, 7.1, 2.3, 2.8, 0.9);
    low.position.set(0, F + H + 0.3, cz);
    g.add(low);
    const clere = block(g, 12.2, 2.9, 7.2, M.red, 0, F + H + 0.3, cz);
    clere.userData.occluder = true;
    block(g, 12.3, 0.35, 7.3, M.teal, 0, F + H + 2.7, cz);
    for (let x = -5.8; x <= 5.81; x += 0.75) {
      block(g, 0.3, 0.2, 7.6, M.teal, x, F + H + 3.05, cz);
    }
    const up = makeRoof(8.5, 5.5, 3.0, 3.3, 0.8);
    up.position.set(0, F + H + 3.25, cz);
    g.add(up);
    plaque(g, '大雄宝殿', 0, F + H + 1.75, cz + 3.68, 3.6, 1.1);
    for (const x of [-5.6, 5.6]) hangingLantern(g, x, F + H - 0.9, -8.6);

    this.buildBuddha(g);

    // altar table and offerings
    block(g, 4.2, 0.85, 0.9, M.red, 0, F, -15.5);
    block(g, 4.4, 0.06, 1.0, M.gold, 0, F + 0.85, -15.5);
    for (const s of [-1, 1]) {
      add(g, new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8), std('#e34a2e'), s * 1.6, F + 1.16, -15.5);
      const fl2 = add(g, new THREE.ConeGeometry(0.045, 0.14, 8), M.flame, s * 1.6, F + 1.48, -15.5, 0, false);
      fl2.userData.noMerge = true;
      // vases with lotus
      add(g, new THREE.CylinderGeometry(0.12, 0.08, 0.45, 10), M.blue, s * 0.9, F + 1.12, -15.6);
      this.lotusFlower(g, s * 0.9, F + 1.55, -15.6, 0.6);
      // fruit
      for (let k = 0; k < 4; k++) add(g, new THREE.SphereGeometry(0.09, 8, 6), std('#e48a2a'), s * 0.35 + (k % 2) * 0.12 - 0.06, F + 0.98 + (k > 1 ? 0.12 : 0), -15.35 + (k % 2 ? 0.05 : -0.05));
    }
    add(g, new THREE.CylinderGeometry(0.22, 0.16, 0.25, 12), M.bronze, 0, F + 1.0, -15.4);
    this.candleLight = new THREE.PointLight('#ffc477', 18, 14, 1.6);
    this.candleLight.position.set(0, F + 2.6, -14.2);
    this.group.add(this.candleLight);

    // cushions
    for (const c of SPOTS.cushions) {
      add(g, new THREE.CylinderGeometry(0.42, 0.45, 0.16, 16), M.cushion, c.x, F + 0.08, c.z);
      const ring = add(g, new THREE.TorusGeometry(0.4, 0.06, 6, 16), std('#a86f22'), c.x, F + 0.15, c.z);
      ring.rotation.x = Math.PI / 2;
    }
    // hanging banners
    for (const x of [-5.6, 5.6]) {
      for (const z of [-11, -15.5]) {
        add(g, new THREE.CylinderGeometry(0.3, 0.3, 2.6, 12, 1, true), std(z < -12 ? '#c99a2e' : '#a8322a', { side: THREE.DoubleSide }), x, F + 3.2, z);
        add(g, new THREE.CylinderGeometry(0.34, 0.34, 0.12, 12), M.gold, x, F + 4.5, z);
      }
    }
  }

  private lotusFlower(g: THREE.Object3D, x: number, y: number, z: number, s: number) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = add(g, new THREE.SphereGeometry(0.12 * s, 6, 5), M.pinkPetal, x + Math.cos(a) * 0.08 * s, y, z + Math.sin(a) * 0.08 * s, 0, false);
      p.scale.set(0.5, 1.4, 0.9);
      p.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    }
    add(g, new THREE.SphereGeometry(0.06 * s, 6, 5), std('#f2cf5b'), x, y + 0.04 * s, z, 0, false);
  }

  private buildBuddha(g: THREE.Group) {
    const F = HALL_FLOOR, z = -16.9;
    // screen behind
    block(g, 6.5, 4.6, 0.25, M.redDark, 0, F, -18.0);
    block(g, 6.7, 0.2, 0.3, M.gold, 0, F + 4.6, -18.0);
    // throne and lotus seat
    block(g, 4.4, 1.0, 2.4, M.red, 0, F, z);
    block(g, 4.6, 0.12, 2.6, M.gold, 0, F + 1.0, z);
    add(g, new THREE.CylinderGeometry(1.5, 1.3, 0.5, 24), M.gold, 0, F + 1.37, z);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const p = add(g, new THREE.SphereGeometry(0.32, 8, 6), std('#e7b3a2', { roughness: 0.5 }), Math.cos(a) * 1.45, F + 1.45, z + Math.sin(a) * 1.45, 0, false);
      p.scale.set(0.6, 0.9, 0.3);
      p.lookAt(0, F + 1.0, z);
    }
    const gold = M.gold;
    const legs = add(g, new THREE.SphereGeometry(1, 20, 12), gold, 0, F + 1.85, z + 0.1);
    legs.scale.set(1.45, 0.42, 0.95);
    const torsoProf = [[0, 0], [1.0, 0], [1.05, 0.4], [0.95, 1.0], [0.78, 1.45], [0.38, 1.72], [0.26, 1.85], [0, 1.86]].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = add(g, new THREE.LatheGeometry(torsoProf, 24), gold, 0, F + 1.8, z - 0.1);
    torso.scale.set(1, 1, 0.75);
    const hands = add(g, new THREE.SphereGeometry(0.32, 12, 8), gold, 0, F + 2.25, z + 0.62);
    hands.scale.set(1.3, 0.5, 0.9);
    // robe fold across the chest
    const fold = add(g, new THREE.TorusGeometry(0.8, 0.07, 6, 20, Math.PI), std('#c4913b', { metalness: 0.8, roughness: 0.35 }), 0, F + 3.2, z + 0.05);
    fold.rotation.set(0.5, 0, Math.PI);
    const head = add(g, new THREE.SphereGeometry(0.56, 24, 16), gold, 0, F + 4.15, z);
    head.scale.set(1, 1.08, 1);
    add(g, new THREE.SphereGeometry(0.3, 16, 10), gold, 0, F + 4.75, z - 0.05);
    for (const s of [-1, 1]) {
      const ear = add(g, new THREE.SphereGeometry(0.2, 10, 8), gold, s * 0.56, F + 4.05, z);
      ear.scale.set(0.45, 1.6, 0.7);
      const eye = add(g, new THREE.TorusGeometry(0.1, 0.018, 4, 10, Math.PI), M.dark, s * 0.2, F + 4.17, z + 0.52, 0, false);
      eye.rotation.z = Math.PI;
    }
    add(g, new THREE.SphereGeometry(0.035, 6, 5), std('#c0392b'), 0, F + 4.36, z + 0.55, 0, false);
    // halo and mandorla
    const soft = softTexture();
    const haloMat = new THREE.MeshBasicMaterial({ map: soft, color: '#ffd77a', transparent: true, opacity: 0.85, depthWrite: false });
    const halo = add(g, new THREE.CircleGeometry(1.25, 32), haloMat, 0, F + 4.2, z - 0.7, 0, false);
    halo.userData.noMerge = true;
    const ring = add(g, new THREE.TorusGeometry(1.15, 0.05, 6, 40), gold, 0, F + 4.2, z - 0.65, 0, false);
    ring.userData.noMerge = true;
    const mand = add(g, new THREE.CircleGeometry(2.3, 40), new THREE.MeshBasicMaterial({ map: soft, color: '#f0b85a', transparent: true, opacity: 0.55, depthWrite: false }), 0, F + 2.9, z - 0.85, 0, false);
    mand.scale.set(1, 1.15, 1);
    mand.userData.noMerge = true;
  }

  // ---------- gate & steps ----------
  private buildGateAndSteps(g: THREE.Group) {
    stairs(g, -3, 3, 20, 0, 34, PLAZA_Y, 14);
    for (let i = 0; i < 4; i++) {
      const z = 21.5 + i * 3.5;
      const y = (PLAZA_Y * (z - 20)) / 14;
      for (const s of [-1, 1]) stoneLantern(g, s * 4.2, y - 0.2, z, 0.9);
    }
    paving(g, -8, 8, 34, 46, PLAZA_Y + 0.01, 3);
    // mountain gate (山门), a three-bay paifang
    const y = PLAZA_Y, z = 40;
    for (const x of [-2.2, 2.2]) column(g, x, y, z, 5.2, 0.3);
    for (const x of [-5.2, 5.2]) column(g, x, y, z, 4.0, 0.26);
    block(g, 5.2, 0.5, 0.5, M.red, 0, y + 4.6, z);
    block(g, 5.2, 0.3, 0.52, M.teal, 0, y + 4.3, z);
    for (const s of [-1, 1]) {
      block(g, 3.4, 0.4, 0.45, M.red, s * 3.7, y + 3.5, z);
      block(g, 3.4, 0.24, 0.47, M.teal, s * 3.7, y + 3.26, z);
      const r = makeRoof(2.1, 1.0, 0.6, 1.2, 0.35);
      r.position.set(s * 3.7, y + 4.0, z);
      g.add(r);
    }
    const r = makeRoof(3.2, 1.25, 0.9, 2.0, 0.45);
    r.position.set(0, y + 5.15, z);
    g.add(r);
    plaque(g, '云栖寺', 0, y + 4.1, z + 0.3, 2.2, 0.75);
    for (const x of [-3.7, 3.7]) hangingLantern(g, x, y + 2.6, z + 0.35);
    // guardian stones
    for (const x of [-3.7, 3.7]) block(g, 0.9, 0.9, 0.9, M.stone, x, y, z + 2.4);
  }

  // ---------- unlockable areas ----------
  private buildBellTower(g: THREE.Group) {
    const { x, z } = SPOTS.bell;
    paving(g, 25, 37, -9, 5, 0.02, 3);
    block(g, 6.2, 0.25, 7.4, M.stone, x, 0, z);
    for (const sx of [-2.2, 2.2]) for (const sz of [-2.8, 2.8]) column(g, x + sx, 0.25, z + sz, 4.4, 0.24);
    block(g, 5.2, 0.4, 0.4, M.red, x, 4.45, z - 2.8);
    block(g, 5.2, 0.4, 0.4, M.red, x, 4.45, z + 2.8);
    block(g, 0.4, 0.4, 6.2, M.red, x, 4.6, z);
    const r = makeRoof(3.6, 4.2, 2.4, 0.8, 0.7);
    r.position.set(x, 4.95, z);
    g.add(r);
    plaque(g, '钟楼', x, 4.2, z + 2.95, 1.2, 0.5);
    const bellProf = [[0, 2.75], [0.35, 2.72], [0.55, 2.6], [0.68, 2.3], [0.75, 1.6], [0.82, 0.7], [0.98, 0.05], [0.92, 0]].map(([r2, y]) => new THREE.Vector2(r2, y));
    const bell = add(g, new THREE.LatheGeometry(bellProf, 28), std('#5d5135', { metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }), x, 1.4, z);
    bell.userData.noMerge = true;
    for (const yy of [0.4, 1.4, 2.2]) {
      const band = add(g, new THREE.TorusGeometry(yy < 1 ? 0.88 : yy < 2 ? 0.76 : 0.7, 0.04, 6, 28), M.bronze, x, 1.4 + yy, z);
      band.rotation.x = Math.PI / 2;
    }
    add(g, new THREE.TorusGeometry(0.22, 0.06, 6, 12), M.bronze, x, 4.25, z);
    // swinging striker log
    this.striker = new THREE.Group();
    this.striker.position.set(x - 2.0, 4.4, z);
    const log = add(this.striker, new THREE.CylinderGeometry(0.17, 0.17, 1.9, 10), M.wood, -0.1, -2.15, 0);
    log.rotation.z = Math.PI / 2;
    for (const dx of [-0.7, 0.5]) add(this.striker, new THREE.CylinderGeometry(0.015, 0.015, 2.15), M.dark, dx, -1.07, 0, 0, false);
    this.group.add(this.striker);
    for (const [px, pz] of [[27.5, -10], [36.5, -10], [36.5, 6]]) stoneLantern(g, px, 0, pz);
  }

  ringBell() {
    this.strikeT = 0;
  }

  private buildPond(g: THREE.Group) {
    const { x, z, r } = SPOTS.pond;
    const water = add(g, new THREE.CircleGeometry(r, 48), M.water, x, -0.25, z, 0, false);
    water.rotation.x = -Math.PI / 2;
    water.userData.noMerge = true;
    // stone rim
    const rr = mulberry32(5);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const s = add(g, new THREE.DodecahedronGeometry(0.45 + rr() * 0.25, 0), M.stone, x + Math.cos(a) * (r + 0.2), -0.05, z + Math.sin(a) * (r + 0.2));
      s.scale.y = 0.55;
      s.rotation.set(rr() * 3, rr() * 3, 0);
    }
    for (let i = 0; i < 22; i++) {
      const a = rr() * Math.PI * 2, d = 1.2 + rr() * (r - 2);
      const pad = add(g, new THREE.CircleGeometry(0.3 + rr() * 0.25, 14, 0.4, Math.PI * 2 - 0.4), M.pad, x + Math.cos(a) * d, -0.22, z + Math.sin(a) * d, 0, false);
      pad.rotation.set(-Math.PI / 2, 0, rr() * 6);
      if (i % 4 === 0) this.lotusFlower(g, x + Math.cos(a) * d, -0.1, z + Math.sin(a) * d, 1.2);
    }
    // koi
    for (let i = 0; i < 6; i++) {
      const fish = new THREE.Group();
      const body = add(fish, new THREE.SphereGeometry(0.2, 10, 6), std(i % 3 === 0 ? '#f3efe6' : '#e8692a'), 0, 0, 0, 0, false);
      body.scale.set(0.55, 0.45, 1.4);
      const tail = add(fish, new THREE.ConeGeometry(0.12, 0.25, 4), std('#e8692a'), 0, 0, -0.32, 0, false);
      tail.rotation.x = -Math.PI / 2;
      fish.position.set(x, -0.42, z);
      this.group.add(fish);
      this.koi.push({ mesh: fish, r: 1.5 + i * 0.65, speed: (0.15 + rr() * 0.2) * (i % 2 ? 1 : -1), ph: rr() * 6 });
    }
    // hexagonal pavilion with a bench
    const px = SPOTS.pondBench.x, pz = SPOTS.pondBench.z + 0.7;
    block(g, 5.2, 0.2, 5.2, M.stone, px, 0, pz);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const cx = px + Math.cos(a) * 2.1, czz = pz + Math.sin(a) * 2.1;
      column(g, cx, 0.2, czz, 2.8, 0.17);
      circle(cx, czz, 0.2);
    }
    const pr = makeRoof(3.0, 3.0, 1.7, 0, 0.55);
    pr.position.set(px, 3.0, pz);
    g.add(pr);
    block(g, 1.6, 0.42, 0.5, M.wood, px, 0.2, pz - 0.2);
  }

  private buildSutraTerrace(g: THREE.Group) {
    const Y = TERRACE_Y;
    stairs(g, 10, 14, -24, 0, -36, Y, 12);
    // retaining wall below the terrace
    block(g, 24, Y + 2, 0.8, M.stoneDark, -2, -2, -35.6);
    block(g, 2, Y + 2, 0.8, M.stoneDark, 15, -2, -35.6);
    paving(g, -14, 16, -50, -36, Y + 0.01, 3.5);
    for (let x = -13.5; x <= 15.6; x += 1.5) if (x < 9.5 || x > 14.5) block(g, 0.22, 0.75, 0.22, M.white, x, Y, -36.2);
    // the pavilion
    const cz = -45.2;
    block(g, 14, 0.5, 6.6, M.stone, 0, Y, cz);
    const B = Y + 0.5;
    const walls = block(g, 12.6, 3.2, 5.0, M.red, 0, B, cz - 0.1);
    walls.userData.occluder = true;
    const lat = latticeTexture();
    lat.repeat.set(4, 1);
    block(g, 8.2, 2.8, 0.1, new THREE.MeshStandardMaterial({ map: lat }), 0, B, cz + 2.45).userData.noMerge = true;
    for (const x of [-6.2, -4.2, 4.2, 6.2]) column(g, x, B, cz + 2.7, 3.3, 0.22);
    block(g, 13.2, 0.3, 0.5, M.teal, 0, B + 3.2, cz + 2.65);
    const r1 = makeRoof(7.8, 4.2, 1.3, 3.4, 0.6);
    r1.position.set(0, B + 3.5, cz);
    g.add(r1);
    const upper = block(g, 9.6, 2.4, 3.8, M.red, 0, B + 4.2, cz);
    upper.userData.occluder = true;
    for (let x = -4.8; x <= 4.81; x += 0.8) block(g, 0.12, 0.6, 0.12, M.white, x, B + 4.2, cz + 2.15);
    block(g, 9.8, 0.1, 0.12, M.white, 0, B + 4.8, cz + 2.15);
    const r2 = makeRoof(6.8, 3.4, 2.2, 2.6, 0.6);
    r2.position.set(0, B + 6.6, cz);
    g.add(r2);
    plaque(g, '藏经阁', 0, B + 5.5, cz + 1.95, 2.4, 0.8);
    // lectern with an open scroll
    const { x: lx, z: lz } = SPOTS.lectern;
    block(g, 0.9, 0.9, 0.5, M.wood, lx, Y, lz - 1.0);
    const scroll = add(g, new THREE.PlaneGeometry(0.8, 0.42), std('#efe3c4', { side: THREE.DoubleSide }), lx, Y + 0.95, lz - 0.98, 0, false);
    scroll.rotation.x = -Math.PI / 2 + 0.35;
    for (const s of [-1, 1]) add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.5), M.wood, lx + s * 0.42, Y + 0.96, lz - 0.98).rotation.x = Math.PI / 2 + 0.35;
    for (const [x, z] of [[-11, -38], [14, -38], [-11, -48]]) stoneLantern(g, x, Y, z);
  }

  private buildSummit(g: THREE.Group) {
    const Y = SUMMIT_Y;
    stairs(g, 8, 12, -50, TERRACE_Y, -72, Y, 26);
    paving(g, 0, 20, -86, -72, Y + 0.01, 3);
    block(g, 21, 3, 15, M.stoneDark, 10, Y - 3, -79);
    for (let x = 0.3; x <= 19.8; x += 1.6) for (const z of [-85.7, -72.3]) if (z < -80 || x < 7.5 || x > 12.5) block(g, 0.25, 0.7, 0.25, M.stone, x, Y, z);
    for (let z = -85.7; z <= -72.3; z += 1.6) for (const x of [0.3, 19.7]) block(g, 0.25, 0.7, 0.25, M.stone, x, Y, z);
    // small stone pagoda
    const px = 10, pz = -82;
    block(g, 2.6, 0.6, 2.6, M.stone, px, Y, pz);
    let y = Y + 0.6;
    for (let i = 0; i < 5; i++) {
      const w = 1.7 - i * 0.22;
      block(g, w, 0.75, w, M.white, px, y, pz);
      y += 0.75;
      const eave = add(g, new THREE.CylinderGeometry(w * 0.62, w * 0.82, 0.22, 4), M.tileCap, px, y + 0.11, pz, Math.PI / 4);
      eave.castShadow = true;
      y += 0.22;
    }
    add(g, new THREE.ConeGeometry(0.18, 1.3, 8), M.gold, px, y + 0.65, pz);
    const c = SPOTS.summitSeat;
    add(g, new THREE.CylinderGeometry(0.42, 0.45, 0.16, 16), M.cushion, c.x, Y + 0.08, c.z);
  }

  /** Wooden barriers in front of each locked area. */
  private buildGates() {
    for (const gate of GATES) {
      const grp = new THREE.Group();
      const rank = UNLOCKS.area.indexOf(gate.area);
      for (const s of [-1, 1]) block(grp, 0.2, 1.4, 0.2, M.wood, s * (gate.w / 2 - 0.1), 0, 0);
      for (const yy of [0.5, 1.0]) block(grp, gate.w, 0.12, 0.08, M.wood, 0, yy, 0);
      plaque(grp, RANKS[rank].zh, 0, 1.55, 0.06, 0.9, 0.42);
      grp.position.set(gate.x, gateY(gate.area), gate.z);
      grp.rotation.y = gate.ry;
      this.gates.set(gate.area, grp);
      this.group.add(grp);
    }
  }

  setUnlocked(isOpen: (a: AreaId) => boolean) {
    for (const [area, grp] of this.gates) grp.visible = !isOpen(area);
  }

  // ---------- fallen pine needles for sweeping ----------
  setLeafPiles(date: string, swept: number) {
    for (const p of this.leafPiles) this.group.remove(p.mesh);
    this.leafPiles = [];
    let seed = 0;
    for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rr = mulberry32(seed);
    const spots = [...SPOTS.leafSpots].sort(() => rr() - 0.5).slice(0, 5);
    spots.forEach((s, index) => {
      if (index < swept) return;
      const geos: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 26; i++) {
        const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * 0.8;
        const leaf = new THREE.BoxGeometry(0.28, 0.02, 0.05);
        leaf.rotateY(rr() * 6);
        leaf.translate(s.x + Math.cos(a) * d, 0.03 + rr() * 0.06 * (1 - d), s.z + Math.sin(a) * d);
        geos.push(clean(leaf));
      }
      const mesh = new THREE.Mesh(mergeGeometries(geos)!, M.leafPile);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.leafPiles.push({ mesh, x: s.x, z: s.z, index });
    });
  }
  removeLeafPile(p: LeafPile) {
    this.group.remove(p.mesh);
    this.leafPiles = this.leafPiles.filter((x) => x !== p);
  }

  setVatLevel(trips: number) {
    this.vatTarget = 0.4 + Math.min(trips, 3) * 0.2;
  }

  // ---------- smoke ----------
  private buildSmoke() {
    const N = 70;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 4), 4));
    const mat = new THREE.PointsMaterial({
      size: 0.9, map: softTexture(), transparent: true, depthWrite: false, vertexColors: true, sizeAttenuation: true,
    });
    this.smoke = new THREE.Points(geo, mat);
    this.smoke.frustumCulled = false;
    for (let i = 0; i < N; i++) this.smokeData.push({ x: 0, y: -100, z: 0, vx: 0, vz: 0, life: Math.random() * 6, max: 6 });
    this.group.add(this.smoke);
  }

  update(dt: number) {
    this.time += dt;
    const { x: bx, z: bz } = SPOTS.burner;
    const pos = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.smoke.geometry.attributes.color as THREE.BufferAttribute;
    const strength = 1 + this.offerSticks.children.length * 0.4;
    this.smokeData.forEach((p, i) => {
      p.life += dt;
      if (p.life > p.max) {
        p.life = 0;
        p.max = 4 + Math.random() * 3;
        p.x = bx + (Math.random() - 0.5) * 0.6;
        p.z = bz + (Math.random() - 0.5) * 0.6;
        p.y = 2.2;
        p.vx = 0.08 + Math.random() * 0.08;
        p.vz = (Math.random() - 0.5) * 0.08;
      }
      const t = p.life / p.max;
      p.y += dt * (0.45 - t * 0.2);
      p.x += dt * (p.vx + Math.sin(this.time * 0.9 + i) * 0.08);
      p.z += dt * (p.vz + Math.cos(this.time * 0.7 + i) * 0.06);
      pos.setXYZ(i, p.x, p.y, p.z);
      const a = Math.min(1, t * 6) * (1 - t) * 0.32 * Math.min(1.6, strength);
      col.setXYZW(i, 0.93, 0.92, 0.9, a);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
    (this.smoke.material as THREE.PointsMaterial).size = 0.7 + 0.2 * Math.sin(this.time);

    // offered sticks burn down over 4 minutes
    for (const b of [...this.offerSticks.children]) {
      const age = this.time - (b.userData.born as number);
      b.scale.y = Math.max(0.2, 1 - age / 240);
      b.position.y = 1.66 * (1 - b.scale.y);
      if (age > 240) this.offerSticks.remove(b);
    }

    this.vatLevel += (this.vatTarget - this.vatLevel) * Math.min(1, dt * 1.5);
    this.vatWater.position.y = this.vatLevel;

    if (this.strikeT >= 0) {
      this.strikeT += dt;
      const t = this.strikeT;
      // pull back, swing in, then damped sway
      const a = t < 0.6 ? -0.5 * Math.sin((t / 0.6) * Math.PI * 0.5) : t < 0.8 ? -0.5 + ((t - 0.6) / 0.2) * 0.62 : 0.12 * Math.exp(-(t - 0.8) * 1.2) * Math.cos((t - 0.8) * 4);
      this.striker.rotation.z = a;
      if (t > 5) {
        this.strikeT = -1;
        this.striker.rotation.z = 0;
      }
    }

    const { x: px, z: pz } = SPOTS.pond;
    for (const k of this.koi) {
      const a = this.time * k.speed + k.ph;
      const wob = Math.sin(this.time * 0.4 + k.ph) * 0.5;
      k.mesh.position.set(px + Math.cos(a) * (k.r + wob), -0.42, pz + Math.sin(a) * (k.r + wob));
      k.mesh.rotation.y = -a + (k.speed > 0 ? Math.PI : 0);
    }

    const flicker = 0.85 + Math.sin(this.time * 9) * 0.05 + Math.sin(this.time * 23) * 0.04;
    this.candleLight.intensity = 18 * flicker;
    M.lantern.emissiveIntensity = 0.6 * flicker;
  }
}

export function gateY(area: AreaId): number {
  return area === 'summit' ? TERRACE_Y : 0;
}

/** Merge static meshes by material to cut draw calls (keeps meshes flagged noMerge). */
function mergeStatic(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const remove: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.noMerge || m.userData.occluder || Array.isArray(m.material) || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    let ancestorSkip = false;
    m.traverseAncestors((a) => { if (a.userData.noMerge) ancestorSkip = true; });
    if (ancestorSkip) return;
    const key = m.material as THREE.Material;
    const b = buckets.get(key) ?? { geos: [], cast: false };
    b.geos.push(clean(m.geometry.clone()).applyMatrix4(m.matrixWorld));
    b.cast ||= m.castShadow;
    buckets.set(key, b);
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  for (const [mat, b] of buckets) {
    const merged = new THREE.Mesh(mergeGeometries(b.geos)!, mat);
    merged.castShadow = b.cast;
    merged.receiveShadow = true;
    root.add(merged);
  }
}
