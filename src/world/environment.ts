// Ground, sky, light, layered far mountains and drifting valley mist.
import * as THREE from 'three';
import { nearestZone, SPOTS, ZONES, zoneAt } from './layout.ts';
import { mistTexture } from './textures.ts';

// --- value noise ---
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Ground height everywhere: matches the walkable zones, falls to the valley south, rises north. */
export function terrainY(x: number, z: number): number {
  // under the raised hall platform the ground must stay below the courtyard paving
  const zn = zoneAt(x, z);
  if (zn && (zn.name === 'hall' || zn.name === 'hallSteps')) return -0.05;
  // stair blocks cover these ramps, so keep the ground well beneath them
  if (zn && ['steps', 'sutraPass', 'summitPass'].includes(zn.name)) return zn.h(x, z) - 0.6;
  const { d, y } = nearestZone(x, z);
  const pd = Math.hypot(x - SPOTS.pond.x, z - SPOTS.pond.z);
  if (pd < SPOTS.pond.r + 0.6) return -1.1 * smooth(SPOTS.pond.r + 0.6, SPOTS.pond.r - 1.5, pd) - 0.02;
  if (d < 0.001) return y - 0.02;
  // the temple sits on a ridge: everything falls away, except the far mountain behind it
  const north = smooth(-92, -135, z);
  const n = fbm(x * 0.035 + 10, z * 0.035) - 0.5;
  const rim = -0.25 * Math.min(d, 1.5);
  const fall = -(Math.min(d, 30) * 0.75 + Math.max(0, d - 30) * 0.25) * (1 - north);
  const rise = d * 0.55 * north;
  const bumps = n * Math.min(1, d / 6) * (8 + 10 * north);
  return y + rim + fall + rise + bumps;
}

export function buildTerrain(): THREE.Mesh {
  const W = 300, D = 280, SEG = 190;
  const geo = new THREE.PlaneGeometry(W, D, SEG, Math.round((SEG * D) / W));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -20);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grass = new THREE.Color('#6f8f4e');
  const grassDark = new THREE.Color('#4d6b3a');
  const moss = new THREE.Color('#7c9a58');
  const rock = new THREE.Color('#7b786d');
  const dirt = new THREE.Color('#8a7a5c');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = terrainY(x, z);
    pos.setY(i, y);
    const { d } = nearestZone(x, z);
    const n = fbm(x * 0.12, z * 0.12, 3);
    c.copy(grass).lerp(grassDark, n);
    if (d < 0.01) c.lerp(moss, 0.4).lerp(dirt, n * 0.3);
    // steep ground shows rock
    const slope = Math.abs(terrainY(x + 1, z) - y) + Math.abs(terrainY(x, z + 1) - y);
    c.lerp(rock, smooth(0.5, 1.6, slope) * 0.85);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  return mesh;
}

export const SKY_TOP = new THREE.Color('#9fbcd0');
export const SKY_HORIZON = new THREE.Color('#e7e2d3');
export const FOG_COLOR = new THREE.Color('#d9dcd2');

export function buildSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: SKY_TOP },
      horizon: { value: SKY_HORIZON },
      sunDir: { value: new THREE.Vector3(0.45, 0.5, 0.75).normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 col = mix(horizon, top, smoothstep(0.0, 0.55, h));
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.9, 0.7) * (pow(sun, 24.0) * 0.35 + pow(sun, 400.0) * 0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  sky.renderOrder = -10;
  return sky;
}

/** Layered ink-wash ridges in a ring around the temple, lighter as they recede. */
export function buildFarMountains(): THREE.Group {
  const g = new THREE.Group();
  const layers = [
    { r: 230, h: 70, base: -60, color: '#7f9188', amp: 1.0, f: 5 },
    { r: 320, h: 110, base: -70, color: '#9aaba6', amp: 1.2, f: 4 },
    { r: 430, h: 160, base: -80, color: '#b4c1bf', amp: 1.0, f: 3 },
    { r: 560, h: 210, base: -90, color: '#c9d1cc', amp: 1.0, f: 2.3 },
  ];
  layers.forEach((L, li) => {
    const seg = 220;
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const n = fbm(Math.cos(a) * L.f + li * 7, Math.sin(a) * L.f + li * 3, 5);
      // taller behind the temple (north), lower toward the valley (south)
      const northness = 0.55 + 0.45 * -Math.sin(a);
      const top = L.base + L.h * (0.25 + n * 1.1 * L.amp) * northness + 20;
      const x = Math.cos(a) * L.r, z = Math.sin(a) * L.r - 20;
      verts.push(x, L.base - 60, z, x, top, z);
      if (i < seg) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: L.color, fog: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -5 + li;
    g.add(m);
  });
  return g;
}

export class Mist {
  group = new THREE.Group();
  private bands: { mesh: THREE.Mesh; speed: number }[] = [];
  constructor() {
    const tex = mistTexture();
    const specs = [
      { y: -16, r: 120, h: 30, speed: 0.004, op: 0.8 },
      { y: -10, r: 170, h: 40, speed: -0.003, op: 0.7 },
      { y: -4, r: 240, h: 60, speed: 0.002, op: 0.65 },
      { y: 8, r: 380, h: 80, speed: -0.0015, op: 0.6 },
    ];
    for (const s of specs) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(6, 1);
      const mat = new THREE.MeshBasicMaterial({
        map: t, transparent: true, opacity: s.op, depthWrite: false, side: THREE.DoubleSide, fog: false, color: '#f3f1ea',
      });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, s.h, 64, 1, true), mat);
      mesh.position.set(0, s.y, -20);
      this.group.add(mesh);
      this.bands.push({ mesh, speed: s.speed });
    }
    // flat cloud sea in the valley
    const sea = new THREE.Mesh(
      new THREE.RingGeometry(60, 700, 64, 1),
      new THREE.MeshBasicMaterial({ color: '#eef0ea', transparent: true, opacity: 0.85, depthWrite: false, fog: false }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -22, -20);
    this.group.add(sea);
  }
  update(dt: number) {
    for (const b of this.bands) ((b.mesh.material as THREE.MeshBasicMaterial).map!).offset.x += b.speed * dt;
  }
}

export function buildLights(scene: THREE.Scene, quality: 'high' | 'low'): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight('#f4efe0', '#5d6b4a', 1.1));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(30, 45, 40);
  sun.castShadow = true;
  const size = quality === 'high' ? 2048 : 1024;
  sun.shadow.mapSize.set(size, size);
  const s = 28;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  return sun;
}

/** Which zones count as raised ground for scenery placement checks. */
export function insideAnyZone(x: number, z: number, margin = 0): boolean {
  return ZONES.some((zn) => x > zn.x0 - margin && x < zn.x1 + margin && z > zn.z0 - margin && z < zn.z1 + margin);
}
