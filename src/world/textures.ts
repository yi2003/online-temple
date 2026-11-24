// Small procedural canvas textures (paving, plaques, lattice, soft particles).
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Irregular grey flagstones with moss in the joints. */
export function pavingTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#6f7069';
  g.fillRect(0, 0, 512, 512);
  const rows = 8;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rh * 0.5 : 0;
    while (x < 512) {
      const w = rh * (0.9 + rnd() * 0.9);
      const l = 58 + rnd() * 14;
      g.fillStyle = `hsl(${40 + rnd() * 20}, ${6 + rnd() * 6}%, ${l}%)`;
      g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
      // speckle
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '40,40,35' : '230,228,215'},${0.05 + rnd() * 0.08})`;
        g.fillRect(x + rnd() * w, r * rh + rnd() * rh, 2 + rnd() * 4, 2 + rnd() * 3);
      }
      // moss in joints
      if (rnd() < 0.35) {
        g.fillStyle = 'rgba(80,110,60,0.35)';
        g.fillRect(x, r * rh + rh - 5, w * rnd(), 5);
      }
      x += w;
    }
  }
  return tex(c, 1);
}

/** Plain stone for platforms and steps. */
export function stoneTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8c8a80';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '50,50,45' : '220,218,205'},${0.04 + rnd() * 0.07})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 5, 1 + rnd() * 3);
  }
  g.strokeStyle = 'rgba(40,40,35,0.35)';
  g.lineWidth = 2;
  for (let y = 0; y <= 256; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
    for (let x = (y / 64) % 2 ? 0 : 64; x < 256; x += 128) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 64);
      g.stroke();
    }
  }
  return tex(c, 1);
}

/** Wooden floorboards for inside the hall. */
export function woodFloorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `hsl(25, ${35 + rnd() * 10}%, ${24 + rnd() * 6}%)`;
    g.fillRect(0, i * 32, 256, 32);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, i * 32, 256, 2);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = 'rgba(255,220,180,0.05)';
      g.fillRect(0, i * 32 + 4 + rnd() * 24, 256, 1);
    }
  }
  return tex(c, 1);
}

/** Red lattice window panels (格扇). */
export function latticeTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#8f2a20';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#e9d8b8';
  g.fillRect(14, 14, 100, 150);
  g.strokeStyle = '#8f2a20';
  g.lineWidth = 5;
  for (let i = 0; i <= 6; i++) {
    g.beginPath();
    g.moveTo(14 + (i * 100) / 6, 14);
    g.lineTo(14 + (i * 100) / 6, 164);
    g.stroke();
  }
  for (let i = 0; i <= 9; i++) {
    g.beginPath();
    g.moveTo(14, 14 + (i * 150) / 9);
    g.lineTo(114, 14 + (i * 150) / 9);
    g.stroke();
  }
  g.fillStyle = '#7a221a';
  g.fillRect(20, 180, 88, 60);
  g.strokeStyle = '#c99a3a';
  g.lineWidth = 2;
  g.strokeRect(26, 186, 76, 48);
  return tex(c, 1);
}

/** Vertical plaque with gold characters. */
export function plaqueTexture(text: string, vertical = false): THREE.CanvasTexture {
  const [c, g] = vertical ? canvas(128, 384) : canvas(512, 160);
  g.fillStyle = '#14233a';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#c8a046';
  g.lineWidth = 10;
  g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = '#e2bd5c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${vertical ? 76 : 96}px "Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC",serif`;
  if (vertical) {
    [...text].forEach((ch, i, a) => g.fillText(ch, 64, (384 / (a.length + 1)) * (i + 1)));
  } else {
    const chars = [...text];
    chars.forEach((ch, i) => g.fillText(ch, (512 / (chars.length + 1)) * (i + 1), 84));
  }
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft round puff for smoke, mist and glows. */
export function softTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Wide horizontal mist band for the valley. */
export function mistTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * 512, y = 40 + rnd() * 50, r = 30 + rnd() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = tex(c, 1);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
