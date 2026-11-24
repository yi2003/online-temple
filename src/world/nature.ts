// Pines, bamboo, blossom trees, rocks and grass, drawn with instancing so phones cope.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../state/names.ts';

const rand = mulberry32(2024);
const r = (a: number, b: number) => a + rand() * (b - a);

/** Strip a geometry down to position/normal/uv, non-indexed, so prototypes merge cleanly. */
export function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  return out;
}

function placed(g: THREE.BufferGeometry, pos: THREE.Vector3, rot: THREE.Euler, scale: THREE.Vector3): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scale);
  return clean(g.clone()).applyMatrix4(m);
}

/** One pine: a leaning trunk with a few branches ending in flat cloud-like pads (like ink paintings). */
function pinePrototype(seed: number): { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const rr = mulberry32(seed);
  const R = (a: number, b: number) => a + rr() * (b - a);
  const trunks: THREE.BufferGeometry[] = [];
  const pads: THREE.BufferGeometry[] = [];
  const h = R(5.5, 8);
  const lean = R(-0.18, 0.18);
  const trunk = new THREE.CylinderGeometry(0.16, 0.32, h, 7, 4);
  trunk.translate(0, h / 2, 0);
  // bend the trunk a little
  const p = trunk.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + Math.sin((y / h) * 2.2) * lean * h * 0.4);
  }
  trunk.computeVertexNormals();
  trunks.push(clean(trunk));
  const pad = new THREE.IcosahedronGeometry(1, 1);
  const top = new THREE.Vector3(Math.sin(2.2) * lean * h * 0.4, h, 0);
  pads.push(placed(pad, top, new THREE.Euler(0, R(0, 6), 0), new THREE.Vector3(R(1.8, 2.4), R(0.55, 0.75), R(1.6, 2.2))));
  const branches = 3 + Math.floor(rr() * 3);
  for (let b = 0; b < branches; b++) {
    const y = h * R(0.45, 0.88);
    const a = R(0, Math.PI * 2);
    const len = R(1.4, 2.6) * (1.1 - y / h);
    const base = new THREE.Vector3(Math.sin((y / h) * 2.2) * lean * h * 0.4, y, 0);
    const dir = new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)).normalize();
    const end = base.clone().addScaledVector(dir, len * 1.6);
    const br = new THREE.CylinderGeometry(0.05, 0.1, len * 1.6, 5);
    br.translate(0, (len * 1.6) / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    br.applyQuaternion(q).translate(base.x, base.y, base.z);
    trunks.push(clean(br));
    pads.push(placed(pad, end, new THREE.Euler(0, R(0, 6), 0), new THREE.Vector3(R(1.2, 1.9), R(0.4, 0.6), R(1.1, 1.7))));
  }
  return { trunk: mergeGeometries(trunks)!, leaves: mergeGeometries(pads)! };
}

const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 1 });
const pineMat = new THREE.MeshStandardMaterial({ color: '#3d5a3a', roughness: 0.9, flatShading: true });

