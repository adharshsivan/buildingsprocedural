import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Batcher, type BatchOptions, type Vec3 } from './batcher';
import { lobbyUV, roomUV, shopUV } from './detailTextures';
import type { MatLib } from './materials';
import type { BuildingParams } from './types';
import { RNG } from './rng';

export class DetailFrame {
  constructor(readonly batch: Batcher, readonly origin: Vec3, readonly yaw = 0) {}
  world(x: number, y: number, z: number): Vec3 {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [this.origin[0] + x * c + z * s, this.origin[1] + y, this.origin[2] - x * s + z * c];
  }
  box(mat: THREE.Material, size: Vec3, pos: Vec3, cast = false, opts: BatchOptions = {}) {
    this.batch.box(mat, size, this.world(...pos), [0, this.yaw, 0], { cast, ...opts });
  }
  panel(mat: THREE.Material, size: [number, number], pos: Vec3, opts: BatchOptions = {}) {
    this.batch.plane(mat, size, this.world(...pos), [0, this.yaw, 0], opts);
  }
  cylinder(mat: THREE.Material, top: number, bottom: number, height: number, segments: number, pos: Vec3) {
    this.batch.cylinder(mat, top, bottom, height, segments, this.world(...pos));
  }
  pipe(mat: THREE.Material, points: Vec3[], radius: number, segments = 6) {
    this.batch.pipe(mat, points.map(point => this.world(...point)), radius, segments);
  }
  geometry(mat: THREE.Material, geometry: THREE.BufferGeometry, pos: Vec3, cast = false, opts: BatchOptions = {}) {
    this.batch.add(geometry, mat, this.world(...pos), [0, this.yaw, 0], { cast, ...opts });
    geometry.dispose();
  }
}

function surround(f: DetailFrame, material: THREE.Material, w: number, h: number, t: number, d: number, z: number, x = 0, y = 0) {
  f.box(material, [w + t, t, d], [x, y + h / 2, z]);
  f.box(material, [w + t, t, d], [x, y - h / 2, z]);
  f.box(material, [t, h, d], [x - w / 2, y, z]);
  f.box(material, [t, h, d], [x + w / 2, y, z]);
}

export function roomBox(f: DetailFrame, m: MatLib, p: BuildingParams, w: number, h: number, seed: number, depth: number) {
  const rng = new RNG(seed);
  const variant = rng.int(0, 15);
  const lit = p.warmLights && p.dayNight !== 'day' && rng.bool(p.litWindowRatio);
  surround(f, m.reveal, w + 0.035, h + 0.035, 0.05, depth, -depth / 2);
  const backdrop = p.interiors ? (lit ? m.interiorsLit[0] : m.interiors[0]) : m.glassSpandrel;
  f.panel(backdrop, [w, h], [0, 0, -depth], p.interiors ? { uvRect: roomUV(variant), receive: true } : {});
  if (p.interiors && p.curtains && p.lod !== 'low') {
    const draw = rng.next();
    const curtain = m.curtains[rng.int(0, m.curtains.length - 1)];
    const cw = w * (draw > 0.88 ? 0.45 : rng.float(0.12, 0.25));
    for (const side of [-1, 1]) {
      f.panel(curtain, [cw, h - 0.1], [side * (w - cw) / 2, -0.015, -depth * 0.58]);
    }
    f.box(m.frame, [w, 0.035, 0.035], [0, h / 2 - 0.035, -depth * 0.58]);
  }
}

