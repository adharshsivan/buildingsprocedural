// Procedural canvas textures - deterministic, cached, atlas friendly.
import * as THREE from 'three';
import { RNG } from './rng';
import type { TimeOfDay } from './types';

const cache = new Map<string, THREE.CanvasTexture>();

function canvasOf(w: number, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function finish(key: string, canvas: HTMLCanvasElement, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rng: RNG, amount: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/* ---------------- surfaces ---------------- */

export function pavementTexture(color: string): THREE.CanvasTexture {
  const key = `pave|${color}`;
  const hit = cache.get(key); if (hit) return hit;
  const S = 256;
  const { canvas, ctx } = canvasOf(S);
  const rng = new RNG(4400);
  ctx.fillStyle = color; ctx.fillRect(0, 0, S, S);
  const t = 32;
  for (let y = 0; y < S; y += t) {
    for (let x = 0; x < S; x += t) {
      ctx.fillStyle = `rgba(0,0,0,${rng.float(0, 0.07)})`;
      ctx.fillRect(x + 1, y + 1, t - 2, t - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, t - 1, t - 1);
    }
  }
  grain(ctx, S, S, rng, 12);
  return finish(key, canvas);
}

export function asphaltTexture(): THREE.CanvasTexture {
  const key = 'asphalt';
  const hit = cache.get(key); if (hit) return hit;
  const S = 256;
  const { canvas, ctx } = canvasOf(S);
  const rng = new RNG(5500);
  ctx.fillStyle = '#3a3c40'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rng.float(0.01, 0.07)})`;
    ctx.fillRect(rng.float(0, S), rng.float(0, S), rng.float(0.6, 2), rng.float(0.6, 2));
  }
  grain(ctx, S, S, rng, 16);
  return finish(key, canvas);
}

/* ---------------- openings ---------------- */

export function curtainTexture(color: string): THREE.CanvasTexture {
  const key = `curtain|${color}`;
  const hit = cache.get(key); if (hit) return hit;
  const S = 128;
  const { canvas, ctx } = canvasOf(S);
  const rng = new RNG(8800 + color.length);
  ctx.fillStyle = color; ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 6) {
    const a = rng.float(0.05, 0.2);
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(x, 0, rng.float(1.5, 3), S);
    ctx.fillStyle = `rgba(255,255,255,${a * 0.5})`;
    ctx.fillRect(x + 3, 0, 1, S);
  }
  grain(ctx, S, S, rng, 6);
  return finish(key, canvas);
}

/* ---------------- props ---------------- */

export function clothesTexture(variant: number): THREE.CanvasTexture {
  const key = `clothes|${variant}`;
  const hit = cache.get(key); if (hit) return hit;
  const W = 256, H = 128;
  const { canvas, ctx } = canvasOf(W, H);
  const rng = new RNG(9900 + variant * 57);
  ctx.clearRect(0, 0, W, H);
  const colors = ['#e2574c', '#4a7fc1', '#4fae6a', '#e0b84a', '#8a62c0', '#e08a4a', '#f2f2f2', '#3b4a5a'];
  let x = 6;
  while (x < W - 24) {
    const w = rng.float(22, 40);
    const h = rng.float(H * 0.45, H * 0.9);
    ctx.fillStyle = rng.pick(colors);
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x + w, 6);
    ctx.lineTo(x + w - rng.float(0, 5), h);
    ctx.lineTo(x + rng.float(0, 5), h);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, 6, w * 0.25, h - 6);
    x += w + rng.float(6, 16);
  }
  return finish(key, canvas);
}

export function signageTexture(variant: number, lit: boolean): THREE.CanvasTexture {
  const key = `sign|${variant}|${lit}`;
  const hit = cache.get(key); if (hit) return hit;
  const W = 512, H = 128;
  const { canvas, ctx } = canvasOf(W, H);
  const rng = new RNG(11100 + variant * 211);
  ctx.fillStyle = lit ? '#15161b' : '#20222a';
  ctx.fillRect(0, 0, W, H);
  const brandColors = ['#ff7a45', '#43c6ac', '#f5c518', '#5aa9ff', '#ff5f8f', '#9be15d'];
  let x = 10;
  while (x < W - 40) {
    const bw = rng.float(70, 150);
    const c = rng.pick(brandColors);
    ctx.fillStyle = lit ? c : `${c}aa`;
    ctx.globalAlpha = lit ? 1 : 0.65;
    ctx.fillRect(x, H * 0.22, bw, H * 0.3);
    // fake lettering
    ctx.fillStyle = lit ? 'rgba(255,255,255,0.9)' : 'rgba(230,230,230,0.6)';
    let lx = x + 8;
    while (lx < x + bw - 10) {
      const lw = rng.float(5, 13);
      ctx.fillRect(lx, H * 0.6, lw, H * 0.16);
      lx += lw + 5;
    }
    ctx.globalAlpha = 1;
    x += bw + rng.float(16, 40);
  }
  return finish(key, canvas);
}

export function foliageTexture(): THREE.CanvasTexture {
  const key = 'foliage';
  const hit = cache.get(key); if (hit) return hit;
  const S = 128;
  const { canvas, ctx } = canvasOf(S);
  const rng = new RNG(12200);
  ctx.fillStyle = '#2f5c33'; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 380; i++) {
    ctx.fillStyle = rng.bool(0.5) ? `rgba(90,150,80,${rng.float(0.2, 0.6)})` : `rgba(20,60,30,${rng.float(0.2, 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(rng.float(0, S), rng.float(0, S), rng.float(2, 7), rng.float(1, 4), rng.float(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(key, canvas);
}

/* ---------------- environment ---------------- */

export function skyEquirect(mode: TimeOfDay): THREE.CanvasTexture {
  const key = `sky|${mode}`;
  const hit = cache.get(key); if (hit) return hit;
  const W = 1024, H = 512;
  const { canvas, ctx } = canvasOf(W, H);
  const stops: [number, string][] =
    mode === 'night'
      ? [[0, '#05070f'], [0.42, '#0b1225'], [0.52, '#17203a'], [0.56, '#2a2535'], [1, '#0a0c12']]
      : mode === 'dusk'
      ? [[0, '#1d2a52'], [0.38, '#5a4b7a'], [0.5, '#d2794f'], [0.56, '#f0a765'], [1, '#2e2a33']]
      : [[0, '#4f85c6'], [0.42, '#9dc3e6'], [0.52, '#e3eef8'], [0.56, '#cdd6da'], [1, '#6e7175']];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [p, c] of stops) g.addColorStop(p, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const rng = new RNG(mode === 'night' ? 1 : mode === 'dusk' ? 2 : 3);
  if (mode === 'night') {
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rng.float(0.1, 0.8)})`;
      ctx.fillRect(rng.float(0, W), rng.float(0, H * 0.48), rng.float(0.6, 1.6), rng.float(0.6, 1.6));
    }
  } else {
    for (let i = 0; i < 28; i++) {
      const cx = rng.float(0, W), cy = rng.float(H * 0.08, H * 0.42), r = rng.float(40, 150);
      const cg = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
      cg.addColorStop(0, `rgba(255,255,255,${mode === 'dusk' ? 0.22 : 0.45}`.concat(')'));
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
  // sun / moon
  const sx = W * 0.72, sy = mode === 'dusk' ? H * 0.5 : H * 0.2;
  const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, mode === 'night' ? 60 : 140);
  sg.addColorStop(0, mode === 'night' ? 'rgba(200,220,255,0.9)' : 'rgba(255,245,220,1)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);

  const t = new THREE.CanvasTexture(canvas);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export function disposeTextureCache() {
  cache.forEach(t => t.dispose());
  cache.clear();
}
