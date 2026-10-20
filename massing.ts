import type { Block } from './building';
import type { BuildingParams, Massing, StyleProfile } from './types';
import type { RNG } from './rng';
import type { Rect } from './parking';

/**
 * Massing planner: the building footprint as a set of non-overlapping blocks.
 *
 * Every multi-block shape is edge-glued (blocks share full edge segments, never
 * partial overlaps), so there is no z-fighting and no volumetric intersection.
 * Faces glued to a neighbour are reported as party walls; faces across a narrow
 * gap are reported as near, so facades, roofs and sites can treat them correctly.
 */

export interface MassingPlan {
  shape: Massing;
  blocks: Block[];
  /** Block carrying the main street entrance. */
  primary: number;
  /** party[bi][side] — that face is glued to another block (no openings). */
  party: boolean[][];
  /** near[bi][side] — another block faces this one across a narrow gap (windows ok, no balconies/AC). */
  near: boolean[][];
  footprint: Rect;
  description: string;
  bridges: { y: number; x0: number; x1: number; z: number; w: number }[];
}

export const NEAR_GAP = 3.5;

function facePlane(b: Block, side: number): number {
  if (side === 0) return b.cz + b.d / 2;
  if (side === 2) return b.cz - b.d / 2;
  if (side === 1) return b.cx + b.w / 2;
  return b.cx - b.w / 2;
}

function faceSpan(b: Block, side: number): [number, number] {
  return side === 0 || side === 2 ? [b.cx - b.w / 2, b.cx + b.w / 2] : [b.cz - b.d / 2, b.cz + b.d / 2];
}

const overlap1D = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** Sides: 0 = +z (front), 1 = +x (right), 2 = -z (back), 3 = -x (left). */
export function analyzeAdjacency(blocks: Block[]): { party: boolean[][]; near: boolean[][] } {
  const party = blocks.map(() => [false, false, false, false]);
  const near = blocks.map(() => [false, false, false, false]);
  for (let i = 0; i < blocks.length; i++) {
    for (let s = 0; s < 4; s++) {
      const opp = (s + 2) % 4;
      const plane = facePlane(blocks[i], s);
      const [s0, s1] = faceSpan(blocks[i], s);
      for (let j = 0; j < blocks.length; j++) {
        if (i === j) continue;
        const b = blocks[j];
        // Vertical ranges must overlap for faces to interact.
        if (b.y0 >= blocks[i].y1 - 0.01 || b.y1 <= blocks[i].y0 + 0.01) continue;
        const oPlane = facePlane(b, opp);
        const [o0, o1] = faceSpan(b, opp);
        const span = overlap1D(s0, s1, o0, o1);
        if (span <= 0.3) continue;
        const differs = s === 0 || s === 1 ? oPlane - plane : plane - oPlane;
        if (Math.abs(differs) < 0.012) {
          party[i][s] = true;
        } else if (differs > 0 && differs < NEAR_GAP) {
          near[i][s] = true;
        }
      }
    }
  }
  return { party, near };
}

