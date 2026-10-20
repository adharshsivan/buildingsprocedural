import * as THREE from 'three';
import { DetailFrame } from './components';
import { OPAQUE_FABRIC_UV, garmentUV } from './detailTextures';
import type { MatLib } from './materials';
import { RNG } from './rng';
import type { BalconyStyle, BuildingParams, Style } from './types';
import type { Vec3 } from './batcher';

/**
 * Realistic laundry.
 *
 * Placement rules (kept deliberately conservative):
 *  - only on balconies (never ground floor, shopfronts, curtain walls, plain windows or the street);
 *  - ceiling drying rails only where the balcony above provides a ceiling to fix them to;
 *  - drying racks stand on the balcony floor, on the side away from any planter;
 *  - drapes only over railings / parapets you could actually fold a towel over;
 *  - the street-facing elevation is excluded unless explicitly allowed;
 *  - frequency follows regional habit (high in Kerala/Indian blocks, rare in luxury/glass towers)
 *    and drops at night when most washing has been brought in;
 *  - garment length is clamped so nothing touches the floor or pokes through the railing.
 */

export type GarmentKind = 'tshirt' | 'shirt' | 'trousers' | 'shorts' | 'towel' | 'saree' | 'frock' | 'socks';
export interface LaundryRecord { kind: 'rail' | 'rack' | 'drape' | 'roof'; side: number; floor: number; garments: number }

const CELL: Record<GarmentKind, number> = { tshirt: 0, shirt: 1, trousers: 2, shorts: 3, towel: 4, saree: 5, frock: 6, socks: 7 };
/** width × full length in metres */
const SIZE: Record<GarmentKind, [number, number]> = {
  tshirt: [0.5, 0.66], shirt: [0.62, 0.76], trousers: [0.4, 1.0], shorts: [0.42, 0.46],
  towel: [0.62, 1.2], saree: [0.66, 2.4], frock: [0.36, 0.52], socks: [0.24, 0.24],
};

const REGIONAL: Record<Style, number> = {
  kerala: 1, indian: 0.9, mediterranean: 0.7, brutalist: 0.55, modern: 0.4, minimal: 0.28, luxury: 0.14, glassTower: 0.1,
};

const COMMON = ['#f2f1ec', '#e9e6dd', '#d6dbe2', '#a8bacd', '#61799a', '#2e3b52', '#38393b', '#8a8e93', '#c8b799', '#7b6a52', '#6c7a58', '#8c3b3d', '#c79a43', '#d9aeb0', '#4e6e77'];
const DENIM = ['#3e5a7e', '#2a3954', '#4b5059', '#c3b69c', '#6b5b45'];
const TOWEL = ['#f1f0ea', '#d8c6a6', '#9db6c8', '#c97f6e', '#e4d27f', '#b9c7b0'];
const SAREE = ['#a63558', '#c88a2e', '#2e7d78', '#6a428c', '#cf6a40', '#2f4f8f'];
const MUNDU = '#efe9d6'; // Kerala white cloth with gold border

const linear = (hex: string, rng: RNG): [number, number, number] => {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * rng.float(0.85, 1), Math.min(0.96, hsl.l * rng.float(0.9, 1.06)));
  return [c.r, c.g, c.b];
};

export function laundryChance(p: BuildingParams, side: number): number {
  if (!p.hangingClothes) return 0;
  const sideFactor = side === 0 ? (p.laundryFrontFacade ? 0.6 : 0) : 1;
  const time = p.dayNight === 'night' ? 0.55 : p.dayNight === 'dusk' ? 0.85 : 1;
  return Math.min(0.92, p.laundryDensity * 1.6 * REGIONAL[p.style] * sideFactor * time);
}

function pickKind(p: BuildingParams, rng: RNG, pool: 'line' | 'rack' | 'drape'): GarmentKind {
  const regional = p.style === 'kerala' || p.style === 'indian';
  const table: [GarmentKind, number][] = pool === 'drape'
    ? [['towel', 6], ['saree', regional ? 4 : 0.6]]
    : pool === 'rack'
      ? [['towel', 3], ['socks', 3], ['tshirt', 2], ['shorts', 2], ['frock', 1]]
      : [['tshirt', 5], ['shirt', 4], ['trousers', 3], ['shorts', 2], ['towel', 3], ['socks', 2], ['frock', 0.8], ['saree', regional ? 2.4 : 0.2]];
  let r = rng.float(0, table.reduce((a, [, w]) => a + w, 0));
  for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
  return 'tshirt';
}