/** A public lobby, intentionally distinct from the apartment-room parallax atlas. */
export function buildLobbyInterior(f: DetailFrame, m: MatLib, p: BuildingParams, w: number, h: number, seed: number, depth = 2.05) {
  const rng = new RNG(seed + 171);
  const variant = p.lobbyStyle === 'warm' ? 0 : p.lobbyStyle === 'minimal' ? 1 : 2;
  const lit = p.warmLights && (p.dayNight !== 'day' || rng.bool(0.55));
  const lobby = lit ? m.lobbiesLit[variant] : m.lobbies[variant];
  surround(f, m.reveal, w + 0.04, h + 0.04, 0.06, depth, -depth / 2);
  f.panel(lobby, [w, h], [0, 0, -depth], { uvRect: lobbyUV(variant), receive: true });
  // Deep floor/ceiling planes give the reception atlas an actual spatial threshold.
  f.box(m.stone, [w - 0.08, 0.08, depth - 0.05], [0, -h / 2 + 0.04, -depth / 2], false);
  f.box(m.soffit, [w - 0.08, 0.04, depth - 0.05], [0, h / 2 - 0.02, -depth / 2], false);
  if (!p.lobbyDetails || p.lod === 'low') return;
  // A partial reception counter: it sits behind the doors, never in the threshold.
  const deskW = Math.min(1.55, w * 0.34);
  f.box(m.panel, [deskW, 0.76, 0.46], [-w * 0.22, -h / 2 + 0.38, -depth * 0.62]);
  f.box(m.stone, [deskW + 0.12, 0.08, 0.55], [-w * 0.22, -h / 2 + 0.8, -depth * 0.62], false);
  f.box(m.metal, [0.34, 0.12, 0.03], [-w * 0.22, -h / 2 + 0.59, -depth * 0.88], false);
  // Mailboxes / directory panel by the entrance.
  const bankX = w * 0.37;
  f.box(m.metalDark, [0.46, 0.92, 0.07], [bankX, -h / 2 + 0.92, -depth * 0.86], false);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 2; col++) {
    f.box(m.metal, [0.18, 0.17, 0.01], [bankX + (col ? 0.1 : -0.1), -h / 2 + 0.52 + row * 0.2, -depth * 0.9], false);
  }
  // A small internal planter stops the lobby from reading as a generic apartment room.
  f.box(m.pot, [0.38, 0.38, 0.34], [w * 0.12, -h / 2 + 0.18, -depth * 0.86], false);
  f.box(m.foliage, [0.32, 0.5, 0.29], [w * 0.12, -h / 2 + 0.58, -depth * 0.86], false);
}

export function buildShopfront(f: DetailFrame, m: MatLib, p: BuildingParams, w: number, h: number, seed: number) {
  const rng = new RNG(seed + 271);
  const depth = 1.35;
  const lit = p.dayNight !== 'day' && p.warmLights && rng.bool(Math.max(0.55, p.litWindowRatio));
  const shop = lit ? m.shopsLit[0] : m.shops[0];
  surround(f, m.reveal, w + 0.04, h + 0.04, 0.06, depth, -depth / 2);
  f.panel(shop, [w, h], [0, 0, -depth], { uvRect: shopUV(rng.int(0, 3)), receive: true });
  f.box(m.stone, [w - 0.04, 0.06, depth], [0, -h / 2 + 0.03, -depth / 2], false);
  surround(f, m.frame, w, h, 0.065, 0.13, -0.04);
  const doorW = Math.min(0.86, w * 0.28);
  f.panel(m.glass, [w - 0.08, h - 0.08], [0, 0, -0.07]);
  f.box(m.frame, [0.06, h - 0.08, 0.12], [w / 2 - doorW, 0, -0.025]);
  f.box(m.frame, [doorW + 0.04, h - 0.08, 0.12], [w / 2 - doorW / 2 - 0.04, 0, -0.025]);
  f.box(m.stainless, [0.024, 0.35, 0.03], [w / 2 - doorW / 2 - 0.07, -0.12, 0.02]);
  f.box(m.stone, [w + 0.15, 0.08, 0.32], [0, -h / 2 - 0.04, 0.07], false);
}

