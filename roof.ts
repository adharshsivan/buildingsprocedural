import type { Batcher } from './batcher';
import * as THREE from 'three';
import { DetailFrame, buildAirConditioner, buildServiceDoor, buildWaterTank } from './components';
import { buildRooftopHoarding, planHoardingFootprint } from './hoarding';
import { buildRoofLaundry, type LaundryRecord } from './laundry';
import type { MatLib } from './materials';
import { RNG } from './rng';
import type { BuildingParams, StyleProfile } from './types';
import type { Block } from './building';
import type { Rect } from './parking';

export type RoofKind = 'core' | 'access' | 'tank' | 'ac' | 'solar' | 'mechanical' | 'planter' | 'terrace' | 'laundry' | 'antenna' | 'hoarding';
export interface RoofPlacement { kind: RoofKind; rect: Rect }
export interface RoofLayout {
  block: number;
  style: Exclude<BuildingParams['roofStyle'], 'mixed'>;
  bounds: Rect;
  placements: RoofPlacement[];
}

const rect = (x: number, z: number, w: number, d: number): Rect => ({
  x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2,
});
const center = (r: Rect): [number, number] => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

/** Footprints are in building-local coordinates, not overlapping mesh bounding boxes. */
export function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.x0 < b.x1 + margin && a.x1 + margin > b.x0 && a.z0 < b.z1 + margin && a.z1 + margin > b.z0;
}

function roofProfile(p: BuildingParams, rng: RNG): RoofLayout['style'] {
  if (p.roofStyle !== 'mixed') return p.roofStyle;
  if (p.style === 'glassTower') return rng.pick(['mechanical', 'solar', 'mechanical']);
  if (p.style === 'luxury') return rng.pick(['terrace', 'planters', 'solar']);
  if (p.style === 'kerala' || p.style === 'indian') return rng.pick(['terrace', 'solar', 'planters', 'mechanical']);
  return rng.pick(['solar', 'terrace', 'mechanical', 'planters']);
}

class FootprintPlanner {
  readonly placements: RoofPlacement[] = [];
  constructor(readonly bounds: Rect, private rng: RNG) {}

  reserve(kind: RoofKind, r: Rect, clearance = 0.18): Rect | null {
    // Centre/half-size arithmetic can land a few ulps outside the same bound.
    if (r.x0 < this.bounds.x0 - 1e-5 || r.x1 > this.bounds.x1 + 1e-5 || r.z0 < this.bounds.z0 - 1e-5 || r.z1 > this.bounds.z1 + 1e-5) return null;
    if (this.placements.some(other => overlaps(other.rect, r, clearance))) return null;
    this.placements.push({ kind, rect: r });
    return r;
  }

  find(kind: RoofKind, w: number, d: number, preference: 'front' | 'back' | 'any' = 'any'): Rect | null {
    const choices: { rect: Rect; score: number }[] = [];
    for (let x = this.bounds.x0 + w / 2; x <= this.bounds.x1 - w / 2 + 0.01; x += 0.67) {
      for (let z = this.bounds.z0 + d / 2; z <= this.bounds.z1 - d / 2 + 0.01; z += 0.67) {
        const candidate = rect(x, z, w, d);
        const normalized = (z - this.bounds.z0) / Math.max(0.01, this.bounds.z1 - this.bounds.z0);
        const penalty = preference === 'front' ? (1 - normalized) * 0.45 : preference === 'back' ? normalized * 0.45 : 0;
        choices.push({ rect: candidate, score: penalty + this.rng.next() * 0.55 });
      }
    }
    choices.sort((a, b) => a.score - b.score);
    for (const choice of choices) {
      const placed = this.reserve(kind, choice.rect, 0.22);
      if (placed) return placed;
    }
    return null;
  }
}

/**
 * One composition per exposed roof. Reserve core, access path and services before
 * drawing anything; roofs that cannot fit an object simply omit it.
 */
