import type { Batcher, Vec3 } from './batcher';
import { DetailFrame } from './components';
import { hoardingUV } from './detailTextures';
import type { MatLib } from './materials';
import { RNG } from './rng';
import type { BuildingParams, HoardingStyle } from './types';
import type { Rect } from './parking';

export interface HoardingOptions {
  cx: number;
  cz: number;
  deckY: number;
  roofW: number;
  roofD: number;
  seed: number;
  style: HoardingStyle;
  variantA: number;
  variantB: number;
}

export interface HoardingResult {
  rect: Rect;
  style: 'single' | 'double' | 'v-shape';
  width: number;
  height: number;
  elevation: number;
}

interface HoardingPlan extends HoardingResult {
  faceZ: number;
  wingLength: number;
  angle: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Plans the complete steel footprint, not just the poster. Braces point inward
 * and the street-side catwalk remains behind the roof parapet.
 */
export function planHoardingFootprint(
  p: BuildingParams,
  cx: number,
  cz: number,
  roofW: number,
  roofD: number,
  seed: number,
): HoardingPlan {
  const rng = new RNG(seed);
  const requested = p.hoardingStyle;
  let style: HoardingResult['style'];
  if (requested === 'single' || requested === 'double' || requested === 'v-shape') style = requested;
  else if (roofW >= 11 && roofD >= 8 && rng.bool(0.42)) style = 'v-shape';
  else style = p.floors >= 10 && rng.bool(0.55) ? 'double' : 'single';

  const faceZ = cz + roofD / 2 - 1.55;
  const elevation = 1.25;
  const angle = 0.72;

  if (style === 'v-shape') {
    // Account for roof planner margins and the rear brace, not just poster corners.
    const maxFromWidth = (roofW - 2.55) / (2 * Math.sin(angle));
    const maxFromDepth = (roofD - 3.05) / Math.cos(angle);
    const feasible = Math.min(5.35, maxFromWidth, maxFromDepth);
    if (feasible >= 2.7) {
      const wingLength = feasible;
      const width = wingLength * 2 * Math.sin(angle);
      const height = clamp(width * 0.38, 2.35, 3.1);
      const depth = wingLength * Math.cos(angle);
      return {
        style, width, height, elevation, faceZ, wingLength, angle,
        rect: {
          x0: cx - width / 2 - 0.4,
          x1: cx + width / 2 + 0.4,
          z0: faceZ - depth - 0.95,
          z1: faceZ + 0.58,
        },
      };
    }
    // A V cannot be squeezed onto a narrow tower without its footings leaving the roof.
    // Fall back to a compact single face instead of silently omitting the requested sign.
    style = 'single';
  }

  // Narrow twin towers get a compact sign; broad towers retain a skyline-scale face.
  const width = clamp(roofW - 2.3, 2.4, 9.2);
  const height = clamp(width * 0.34, 1.45, 3.1);
  const depth = style === 'double' ? 2.0 : 2.65;
  return {
    style, width, height, elevation, faceZ, wingLength: width, angle,
    rect: {
      x0: cx - width / 2 - 0.28,
      x1: cx + width / 2 + 0.28,
      z0: faceZ - depth - 0.18,
      z1: faceZ + 0.58,
    },
  };
}

function addBoard(
  f: DetailFrame,
  m: MatLib,
  p: BuildingParams,
  width: number,
  height: number,
  variant: number,
  anchors: { position: Vec3; kind: string }[],
) {
  // Backing first, then poster with 18mm clearance: no z-fighting.
  f.box(m.metalDark, [width, height, 0.055], [0, 0, -0.025]);
  f.panel(m.hoarding, [width - 0.14, height - 0.14], [0, 0, 0.018], { uvRect: hoardingUV(variant) });

  const frame = 0.075;
  f.box(m.metal, [width + frame, frame, 0.105], [0, height / 2, 0.02]);
  f.box(m.metal, [width + frame, frame, 0.105], [0, -height / 2, 0.02]);
  f.box(m.metal, [frame, height, 0.105], [-width / 2, 0, 0.02]);
  f.box(m.metal, [frame, height, 0.105], [width / 2, 0, 0.02]);

  // Slim maintenance walk, deliberately lighter than a balcony.
  if (p.lod !== 'low') {
    const catY = -height / 2 - 0.12;
    f.box(m.metalDark, [width + 0.2, 0.055, 0.52], [0, catY, 0.25]);
    f.pipe(m.metal, [[-width / 2, catY + 0.76, 0.48], [width / 2, catY + 0.76, 0.48]], 0.018, 4);
    for (let x = -width / 2; x <= width / 2 + 0.01; x += 1.7) {
      f.pipe(m.metal, [[x, catY, 0.48], [x, catY + 0.76, 0.48]], 0.014, 4);
    }
  }

  // Compact LED washers below the face preserve the clean top silhouette.
  const lights = width >= 8 ? 4 : 3;
  for (let i = 0; i < lights; i++) {
    const x = -width / 2 + width * (i + 0.5) / lights;
    const y = -height / 2 - 0.36;
    f.pipe(m.metalDark, [[x, y + 0.18, 0], [x, y, 0.44]], 0.018, 4);
    f.box(m.metalDark, [0.28, 0.11, 0.2], [x, y, 0.47]);
    f.box(p.dayNight === 'day' ? m.glassSpandrel : m.emissiveWarm, [0.24, 0.025, 0.16], [x, y - 0.055, 0.48], false);
  }
  if (p.dayNight !== 'day') {
    anchors.push({ position: f.world(-width * 0.25, -height / 2 - 0.45, 0.75), kind: 'hoarding' });
    anchors.push({ position: f.world(width * 0.25, -height / 2 - 0.45, 0.75), kind: 'hoarding' });
  }
}

function ladder(b: Batcher, m: MatLib, x: number, y: number, z: number, height: number) {
  for (const dz of [-0.17, 0.17]) b.pipe(m.metal, [[x, y, z + dz], [x, y + height, z + dz]], 0.016, 4);
  for (let dy = 0.25; dy < height; dy += 0.3) {
    b.pipe(m.metal, [[x, y + dy, z - 0.17], [x, y + dy, z + 0.17]], 0.012, 3);
  }
}

function singleOrDouble(
  b: Batcher,
  m: MatLib,
  p: BuildingParams,
  opt: HoardingOptions,
  plan: HoardingPlan,
  anchors: { position: Vec3; kind: string }[],
) {
  const backToBack = plan.style === 'double';
  const faceZ = plan.faceZ;
  const rearZ = faceZ - (backToBack ? 0.9 : 2.1);
  const boardY = opt.deckY + plan.elevation + plan.height / 2;
  const columnXs = plan.width > 7.4
    ? [-plan.width / 2 + 0.35, 0, plan.width / 2 - 0.35]
    : [-plan.width / 2 + 0.35, plan.width / 2 - 0.35];

  for (const dx of columnXs) {
    const x = opt.cx + dx;
    b.box(m.stone, [0.5, 0.16, 0.5], [x, opt.deckY + 0.08, faceZ]);
    b.box(m.metalDark, [0.16, plan.elevation + plan.height, 0.16], [x, opt.deckY + (plan.elevation + plan.height) / 2, faceZ]);
    b.box(m.stone, [0.5, 0.16, 0.5], [x, opt.deckY + 0.08, rearZ]);

    if (backToBack) {
      b.box(m.metalDark, [0.16, plan.elevation + plan.height, 0.16], [x, opt.deckY + (plan.elevation + plan.height) / 2, rearZ]);
      b.pipe(m.metalDark, [[x, opt.deckY + plan.elevation, faceZ], [x, opt.deckY + plan.elevation + plan.height, rearZ]], 0.03, 5);
      b.pipe(m.metalDark, [[x, opt.deckY + plan.elevation + plan.height, faceZ], [x, opt.deckY + plan.elevation, rearZ]], 0.03, 5);
    } else {
      // A-frame braces remain hidden behind the poster from street level.
      b.pipe(m.metalDark, [[x, opt.deckY + plan.elevation + plan.height - 0.1, faceZ - 0.05], [x, opt.deckY + 0.16, rearZ]], 0.042, 5);
      b.pipe(m.metalDark, [[x, opt.deckY + plan.elevation + 0.2, faceZ - 0.05], [x, opt.deckY + 0.16, rearZ]], 0.028, 4);
    }
  }

  for (const y of [boardY - plan.height * 0.38, boardY, boardY + plan.height * 0.38]) {
    b.pipe(m.metalDark, [[opt.cx - plan.width / 2, y, faceZ - 0.07], [opt.cx + plan.width / 2, y, faceZ - 0.07]], 0.03, 4);
  }

  addBoard(new DetailFrame(b, [opt.cx, boardY, faceZ]), m, p, plan.width, plan.height, opt.variantA, anchors);
  if (backToBack) addBoard(new DetailFrame(b, [opt.cx, boardY, rearZ], Math.PI), m, p, plan.width, plan.height, opt.variantB, anchors);
  if (p.lod !== 'low') ladder(b, m, opt.cx + plan.width / 2 + 0.18, opt.deckY, backToBack ? (faceZ + rearZ) / 2 : rearZ, plan.elevation);
}

function vShape(
  b: Batcher,
  m: MatLib,
  p: BuildingParams,
  opt: HoardingOptions,
  plan: HoardingPlan,
  anchors: { position: Vec3; kind: string }[],
) {
  const apexX = opt.cx, apexZ = plan.faceZ;
  const boardY = opt.deckY + plan.elevation + plan.height / 2;
  const ends: [number, number][] = [];

  b.box(m.stone, [0.55, 0.16, 0.55], [apexX, opt.deckY + 0.08, apexZ]);
  b.box(m.metalDark, [0.18, plan.elevation + plan.height, 0.18], [apexX, opt.deckY + (plan.elevation + plan.height) / 2, apexZ]);

  for (const side of [-1, 1]) {
    const dx = side * Math.sin(plan.angle) * plan.wingLength;
    const dz = -Math.cos(plan.angle) * plan.wingLength;
    const endX = apexX + dx, endZ = apexZ + dz;
    const midX = apexX + dx / 2, midZ = apexZ + dz / 2;
    ends.push([endX, endZ]);

    b.box(m.stone, [0.5, 0.16, 0.5], [endX, opt.deckY + 0.08, endZ]);
    b.box(m.metalDark, [0.16, plan.elevation + plan.height, 0.16], [endX, opt.deckY + (plan.elevation + plan.height) / 2, endZ]);
    const braceZ = endZ - 0.65;
    b.box(m.stone, [0.46, 0.16, 0.46], [endX, opt.deckY + 0.08, braceZ]);
    b.pipe(m.metalDark, [[endX, opt.deckY + plan.elevation + plan.height - 0.1, endZ], [endX, opt.deckY + 0.16, braceZ]], 0.04, 5);

    // Correct outward normals: left face points front-left, right front-right.
    const yaw = side * (Math.PI / 2 - plan.angle);
    addBoard(new DetailFrame(b, [midX, boardY, midZ], yaw), m, p, plan.wingLength, plan.height,
      side < 0 ? opt.variantA : opt.variantB, anchors);
  }

  const [left, right] = ends;
  b.pipe(m.metalDark, [[left[0], opt.deckY + plan.elevation, left[1]], [right[0], opt.deckY + plan.elevation, right[1]]], 0.035, 5);
  b.pipe(m.metalDark, [[left[0], opt.deckY + 0.22, left[1]], [apexX, opt.deckY + plan.elevation, apexZ]], 0.028, 5);
  b.pipe(m.metalDark, [[right[0], opt.deckY + 0.22, right[1]], [apexX, opt.deckY + plan.elevation, apexZ]], 0.028, 5);
  if (p.lod !== 'low') ladder(b, m, right[0] + 0.18, opt.deckY, right[1], plan.elevation);
}

/** Build a clean large-format rooftop advertising hoarding in the reserved roof zone. */
export function buildRooftopHoarding(
  b: Batcher,
  m: MatLib,
  p: BuildingParams,
  opt: HoardingOptions,
  anchors: { position: Vec3; kind: string }[],
): HoardingResult {
  const plan = planHoardingFootprint(p, opt.cx, opt.cz, opt.roofW, opt.roofD, opt.seed);
  if (plan.style === 'v-shape') vShape(b, m, p, opt, plan, anchors);
  else singleOrDouble(b, m, p, opt, plan, anchors);
  return plan;
}