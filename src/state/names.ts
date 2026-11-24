// Calm two-character dharma names. Each half carries its pinyin.
const FIRST: [string, string][] = [
  ['明', 'Ming'], ['清', 'Qing'], ['慧', 'Hui'], ['静', 'Jing'], ['了', 'Liao'], ['悟', 'Wu'],
  ['空', 'Kong'], ['一', 'Yi'], ['澄', 'Cheng'], ['寂', 'Ji'], ['觉', 'Jue'], ['安', 'An'],
  ['宁', 'Ning'], ['圆', 'Yuan'], ['真', 'Zhen'], ['若', 'Ruo'], ['心', 'Xin'], ['常', 'Chang'],
];
const SECOND: [string, string][] = [
  ['山', 'Shan'], ['泉', 'Quan'], ['云', 'Yun'], ['松', 'Song'], ['尘', 'Chen'], ['石', 'Shi'],
  ['月', 'Yue'], ['风', 'Feng'], ['竹', 'Zhu'], ['溪', 'Xi'], ['林', 'Lin'], ['舟', 'Zhou'],
  ['莲', 'Lian'], ['雪', 'Xue'], ['岩', 'Yan'], ['光', 'Guang'], ['海', 'Hai'], ['灯', 'Deng'],
];

export interface DharmaName {
  zh: string;
  en: string;
}

export function randomName(rand: () => number = Math.random): DharmaName {
  const a = FIRST[Math.floor(rand() * FIRST.length)];
  const b = SECOND[Math.floor(rand() * SECOND.length)];
  return { zh: a[0] + b[0], en: a[1] + b[1] };
}

/** Deterministic PRNG so simulated monks keep the same names between visits. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Names travel over the network as two indices, so no free text is ever shown to others. */
export function nameToIndices(n: DharmaName): [number, number] | null {
  const a = FIRST.findIndex((f) => n.zh.startsWith(f[0]));
  const b = SECOND.findIndex((f) => n.zh.endsWith(f[0]));
  return a >= 0 && b >= 0 ? [a, b] : null;
}
export function nameFromIndices(a: number, b: number): DharmaName | null {
  const f = FIRST[a], s = SECOND[b];
  return f && s ? { zh: f[0] + s[0], en: f[1] + s[1] } : null;
}
export const NAME_PARTS = { first: FIRST.length, second: SECOND.length };