export function buildWindow(f: DetailFrame, m: MatLib, p: BuildingParams, w: number, h: number, seed: number, balcony = false) {
  const depth = p.parallaxWindows ? p.windowRecess : 0.18;
  roomBox(f, m, p, w, h, seed, depth);
  const rng = new RNG(seed + 60);
  if (p.lod !== 'low') surround(f, m.stone, w + 0.13, h + 0.13, 0.065, 0.14, 0.015);
  surround(f, m.frame, w, h, 0.062, 0.14, -0.05);
  if (p.lod !== 'low') surround(f, m.tyre, w - 0.08, h - 0.08, 0.018, 0.032, -0.067);
  const style = balcony ? 'sliding' : p.windowStyle;
  const panes = style === 'fixed' ? (w > 2.6 ? 2 : 1) : (w > 2.8 ? 3 : 2);
  const innerW = w - 0.12, innerH = h - 0.12;
  const pw = innerW / panes;
  for (let i = 0; i < panes; i++) {
    const x = -innerW / 2 + pw * (i + 0.5);
    const z = style === 'sliding' ? -0.062 - (i % 2) * 0.035 : -0.06;
    f.panel(m.glass, [pw - 0.032, innerH - 0.025], [x, 0, z], { tint: rng.float(0.82, 1.02) });
    if (p.lod !== 'low') {
      surround(f, m.frame, pw - 0.025, innerH, 0.027, 0.047, z, x);
      if (style !== 'fixed') {
        const hx = x + pw / 2 - 0.09;
        f.box(m.metal, [0.018, balcony ? 0.23 : 0.13, 0.024], [hx, balcony ? -0.12 : -0.06, z + 0.05]);
        f.box(m.frame, [0.048, 0.045, 0.022], [hx, -0.06, z + 0.026]);
      }
      if (style === 'casement') {
        for (const hy of [-innerH * 0.33, innerH * 0.33]) {
          f.box(m.metal, [0.022, 0.09, 0.023], [x - pw / 2 + 0.03, hy, z + 0.035]);
        }
      }
    }
    if (i > 0) f.box(m.frame, [0.042, innerH, 0.12], [x - pw / 2, 0, -0.035]);
  }
  f.box(m.stone, [w + 0.25, 0.075, 0.32], [0, -h / 2 - 0.06, 0.075]);
  if (p.lod === 'high') {
    f.box(m.metal, [w - 0.08, 0.014, 0.025], [0, -h / 2 + 0.035, 0.032]);
    f.box(m.frame, [w + 0.1, 0.025, 0.045], [0, h / 2 + 0.075, 0.08]);
  }
}

export function buildEntrance(f: DetailFrame, m: MatLib, p: BuildingParams, w: number, h: number, seed: number) {
  const center = new DetailFrame(f.batch, f.world(0, h / 2, 0), f.yaw);
  buildLobbyInterior(center, m, { ...p, curtains: false }, w, h, seed);
  surround(center, m.stone, w + 0.22, h + 0.18, 0.12, 0.36, 0.04);
  surround(center, m.frame, w, h, 0.09, 0.18, -0.04);
  const doorWidth = Math.min(w - 0.35, 1.95);
  const doorH = Math.min(h - 0.24, 2.28);
  const sidelights = (w - doorWidth) / 2;
  for (const s of [-1, 1]) {
    const dx = s * doorWidth / 4;
    const leaf = doorWidth / 2 - 0.035;
    const leafMat = p.entranceStyle === 'glass' ? m.glass : p.entranceStyle === 'timber' ? m.door : m.enamel;
    if (p.entranceStyle === 'glass') f.panel(leafMat, [leaf, doorH], [dx, doorH / 2, -0.055]);
    else f.box(leafMat, [leaf, doorH, 0.075], [dx, doorH / 2, -0.05]);
    surround(f, m.frame, leaf, doorH, 0.052, 0.11, -0.025, dx, doorH / 2);
    f.box(m.stainless, [leaf - 0.08, 0.15, 0.025], [dx, 0.115, 0.044]);
    const hx = s * 0.12;
    f.pipe(m.stainless, [[hx, 0.88, 0.035], [hx, 0.88, 0.13], [hx, 1.52, 0.13], [hx, 1.52, 0.035]], 0.017, 8);
    f.box(m.metal, [0.034, 0.13, 0.016], [hx, 0.73, 0.025]);
    for (const y of [0.3, 1.95]) f.box(m.metal, [0.032, 0.12, 0.04], [s * (doorWidth / 2 - 0.025), y, 0.035]);
    if (sidelights > 0.1) {
      const x = s * (doorWidth + sidelights) / 2;
      f.panel(m.glass, [sidelights - 0.055, doorH], [x, doorH / 2, -0.06]);
      f.box(m.frame, [0.06, doorH, 0.12], [s * doorWidth / 2, doorH / 2, -0.03]);
    }
  }
  f.panel(m.glass, [w - 0.1, h - doorH - 0.035], [0, (h + doorH) / 2, -0.06]);
  f.box(m.frame, [w, 0.065, 0.14], [0, doorH, -0.02]);
  f.box(m.stone, [w + 0.25, 0.09, 0.55], [0, 0.045, 0.07]);
  f.box(m.metalDark, [0.16, 0.3, 0.045], [w / 2 + 0.25, 1.38, 0.18]);
  f.box(m.glassSpandrel, [0.11, 0.1, 0.01], [w / 2 + 0.25, 1.43, 0.205]);
  f.box(m.metal, [0.04, 0.04, 0.012], [w / 2 + 0.25, 1.31, 0.205]);
}

