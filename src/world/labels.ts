// Small HTML name labels that float above each monk.
import * as THREE from 'three';

interface Label { el: HTMLDivElement; anchor: THREE.Object3D }

export class Labels {
  private layer = document.createElement('div');
  private labels = new Map<string, Label>();
  private v = new THREE.Vector3();

  constructor() {
    this.layer.className = 'labels';
    document.body.appendChild(this.layer);
  }

  set(id: string, anchor: THREE.Object3D, text: string, self = false) {
    let l = this.labels.get(id);
    if (!l) {
      const el = document.createElement('div');
      el.className = 'label' + (self ? ' self' : '');
      this.layer.appendChild(el);
      l = { el, anchor };
      this.labels.set(id, l);
    }
    l.anchor = anchor;
    if (l.el.textContent !== text) l.el.textContent = text;
  }

  remove(id: string) {
    const l = this.labels.get(id);
    if (l) {
      l.el.remove();
      this.labels.delete(id);
    }
  }

  update(camera: THREE.PerspectiveCamera) {
    const w = innerWidth, h = innerHeight;
    for (const l of this.labels.values()) {
      l.anchor.getWorldPosition(this.v);
      const d = this.v.distanceTo(camera.position);
      this.v.project(camera);
      const visible = this.v.z < 1 && d < 30 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1;
      if (!visible) {
        l.el.style.opacity = '0';
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      l.el.style.opacity = String(Math.min(1, (30 - d) / 8));
    }
  }
}