export class Pines {
  group = new THREE.Group();
  constructor(spots: { x: number; y: number; z: number; s?: number }[]) {
    const protos = [11, 23, 37, 41, 53, 67].map(pinePrototype);
    const buckets: { x: number; y: number; z: number; s: number; ry: number }[][] = protos.map(() => []);
    spots.forEach((s, i) => buckets[i % protos.length].push({ ...s, s: s.s ?? r(0.8, 1.25), ry: r(0, Math.PI * 2) }));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    protos.forEach((proto, k) => {
      const list = buckets[k];
      if (!list.length) return;
      const trunks = new THREE.InstancedMesh(proto.trunk, trunkMat, list.length);
      const leaves = new THREE.InstancedMesh(proto.leaves, pineMat, list.length);
      list.forEach((t, i) => {
        q.setFromEuler(new THREE.Euler(0, t.ry, 0));
        m.compose(new THREE.Vector3(t.x, t.y - 0.1, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
        trunks.setMatrixAt(i, m);
        leaves.setMatrixAt(i, m);
        // vary the green a little per tree
        leaves.setColorAt(i, new THREE.Color().setHSL(0.3 + r(-0.03, 0.03), r(0.2, 0.32), r(0.24, 0.32)));
      });
      for (const im of [trunks, leaves]) {
        im.castShadow = true;
        im.receiveShadow = true;
        this.group.add(im);
      }
    });
  }
}

export class Bamboo {
  group = new THREE.Group();
  stalks: THREE.InstancedMesh;
  leaves: THREE.InstancedMesh;
  private base: { x: number; y: number; z: number; h: number; ph: number; tilt: number; ry: number }[] = [];
  constructor(spots: { x: number; y: number; z: number }[]) {
    for (const s of spots) {
      const n = 4 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        this.base.push({
          x: s.x + r(-0.6, 0.6), y: s.y, z: s.z + r(-0.6, 0.6),
          h: r(5, 8.5), ph: r(0, 6), tilt: r(0.02, 0.09), ry: r(0, 6.28),
        });
      }
    }
    const stalkGeo = new THREE.CylinderGeometry(0.05, 0.07, 1, 6, 1);
    stalkGeo.translate(0, 0.5, 0);
    this.stalks = new THREE.InstancedMesh(stalkGeo, new THREE.MeshStandardMaterial({ color: '#6f9a47', roughness: 0.6 }), this.base.length);
    // each stalk carries three leaf tufts
    const tuft = new THREE.IcosahedronGeometry(0.42, 0);
    tuft.scale(1, 0.35, 1);
    this.leaves = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: '#6d9a45', roughness: 0.8, flatShading: true }), this.base.length * 3);
    this.stalks.castShadow = this.leaves.castShadow = true;
    this.group.add(this.stalks, this.leaves);
    this.update(0);
  }
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  update(time: number) {
    this.base.forEach((b, i) => {
      const sway = Math.sin(time * 0.8 + b.ph) * 0.03 + b.tilt;
      this.e.set(sway, b.ry, sway * 0.6);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(b.x, b.y, b.z), this.q, this.s.set(1, b.h, 1));
      this.stalks.setMatrixAt(i, this.m);
      for (let k = 0; k < 3; k++) {
        const up = new THREE.Vector3(0, b.h * (0.7 + k * 0.12), 0).applyQuaternion(this.q);
        this.m.compose(
          this.v.set(b.x + up.x + Math.cos(b.ph + k * 2) * 0.35, b.y + up.y, b.z + up.z + Math.sin(b.ph + k * 2) * 0.35),
          this.q,
          this.s.set(1 - k * 0.15, 1, 1 - k * 0.15),
        );
        this.leaves.setMatrixAt(i * 3 + k, this.m);
      }
    });
    this.stalks.instanceMatrix.needsUpdate = true;
    this.leaves.instanceMatrix.needsUpdate = true;
  }
}

/** Plum / cherry style blossom trees: dark trunk and soft pink puffs. */
export function blossomTrees(spots: { x: number; y: number; z: number }[]): THREE.Group {
  const g = new THREE.Group();
  const trunks: THREE.BufferGeometry[] = [];
  const puffs: THREE.BufferGeometry[] = [];
  const puff = new THREE.IcosahedronGeometry(0.9, 1);
  for (const s of spots) {
    const h = r(2.6, 3.6);
    const t = new THREE.CylinderGeometry(0.1, 0.18, h, 6);
    t.translate(s.x, s.y + h / 2, s.z);
    trunks.push(clean(t));
    for (let i = 0; i < 6; i++) {
      puffs.push(placed(puff, new THREE.Vector3(s.x + r(-1.2, 1.2), s.y + h + r(-0.5, 0.8), s.z + r(-1.2, 1.2)), new THREE.Euler(), new THREE.Vector3(1, 1, 1).multiplyScalar(r(0.7, 1.2))));
    }
  }
  const tm = new THREE.Mesh(mergeGeometries(trunks)!, trunkMat);
  const pm = new THREE.Mesh(mergeGeometries(puffs)!, new THREE.MeshStandardMaterial({ color: '#f2b9c4', roughness: 0.9, flatShading: true }));
  tm.castShadow = pm.castShadow = true;
  g.add(tm, pm);
  return g;
}

export function rocks(spots: { x: number; y: number; z: number; s: number }[]): THREE.Mesh {
  const geos = spots.map((s) =>
    placed(new THREE.DodecahedronGeometry(1, 0), new THREE.Vector3(s.x, s.y + s.s * 0.2, s.z), new THREE.Euler(r(0, 3), r(0, 3), r(0, 3)), new THREE.Vector3(s.s * r(0.9, 1.5), s.s * r(0.5, 0.9), s.s)),
  );
  const m = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshStandardMaterial({ color: '#8a877c', roughness: 1, flatShading: true }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function grassTufts(spots: { x: number; y: number; z: number }[]): THREE.InstancedMesh {
  // a tuft = three thin leaning blades
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.ConeGeometry(0.035, 0.3, 3);
    b.translate(0, 0.14, 0);
    b.rotateZ(0.25);
    b.rotateY((i / 3) * Math.PI * 2);
    blades.push(clean(b));
  }
  const blade = mergeGeometries(blades)!;
  const im = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#7d9b4f', roughness: 1 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((s, i) => {
    m.compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r(-0.2, 0.2), r(0, 6), r(-0.2, 0.2))), new THREE.Vector3(1, r(0.6, 1.5), 1));
    im.setMatrixAt(i, m);
    im.setColorAt(i, new THREE.Color().setHSL(r(0.2, 0.28), 0.35, r(0.32, 0.42)));
  });
  return im;
}
