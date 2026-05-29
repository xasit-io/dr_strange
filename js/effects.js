/**
 * Three.js scene: palm magic circles, orb, portal, shield, beam, trails, post-processing.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import {
  orbVertex,
  orbFragment,
  portalRingVertex,
  portalRingFragment,
  compositeVertex,
  compositeFragment,
  simpleRingVertex,
  simpleRingFragment,
} from './shaders.js';
import { LM } from './handTracking.js';
import { ParticleField } from './particles.js';
import { G } from './gestures.js';

const COLOR_GOLD = new THREE.Color(1.0, 0.72, 0.35);
const COLOR_DEEP = new THREE.Color(0.55, 0.12, 0.05);

function makeMagicRing(layerIndex, maxR) {
  const inner = maxR * (0.45 + layerIndex * 0.08);
  const outer = maxR * (0.62 + layerIndex * 0.1);
  const geo = new THREE.RingGeometry(inner, outer, 64);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpin: { value: layerIndex },
      uIntensity: { value: 0.85 - layerIndex * 0.08 },
      uLayer: { value: layerIndex },
      uColorInner: { value: COLOR_GOLD.clone() },
      uColorOuter: { value: COLOR_DEEP.clone() },
      uGestureBoost: { value: 1 },
    },
    vertexShader: simpleRingVertex,
    fragmentShader: simpleRingFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.z = layerIndex * 0.4;
  return mesh;
}

function makeShieldDisc() {
  const geo = new THREE.CircleGeometry(0.55, 48);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffaa55,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  return mesh;
}

export class MagicScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, this.width / this.height, 0.05, 200);
    this.camera.position.set(0, 0, 0.01);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloom = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.72,
      0.38,
      0.22,
    );
    this.bloomPass = bloom;
    this.composer.addPass(bloom);

    this.afterPass = new AfterimagePass(0.88);
    this.composer.addPass(this.afterPass);

    const compShader = {
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(this.width, this.height) },
        uHeat: { value: 0.35 },
        uChroma: { value: 0.55 },
        uVignette: { value: 1 },
        uRays: { value: 0.4 },
      },
      vertexShader: compositeVertex,
      fragmentShader: compositeFragment,
    };
    this.compPass = new ShaderPass(compShader);
    const compMat = this.compPass.material;
    if (compMat) {
      compMat.transparent = true;
      compMat.depthWrite = false;
      compMat.depthTest = false;
    }
    this.composer.addPass(this.compPass);

    this.particles = new ParticleField(3200);
    this.scene.add(this.particles.points);

    /** Palm anchors (max 2 hands) */
    this.handRoots = [new THREE.Group(), new THREE.Group()];
    this.scene.add(this.handRoots[0], this.handRoots[1]);

    this.rings = [[], []];
    for (let h = 0; h < 2; h++) {
      for (let i = 0; i < 4; i++) {
        const r = makeMagicRing(i, 1.0);
        this.handRoots[h].add(r);
        this.rings[h].push(r);
      }
    }

    this.shields = [makeShieldDisc(), makeShieldDisc()];
    this.handRoots[0].add(this.shields[0]);
    this.handRoots[1].add(this.shields[1]);

    const orbGeo = new THREE.IcosahedronGeometry(0.22, 5);
    this.orbMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uCharge: { value: 0.3 },
        uColor: { value: new THREE.Color(1, 0.45, 0.12) },
      },
      vertexShader: orbVertex,
      fragmentShader: orbFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.orb = new THREE.Mesh(orbGeo, this.orbMat);
    this.orb.visible = false;
    this.scene.add(this.orb);

    this.portal = new THREE.Group();
    const pRing = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.92, 96),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uOpen: { value: 0 },
          uColor: { value: new THREE.Color(1, 0.4, 0.08) },
        },
        vertexShader: portalRingVertex,
        fragmentShader: portalRingFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    pRing.rotation.x = Math.PI / 2;
    this.portal.add(pRing);
    this.portalMesh = pRing;
    this.portal.visible = false;
    this.portalScale = 0;
    this.scene.add(this.portal);

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.12, 3.5, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff7722,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.beam.visible = false;
    this.scene.add(this.beam);

    /** Motion trails */
    this.trailLen = 42;
    this.trails = [];
    for (let h = 0; h < 2; h++) {
      const positions = new Float32Array(this.trailLen * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({
        color: 0xff9933,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this.scene.add(line);
      this.trails.push({ points: [], geo, line, positions });
    }

    this.fxState = {
      bloom: true,
      chroma: true,
      motion: true,
      heat: true,
      rays: true,
      particles: true,
    };

    this._charge = 0;
    this._portalOpen = 0;

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    this.bloomPass.resolution.set(this.width, this.height);
    this.compPass.uniforms.uResolution.value.set(this.width, this.height);
  }

  /** Normalized landmark + z to world units at fixed depth plane */
  toWorld(nx, ny, nz = 0) {
    const aspect = this.width / Math.max(this.height, 1);
    const dist = 2.55;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * dist;
    const viewW = viewH * aspect;
    const x = (0.5 - nx) * viewW;
    const y = (0.5 - ny) * viewH;
    const z = -dist + nz * 0.65;
    return new THREE.Vector3(x, y, z);
  }

  palmOrientation(lm) {
    const w = this.toWorld(lm[LM.WRIST].x, lm[LM.WRIST].y, lm[LM.WRIST].z);
    const im = this.toWorld(lm[LM.INDEX_MCP].x, lm[LM.INDEX_MCP].y, lm[LM.INDEX_MCP].z);
    const pm = this.toWorld(lm[LM.PINKY_MCP].x, lm[LM.PINKY_MCP].y, lm[LM.PINKY_MCP].z);
    const palm = this.toWorld(
      (lm[LM.WRIST].x + lm[LM.INDEX_MCP].x + lm[LM.PINKY_MCP].x + lm[LM.MIDDLE_MCP].x) * 0.25,
      (lm[LM.WRIST].y + lm[LM.INDEX_MCP].y + lm[LM.PINKY_MCP].y + lm[LM.MIDDLE_MCP].y) * 0.25,
      (lm[LM.WRIST].z + lm[LM.INDEX_MCP].z + lm[LM.PINKY_MCP].z + lm[LM.MIDDLE_MCP].z) * 0.25,
    );
    const along = im.clone().sub(w);
    const across = pm.clone().sub(w);
    const normal = along.clone().cross(across).normalize();
    const tangentX = along.clone().normalize();
    const tangentY = normal.clone().cross(tangentX).normalize();
    const mx = new THREE.Matrix4().makeBasis(tangentX, tangentY, normal);
    const q = new THREE.Quaternion().setFromRotationMatrix(mx);
    return { palm, quat: q, normal };
  }

  updateHandRoot(hIndex, lm, velocity, gestureBoost) {
    const { palm, quat } = this.palmOrientation(lm);
    const root = this.handRoots[hIndex];
    root.position.copy(palm);
    root.quaternion.copy(quat);

    const speed = Math.min(2.5, velocity * 0.45);
    const t = performance.now() * 0.001;
    this.rings[hIndex].forEach((ring, i) => {
      const m = ring.material;
      m.uniforms.uTime.value = t;
      m.uniforms.uGestureBoost.value = gestureBoost;
      ring.rotation.z += 0.012 * (1 + i * 0.15) * (1.1 + speed);
      const sc = 0.75 + speed * 0.12 + i * 0.06;
      ring.scale.setScalar(sc);
    });

    const trail = this.trails[hIndex];
    trail.points.unshift(palm.clone());
    if (trail.points.length > this.trailLen) trail.points.length = this.trailLen;
    const n = trail.points.length;
    for (let i = 0; i < n; i++) {
      trail.positions[i * 3 + 0] = trail.points[i].x;
      trail.positions[i * 3 + 1] = trail.points[i].y;
      trail.positions[i * 3 + 2] = trail.points[i].z;
    }
    trail.geo.setDrawRange(0, n);
    trail.geo.attributes.position.needsUpdate = true;
    trail.line.material.opacity = 0.35 + Math.min(0.45, speed * 0.2);
  }

  clearHand(h) {
    this.handRoots[h].visible = false;
    this.shields[h].visible = false;
    this.trails[h].points.length = 0;
    this.trails[h].geo.setDrawRange(0, 0);
  }

  setFxEnabled(key, on) {
    this.fxState[key] = on;
    if (key === 'bloom') this.bloomPass.enabled = on;
    if (key === 'chroma') this.compPass.uniforms.uChroma.value = on ? 0.55 : 0;
    if (key === 'motion') this.afterPass.enabled = on;
    if (key === 'heat') this.compPass.uniforms.uHeat.value = on ? 0.38 : 0;
    if (key === 'rays') this.compPass.uniforms.uRays.value = on ? 0.45 : 0;
    if (key === 'particles') this.particles.points.visible = on;
  }

  /**
   * @param {object} param0
   * @param {ReturnType<import('./gestures.js').detectGestures>} param0.gesture
   * @param {import('./handTracking.js').HandTracker['latest']} param0.snapshot
   */
  renderFrame({ gesture, snapshot, time }) {
    const t = time * 0.001;
    this.orbMat.uniforms.uTime.value = t;
    if (this.portalMesh.material.uniforms)
      this.portalMesh.material.uniforms.uTime.value = t;

    const hands = snapshot.hands || [];
    const g = gesture.primary;

    for (let h = 0; h < 2; h++) {
      if (h < hands.length && hands[h].landmarks) {
        const gb =
          g === G.OPEN_PALM || g === G.FAST_MOVE || g === G.CLAP ? 1.35 : 1;
        this.handRoots[h].visible = true;
        this.updateHandRoot(h, hands[h].landmarks, hands[h].velocity, gb);
        this.shields[h].visible = g === G.OPEN_PALM;
        this.shields[h].rotation.z = t * 0.8;
      } else {
        this.clearHand(h);
      }
    }

    /** Orb on pinch */
    if (g === G.PINCH && gesture.pinchMid) {
      const p = gesture.pinchMid;
      this.orb.visible = true;
      this.orb.position.copy(this.toWorld(p.x, p.y, p.z));
      this.orbMat.uniforms.uCharge.value = 0.75;
      this._charge = Math.min(1, this._charge + 0.04);
    } else if (g === G.FIST && hands[0]) {
      this.orb.visible = true;
      this.orb.position.copy(
        this.toWorld(hands[0].palm.x, hands[0].palm.y, hands[0].palm.z),
      );
      this.orbMat.uniforms.uCharge.value = 0.95;
      this._charge = Math.min(1, this._charge + 0.06);
    } else {
      this.orbMat.uniforms.uCharge.value = THREE.MathUtils.lerp(
        this.orbMat.uniforms.uCharge.value,
        0.25,
        0.08,
      );
      this.orb.visible = g === G.PINCH || g === G.FIST;
      if (!this.orb.visible) this._charge *= 0.9;
    }

    this.orb.scale.setScalar(0.95 + this._charge * 0.35);

    /** Portal between palms */
    if (g === G.TWO_HANDS_WIDE && gesture.twoPalms && gesture.twoPalms.length === 2) {
      const a = this.toWorld(gesture.twoPalms[0].x, gesture.twoPalms[0].y, gesture.twoPalms[0].z);
      const b = this.toWorld(gesture.twoPalms[1].x, gesture.twoPalms[1].y, gesture.twoPalms[1].z);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      this.portal.visible = true;
      this.portal.position.copy(mid);
      this.portal.lookAt(this.camera.position);
      this._portalOpen = THREE.MathUtils.lerp(this._portalOpen, gesture.portalStrength, 0.06);
      const spread = a.distanceTo(b);
      const scl = 0.55 + spread * 2.2;
      this.portal.scale.setScalar(scl * (0.5 + this._portalOpen * 0.6));
      this.portalMesh.material.uniforms.uOpen.value = this._portalOpen;
      if (this.fxState.particles)
        this.particles.emitBurst(mid, 8 + Math.floor(this._portalOpen * 16), 0.8, 1.2);
    } else {
      this._portalOpen *= 0.92;
      this.portal.visible = this._portalOpen > 0.04;
      this.portal.scale.setScalar(
        THREE.MathUtils.lerp(this.portal.scale.x, 0.1, 0.12),
      );
      this.portalMesh.material.uniforms.uOpen.value = this._portalOpen;
    }

    /** Beam toward index tip when pointing */
    if (g === G.POINT && hands[0]) {
      const lm = hands[0].landmarks;
      const tip = this.toWorld(lm[LM.INDEX_TIP].x, lm[LM.INDEX_TIP].y, lm[LM.INDEX_TIP].z);
      const base = this.toWorld(lm[LM.INDEX_MCP].x, lm[LM.INDEX_MCP].y, lm[LM.INDEX_MCP].z);
      this.beam.visible = true;
      const dir = tip.clone().sub(base).normalize();
      const mid = base.clone().lerp(tip, 0.5);
      this.beam.position.copy(mid);
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      this.beam.setRotationFromQuaternion(quat);
      if (this.fxState.particles)
        this.particles.emitCone(tip, dir, 4, 0.2);
    } else {
      this.beam.visible = false;
    }

    /** Gesture-driven bursts */
    if (g === G.FAST_MOVE && hands.length) {
      const h0 = hands[0];
      const o = this.toWorld(h0.palm.x, h0.palm.y, h0.palm.z);
      if (this.fxState.particles)
        this.particles.emitBurst(o, 18, h0.velocity * 0.45, 1.3);
    }
    if (g === G.CLAP && gesture.twoPalms) {
      const mid = this.toWorld(
        (gesture.twoPalms[0].x + gesture.twoPalms[1].x) * 0.5,
        (gesture.twoPalms[0].y + gesture.twoPalms[1].y) * 0.5,
        (gesture.twoPalms[0].z + gesture.twoPalms[1].z) * 0.5,
      );
      if (this.fxState.particles) this.particles.emitBurst(mid, 80, 2.2, 2);
      this.compPass.uniforms.uHeat.value = 0.95;
    } else {
      this.compPass.uniforms.uHeat.value = THREE.MathUtils.lerp(
        this.compPass.uniforms.uHeat.value,
        this.fxState.heat ? 0.38 : 0,
        0.05,
      );
    }

    /** Particle ambience from palms */
    if (this.fxState.particles && hands.length) {
      hands.forEach((h) => {
        if (h.velocity > 0.5) {
          const o = this.toWorld(h.palm.x, h.palm.y, h.palm.z);
          this.particles.emitBurst(o, Math.floor(2 + h.velocity * 3), h.velocity * 0.25, 0.6);
        }
      });
    }

    this.particles.setTime(t);
    this.particles.setIntensity(hands[0]?.velocity || 0);

    this.compPass.uniforms.uTime.value = t;
    this.compPass.uniforms.tDiffuse.value = null;

    this.renderer.setClearColor(0x000000, 0);
    this.composer.render();
  }

  dispose() {
    this.renderer.dispose();
    this.composer.dispose();
    this.particles.dispose();
  }
}