/** External lobby steps, side handrails and a short graded alternative for a believable arrival threshold. */
export function buildEntranceApproach(f: DetailFrame, m: MatLib, p: BuildingParams, width: number, threshold = 0.45, availableRun = 0) {
  const steps = 3;
  const rise = threshold / steps;
  const tread = 0.34;
  for (let i = 0; i < steps; i++) {
    const level = i + 1;
    f.box(m.stone, [width + 0.9 - i * 0.12, rise * level, tread * (steps - i)], [0, (rise * level) / 2, tread * (steps - i) / 2], false);
  }
  for (const x of [-width / 2 - 0.18, width / 2 + 0.18]) {
    f.pipe(m.stainless, [[x, 0.13, 0.95], [x, threshold + 0.82, 0.12], [x, threshold + 0.82, -0.15]], 0.022, 6);
    f.pipe(m.stainless, [[x, 0.1, 0.91], [x, 0.1, 0.6]], 0.022, 6);
  }
  if (!p.accessibleEntry || p.lod === 'low') return;
  // A 1:11 side ramp needs real frontage. If that frontage does not exist, we do not fake one.
  const run = threshold * 11;
  if (availableRun < run) return;
  const rampW = 1.15;
  const rampCenterX = width / 2 + 0.22 + run / 2;
  const shape = new THREE.Shape();
  // High end is beside the entrance; the route slopes down as it moves away along the facade.
  shape.moveTo(-run / 2, 0);
  shape.lineTo(run / 2, 0);
  shape.lineTo(-run / 2, threshold);
  const wedge = new THREE.ExtrudeGeometry(shape, { depth: rampW, bevelEnabled: false });
  wedge.translate(0, 0, -rampW / 2);
  f.geometry(m.pavement, wedge, [rampCenterX, 0, 0.83], false);
  // Small high-side landing joins the ramp to the entrance threshold.
  f.box(m.pavement, [0.48, 0.1, rampW], [width / 2 + 0.2, threshold - 0.05, 0.83], false);
  for (const z of [0.83 - rampW / 2 + 0.08, 0.83 + rampW / 2 - 0.08]) {
    f.pipe(m.metal, [[width / 2 + 0.22, threshold + 0.18, z], [width / 2 + 0.22 + run, 0.18, z]], 0.018, 5);
  }
}

export function buildServiceDoor(f: DetailFrame, m: MatLib, width = 0.95, height = 2.1) {
  f.box(m.metalDark, [width + 0.12, height + 0.08, 0.075], [0, height / 2, 0]);
  f.box(m.enamel, [width, height, 0.04], [0, height / 2, 0.055]);
  f.panel(m.equipment, [width * 0.5, 0.23], [0, 0.32, 0.085], { uvRect: [0.54, 0.05, 0.43, 0.9] });
  f.box(m.metal, [0.035, 0.19, 0.025], [width * 0.34, 1, 0.087]);
  f.box(m.metal, [0.14, 0.025, 0.035], [width * 0.29, 1.04, 0.11]);
  for (const y of [0.25, height - 0.25]) f.box(m.metal, [0.025, 0.1, 0.025], [-width / 2, y, 0.08]);
}