function colorFor(kind: GarmentKind, p: BuildingParams, rng: RNG) {
  if (kind === 'trousers' || kind === 'shorts') return linear(rng.bool(0.7) ? rng.pick(DENIM) : rng.pick(COMMON), rng);
  if (kind === 'towel') return linear(rng.pick(TOWEL), rng);
  if (kind === 'saree') return linear(p.style === 'kerala' && rng.bool(0.55) ? MUNDU : rng.pick(SAREE), rng);
  if (kind === 'socks') return linear(rng.pick(['#2f3033', '#f0efea', '#8a8e93', '#3e4a63']), rng);
  return linear(rng.pick(COMMON), rng);
}

/** A subdivided cloth panel hanging down from y = 0, with gravity folds and an optional breeze. */
function clothGeometry(w: number, h: number, rng: RNG, wind: number, lod: BuildingParams['lod']) {
  const sx = lod === 'low' ? 1 : 4, sy = lod === 'low' ? 1 : lod === 'medium' ? 4 : 6;
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  g.translate(0, -h / 2, 0);
  const pos = g.attributes.position;
  const phase = rng.float(0, Math.PI * 2), k = rng.float(1.6, 3.2);
  const billow = wind * rng.float(0.45, 1), lean = wind * rng.float(-0.6, 0.6);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const t = -y / h; // 0 at the line, 1 at the hem
    const z = Math.sin((x / w) * Math.PI * k + phase) * 0.014 * (0.35 + t) + billow * 0.15 * Math.min(h, 1) * t * t;
    pos.setXYZ(i, x + lean * 0.08 * Math.min(h, 1) * t, y + billow * 0.05 * Math.min(h, 1) * t * t, z);
  }
  g.computeVertexNormals();
  return g;
}

class LaundryKit {
  garments = 0;
  constructor(readonly f: DetailFrame, readonly m: MatLib, readonly p: BuildingParams, readonly rng: RNG) {}

  private cloth(kind: GarmentKind, w: number, h: number, pos: Vec3, color: [number, number, number], wind = this.p.laundryWind) {
    this.f.geometry(this.m.fabric, clothGeometry(w, h, this.rng, wind, this.p.lod), pos, false, { uvRect: garmentUV(CELL[kind]), color });
  }
  private peg(x: number, y: number, z: number) {
    if (this.p.lod === 'low') return;
    const c = linear(this.rng.pick(['#d84a3c', '#3f7fc4', '#e9c43b', '#58a86a', '#f2f2ee']), this.rng);
    this.f.box(this.m.fabric, [0.014, 0.06, 0.022], [x, y - 0.012, z], false, { uvRect: OPAQUE_FABRIC_UV, color: c });
  }
  private hanger(x: number, y: number, z: number, span: number) {
    this.f.pipe(this.m.frame, [[x - span / 2, y - 0.1, z], [x, y - 0.035, z], [x + span / 2, y - 0.1, z], [x - span / 2, y - 0.1, z]], 0.004, 3);
    this.f.pipe(this.m.metal, [[x, y - 0.035, z], [x, y + 0.02, z], [x + 0.025, y + 0.02, z]], 0.003, 3);
  }

  /** Fold a cloth over a bar: front and back halves of different length plus a soft crease. */
  drapeOver(kind: GarmentKind, w: number, front: number, back: number, x: number, y: number, z: number, r: number, wind: number) {
    const color = colorFor(kind, this.p, this.rng);
    this.cloth(kind, w, front, [x, y + r * 0.6, z + r + 0.006], color, wind);
    this.cloth(kind, w, back, [x, y + r * 0.6, z - r - 0.006], color, wind * 0.5);
    this.f.box(this.m.fabric, [w, 0.022, r * 2 + 0.02], [x, y + r * 0.7, z], false, { uvRect: OPAQUE_FABRIC_UV, color });
    this.garments++;
  }

