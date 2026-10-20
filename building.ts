import * as THREE from 'three';
import { RNG, moduleSeed } from './rng';
import { Batcher, type BatchOptions } from './batcher';
import { getMaterials, type MatLib } from './materials';
import { colorSummary, resolveColors, roofTone, wallTone, type ColorPlan } from './colors';
import { buildBalconyLaundry, type LaundryRecord } from './laundry';
import { DEFAULT_PARAMS, PALETTES, STYLE_PROFILES, type BuildingParams, type StyleProfile } from './types';
import { DetailFrame, buildAirConditioner, buildDownpipe, buildEntrance, buildEntranceApproach, buildPottedPlant, buildServiceDoor, buildShopfront, buildWindow } from './components';
import { planMassing } from './massing';
import { analyzeBay } from './spatial';
import { buildGarage, buildSurfaceLot, groundWithOpening, mirrorRect, planGarage, type Rect, type SurfacePlan } from './parking';
import { buildRoof, type RoofLayout } from './roof';

const WT = 0.3; // exterior wall thickness

export interface Block {
  cx: number; cz: number;
  w: number; d: number;
  fStart: number; fCount: number;
  y0: number; y1: number;
}

export interface SiteLayout {
  entrance: { position: [number, number, number]; threshold: number };
  parking: 'underground' | 'surface' | 'none';
  parkingLayout?: {
    side: 'left' | 'right'; marking: 'lines' | 'corners'; bays: Rect[]; vehicles: Rect[];
    columns: Rect[]; stair: Rect | null; aisle?: Rect; entryLane?: Rect;
    canopy?: SurfacePlan['canopy']; bayRow?: 'rear' | 'front';
  };
  bounds: Rect;
  plantCenters: [number, number][];
  frontPlanters: Rect[];
  gradedApproach?: Rect;
  /** Present only when a basement actually fits the plot. */
  garage?: {
    rampWidth: number; rampRun: number; slope: number; floorLevel: number; clearance: number;
    /** Ramp head at grade, mid-slope point and the basement portal, all in building-local space. */
    rampTop: [number, number, number]; rampCenter: [number, number, number]; portal: [number, number, number];
    /** Opening the generator cuts in its own site slab. Cut host terrain to match, or the trough is covered. */
    excavation: { x0: number; x1: number; z0: number; z1: number; depth: number };
  };
  parkingSpaces: number;
}

type ModuleKind = 'window' | 'glass' | 'solid' | 'balcony';

const SIDES = [
  { ux: 1, uz: 0, nx: 0, nz: 1, rotY: 0 },
  { ux: 0, uz: -1, nx: 1, nz: 0, rotY: Math.PI / 2 },
  { ux: -1, uz: 0, nx: 0, nz: -1, rotY: Math.PI },
  { ux: 0, uz: 1, nx: -1, nz: 0, rotY: -Math.PI / 2 },
];