export function buildAirConditioner(f: DetailFrame, m: MatLib, p: BuildingParams, drainX = 0.7, wallMounted = true) {
  const high = p.lod === 'high';
  if (p.lod === 'low') f.box(m.enamel, [0.96, 0.64, 0.4], [0, 0, 0.26], true);
  else f.geometry(m.enamel, new RoundedBoxGeometry(0.96, 0.64, 0.4, 1, 0.035), [0, 0, 0.26], true);
  f.panel(m.equipment, [0.54, 0.54], [-0.14, 0, 0.463], { uvRect: [0.012, 0.025, 0.476, 0.95] });
  f.panel(m.equipment, [0.17, 0.42], [0.326, 0, 0.463], { uvRect: [0.535, 0.05, 0.43, 0.9] });
  f.box(m.metalDark, [0.009, 0.52, 0.007], [0.207, 0, 0.466]);
  f.box(m.accentMetal, [0.09, 0.025, 0.008], [0.31, 0.255, 0.468]);
  if (p.lod !== 'low') {
    for (const x of [-0.32, 0.32]) {
      f.box(m.metal, [0.07, 0.055, 0.53], [x, -0.37, 0.25]);
      f.box(m.tyre, [0.1, 0.035, 0.1], [x, -0.335, 0.26]);
      if (wallMounted) f.box(m.metal, [0.07, 0.44, 0.06], [x, -0.18, 0.035]);
      else f.box(m.stone, [0.14, 0.13, 0.5], [x, -0.455, 0.25]);
    }
    if (high) {
      f.geometry(m.metal, new THREE.TorusGeometry(0.237, 0.007, 4, 24), [-0.14, 0, 0.47]);
      for (const x of [-0.435, 0.435]) for (const y of [-0.265, 0.265]) {
        f.box(m.metalDark, [0.014, 0.014, 0.008], [x, y, 0.467]);
      }
    }
    if (p.facadePipes) {
      if (wallMounted) {
        f.pipe(m.pipe, [[0.48, -0.08, 0.25], [0.59, -0.08, 0.25], [0.59, 0.59, 0.1], [0.59, 0.59, -0.03]], 0.039);
        f.pipe(m.tyre, [[0.48, -0.17, 0.27], [0.68, -0.17, 0.27], [0.68, 0.52, 0.1], [0.68, 0.52, -0.03]], 0.026);
        f.pipe(m.pipe, [[0.31, -0.32, 0.3], [0.31, -0.46, 0.3], [drainX, -0.46, 0.16]], 0.018);
      } else {
        f.pipe(m.pipe, [[0.48, -0.08, 0.25], [0.59, -0.08, 0.25], [0.59, -0.46, -0.22], [0.59, -0.57, -0.22]], 0.039);
        f.pipe(m.tyre, [[0.48, -0.17, 0.27], [0.68, -0.17, 0.27], [0.68, -0.46, -0.3], [0.68, -0.57, -0.3]], 0.026);
        f.box(m.metal, [0.27, 0.035, 0.28], [0.64, -0.515, -0.26]);
      }
    }
  }
}

export function buildDownpipe(f: DetailFrame, m: MatLib, p: BuildingParams, height: number) {
  const start = 0.14, end = height + 0.4;
  f.pipe(m.pipe, [[0, end, -0.2], [0, end, 0.16], [0, 0.34, 0.16], [0, start, 0.45]], 0.065, p.lod === 'high' ? 8 : 6);
  f.box(m.metalDark, [0.22, 0.18, 0.07], [0, end, -0.03]);
  f.box(m.metalDark, [0.35, 0.035, 0.42], [0, 0.08, 0.46]);
  if (p.lod === 'low') return;
  for (let y = 0.65; y < height; y += p.floorHeight) {
    f.cylinder(m.enamel, 0.083, 0.083, 0.1, 10, [0, y, 0.16]);
    f.box(m.metal, [0.12, 0.035, 0.12], [0, y, 0.06]);
  }
}

