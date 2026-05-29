/**
 * GPU-friendly burst / emission particles with object pool and additive blending.
 */

import * as THREE from 'three';
import { particleVertex, particleFragment } from './shaders.js';

export class ParticleField {
  constructor(max = 2800) {
    this.max = max;
    this.geom = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3);
    const vel = new Float32Array(max * 3);
    const life = new Float32Array(max);
    const seed = new Float32Array(max);
    for (let i = 0; i < max; i++) {
      pos[i * 3 + 2] = -20;
    }

    this.pos = pos;
    this.vel = vel;
    this.life = life;
    this.seed = seed;
    this.active = 0;
    this.write = 0;

    this.geom.setAttribute('aPos', new THREE.BufferAttribute(pos, 3));
    this.geom.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    this.geom.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    this.geom.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.geom.setDrawRange(0, 0);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 14 },
        uColor: { value: new THREE.Color(1, 0.55, 0.2) },
      },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geom, this.mat);
    this.points.frustumCulled = false;
  }

  reset() {
    this.active = 0;
    this.write = 0;
    this.geom.setDrawRange(0, 0);
  }

  emitBurst(origin, count, speedScale = 1, spread = 1) {
    const p = this.pos;
    const v = this.vel;
    const lf = this.life;
    const sd = this.seed;
    const rnd = Math.random;

    for (let i = 0; i < count; i++) {
      const idx = this.write % this.max;
      this.write++;

      p[idx * 3 + 0] = origin.x + (rnd() - 0.5) * 0.02;
      p[idx * 3 + 1] = origin.y + (rnd() - 0.5) * 0.02;
      p[idx * 3 + 2] = origin.z + (rnd() - 0.5) * 0.02;

      const vx = (rnd() - 0.5) * 2 * spread;
      const vy = (rnd() - 0.5) * 2 * spread;
      const vz = (rnd() - 0.5) * 2 * spread;
      const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const s = (0.35 + rnd() * 1.2) * speedScale;
      v[idx * 3 + 0] = (vx / len) * s;
      v[idx * 3 + 1] = (vy / len) * s;
      v[idx * 3 + 2] = (vz / len) * s;

      lf[idx] = rnd();
      sd[idx] = rnd() * 1000;

      this.active = Math.min(this.max, this.active + 1);
    }

    this.geom.attributes.aPos.needsUpdate = true;
    this.geom.attributes.aVel.needsUpdate = true;
    this.geom.attributes.aLife.needsUpdate = true;
    this.geom.attributes.aSeed.needsUpdate = true;
    this.geom.setDrawRange(0, Math.min(this.max, this.active, this.write));
  }

  /** Emit a directional cone (e.g. beam) */
  emitCone(origin, dir, count, spread = 0.15) {
    const p = this.pos;
    const v = this.vel;
    const lf = this.life;
    const sd = this.seed;
    const rnd = Math.random;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const nz = dz / len;

    for (let i = 0; i < count; i++) {
      const idx = this.write % this.max;
      this.write++;

      p[idx * 3 + 0] = origin.x;
      p[idx * 3 + 1] = origin.y;
      p[idx * 3 + 2] = origin.z;

      const ox = (rnd() - 0.5) * spread;
      const oy = (rnd() - 0.5) * spread;
      const oz = (rnd() - 0.5) * spread;
      const vx = nx + ox;
      const vy = ny + oy;
      const vz = nz + oz;
      const L = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      const s = 0.6 + rnd() * 1.4;

      v[idx * 3 + 0] = (vx / L) * s;
      v[idx * 3 + 1] = (vy / L) * s;
      v[idx * 3 + 2] = (vz / L) * s;

      lf[idx] = rnd();
      sd[idx] = rnd() * 1000;
    }

    this.geom.attributes.aPos.needsUpdate = true;
    this.geom.attributes.aVel.needsUpdate = true;
    this.geom.attributes.aLife.needsUpdate = true;
    this.geom.attributes.aSeed.needsUpdate = true;
    this.active = Math.min(this.max, this.active + count);
    this.geom.setDrawRange(0, Math.min(this.max, this.write));
  }

  setTime(t) {
    this.mat.uniforms.uTime.value = t;
  }

  setIntensity(velMul) {
    this.mat.uniforms.uSize.value = 10 + velMul * 18;
  }

  dispose() {
    this.geom.dispose();
    this.mat.dispose();
  }
}
