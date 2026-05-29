/**
 * GLSL shader sources — magic circle, orb, portal ring, heat distortion, composite VFX.
 */

export const magicCircleVertex = /* glsl */ `
uniform float uTime;
uniform float uSpin;
uniform float uPulse;
attribute vec3 instanceOffset;
attribute float instancePhase;
attribute float instanceLayer;
varying vec2 vUv;
varying float vPhase;
varying float vLayer;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vPhase = instancePhase;
  vLayer = instanceLayer;
  vec3 pos = position;
  float wobble = sin(uTime * 2.0 + instancePhase * 6.2831) * 0.02 * uPulse;
  pos.xy *= 1.0 + wobble + instanceLayer * 0.08;
  vec4 world = modelMatrix * instanceMatrix * vec4(pos, 1.0);
  vWorldPos = world.xyz + instanceOffset;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
`;

export const magicCircleFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColorInner;
uniform vec3 uColorOuter;
uniform float uGestureBoost;

varying vec2 vUv;
varying float vPhase;
varying float vLayer;

float aastep(float threshold, float value) {
  float afwidth = fwidth(value) * 0.7;
  return smoothstep(threshold - afwidth, threshold + afwidth, value);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float runes = sin(a * 13.0 + uTime * (2.5 + vLayer) + vPhase * 4.0)
    * sin(r * 28.0 - uTime * 3.0);
  float ring = abs(fract(r * 3.5 + vLayer * 0.15) - 0.5);
  ring = smoothstep(0.08, 0.0, ring) * (1.0 - smoothstep(0.92, 1.0, r));
  float spokes = aastep(0.35, abs(sin(a * 6.0 + uTime * 1.5)));
  float core = exp(-r * r * 3.0) * 0.4;
  float edge = smoothstep(0.98, 0.75, r) * smoothstep(0.2, 0.85, r);
  float alpha = (ring * 0.85 + core + edge * 0.6 + spokes * 0.2) * uIntensity;
  alpha += runes * 0.08 * (1.0 - r);
  alpha *= 0.45 + 0.55 * uGestureBoost;
  vec3 col = mix(uColorInner, uColorOuter, r + vLayer * 0.1);
  col += vec3(1.0, 0.7, 0.35) * ring * 0.5;
  gl_FragColor = vec4(col, alpha * (1.1 - r * 0.25));
}
`;

export const orbVertex = /* glsl */ `
uniform float uTime;
uniform float uScale;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorldPos;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 wPos = modelMatrix * vec4(position * uScale, 1.0);
  vWorldPos = wPos.xyz;
  vec4 mv = modelViewMatrix * vec4(position * uScale, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const orbFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uCharge;
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorldPos;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.x), f.y
  );
  return n;
}

float fbm(vec3 p) {
  float t = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    t += a * noise(p);
    p *= 2.1;
    a *= 0.5;
  }
  return t;
}

void main() {
  vec3 V = normalize(vView);
  vec3 N = normalize(vNormal);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 p = vWorldPos * 2.0 + uTime * vec3(0.15, 0.25, 0.1);
  float n = fbm(p);
  float bolts = smoothstep(0.55, 0.9, abs(sin(n * 18.0 - uTime * 8.0)));
  vec3 electric = vec3(1.0, 0.92, 0.75) * bolts * uCharge;
  vec3 core = uColor * (0.35 + n * 0.4);
  vec3 glow = mix(core, vec3(1.0, 0.55, 0.15), fres + 0.2 * uCharge);
  glow += electric;
  float alpha = 0.25 + fres * 0.55 + bolts * 0.35 * uCharge;
  alpha = clamp(alpha + uCharge * 0.15, 0.0, 0.95);
  gl_FragColor = vec4(glow, alpha);
}
`;

export const portalRingVertex = /* glsl */ `
uniform float uTime;
uniform float uOpen;
varying vec2 vUv;
varying vec3 vPos;