export function buildRoof(
  b: Batcher, m: MatLib, p: BuildingParams, prof: StyleProfile,
  blk: Block, blockIndex: number, rng: RNG, blocks: Block[], laundry: LaundryRecord[],
  party: boolean[] = [false, false, false, false],
  anchors: { position: [number, number, number]; kind: string }[] = [],
): RoofLayout | null {
  const exposed = !blocks.some(o => o !== blk && Math.abs(o.y0 - blk.y1) < 0.01 && overlaps(
    { x0: blk.cx - blk.w / 2, x1: blk.cx + blk.w / 2, z0: blk.cz - blk.d / 2, z1: blk.cz + blk.d / 2 },
    { x0: o.cx - o.w / 2, x1: o.cx + o.w / 2, z0: o.cz - o.d / 2, z1: o.cz + o.d / 2 },
  ));
  const roofY = blk.y1;
  b.box(m.membrane, [blk.w + 0.28, 0.19, blk.d + 0.28], [blk.cx, roofY + 0.095, blk.cz], [0, 0, 0], { cast: true, receive: true });

  // The parapet ring always belongs on the outer perimeter — even on a lower tier
  // carrying another mass above it, where it edges a walkable terrace.
  const parapetHeight = prof.parapetSolid ? (p.style === 'kerala' ? 0.95 : 0.78) : 0.62;
  // Ring order is front(0), back(2), right(1), left(3); party edges get no parapet —
  // it would run straight through the neighbouring mass.
  const ring: [number, number, number, number, number][] = [
    [blk.w + 0.28, 0.2, blk.cx, blk.cz + blk.d / 2 + 0.04, 0],
    [blk.w + 0.28, 0.2, blk.cx, blk.cz - blk.d / 2 - 0.04, 2],
    [0.2, blk.d + 0.28, blk.cx + blk.w / 2 + 0.04, blk.cz, 1],
    [0.2, blk.d + 0.28, blk.cx - blk.w / 2 - 0.04, blk.cz, 3],
  ];
  for (const [w, d, x, z, s] of ring) {
    if (party[s]) continue;
    b.box(m.wall, [w, parapetHeight, d], [x, roofY + 0.19 + parapetHeight / 2, z]);
    b.box(m.stone, [w + 0.06, 0.07, d + 0.06], [x, roofY + 0.19 + parapetHeight + 0.035, z], [0, 0, 0], { cast: false });
  }

  // Equipment only belongs on open sky decks, never underneath an upper mass.
  if (!exposed) return null;
  if (!p.roofFeatures || blk.w < 5.6 || blk.d < 4.8) return null;
  const deck = roofY + 0.19;
  const margin = 0.85;
  const bounds: Rect = {
    x0: blk.cx - blk.w / 2 + margin, x1: blk.cx + blk.w / 2 - margin,
    z0: blk.cz - blk.d / 2 + margin, z1: blk.cz + blk.d / 2 - margin,
  };
  const planner = new FootprintPlanner(bounds, rng);
  const style = roofProfile(p, rng);
  const coreW = Math.min(3.3, (bounds.x1 - bounds.x0) * 0.36);
  const coreD = Math.min(2.9, (bounds.z1 - bounds.z0) * 0.5);
  const coreSide = rng.bool() ? -1 : 1;
  const coreX = coreSide < 0 ? bounds.x0 + coreW / 2 : bounds.x1 - coreW / 2;
  const coreZ = bounds.z0 + coreD / 2;
  const core = planner.reserve('core', rect(coreX, coreZ, coreW, coreD), 0)!;
  // A narrow but uninterrupted path from the core door out onto the open roof deck.
  const pathEnd = Math.min(bounds.z1 - 2.6, core.z1 + 1.8);
  if (pathEnd - core.z1 > 0.08) planner.reserve('access', { x0: coreX - 0.53, x1: coreX + 0.53, z0: core.z1 + 0.02, z1: pathEnd }, 0);

  b.box(m.wallAccent, [coreW, 2.5, coreD], [coreX, deck + 1.25, coreZ]);
  b.box(m.stone, [coreW + 0.12, 0.13, coreD + 0.12], [coreX, deck + 2.57, coreZ], [0, 0, 0], { cast: false });
  buildServiceDoor(new DetailFrame(b, [coreX, deck, core.z1 + 0.025]), m, Math.min(0.95, coreW * 0.42), 2.08);
  if (p.floors > 8 && rng.bool(0.5)) {
    b.box(m.panel, [coreW * 0.55, 1.25, coreD * 0.5], [coreX, deck + 3.25, coreZ]);
  }

  // ---------------------------------------------------------------------------
  // Rooftop Hoarding (Large billboard: single-sided, double, or V-shaped)
  // ---------------------------------------------------------------------------
  if (p.roofHoarding && blk.w >= 4.8 && blk.d >= 4.8) {
    const maxTop = Math.max(...blocks.map(ob => ob.y1));
    const isHighest = Math.abs(blk.y1 - maxTop) < 0.05;
    // On multi-block shapes (twin towers, stepped, etc.), select the primary or first highest block:
    const isDesignated = isHighest && !blocks.some((ob, oi) => oi < blockIndex && Math.abs(ob.y1 - maxTop) < 0.05);

    if (isDesignated) {
      // Keep the hoarding away from the stair-core/access side. This matters most for
      // V hoardings, whose wings reach farther back than a flat sign.
      const centred = planHoardingFootprint(p, blk.cx, blk.cz, blk.w, blk.d, p.seed + blockIndex * 137);
      const spare = Math.max(0, (bounds.x1 - bounds.x0 - (centred.rect.x1 - centred.rect.x0)) / 2);
      const hoardingX = blk.cx - coreSide * Math.min(0.85, spare);
      const hoardingPlan = planHoardingFootprint(p, hoardingX, blk.cz, blk.w, blk.d, p.seed + blockIndex * 137);
      const reserved = planner.reserve('hoarding', hoardingPlan.rect, 0.15);
      if (reserved) {
        buildRooftopHoarding(b, m, p, {
          cx: hoardingX,
          cz: blk.cz,
          deckY: deck,
          roofW: blk.w,
          roofD: blk.d,
          seed: p.seed + blockIndex * 137,
          style: p.hoardingStyle,
          variantA: Math.floor(rng.float(0, 4)),
          variantB: Math.floor(rng.float(0, 4)),
        }, anchors);
      }
    }
  }

  const tankCount = p.style === 'glassTower' || p.style === 'luxury'
    ? (rng.bool(0.52) ? 1 : 0) : Math.min(2, 1 + (blk.w > 18 && rng.bool(0.45) ? 1 : 0));
  for (let i = 0; i < tankCount; i++) {
    const tank = planner.find('tank', 2.45, 2.55, 'back');
    if (!tank) break;
    const [x, z] = center(tank);
    buildWaterTank(new DetailFrame(b, [x, deck, z]), m, p, [1.08, 0.08, 0]);
  }

  if (style === 'mechanical') {
    const room = planner.find('mechanical', 3.65, 2.75, 'back');
    if (room) {
      const [x, z] = center(room);
      b.box(m.panel, [2.25, 1.35, 1.75], [x - 0.35, deck + 0.675, z - 0.15]);
      for (let i = 0; i < 4; i++) b.box(m.metal, [2.1, 0.045, 0.06], [x - 0.35, deck + 0.23 + i * 0.26, z + 0.75], [0, 0, 0], { cast: false });
      b.box(m.metalDark, [0.6, 0.48, 0.72], [x + 1.05, deck + 0.24, z + 0.18]);
      b.cylinder(m.metal, 0.22, 0.22, 0.53, 8, [x + 1.05, deck + 0.63, z + 0.18]);
    }
  }

  if (style === 'solar' && p.lod !== 'low') {
    const count = 1 + Math.round(p.roofClutter * (blk.w > 16 ? 3 : 2));
    for (let i = 0; i < count; i++) {
      const panel = planner.find('solar', 3.15, 1.55, 'front');
      if (!panel) break;
      const [x, z] = center(panel);
      b.box(m.solar, [2.9, 0.05, 1.12], [x, deck + 0.45, z], [-0.36, 0, 0]);
      for (const dx of [-1.0, 1.0]) {
        b.box(m.metal, [0.045, 0.41, 0.06], [x + dx, deck + 0.21, z - 0.33], [0, 0, 0], { cast: false });
        b.box(m.metal, [0.045, 0.26, 0.06], [x + dx, deck + 0.13, z + 0.33], [0, 0, 0], { cast: false });
      }
    }
  }

  if ((style === 'terrace' || style === 'planters') && p.roofClutter > 0.08 && p.lod !== 'low') {
    if (style === 'terrace') {
      const seating = planner.find('terrace', 2.9, 2.25, 'front');
      if (seating) {
        const [x, z] = center(seating);
        b.box(m.stone, [2.0, 0.42, 0.52], [x - 0.3, deck + 0.21, z - 0.65], [0, 0, 0], { cast: false });
        b.box(m.stone, [0.44, 0.42, 1.3], [x + 0.9, deck + 0.21, z + 0.2], [0, 0, 0], { cast: false });
        b.box(m.trim, [0.65, 0.34, 0.65], [x - 0.1, deck + 0.17, z + 0.3], [0, 0, 0], { cast: false });
      }
    }
    const count = Math.max(1, Math.round(p.roofClutter * 3));
    for (let i = 0; i < count; i++) {
      const planter = planner.find('planter', 1.9, 1.1, 'front');
      if (!planter) break;
      const [x, z] = center(planter);
      b.box(m.planter, [1.5, 0.38, 0.66], [x, deck + 0.19, z]);
      for (const offset of [-0.45, 0, 0.45]) {
        const leaves = new THREE.IcosahedronGeometry(1, 0);
        b.add(leaves, m.foliage, [x + offset, deck + 0.6, z + rng.float(-0.07, 0.07)],
          [0, rng.float(0, Math.PI), 0], { scale: [0.32, 0.29 + rng.float(0, 0.15), 0.25], cast: false });
        leaves.dispose();
      }
    }
  }

  if (p.acUnits) {
    const count = p.lod === 'low' ? 1 : Math.max(1, Math.round(1 + p.roofClutter * 2));
    for (let i = 0; i < count; i++) {
      const ac = planner.find('ac', 1.55, 1.35, 'back');
      if (!ac) break;
      const [x, z] = center(ac);
      buildAirConditioner(new DetailFrame(b, [x, deck + 0.51, z]), m, p, 0.7, false);
    }
  }

  if (p.laundryLines) {
    const area = planner.find('laundry', 3.4, 1.4, 'front');
    if (area) buildRoofLaundry(b, m, p, { ...area, y: deck }, p.seed + p.roofVariation * 71 + blockIndex * 101, laundry);
  }

  if (p.lod !== 'low' && rng.bool(0.7)) {
    const mast = planner.find('antenna', 0.65, 0.65, 'back');
    if (mast) {
      const [x, z] = center(mast);
      b.cylinder(m.metal, 0.04, 0.06, 2.7, 6, [x, deck + 1.35, z]);
      b.box(m.metalDark, [0.42, 0.05, 0.4], [x, deck + 2.13, z], [0.38, 0, 0], { cast: false });
      if (p.dayNight !== 'day') b.box(m.emissiveCool, [0.12, 0.12, 0.12], [x, deck + 2.77, z], [0, 0, 0], { cast: false });
    }
  }

  return { block: blockIndex, style, bounds, placements: planner.placements };
}