/** Deterministic 0..1 hash so toggling one option never reshuffles everything. */
function hash01(...v: number[]): number {
  let h = 2166136261 >>> 0;
  for (const n of v) {
    h ^= Math.imul(Math.round(n * 1000) ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  }
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Facade-local placement helper: u runs along the wall, out runs away from it. */
class Face {
  readonly len: number;
  readonly halfN: number;
  readonly rotY: number;
  constructor(private b: Batcher, private block: Block, private side: number) {
    const s = SIDES[side];
    const alongX = Math.abs(s.ux) > 0.5;
    this.len = alongX ? block.w : block.d;
    this.halfN = alongX ? block.d / 2 : block.w / 2;
    this.rotY = s.rotY;
  }
  world(u: number, y: number, out: number): [number, number, number] {
    const s = SIDES[this.side];
    const n = this.halfN + out;
    return [this.block.cx + s.ux * u + s.nx * n, y, this.block.cz + s.uz * u + s.nz * n];
  }
  box(mat: THREE.Material, lw: number, lh: number, ln: number, u: number, y: number, out: number, cast = true) {
    if (lw <= 0 || lh <= 0 || ln <= 0) return;
    this.b.box(mat, [lw, lh, ln], this.world(u, y, out), [0, this.rotY, 0], { cast, receive: true });
  }
  panel(mat: THREE.Material, lw: number, lh: number, u: number, y: number, out: number, opts: BatchOptions = {}) {
    if (lw <= 0 || lh <= 0) return;
    this.b.plane(mat, [lw, lh], this.world(u, y, out), [0, this.rotY, 0], opts);
  }
  rod(mat: THREE.Material, r: number, len: number, u: number, y: number, out: number) {
    this.b.cylinder(mat, r, r, len, 6, this.world(u, y, out), [0, this.rotY, Math.PI / 2]);
  }
}

let laundryLog: LaundryRecord[] = [];

/** A view of the material library with a different wall material; everything else is inherited. */
function withWall(m: MatLib, wall: MatLib['wall']): MatLib {
  return Object.assign(Object.create(m) as MatLib, { wall });
}

export function generateBuilding(paramsIn: Partial<BuildingParams> & { seed: number }): THREE.Group {
  const p = { ...DEFAULT_PARAMS, ...paramsIn };
  const numeric = (v: number, min: number, max: number, fallback: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : fallback));
  p.seed = Math.trunc(numeric(p.seed, 0, 4294967295, DEFAULT_PARAMS.seed));
  p.floors = Math.round(numeric(p.floors, 2, 24, 6));
  p.width = Math.round(numeric(p.width, 3, 10, 5));
  p.depth = Math.round(numeric(p.depth, 2, 8, 4));
  p.bay = numeric(p.bay, 2.6, 4.4, 3.2);
  p.floorHeight = numeric(p.floorHeight, 2.6, 4, 3.1);
  p.windowRecess = numeric(p.windowRecess, 0.2, 1.1, 0.62);
  p.surfaceVariation = numeric(p.surfaceVariation, 0, 1, 0.35);
  p.acDensity = numeric(p.acDensity, 0, 1, 0.5);
  p.balconyChance = numeric(p.balconyChance, 0, 1, 0.7);
  p.litWindowRatio = numeric(p.litWindowRatio, 0, 1, 0.55);
  p.parkedVehicles = Math.round(numeric(p.parkedVehicles, 0, 10, 3));
  p.parkingVariation = Math.round(numeric(p.parkingVariation, 0, 9999, 0));
  p.roofVariation = Math.round(numeric(p.roofVariation, 0, 9999, 0));
  p.roofClutter = numeric(p.roofClutter, 0, 1, 0.55);
  p.laundryDensity = numeric(p.laundryDensity, 0, 1, 0.3);
  p.laundryWind = numeric(p.laundryWind, 0, 1, 0.25);
  p.colorShift = numeric(p.colorShift, 0, 1, 0.6);
  p.colorVariation = Math.round(numeric(p.colorVariation, 0, 9999, 0));
  p.massingVariation = Math.round(numeric(p.massingVariation, 0, 9999, 0));
  if (!['auto', 'slab', 'tower', 'stepped', 'podium', 'twin', 'L', 'T', 'U', 'courtyard', 'staggered'].includes(p.massing)) p.massing = 'auto';
  if (!['auto', 'single', 'stripe', 'crown', 'blocks'].includes(p.colorScheme)) p.colorScheme = 'auto';
  if (p.palette !== 'auto' && !(p.palette in PALETTES)) p.palette = 'auto';
  p.roofHoarding = Boolean(p.roofHoarding);
  if (!['auto', 'single', 'double', 'v-shape'].includes(p.hoardingStyle)) p.hoardingStyle = 'auto';
  laundryLog = [];
  if (!(p.style in STYLE_PROFILES)) p.style = 'modern';
  const prof = STYLE_PROFILES[p.style];
  const b = new Batcher();

  const rngMass = new RNG(moduleSeed(p.seed, p.massingVariation, 0x6d617373));

  const massingPlan = planMassing(p, prof, rngMass);
  const blocks = massingPlan.blocks;
  const colors = resolveColors(p, blocks.length);
  const mats = getMaterials(colors.palette, p.dayNight, p.style, p.surfaceVariation);
  const W = p.width * p.bay;
  const D = p.depth * p.bay;
  const lightAnchors: { position: [number, number, number]; kind: string }[] = [];

  // Opaque core prevents see-through between opposite facades.
  for (const blk of blocks) {
    const floorStart = p.groundFloor === 'stilts' && blk.y0 === 0 ? p.floorHeight : blk.y0;
    b.box(mats.reveal, [Math.max(blk.w - 2.7, 0.1), blk.y1 - floorStart, Math.max(blk.d - 2.7, 0.1)],
      [blk.cx, (floorStart + blk.y1) / 2, blk.cz], [0, 0, 0], { cast: true, receive: false });
  }

  const roofLayouts: RoofLayout[] = [];
  blocks.forEach((blk, bi) => {
    for (let side = 0; side < 4; side++) {
      buildFacade(b, mats, p, prof, blk, bi, side, lightAnchors, colors.plan, bi === massingPlan.primary, blocks);
    }
    const roofMats = roofTone(colors.plan, bi) === 'deep' ? withWall(mats, mats.wallDeep) : mats;
    const plan = buildRoof(b, roofMats, p, prof, blk, bi, new RNG(moduleSeed(p.seed, p.roofVariation, 0x8da410 + bi)), blocks, laundryLog, massingPlan.party[bi], lightAnchors);
    if (plan) roofLayouts.push(plan);
  });
  for (const br of massingPlan.bridges) buildBridge(b, mats, br);

  // The street entrance belongs to the primary block, not the plot centre.
  const pb = blocks[massingPlan.primary];
  const entranceX = Math.min(Math.max(pb.cx, pb.cx - pb.w / 2 + 1), pb.cx + pb.w / 2 - 1);
  const site = buildPlot(b, mats, p, prof, W, D, new RNG(moduleSeed(p.seed, p.parkingVariation, 0x5146f9)), lightAnchors, entranceX, massingPlan.footprint.z1);

  const group = b.build(`apartment-${p.seed}`);
  group.userData.params = p;
  group.userData.lightAnchors = lightAnchors;
  group.userData.blocks = blocks;
  group.userData.massing = {
    shape: massingPlan.shape,
    primary: massingPlan.primary,
    description: massingPlan.description,
    partySides: massingPlan.party.flat().filter(Boolean).length,
  };
  group.userData.site = site;
  group.userData.roofs = roofLayouts;
  group.userData.colors = colorSummary(colors);
  group.userData.laundry = laundryLog;
  laundryLog = [];
  return group;
}

/* ------------------------------------------------------------------ skybridges */

function buildBridge(b: Batcher, m: MatLib, br: { y: number; x0: number; x1: number; z: number; w: number }) {
  const cx = (br.x0 + br.x1) / 2;
  const len = br.x1 - br.x0;
  if (len <= 0.5) return;
  b.box(m.slab, [len + 0.3, 0.28, br.w], [cx, br.y + 0.14, br.z]);
  b.box(m.soffit, [len + 0.2, 0.06, br.w - 0.1], [cx, br.y - 0.03, br.z], [0, 0, 0], { cast: false });
  for (const s of [-1, 1]) {
    b.box(m.railGlass, [len, 0.95, 0.04], [cx, br.y + 0.75, br.z + s * (br.w / 2 - 0.02)], [0, 0, 0], { cast: false });
    b.box(m.accentMetal, [len, 0.07, 0.07], [cx, br.y + 1.26, br.z + s * (br.w / 2 - 0.02)], [0, 0, 0], { cast: false });
  }
}

/* ------------------------------------------------------------------ facades */

function moduleKind(p: BuildingParams, prof: StyleProfile, bi: number, side: number, floor: number, bay: number, bays: number): ModuleKind {
  const front = side === 0;
  const compositionFloor = p.windowLayout === 'random' || p.style === 'kerala' ? floor : 0;
  const h = hash01(p.seed, bi, side, compositionFloor, bay);
  if (p.windowLayout === 'ribbon' && floor > 0) return h < 0.08 ? 'solid' : 'glass';

  let glassChance = prof.curtainWall;
  if (!front && side !== 2) glassChance *= 0.6;
  if (h < glassChance) return 'glass';

  switch (p.windowLayout) {
    case 'vertical':
      if (bay % 2 === 1 && bays > 3) return 'solid';
      break;
    case 'staggered':
      if ((bay + floor) % 3 === 2) return 'solid';
      break;
    case 'random':
      if (h > 0.86) return 'solid';
      break;
  }

  const balconyAllowed = p.balconyStyle !== 'none' && floor > 0 && (side === 0 || side === 2 || hash01(p.seed, side, bay) > 0.75);
  if (balconyAllowed) {
    const chance = p.balconyChance * prof.balconyBias * (side === 0 ? 1.15 : 0.7);
    if (hash01(p.seed + 5, bi, side, compositionFloor, bay) < chance) return 'balcony';
  }
  return 'window';
}

function buildFacade(
  b: Batcher, m: MatLib, p: BuildingParams, prof: StyleProfile,
  blk: Block, bi: number, side: number,
  anchors: { position: [number, number, number]; kind: string }[],
  plan: ColorPlan,
  isPrimary: boolean,
  blocks: Block[],
) {
  const f = new Face(b, blk, side);
  const FH = p.floorHeight;
  const bays = Math.max(2, Math.round(f.len / p.bay));
  const bw = f.len / bays;
  const isGround = blk.fStart === 0;
  const lowDetail = p.lod === 'low';

  for (let fl = 0; fl < blk.fCount; fl++) {
    const floor = blk.fStart + fl;
    const yBase = blk.y0 + fl * FH;

    // ---- ground floor treatment on the bottom block
    if (isGround && floor === 0) {
      buildGroundFloor(b, m, p, prof, f, bi, side, bays, bw, yBase, FH, anchors, isPrimary, blocks);
      continue;
    }

    for (let bay = 0; bay < bays; bay++) {
      const u = -f.len / 2 + bw / 2 + bay * bw;
      const spatial = analyzeBay(blocks, bi, side, floor, u, bw);
      const tone = wallTone(plan, { block: bi, side, floor, bay, bays, floors: p.floors });
      const mm = tone === 'deep' ? withWall(m, m.wallDeep) : m;

      // If glued to another block at this floor, draw solid party wall:
      if (spatial.isParty) {
        f.box(mm.wall, bw, FH, WT, u, yBase + FH / 2, -WT / 2);
        continue;
      }

      // Exposed facade bay: draw slab band & soffit:
      if (p.slabBands && prof.slabBands) {
        f.box(m.slab, bw + 0.02, 0.26, 0.34, u, yBase + 0.08, 0.1);
        f.box(m.soffit, bw - 0.04, 0.06, 0.3, u, yBase - 0.06, 0.08, false);
      }

      let kind = moduleKind(p, prof, bi, side, floor, bay, bays);
      // If a balcony would collide with an inside corner or perpendicular wall, fall back to clean window:
      if (kind === 'balcony' && !spatial.canBalcony) {
        kind = 'window';
      }

      switch (kind) {
        case 'glass':
          curtainBay(b, mm, p, f, bw, u, yBase, FH, bi, side, floor, bay);
          break;
        case 'solid':
          f.box(mm.wall, bw, FH, WT, u, yBase + FH / 2, -WT / 2);
          if (prof.fins && p.verticalFins && !lowDetail && spatial.frontClearance > 1.2) {
            f.box(m.accentMetal, 0.12, FH * 0.9, 0.3, u, yBase + FH / 2, 0.16, false);
          }
          break;
        case 'balcony':
          windowBay(b, mm, p, prof, f, bw, u, yBase, FH, bi, side, floor, bay, true, !spatial.canAC);
          balcony(
            b,
            m,
            p,
            f,
            bw,
            u,
            yBase,
            FH,
            bi,
            side,
            floor,
            bay,
            anchors,
            fl + 1 < blk.fCount && moduleKind(p, prof, bi, side, floor + 1, bay, bays) === 'balcony',
          );
          break;
        default:
          windowBay(b, mm, p, prof, f, bw, u, yBase, FH, bi, side, floor, bay, false, !spatial.canAC);
      }
    }

    // Corner pilasters on exposed corners only:
    if (prof.pilasters && side % 2 === 0 && !lowDetail) {
      for (const sgn of [-1, 1]) {
        const cu = sgn * (f.len / 2 - 0.15);
        const csp = analyzeBay(blocks, bi, side, floor, cu, 0.4);
        if (!csp.isParty && csp.frontClearance > 0.5) {
          f.box(m.wallAccent, 0.3, FH, 0.42, cu, yBase + FH / 2, 0.1, false);
        }
      }
    }
  }

  // Corner vertical fin for modern styles on exposed corners only:
  if (prof.fins && p.verticalFins && side === 0 && !lowDetail) {
    for (const sgn of [-1, 1]) {
      const cu = sgn * (f.len / 2 - 0.1);
      const csp = analyzeBay(blocks, bi, side, 0, cu, 0.3);
      if (!csp.isParty && csp.frontClearance > 0.5) {
        f.box(m.accentMetal, 0.16, blk.y1 - blk.y0 - 0.2, 0.5, cu, (blk.y0 + blk.y1) / 2, 0.26, false);
      }
    }
  }

  // Rainwater downpipes on exposed corners:
  if (p.facadePipes && side % 2 === 1) {
    const du = f.len / 2 - 0.2;
    const dsp = analyzeBay(blocks, bi, side, 0, du, 0.4);
    if (!dsp.isParty && dsp.frontClearance > 0.5) {
      buildDownpipe(new DetailFrame(b, f.world(du, blk.y0, 0), f.rotY), m, p, blk.y1 - blk.y0);
    }
  }
}

/* --------------------------------------------------------- facade modules */

function windowBay(
  b: Batcher, m: MatLib, p: BuildingParams, prof: StyleProfile, f: Face,
  bw: number, u: number, yBase: number, FH: number,
  bi: number, side: number, floor: number, bay: number, forBalcony: boolean, nearSide = false
) {
  const ow = bw * (forBalcony ? Math.min(0.84, prof.windowWide + 0.12) : prof.windowWide);
  const oh = FH * (forBalcony ? 0.82 : prof.windowTall);
  const sill = forBalcony ? 0.23 : (FH - oh) * 0.78;
  const yc = yBase + sill + oh / 2;
  const margin = (bw - ow) / 2;
  const top = FH - sill - oh;
  for (const sign of [-1, 1]) f.box(m.wall, margin, FH, WT, u + sign * (ow + margin) / 2, yBase + FH / 2, -WT / 2);
  f.box(m.wall, ow, top, WT, u, yBase + FH - top / 2, -WT / 2);
  f.box(m.wall, ow, sill, WT, u, yBase + sill / 2, -WT / 2);
  buildWindow(new DetailFrame(b, f.world(u, yc, 0), f.rotY), m, p, ow, oh,
    Math.floor(hash01(p.seed, bi, side, floor, bay, 3) * 1000000), forBalcony);
  if (prof.chajja) {
    f.box(m.slab, ow + 0.4, 0.095, 0.5, u, yc + oh / 2 + 0.19, 0.21);
  }
  const density = p.acDensity * (side % 2 === 1 ? 1 : 0.22);
  if (p.acUnits && !forBalcony && !nearSide && hash01(p.seed + 7, bi, side, floor, bay) < density) {
    buildAirConditioner(new DetailFrame(b, f.world(u, yBase + 0.43, 0), f.rotY), m, p, f.len / 2 - 0.2 - u);
  }
}

function curtainBay(
  b: Batcher, m: MatLib, p: BuildingParams, f: Face,
  bw: number, u: number, yBase: number, FH: number,
  bi: number, side: number, floor: number, bay: number
) {
  const base = 0.42, gh = FH - 0.6;
  f.box(m.glassSpandrel, bw, base, WT, u, yBase + base / 2, -WT / 2);
  f.box(m.wall, bw, 0.18, WT, u, yBase + FH - 0.09, -WT / 2);
  for (const sign of [-1, 1]) f.box(m.panel, 0.1, gh, WT, u + sign * (bw / 2 - 0.05), yBase + base + gh / 2, -WT / 2);
  buildWindow(new DetailFrame(b, f.world(u, yBase + base + gh / 2, 0), f.rotY), m,
    { ...p, windowStyle: 'fixed' }, bw - 0.2, gh,
    Math.floor(hash01(p.seed, bi, side, floor, bay, 11) * 1000000));
}

function balcony(
  _b: Batcher, m: MatLib, p: BuildingParams, f: Face,
  bw: number, u: number, yBase: number, FH: number,
  bi: number, side: number, floor: number, bay: number,
  anchors: { position: [number, number, number]; kind: string }[],
  ceiling: boolean,
) {
  const lowDetail = p.lod === 'low';
  const bd = 1.5;
  const w = bw * 0.96;
  const y = yBase + 0.1;
  let style = p.balconyStyle;
  if (style === 'mixed') {
    const h = hash01(p.seed + 21, bi, side, bay);
    style = h < 0.45 ? 'glass' : h < 0.8 ? 'railing' : 'solid';
  }

  // slab + fascia
  f.box(m.slab, w, 0.2, bd, u, y, bd / 2);
  f.box(m.soffit, w - 0.1, 0.05, bd - 0.1, u, y - 0.12, bd / 2, false);
  f.box(m.wallAccent, w, 0.26, 0.09, u, y + 0.1, bd + 0.02, false);

  const railH = 1.05;
  const railY = y + 0.1 + railH / 2;

  if (style === 'solid') {
    f.box(m.wallAccent, w, railH, 0.14, u, railY, bd);
    f.box(m.wallAccent, 0.14, railH, bd, u - w / 2, railY, bd / 2);
    f.box(m.wallAccent, 0.14, railH, bd, u + w / 2, railY, bd / 2);
    f.box(m.stone, w + 0.06, 0.07, 0.2, u, railY + railH / 2, bd, false);
  } else if (style === 'glass') {
    f.panel(m.railGlass, w - 0.12, railH, u, railY, bd);
    f.box(m.railGlass, 0.03, railH, bd - 0.1, u - w / 2 + 0.05, railY, bd / 2);
    f.box(m.railGlass, 0.03, railH, bd - 0.1, u + w / 2 - 0.05, railY, bd / 2);
    f.box(m.accentMetal, w, 0.07, 0.07, u, railY + railH / 2, bd, false);
    f.box(m.accentMetal, 0.07, 0.07, bd, u - w / 2 + 0.05, railY + railH / 2, bd / 2, false);
    f.box(m.accentMetal, 0.07, 0.07, bd, u + w / 2 - 0.05, railY + railH / 2, bd / 2, false);
    f.box(m.accentMetal, w, 0.05, 0.05, u, y + 0.16, bd, false);
  } else {
    f.box(m.metalDark, w, 0.07, 0.07, u, railY + railH / 2, bd, false);
    f.box(m.metalDark, w, 0.05, 0.05, u, railY, bd, false);
    f.box(m.metalDark, 0.06, railH, bd, u - w / 2, railY, bd / 2, false);
    f.box(m.metalDark, 0.06, railH, bd, u + w / 2, railY, bd / 2, false);
    if (!lowDetail) {
      const n = Math.max(4, Math.round(w / 0.16));
      for (let i = 0; i <= n; i++) {
        f.box(m.metalDark, 0.035, railH, 0.035, u - w / 2 + (w / n) * i, railY, bd, false);
      }
    }
  }

  // planter
  let planterSide = 0;
  if (p.balconyPlanters && !lowDetail && hash01(p.seed + 31, bi, side, floor, bay) < 0.55) {
    planterSide = hash01(p.seed + 32, floor, bay) > 0.5 ? 1 : -1;
    const px = u + planterSide * (w / 2 - 0.42);
    buildPottedPlant(new DetailFrame(_b, f.world(px, y + 0.12, bd - 0.4), f.rotY), m, 0.82, p.lod === 'high');
  }

  // laundry: rails, racks or railing drapes, only where a household plausibly would
  buildBalconyLaundry(new DetailFrame(_b, f.world(u, y + 0.1, 0), f.rotY), m, p, {
    w, bd, FH, ceiling, railStyle: style, planterSide,
    seed: Math.floor(hash01(p.seed + 41, bi, side, floor, bay) * 1e9), side, floor,
  }, laundryLog);

  // soffit downlight at night
  if (p.dayNight !== 'day' && p.warmLights && hash01(p.seed + 51, bi, side, floor, bay) < 0.4) {
    f.box(m.emissiveWarm, 0.22, 0.04, 0.22, u, y + FH - 0.26, bd * 0.55, false);
    if (side === 0 && anchors.length < 24) {
      anchors.push({ position: f.world(u, y + FH - 0.3, bd * 0.55), kind: 'balcony' });
    }
  }
}

/* ------------------------------------------------------------ ground floor */

function buildGroundFloor(
  b: Batcher, m: MatLib, p: BuildingParams, prof: StyleProfile, f: Face,
  bi: number, side: number, bays: number, bw: number, yBase: number, FH: number,
  anchors: { position: [number, number, number]; kind: string }[],
  isPrimary: boolean,
  blocks: Block[],
) {
  const mode = p.groundFloor === 'auto' ? (p.style === 'kerala' ? 'shops' : 'lobby') : p.groundFloor;

  const opening = (u: number, span: number, w: number, h: number, bottom: number) => {
    const margin = (span - w) / 2;
    const top = FH - h - bottom;
    for (const sign of [-1, 1]) f.box(m.stone, margin, FH, WT, u + sign * (w + margin) / 2, yBase + FH / 2, -WT / 2);
    f.box(m.stone, w, top, WT, u, yBase + FH - top / 2, -WT / 2);
    if (bottom) f.box(m.stone, w, bottom, WT, u, yBase + bottom / 2, -WT / 2);
  };

  const centreBay = Math.floor(bays / 2);

  for (let bay = 0; bay < bays; bay++) {
    const u = -f.len / 2 + (bay + 0.5) * bw;
    const spatial = analyzeBay(blocks, bi, side, 0, u, bw);

    // If glued to another block at ground level, draw solid stone base:
    if (spatial.isParty) {
      f.box(m.stone, bw, FH, WT, u, yBase + FH / 2, -WT / 2);
      continue;
    }

    if (mode === 'stilts') {
      f.box(m.stone, 0.34, FH, 0.4, u - bw / 2, yBase + FH / 2, -0.2);
      if (bay === bays - 1) f.box(m.stone, 0.34, FH, 0.4, u + bw / 2, yBase + FH / 2, -0.2);
      f.box(m.slab, bw, 0.2, 0.5, u, yBase + FH - 0.1, 0);
      continue;
    }

    if (side === 0 && mode === 'lobby') {
      if (isPrimary && bay === centreBay) {
        // Grand primary street entrance:
        const entryW = Math.min(4.8, f.len * 0.52, bw * 1.5);
        const portal = Math.min(f.len - 0.5, entryW + 0.9);
        const threshold = 0.45;
        const h = FH - threshold - 0.28;
        opening(u, portal, entryW, h, threshold);
        buildEntrance(new DetailFrame(b, f.world(u, yBase + threshold, 0), f.rotY), m, p, entryW, h, p.seed);
        buildEntranceApproach(new DetailFrame(b, f.world(u, yBase, 0), f.rotY), m, p, entryW, threshold, f.len / 2 - Math.abs(u) - entryW / 2 - 0.35);
        f.box(m.panel, portal + 0.3, 0.31, 2.15, u, yBase + FH - 0.015, 0.86);
        f.box(m.door, portal + 0.1, 0.045, 1.95, u, yBase + FH - 0.19, 0.86, false);
        f.box(m.emissiveWarm, portal * 0.65, 0.028, 0.045, u, yBase + FH - 0.22, 1.65, false);
        if (p.signage) f.panel(m.nameplate, 1.2, 0.28, u, yBase + FH - 0.015, 1.94);
        if (p.dayNight !== 'day') anchors.push({ position: f.world(u, yBase + FH - 0.28, 1.1), kind: 'entrance' });
        continue;
      } else if (!isPrimary && bay === centreBay) {
        // Secondary wing access door:
        const dw = Math.min(1.1, bw * 0.45);
        opening(u, bw, dw, Math.min(2.1, FH - 0.4), 0.05);
        buildServiceDoor(new DetailFrame(b, f.world(u, yBase, 0.02), f.rotY), m, dw, Math.min(2.1, FH - 0.4));
        continue;
      }
    }

    if (mode === 'shops') {
      const w = bw * 0.83, h = FH * 0.77;
      opening(u, bw, w, h, 0.08);
      buildShopfront(new DetailFrame(b, f.world(u, yBase + 0.08 + h / 2, 0), f.rotY), m, p, w, h, p.seed + bay * 13 + side);
      if (p.signage) f.panel(m.signage, bw * 0.86, 0.42, u, yBase + FH - 0.29, 0.025);
      continue;
    }

    // Standard residential ground-floor bay: stone base + large window:
    const w = bw * 0.64, h = FH * 0.47;
    opening(u, bw, w, h, 0.98);
    buildWindow(
      new DetailFrame(b, f.world(u, yBase + 0.98 + h / 2, 0), f.rotY),
      m,
      { ...p, windowStyle: 'fixed' },
      w,
      h,
      p.seed + side * 100 + bay,
    );
  }

  // Plinth stone along exposed portions:
  if (prof.stoneBase && mode !== 'stilts') {
    for (let bay = 0; bay < bays; bay++) {
      const u = -f.len / 2 + (bay + 0.5) * bw;
      const spatial = analyzeBay(blocks, bi, side, 0, u, bw);
      if (!spatial.isParty) {
        f.box(m.stone, bw + 0.02, 0.14, 0.34, u, yBase + 0.07, -0.1, false);
      }
    }
  }
}

/* -------------------------------------------------------------------- plot */

function buildPlot(
  b: Batcher, m: MatLib, p: BuildingParams, prof: StyleProfile,
  W: number, D: number, rng: RNG,
  anchors: { position: [number, number, number]; kind: string }[],
  entranceX: number,
  front: number,
): SiteLayout {
  const margin = 7.5;
  const plotW = W + margin * 2;
  const frontZ = D / 2 + margin;
  const parkingSide = p.parkingSide === 'auto' ? (rng.bool() ? 'left' : 'right') : p.parkingSide;
  const mirror = parkingSide === 'left';
  const garage = p.parking && p.undergroundParking
    ? planGarage(W, plotW, D + margin * 2, D, new RNG(moduleSeed(p.seed, p.parkingVariation, 0x385dd2))) : null;
  // Surface bays need both their 5 m depth and a separate manoeuvring aisle.
  const backZ = -D / 2 - (p.parking && !garage ? 12 : margin);
  const plotD = frontZ - backZ;
  const plotCenterZ = (frontZ + backZ) / 2;
  const footprint = garage ? (mirror ? mirrorRect(garage.cut) : garage.cut) : null;

  const site: SiteLayout = {
    entrance: { position: [entranceX, 0, front], threshold: 0.45 },
    parking: p.parking ? (garage ? 'underground' : 'surface') : 'none',
    parkingSpaces: 0,
    bounds: { x0: -plotW / 2, x1: plotW / 2, z0: backZ, z1: frontZ },
    plantCenters: [], frontPlanters: [],
  };

  // Ground and apron. The site slab is cut open around the ramp trough so the descent is a real excavation.
  groundWithOpening(b, m.ground, plotW, plotD, -0.1, 0.2, footprint, plotCenterZ);
  b.box(m.pavement, [W + 4.5, 0.08, D + 4.5], [0, 0.02, 0], [0, 0, 0], { cast: false, receive: true });

  // street
  if (p.streetProps) {
    b.box(m.pavement, [plotW + 16, 0.22, 3.2], [0, 0.0, frontZ + 1.8], [0, 0, 0], { cast: false, receive: true });
    b.box(m.stone, [plotW + 16, 0.3, 0.3], [0, 0.08, frontZ + 3.3], [0, 0, 0], { cast: false, receive: true });
    b.box(m.asphalt, [plotW + 16, 0.16, 9], [0, -0.04, frontZ + 7.9], [0, 0, 0], { cast: false, receive: true });
    for (let i = -7; i <= 7; i++) {
      b.box(m.lineMark, [1.6, 0.02, 0.16], [i * 3.4, 0.05, frontZ + 7.9], [0, 0, 0], { cast: false });
    }
    for (const sx of [-1, 1]) {
      const lx = sx * (plotW / 2 - 1.5);
      b.cylinder(m.metalDark, 0.1, 0.14, 6.4, 8, [lx, 3.2, frontZ + 2.6]);
      b.box(m.metalDark, [1.5, 0.12, 0.14], [lx + sx * -0.7, 6.3, frontZ + 2.6], [0, 0, 0], { cast: false });
      b.box(p.dayNight === 'day' ? m.metal : m.emissiveWarm, [0.7, 0.14, 0.3], [lx + sx * -1.3, 6.2, frontZ + 2.6], [0, 0, 0], { cast: false });
      if (p.dayNight !== 'day') anchors.push({ position: [lx + sx * -1.3, 6.0, frontZ + 2.6], kind: 'street' });
    }
  }

  // compound wall
  const gateW = 5.5;
  if (p.compoundWall) {
    const wh = 2.0;
    const addWall = (w: number, d: number, x: number, z: number) => {
      b.box(m.wallAccent, [w, wh * 0.55, d], [x, wh * 0.275, z]);
      b.box(m.stone, [w + 0.08, 0.12, d + 0.08], [x, wh * 0.55 + 0.06, z], [0, 0, 0], { cast: false });
      const horiz = w > d;
      const len = horiz ? w : d;
      const bars = Math.max(2, Math.round(len / 0.26));
      for (let i = 0; i <= bars; i++) {
        const o = -len / 2 + (len / bars) * i;
        b.box(m.metalDark, [horiz ? 0.05 : 0.05, wh * 0.45, 0.05],
          [horiz ? x + o : x, wh * 0.55 + 0.12 + wh * 0.225, horiz ? z : z + o], [0, 0, 0], { cast: false });
      }
      b.box(m.metalDark, [horiz ? w : 0.07, 0.07, horiz ? 0.07 : d], [x, wh * 0.55 + 0.12 + wh * 0.45, z], [0, 0, 0], { cast: false });
    };
    const pedestrianGateW = 1.25;
    const pedestrianGateX = -gateW / 2 - pedestrianGateW / 2 - 0.45;
    const leftEnd = pedestrianGateX - pedestrianGateW / 2;
    const middleStart = pedestrianGateX + pedestrianGateW / 2;
    const middleEnd = -gateW / 2;
    const leftLen = leftEnd - (-plotW / 2);
    const middleLen = middleEnd - middleStart;
    const rightLen = plotW / 2 - gateW / 2;
    addWall(plotW, 0.25, 0, backZ);
    addWall(0.25, plotD, -plotW / 2, plotCenterZ);
    addWall(0.25, plotD, plotW / 2, plotCenterZ);
    if (leftLen > 0.1) addWall(leftLen, 0.25, -plotW / 2 + leftLen / 2, frontZ);
    if (middleLen > 0.1) addWall(middleLen, 0.25, middleStart + middleLen / 2, frontZ);
    if (rightLen > 0.1) addWall(rightLen, 0.25, gateW / 2 + rightLen / 2, frontZ);
    for (const px of [-plotW / 2, plotW / 2, -gateW / 2 - 0.25, gateW / 2 + 0.25]) {
      b.box(m.stone, [0.5, 2.5, 0.5], [px, 1.25, frontZ]);
      b.box(m.panel, [0.6, 0.12, 0.6], [px, 2.55, frontZ], [0, 0, 0], { cast: false });
      if (p.dayNight !== 'day' && Math.abs(px) < gateW) {
        b.box(m.emissiveWarm, [0.22, 0.28, 0.22], [px, 2.75, frontZ], [0, 0, 0], { cast: false });
      }
    }
  }

  // gate
  if (p.gate) {
    const gh = 1.95;
    b.box(m.metalDark, [gateW, 0.1, 0.09], [0, gh, frontZ], [0, 0, 0], { cast: false });
    b.box(m.metalDark, [gateW, 0.08, 0.09], [0, 0.35, frontZ], [0, 0, 0], { cast: false });
    const bars = Math.round(gateW / 0.22);
    for (let i = 0; i <= bars; i++) {
      b.box(m.metalDark, [0.05, gh, 0.05], [-gateW / 2 + (gateW / bars) * i, gh / 2, frontZ], [0, 0, 0], { cast: false });
    }
    b.box(m.accentMetal, [gateW * 0.42, 0.5, 0.04], [0, gh * 0.72, frontZ - 0.05], [0, 0, 0], { cast: false });
    const pedestrianGateW = 1.25;
    const pedestrianGateX = -gateW / 2 - pedestrianGateW / 2 - 0.45;
    b.box(m.metalDark, [pedestrianGateW, 0.08, 0.08], [pedestrianGateX, gh, frontZ], [0, 0, 0], { cast: false });
    for (let i = 0; i <= 5; i++) b.box(m.metalDark, [0.04, gh, 0.04], [pedestrianGateX - pedestrianGateW / 2 + i * pedestrianGateW / 5, gh / 2, frontZ], [0, 0, 0], { cast: false });
  }

  // guard cabin
  if (p.guardCabin) {
    // Opposite the vehicle turn and outside the pedestrian wicket path.
    const gx = (mirror ? 1 : -1) * (gateW / 2 + 3.8), gz = frontZ - 1.6;
    b.box(m.wall, [2.0, 2.5, 0.2], [gx, 1.25, gz - 0.8]);
    b.box(m.wall, [0.2, 2.5, 1.8], [gx - 0.9, 1.25, gz]);
    b.box(m.wall, [0.2, 2.5, 1.8], [gx + 0.9, 1.25, gz]);
    b.box(m.wall, [2, 1.1, 0.2], [gx, 0.55, gz + 0.8]);
    b.box(m.wall, [2, 0.4, 0.2], [gx, 2.3, gz + 0.8]);
    for (const x of [-0.9, 0.9]) b.box(m.wall, [0.2, 1, 0.2], [gx + x, 1.6, gz + 0.8]);
    b.box(m.roofDeck, [2.3, 0.14, 2.1], [gx, 2.57, gz], [0, 0, 0], { cast: false });
    buildWindow(new DetailFrame(b, [gx, 1.6, gz + 0.9]), m, { ...p, curtains: false }, 1.6, 1, p.seed + 32);
    buildServiceDoor(new DetailFrame(b, [gx - 1.02, 0, gz], -Math.PI / 2), m, 0.8, 2.05);
  }

  // Arrival court: car route is centred at the vehicle gate; pedestrian route has its own paving strip.
  const pedestrianGateX = -gateW / 2 - 1.25 / 2 - 0.45;
  const arrivalZ = front + 1.65;
  const drivewayDepth = frontZ - arrivalZ + 0.5;
  b.box(m.asphalt, [gateW + 1.2, 0.1, drivewayDepth], [0, 0.04, arrivalZ + drivewayDepth / 2], [0, 0, 0], { cast: false, receive: true });
  b.box(m.pavement, [2.0, 0.07, frontZ - arrivalZ + 0.9], [pedestrianGateX, 0.055, arrivalZ + (frontZ - arrivalZ + 0.9) / 2], [0, 0, 0], { cast: false, receive: true });
  // Cross path joins the pedestrian gate to the actual lobby door, wherever the massing puts it.
  const crossX0 = Math.min(pedestrianGateX, entranceX) - 0.6;
  const crossX1 = Math.max(pedestrianGateX, entranceX) + 0.6;
  b.box(m.pavement, [crossX1 - crossX0, 0.07, 1.7], [(crossX0 + crossX1) / 2, 0.055, arrivalZ + 0.28], [0, 0, 0], { cast: false, receive: true });
  b.box(m.pavement, [3.2, 0.06, 1.4], [entranceX, 0.05, front + 0.74], [0, 0, 0], { cast: false, receive: true });

  // parking
  if (p.parking) {
    const anchorStart = anchors.length;
    if (garage) {
      site.parkingSpaces = b.withMirrorX(mirror, () => buildGarage(b, m, p, garage, rng, anchors, plotW, D + margin * 2));
      const point = (x: number, y: number, z: number): [number, number, number] => [mirror ? -x : x, y, z];
      site.garage = {
        rampWidth: garage.width, rampRun: garage.run, slope: garage.slope,
        floorLevel: garage.floorY, clearance: garage.clearance,
        rampTop: point(garage.x, 0, garage.topZ),
        rampCenter: point(garage.x, garage.floorY / 2, (garage.topZ + garage.slopeEndZ) / 2),
        portal: point(garage.portal.x, garage.floorY, (garage.portal.z0 + garage.portal.z1) / 2),
        excavation: { ...(mirror ? mirrorRect(garage.cut) : garage.cut), depth: -garage.floorY + garage.slabT + 0.5 },
      };
      site.parkingLayout = {
        side: parkingSide, marking: garage.bayMarking, bayRow: garage.bayRow,
        bays: garage.bays.map(r => mirror ? mirrorRect(r) : r),
        vehicles: garage.vehicles.map(r => mirror ? mirrorRect(r) : r),
        columns: garage.columns.map(r => mirror ? mirrorRect(r) : r),
        stair: garage.stair ? (mirror ? mirrorRect(garage.stair) : garage.stair) : null,
      };
    } else {
      const surface = b.withMirrorX(mirror, () => buildSurfaceLot(b, m, p, W, D, plotW, backZ, arrivalZ, rng, anchors));
      site.parkingSpaces = surface.capacity;
      site.parkingLayout = {
        side: parkingSide, marking: surface.marking, canopy: surface.canopy,
        bays: surface.bays.map(r => mirror ? mirrorRect(r) : r),
        vehicles: surface.vehicles.map(r => mirror ? mirrorRect(r) : r),
        columns: [], stair: null, aisle: mirror ? mirrorRect(surface.aisle) : surface.aisle,
      };
    }
    if (mirror) for (let i = anchorStart; i < anchors.length; i++) anchors[i].position[0] *= -1;
    // Join the centred forecourt to the selected side without drawing
    // coplanar overlapping slabs (which made the paving visibly flicker).
    const gateEdge = (gateW + 1.2) / 2;
    const turnEdge = garage
      ? garage.x - 0.3 - (garage.width + 2.6) / 2
      : Math.min(W / 2 + 4.7, plotW / 2 - 2.1) - 1.9;
    const turnZ = garage ? frontZ - 1.6 : arrivalZ + 0.4;
    const turnDepth = garage ? 2.6 : 2.8;
    const turn: Rect = { x0: gateEdge, x1: turnEdge, z0: turnZ - turnDepth / 2, z1: turnZ + turnDepth / 2 };
    if (turnEdge > gateEdge + 0.05) {
      b.box(m.asphalt, [turnEdge - gateEdge, 0.1, turnDepth],
        [(mirror ? -1 : 1) * (turnEdge + gateEdge) / 2, 0.04, turnZ], [0, 0, 0], { cast: false });
    }
    if (site.parkingLayout) site.parkingLayout.entryLane = mirror ? mirrorRect(turn) : turn;
  }

  const residentialLobby = p.groundFloor === 'lobby' || (p.groundFloor === 'auto' && p.style !== 'kerala');
  const entryW = Math.min(4.8, W * 0.52);
  const gradedApproach = residentialLobby && p.accessibleEntry && W / 2 - entryW / 2 - 0.35 >= 4.95;
  const approach: Rect = { x0: entryW / 2 - 0.15, x1: entryW / 2 + 5.05, z0: D / 2 + 0.2, z1: D / 2 + 1.5 };
  if (gradedApproach) site.gradedApproach = approach;

  // planters / pots
  if (p.pottedPlants) {
    const plantRng = new RNG(p.seed + 8301);
    const count = p.lod === 'low' ? 4 : 10;
    let placed = 0;
    for (let i = 0; i < count * 5 && placed < count; i++) {
      const edge = plantRng.int(0, 3);
      const t = plantRng.float(-0.42, 0.42);
      let x = 0, z = 0;
      if (edge === 0) { x = t * (W + 4); z = front + 2.4; }
      else if (edge === 1) { x = W / 2 + 2.2; z = t * (D + 3); }
      else if (edge === 2) { x = t * (W + 4); z = -D / 2 - 2.2; }
      else { x = -W / 2 - 2.2; z = t * (D + 3); }
      const inRect = (r: Rect, padding: number) => x > r.x0 - padding && x < r.x1 + padding && z > r.z0 - padding && z < r.z1 + padding;
      if (Math.abs(x) < 4.4 && z > front + 0.3) continue; // vehicle and pedestrian entry
      if (site.garage && inRect(site.garage.excavation, 0.9)) continue;
      if (site.parkingLayout?.aisle && inRect(site.parkingLayout.aisle, 0.7)) continue;
      if (site.parkingLayout?.entryLane && inRect(site.parkingLayout.entryLane, 0.6)) continue;
      if (site.parkingLayout?.stair && inRect(site.parkingLayout.stair, 0.7)) continue;
      if (site.parkingLayout?.bays.some(r => inRect(r, 0.45))) continue;
      if (gradedApproach && inRect(approach, 0.55)) continue;
      const s = plantRng.float(0.8, 1.35);
      buildPottedPlant(new DetailFrame(b, [x, 0.07, z]), m, s, p.lod === 'high');
      site.plantCenters.push([x, z]);
      placed++;
    }
    for (const sx of W > 13 ? [-1, 1] : []) {
      if (p.parking && sx === (mirror ? -1 : 1)) continue; // no raised planter in the turning path
      if (gradedApproach && sx > 0) continue; // the side ramp needs clear circulation
      const px = sx * (W / 2 - 1.2);
      site.frontPlanters.push({ x0: px - 1.3, x1: px + 1.3, z0: front + 1.2, z1: front + 2.0 });
      b.box(m.stone, [2.6, 0.5, 0.8], [px, 0.25, front + 1.6], [0, 0, 0], { cast: false });
      for (let i = 0; i < 4; i++) buildPottedPlant(new DetailFrame(b, [px - 0.9 + i * 0.6, 0.32, front + 1.6]), m, 0.72, p.lod === 'high');
    }
  }

  // bollards along the entry path
  if (p.streetProps && p.lod !== 'low') {
    for (let i = 0; i < 4; i++) {
      const z = frontZ - 1.6 - i * 1.6;
      b.cylinder(m.metalDark, 0.08, 0.1, 0.9, 6, [pedestrianGateX - 1.3, 0.45, z], [0, 0, 0], { cast: false });
    }
  }

  // ground-level signage monolith
  if (p.signage && prof.stoneBase && plotW >= 27) {
    const signX = (mirror ? 1 : -1) * (plotW / 2 - 3.4);
    b.box(m.stone, [3.0, 1.5, 0.35], [signX, 0.75, frontZ - 1.1], [0, 0, 0], { cast: true });
    b.box(m.nameplate, [2.5, 0.8, 0.06], [signX, 0.9, frontZ - 0.93], [0, 0, 0], { cast: false });
  }

  return site;
}