export function planMassing(p: BuildingParams, prof: StyleProfile, rng: RNG): MassingPlan {
  const W = p.width * p.bay;
  const D = p.depth * p.bay;
  const FH = p.floorHeight;
  const F = p.floors;
  const bay = p.bay;
  const shape: Massing = p.massing === 'auto' ? prof.defaultMassing : p.massing;
  const mk = (cx: number, cz: number, w: number, d: number, fStart: number, fCount: number): Block => ({
    cx, cz, w, d, fStart, fCount, y0: fStart * FH, y1: (fStart + fCount) * FH,
  });
  const finish = (
    blocks: Block[], description: string,
    bridges: MassingPlan['bridges'] = [],
  ): MassingPlan => {
    const { party, near } = analyzeAdjacency(blocks);
    // Primary = largest ground block on the street frontage (front-most, then widest, then centred).
    const front = Math.max(...blocks.filter(b => b.fStart === 0).map(b => b.cz + b.d / 2));
    const cands = blocks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.fStart === 0 && b.cz + b.d / 2 > front - 0.5);
    cands.sort((a, b2) => b2.b.w * b2.b.d - a.b.w * a.b.d || Math.abs(a.b.cx) - Math.abs(b2.b.cx));
    const primary = cands.length ? cands[0].i : 0;
    const footprint: Rect = {
      x0: Math.min(...blocks.map(b => b.cx - b.w / 2)),
      x1: Math.max(...blocks.map(b => b.cx + b.w / 2)),
      z0: Math.min(...blocks.map(b => b.cz - b.d / 2)),
      z1: Math.max(...blocks.map(b => b.cz + b.d / 2)),
    };
    return { shape, blocks, primary, party, near, footprint, description, bridges };
  };

  if (shape === 'slab' || F <= 4) {
    return finish([mk(0, 0, W, D, 0, F)], 'Single linear slab');
  }
  if (shape === 'tower') {
    const podium = Math.min(2, F - 3);
    const shaftW = Math.max(2 * bay, W * 0.62);
    const shaftD = Math.max(2 * bay, D * 0.62);
    return finish(
      [mk(0, 0, W + 2.2, D + 1.8, 0, podium), mk(0, 0, shaftW, shaftD, podium, F - podium)],
      'Podium with a centred residential shaft',
    );
  }
  if (shape === 'podium') {
    const podium = Math.min(3, F - 4);
    const shift = rng.float(-0.4, 0.4);
    return finish(
      [mk(0, 0, W + 3.0, D + 2.2, 0, podium), mk(shift, 0, W, D, podium, F - podium)],
      'Wide podium with an offset slab above',
    );
  }
  if (shape === 'stepped') {
    const topCount = Math.max(2, Math.round(F * 0.3));
    const midCount = F - topCount;
    const inset = Math.min(bay, 2.6);
    return finish(
      [mk(0, 0, W, D, 0, midCount), mk(0, -inset * 0.2, W - inset, D - inset * 0.6, midCount, topCount)],
      'Two-tier setback crown',
    );
  }
  if (shape === 'staggered') {
    const tiers = Math.max(2, Math.round(F / 3));
    const blocks: Block[] = [];
    let floor = 0;
    while (floor < F) {
      const count = Math.min(tiers, F - floor);
      const inset = Math.min(bay, 2.4);
      const w = W - inset * Math.floor(floor / tiers);
      const d = D - inset * 0.5 * Math.floor(floor / tiers);
      blocks.push(mk(0, 0, Math.max(2 * bay, w), Math.max(2 * bay, d), floor, count));
      floor += count;
    }
    return finish(blocks, `${blocks.length}-tier wedding-cake setbacks`);
  }
  if (shape === 'twin') {
    // Two towers sharing one podium, split by a real lightwell gap and tied by a skybridge.
    if (W < 4 * bay + 2) return finish([mk(0, 0, W, D, 0, F)], 'Single linear slab (plot too narrow for twins)');
    const podium = Math.min(2, F - 3);
    const gap = Math.min(6.5, Math.max(4.5, W * 0.22 + rng.float(-0.5, 0.5)));
    const towerW = (W - gap) / 2;
    const dropB = rng.int(0, 2);
    const tA = F - podium;
    const tB = Math.max(3, F - podium - dropB);
    const towers = [
      mk(-(towerW / 2 + gap / 2), 0, towerW, D, podium, tA),
      mk(+(towerW / 2 + gap / 2), 0, towerW, D, podium, tB),
    ];
    const blocks = [mk(0, 0, W + 2.2, D + 1.8, 0, podium), ...towers];
    const bridges: MassingPlan['bridges'] = [];
    const shared = Math.min(tA, tB);
    if (gap >= 3.5 && shared >= 3 && rng.bool(0.75)) {
      const gb = podium + shared - 2;
      bridges.push({ y: gb * FH, x0: -gap / 2, x1: gap / 2, z: 0, w: 2.4 });
    }
    return finish(blocks, dropB === 0 ? 'Twin towers on a shared podium' : 'Twin towers, one stepped down, on a shared podium', bridges);
  }
  if (shape === 'L') {
    if (W < 4 * bay || D < 4 * bay) return finish([mk(0, 0, W, D, 0, F)], 'Single linear slab (plot too small for an L)');
    const mirror = rng.bool(); // stem on the left or the right
    const split = W * rng.float(0.38, 0.55);
    const stemW = Math.min(Math.max(split, 2 * bay), W - 2 * bay);
    const wingD = Math.min(Math.max(D * rng.float(0.4, 0.55), 2 * bay), D - 2 * bay);
    const wingDrop = rng.bool(0.45) ? Math.min(2, F - 3) : 0;
    const stemX0 = mirror ? W / 2 - stemW : -W / 2;
    const wingX0 = mirror ? -W / 2 : -W / 2 + stemW;
    const wingW = W - stemW;
    return finish(
      [
        mk(stemX0 + stemW / 2, 0, stemW, D, 0, F),
        mk(wingX0 + wingW / 2, D / 2 - wingD / 2, wingW, wingD, 0, Math.max(3, F - wingDrop)),
      ],
      mirror ? 'L-block with the wing reaching right' : 'L-block with the wing reaching left',
    );
  }
  if (shape === 'T') {
    if (W < 4 * bay || D < 4 * bay) return finish([mk(0, 0, W, D, 0, F)], 'Single linear slab (plot too small for a T)');
    const cd = Math.min(Math.max(D * 0.32, 2 * bay), D - 2 * bay);
    const sw = Math.min(Math.max(W * 0.3, 2 * bay), W - 2 * bay);
    const ox = rng.float(-1, 1) * ((W - sw) / 2) * 0.5;
    return finish(
      [
        mk(0, D / 2 - cd / 2, W, cd, 0, F),
        mk(ox, -D / 2 + (D - cd) / 2, sw, D - cd, 0, F),
      ],
      ox === 0 ? 'Symmetric T-block' : ox < 0 ? 'T-block with an offset stem' : 'T-block with an offset stem',
    );
  }
  if (shape === 'U') {
    const fb = Math.min(Math.max(D * 0.28, 1.6 * bay), D * 0.34);
    const aw = Math.min(Math.max(W * 0.24, 1.8 * bay), W * 0.3);
    if (fb > D - 2 * bay || 2 * aw > W - 2 * bay) {
      return finish([mk(0, 0, W, D, 0, F)], 'Single linear slab (plot too small for a court)');
    }
    const armD = D - fb;
    return finish(
      [
        mk(0, D / 2 - fb / 2, W, fb, 0, F),
        mk(-W / 2 + aw / 2, -D / 2 + armD / 2, aw, armD, 0, F),
        mk(W / 2 - aw / 2, -D / 2 + armD / 2, aw, armD, 0, F),
      ],
      'U-court opening onto a private rear garden',
    );
  }
  // 'courtyard' — a fully enclosed perimeter (O). Four edge-glued bars, one open sky well.
  const bd = Math.min(W, D) * 0.22;
  if (W - 2 * bd < 2 * bay || D - 2 * bd < 2 * bay || bd < 1.8) {
    return finish([mk(0, 0, W, D, 0, F)], 'Single linear slab (plot too small for a courtyard)');
  }
  return finish(
    [
      mk(0, D / 2 - bd / 2, W, bd, 0, F),
      mk(0, -D / 2 + bd / 2, W, bd, 0, F),
      mk(-W / 2 + bd / 2, 0, bd, D - 2 * bd, 0, F),
      mk(W / 2 - bd / 2, 0, bd, D - 2 * bd, 0, F),
    ],
    'Enclosed courtyard perimeter with a central sky well',
  );
}