  /** Fill a straight (or sagging) line of length `len` with garments; `yAt` gives the line height at x. */
  fillLine(len: number, z: number, yAt: (x: number) => number, maxDrop: number, rigid: boolean, fill: number) {
    let x = -len / 2 + this.rng.float(0.06, 0.2);
    const end = -len / 2 + len * fill;
    while (x < end) {
      const kind = pickKind(this.p, this.rng, 'line');
      let [w, h] = SIZE[kind];
      w *= this.rng.float(0.9, 1.08);
      if (x + w > len / 2 - 0.05) break;
      const cx = x + w / 2;
      const y = yAt(cx);
      const color = colorFor(kind, this.p, this.rng);
      const onHanger = rigid && (kind === 'tshirt' || kind === 'shirt' || kind === 'frock') && this.rng.bool(0.6);
      if (kind === 'towel' || kind === 'saree' || (kind === 'trousers' && this.rng.bool(0.5))) {
        // folded over the line
        const half = Math.min(kind === 'saree' ? h * 0.5 : h * 0.55, maxDrop);
        const back = Math.min(half * this.rng.float(0.65, 1), maxDrop);
        const ww = kind === 'saree' ? w * this.rng.float(0.9, 1.4) : w;
        this.drapeOver(kind, ww, half, back, cx, y, z, 0.012, this.p.laundryWind);
        x += ww - w;
      } else if (onHanger) {
        this.hanger(cx, y, z, w * 0.8);
        this.cloth(kind, w, Math.min(h, maxDrop - 0.1), [cx, y - 0.085, z], color);
        this.garments++;
      } else {
        this.cloth(kind, w, Math.min(h, maxDrop), [cx, y - 0.004, z], color);
        this.peg(cx - w / 2 + 0.04, y, z);
        this.peg(cx + w / 2 - 0.04, y, z);
        this.garments++;
      }
      x += w + this.rng.float(0.04, 0.2);
    }
  }
}

export interface BalconyLaundryOptions {
  w: number; bd: number; FH: number;
  ceiling: boolean; railStyle: Exclude<BalconyStyle, 'mixed'>; planterSide: number;
  seed: number; side: number; floor: number;
}

/**
 * Frame: origin at the balcony's centre on the facade wall, at balcony floor level;
 * local x along the facade, +z outward, y up.
 */
export function buildBalconyLaundry(f: DetailFrame, m: MatLib, p: BuildingParams, o: BalconyLaundryOptions, log: LaundryRecord[]) {
  const rng = new RNG(o.seed);
  if (rng.next() >= laundryChance(p, o.side)) return;
  const kit = new LaundryKit(f, m, p, rng);
  const ceilingY = o.FH - 0.2;
  const railTop = 1.05;

  const useRack = p.dryingRacks && o.w > 1.9 && rng.bool(o.ceiling ? 0.35 : 0.75);
  const useRail = o.ceiling && rng.bool(0.85);
  const useDrape = p.railingDrapes && o.railStyle !== 'glass' && rng.bool(useRail || useRack ? 0.3 : 0.7);
  if (!useRack && !useRail && !useDrape) return;

  // Ceiling-mounted aluminium drying rail(s), fixed to the soffit of the balcony above.
  if (useRail) {
    const before = kit.garments;
    const len = o.w * 0.84;
    const count = !useRack && o.bd > 1.2 && rng.bool(0.45) ? 2 : 1;
    for (let r = 0; r < count; r++) {
      const z = 0.42 + r * 0.38;
      const y = ceilingY - rng.float(0.32, 0.42);
      for (const x of [-len / 2 + 0.1, len / 2 - 0.1]) {
        f.pipe(m.metal, [[x, ceilingY, z], [x, y, z]], 0.007, 4);
        f.box(m.metal, [0.07, 0.014, 0.05], [x, ceilingY - 0.007, z]);
      }
      f.pipe(m.metal, [[-len / 2, y, z], [len / 2, y, z]], 0.013, 6);
      kit.fillLine(len, z, () => y, y - 0.45, true, rng.float(0.4, 0.9));
    }
    log.push({ kind: 'rail', side: o.side, floor: o.floor, garments: kit.garments - before });
  }

  // Foldable floor rack on the free side of the balcony.
  if (useRack) {
    const before = kit.garments;
    const sideSign = o.planterSide ? -o.planterSide : (rng.bool() ? 1 : -1);
    const rx = sideSign * (o.w / 2 - 0.62);
    const rz = Math.min(o.bd - 0.45, useRail ? 1.0 : 0.72);
    const rack = new DetailFrame(f.batch, f.world(rx, 0, rz), f.yaw);
    const top = 0.92, hw = 0.44;
    const bars = [-0.24, -0.12, 0, 0.12, 0.24];
    for (const bz of bars) rack.pipe(m.stainless, [[-hw, top, bz], [hw, top, bz]], 0.006, 4);
    for (const x of [-hw, hw]) {
      rack.pipe(m.stainless, [[x, top, -0.26], [x, top, 0.26]], 0.009, 4);
      rack.pipe(m.stainless, [[x, 0, -0.3], [x, top, 0.24]], 0.009, 4);
      rack.pipe(m.stainless, [[x, 0, 0.3], [x, top, -0.24]], 0.009, 4);
      for (const z of [-0.3, 0.3]) rack.box(m.tyre, [0.03, 0.02, 0.03], [x, 0.01, z]);
    }
    const rk = new LaundryKit(rack, m, p, rng);
    for (const bz of bars) {
      if (!rng.bool(0.6)) continue;
      const kind = pickKind(p, rng, 'rack');
      const [w0, h0] = SIZE[kind];
      const w = Math.min(w0, hw * 2 - 0.05);
      const front = Math.min(h0 * 0.5, 0.42), back = Math.min(front * rng.float(0.7, 1), 0.42);
      // rack bars run along x, so the fold hangs either side in z
      rk.drapeOver(kind, w, front, back, rng.float(-0.05, 0.05), top, bz, 0.006, p.laundryWind * 0.3);
    }
    kit.garments += rk.garments;
    log.push({ kind: 'rack', side: o.side, floor: o.floor, garments: kit.garments - before });
  }

  // A towel, sheet or mundu folded over the balcony railing.
  if (useDrape) {
    const before = kit.garments;
    const count = o.w > 2.4 && rng.bool(0.35) ? 2 : 1;
    const thickness = o.railStyle === 'solid' ? 0.1 : 0.04;
    for (let i = 0; i < count; i++) {
      const kind = pickKind(p, rng, 'drape');
      const width = kind === 'saree' ? rng.float(0.8, 1.3) : rng.float(0.55, 1.1);
      const slot = count === 1 ? rng.float(-0.25, 0.25) : (i === 0 ? -0.25 : 0.25);
      const x = slot * (o.w - width);
      kit.drapeOver(kind, width, rng.float(0.42, 0.68), rng.float(0.28, 0.42), x, railTop + 0.02, o.bd, thickness, p.laundryWind * 0.25);
    }
    log.push({ kind: 'drape', side: o.side, floor: o.floor, garments: kit.garments - before });
  }
}