export function buildWaterTank(f: DetailFrame, m: MatLib, p: BuildingParams, outlet: Vec3) {
  const stainless = p.tankStyle === 'stainless';
  const mat = stainless ? m.stainless : m.tank;
  const supportH = 0.35;
  for (const x of [-0.55, 0.55]) f.box(m.stone, [0.22, supportH, 1.65], [x, supportH / 2, 0], true);
  f.box(m.stone, [1.82, 0.12, 1.82], [0, supportH + 0.06, 0], true);
  const bottom = supportH + 0.12;
  const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(0.68, 0), new THREE.Vector2(0.8, 0.09)];
  for (let i = 0; i < 5; i++) {
    const y = 0.19 + i * 0.265;
    profile.push(new THREE.Vector2(0.8, y), new THREE.Vector2(stainless ? 0.825 : 0.85, y + 0.03));
    profile.push(new THREE.Vector2(stainless ? 0.825 : 0.85, y + 0.075), new THREE.Vector2(0.8, y + 0.105));
  }
  profile.push(new THREE.Vector2(0.8, 1.54), new THREE.Vector2(0.74, 1.66), new THREE.Vector2(0.36, 1.82), new THREE.Vector2(0, 1.82));
  f.geometry(mat, new THREE.LatheGeometry(profile, p.lod === 'low' ? 10 : 24), [0, bottom, 0], true);
  f.cylinder(mat, 0.32, 0.34, 0.12, 20, [0, bottom + 1.86, 0]);
  f.box(m.metalDark, [0.21, 0.045, 0.065], [0, bottom + 1.94, 0]);
  f.box(m.enamel, [0.32, 0.14, 0.025], [0, bottom + 0.87, 0.812]);
  if (!p.facadePipes) return;
  f.pipe(m.pipe, [[-0.61, bottom + 1.69, 0], [-1.0, bottom + 1.69, 0], [-1.0, 0.16, 0], [-1.0, 0.16, -0.65], [-1.0, -0.02, -0.65]], 0.045, 8);
  f.pipe(m.pipe, [[0.79, bottom + 0.2, 0], [1.07, bottom + 0.2, 0], [1.07, 0.15, 0], [outlet[0], 0.15, 0], [outlet[0], 0.15, outlet[2]], [outlet[0], outlet[1], outlet[2]]], 0.06, 8);
  f.box(m.accentMetal, [0.13, 0.12, 0.13], [1.07, bottom + 0.2, 0]);
  f.box(m.metalDark, [0.25, 0.027, 0.05], [1.07, bottom + 0.29, 0]);
  if (p.lod === 'high') {
    for (const x of [-0.19, 0.19]) f.pipe(m.metal, [[x, 0.1, 0.97], [x, bottom + 1.5, 0.97]], 0.018);
    for (let y = 0.24; y < bottom + 1.5; y += 0.28) {
      f.pipe(m.metal, [[-0.19, y, 0.97], [0.19, y, 0.97]], 0.014);
    }
  }
}

export function buildPottedPlant(f: DetailFrame, m: MatLib, scale = 1, high = true) {
  const s = scale;
  f.cylinder(m.pot, 0.23 * s, 0.17 * s, 0.38 * s, 10, [0, 0.19 * s, 0]);
  f.cylinder(m.pot, 0.25 * s, 0.25 * s, 0.045 * s, 10, [0, 0.37 * s, 0]);
  f.cylinder(m.reveal, 0.218 * s, 0.218 * s, 0.01 * s, 10, [0, 0.389 * s, 0]);
  const count = high ? 9 : 5;
  for (let i = 0; i < count; i++) {
    const a = i * 2.399;
    const stemHeight = (0.38 + (i % 3) * 0.13) * s;
    const geometry = new THREE.SphereGeometry(1, 5, 3);
    geometry.scale(0.085 * s, stemHeight * 0.55, 0.035 * s);
    geometry.rotateZ(-0.45 - (i % 3) * 0.2);
    geometry.rotateY(a);
    f.geometry(m.foliage, geometry, [Math.cos(a) * 0.14 * s, 0.38 * s + stemHeight * 0.45, Math.sin(a) * 0.14 * s]);
  }
}