void main() {
  vUv = uv;
  vec3 pos = position;
  float wave = sin(length(pos.xy) * 12.0 - uTime * 6.0) * 0.03 * uOpen;
  pos.z += wave;
  vPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
}
`;

export const portalRingFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uOpen;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vPos;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float spokes = abs(sin(a * 24.0 + uTime * 4.0));
  float ring = smoothstep(0.52, 0.48, abs(r - 0.72)) * smoothstep(0.1, 0.95, r);
  float inner = smoothstep(0.55, 0.35, r) * uOpen;
  float sparks = spokes * ring * (0.4 + 0.6 * uOpen);
  vec3 col = uColor * (inner + ring * 1.2 + sparks);
  float alpha = (inner * 0.35 + ring * 0.85 + sparks * 0.5) * uOpen;
  alpha *= smoothstep(1.0, 0.15, r);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

export const particleVertex = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aVel;
attribute float aLife;
attribute float aSeed;
uniform float uTime;
uniform float uSize;

void main() {
  float t = fract(uTime * 0.5 + aSeed);
  vec3 pos = aPos + aVel * t * 1.8;
  pos += sin(uTime * 3.0 + aSeed * 40.0) * 0.02;
  vec4 mv = viewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = max(0.12, -mv.z);
  float ps = uSize * (1.0 - t) * (180.0 / depth);
  gl_PointSize = clamp(ps, 2.0, 96.0);
}
`;

export const particleFragment = /* glsl */ `
precision highp float;
uniform vec3 uColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = 1.0 - length(uv) * 2.0;
  if (d <= 0.0) discard;
  float glow = pow(d, 1.8);
  gl_FragColor = vec4(uColor * 1.2, glow);
}
`;

/** Fullscreen composite: heat + chromatic + vignette (sample tDiffuse) */
export const compositeFragment = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uTime;
uniform vec2 uResolution;
uniform float uHeat;
uniform float uChroma;
uniform float uVignette;
uniform float uRays;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float dist = length(d);
  vec2 heatOff = vec2(
    sin(uv.y * 30.0 + uTime * 2.0),
    cos(uv.x * 28.0 - uTime * 1.7)
  ) * 0.002 * uHeat * dist;
  vec2 uvH = uv + heatOff;

  float off = 0.002 * uChroma * dist;
  vec3 col;
  col.r = texture2D(tDiffuse, uvH + vec2(off, 0.0)).r;
  col.g = texture2D(tDiffuse, uvH).g;
  col.b = texture2D(tDiffuse, uvH - vec2(off, 0.0)).b;

  float ray = pow(max(0.0, sin(atan(d.y, d.x) * 8.0 + uTime * 2.0)), 12.0) * uRays * 0.15;
  col += vec3(1.0, 0.45, 0.1) * ray * (1.0 - dist);

  float vig = 1.0 - smoothstep(0.5, 1.5 * uVignette, dist * dist * 4.0);
  col *= vig;

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float peak = max(max(col.r, col.g), col.b);
  float mask = smoothstep(0.004, 0.18, lum + peak * 0.35);
  float outA = clamp(mask * 0.92, 0.0, 0.98);
  gl_FragColor = vec4(col, outA);
}
`;

export const compositeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/** Non-instanced palm ring — RingGeometry UVs */
export const simpleRingVertex = /* glsl */ `
uniform float uTime;
uniform float uSpin;
varying vec2 vUv;
varying float vLayer;

void main() {
  vUv = uv;
  vLayer = uSpin * 0.01;
  vec3 pos = position;
  float wobble = sin(uTime * 2.0 + position.x * 8.0) * 0.015;
  pos.xy *= 1.0 + wobble;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const simpleRingFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uIntensity;
uniform float uLayer;
uniform vec3 uColorInner;
uniform vec3 uColorOuter;
uniform float uGestureBoost;

varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float runes = sin(a * (13.0 + uLayer * 2.0) + uTime * (2.5 + uLayer * 0.2))
    * sin(r * 28.0 - uTime * 3.0);
  float ring = abs(fract(r * 3.8 + uLayer * 0.2) - 0.5);
  ring = smoothstep(0.12, 0.0, ring) * (1.0 - smoothstep(0.96, 1.0, r));
  float spokes = smoothstep(0.35, 0.33, abs(sin(a * 6.0 + uTime * 1.5)));
  float core = exp(-r * r * 4.0) * 0.35;
  float alpha = (ring * 0.88 + core + spokes * 0.18) * uIntensity;
  alpha += runes * 0.06 * (1.0 - r);
  alpha *= 0.5 + 0.5 * uGestureBoost;
  vec3 col = mix(uColorInner, uColorOuter, r + uLayer * 0.08);
  col += vec3(1.0, 0.65, 0.3) * ring * 0.45;
  gl_FragColor = vec4(col, alpha * (1.05 - r * 0.3));
}
`;