/** Rooftop wire lines between galvanised posts, inside a free terrace zone (world coordinates). */
export function buildRoofLaundry(
  batch: DetailFrame['batch'], m: MatLib, p: BuildingParams,
  zone: { x0: number; x1: number; z0: number; z1: number; y: number }, seed: number, log: LaundryRecord[],
) {
  const len = zone.x1 - zone.x0;
  const depth = zone.z1 - zone.z0;
  if (len < 2.2 || depth < 0.8) return;
  const rng = new RNG(seed);
  const lines = Math.min(3, Math.floor(depth / 0.85) + 1);
  const cx = (zone.x0 + zone.x1) / 2;
  const postH = 1.75;
  for (let i = 0; i < lines; i++) {
    const z = zone.z0 + (lines === 1 ? depth / 2 : (depth * i) / (lines - 1));
    const f = new DetailFrame(batch, [cx, zone.y, z]);
    for (const x of [-len / 2, len / 2]) {
      f.pipe(m.metalDark, [[x, 0, 0], [x, postH, 0]], 0.025, 6);
      f.box(m.stone, [0.18, 0.08, 0.18], [x, 0.04, 0]);
    }
    const sag = 0.05 + len * 0.012;
    const yAt = (x: number) => postH - 0.05 - sag * (1 - (2 * x / len) ** 2);
    const pts: Vec3[] = [];
    for (let s = 0; s <= 6; s++) { const x = -len / 2 + (len * s) / 6; pts.push([x, yAt(x), 0]); }
    f.pipe(m.pipe, pts, 0.004, 3);
    const kit = new LaundryKit(f, m, p, rng);
    if (p.hangingClothes && rng.bool(Math.min(1, 0.35 + p.laundryDensity))) {
      kit.fillLine(len - 0.3, 0, yAt, postH - 0.4, false, rng.float(0.35, 0.85));
    }
    log.push({ kind: 'roof', side: -1, floor: p.floors, garments: kit.garments });
  }
}
