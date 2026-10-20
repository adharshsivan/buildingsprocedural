import * as THREE from 'three';
import type { BatchOptions, Batcher, Vec3 } from './batcher';
import type { MatLib } from './materials';
import type { BuildingParams } from './types';
import { RNG } from './rng';
import { car, scooter } from './vehicles';

export interface Anchor { position: Vec3; kind: string }
export interface Rect { x0: number; x1: number; z0: number; z1: number }

export interface SurfacePlan {
  capacity: number;
  marking: 'lines' | 'corners';
  bays: Rect[];
  vehicles: Rect[];
  aisle: Rect;
  canopy: 'linear' | 'solar' | 'none';
}

/**
 * Parking is laid out as a route, not as a decorative pad:
 *   vehicle gate → forecourt → side drive → ramp head → sloped trough → basement portal.
 * The ground slab is cut around the trough, so the descent is a real excavation
 * rather than a sloped plane sitting on top of the site.
 */
export interface GaragePlan {
  x: number;              // centreline of the ramp
  width: number;          // running width between kerbs
  wallT: number;
  slabT: number;
  topZ: number;           // ramp head, at grade
  slopeEndZ: number;      // foot of the slope
  botZ: number;           // end of the level landing
  floorY: number;         // basement floor level (negative)
  clearance: number;      // floor to ceiling soffit
  run: number;
  slope: number;          // rise / run
  portal: { z0: number; z1: number; x: number; head: number };
  room: Rect;
  cut: Rect;              // opening in the site slab
  bayMarking: 'lines' | 'corners';
  bays: Rect[];
  columns: Rect[];
  stair: Rect | null;
  vehicles: Rect[];
  bayRow: 'rear' | 'front';
}

const MAX_SLOPE = 1 / 6.5;     // ~15%, a comfortable residential ramp
const MIN_BASEMENT = 2.55;     // below this a basement cannot be covered properly

export function planGarage(W: number, plotW: number, plotD: number, D: number, rng = new RNG(1)): GaragePlan | null {
  const width = 3.6, wallT = 0.3, slabT = 0.35;
  const x = Math.min(W / 2 + 4.3, plotW / 2 - width / 2 - wallT - 1.0);
  if (x - width / 2 - wallT < W / 2 + 1.5) return null;          // no usable side yard
  const topZ = plotD / 2 - rng.float(3.2, 3.75);
  const botZ = -plotD / 2 + rng.float(1.85, 2.25);
  const slopeEndZ = botZ + rng.float(3.7, 4.25);                 // level landing at the foot
  const run = topZ - slopeEndZ;
  if (run < 12) return null;
  const drop = Math.min(2.95, run * MAX_SLOPE);
  if (drop < MIN_BASEMENT) return null;                           // plot is too short: use a surface lot
  const floorY = -drop;
  const clearance = Math.max(2.1, drop - slabT - 0.12);
  const portalW = 2.9 + rng.float(0, 0.25);
  return {
    x, width, wallT, slabT, topZ, slopeEndZ, botZ, floorY, clearance,
    run, slope: drop / run,
    portal: { z0: botZ + 0.45, z1: botZ + 0.45 + portalW, x: x - width / 2 - wallT / 2, head: floorY + clearance },
    room: { x0: -W / 2 - 1.5, x1: x - width / 2 - wallT, z0: botZ - 0.2, z1: D / 2 + 2 },
    cut: { x0: x - width / 2 - wallT, x1: x + width / 2 + wallT, z0: botZ, z1: topZ },
    bayMarking: rng.bool() ? 'lines' : 'corners',
    bays: [], columns: [], stair: null, vehicles: [], bayRow: rng.bool() ? 'rear' : 'front',
  };
}

export function mirrorRect(rect: Rect): Rect {
  return { x0: -rect.x1, x1: -rect.x0, z0: rect.z0, z1: rect.z1 };
}

function bayMarking(b: Batcher, m: MatLib, cx: number, cz: number, w: number, d: number, y: number, style: GaragePlan['bayMarking']) {
  if (style === 'lines') {
    for (const x of [-w / 2, w / 2]) b.box(m.lineMark, [0.07, 0.012, d], [cx + x, y, cz], [0, 0, 0], { cast: false });
  } else {
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) {
      b.box(m.lineMark, [0.07, 0.012, 0.45], [cx + x, y, cz + z - Math.sign(z) * 0.225], [0, 0, 0], { cast: false });
      b.box(m.lineMark, [0.4, 0.012, 0.07], [cx + x - Math.sign(x) * 0.2, y, cz + z], [0, 0, 0], { cast: false });
    }
  }
}

/** Extrude a (z, y) profile along X; the result is centred on x = 0. */
function prismAlongX(points: [number, number][], thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

function addPrism(b: Batcher, mat: THREE.Material, profile: [number, number][], width: number,
  x: number, opts: BatchOptions = {}) {
  const geometry = prismAlongX(profile, width);
  b.add(geometry, mat, [x, 0, 0], [0, 0, 0], opts);
  geometry.dispose();
}

/** Site slab with a rectangular opening, so the excavation is genuinely open to the sky. */
export function groundWithOpening(
  b: Batcher, mat: THREE.Material, w: number, d: number, y: number, thickness: number, hole: Rect | null, centerZ = 0,
) {
  if (!hole) {
    b.box(mat, [w, thickness, d], [0, y, centerZ], [0, 0, 0], { cast: false, receive: true });
    return;
  }
  const opts = { cast: false, receive: true };
  const left = hole.x0 + w / 2, right = w / 2 - hole.x1;
  if (left > 0.01) b.box(mat, [left, thickness, d], [-w / 2 + left / 2, y, centerZ], [0, 0, 0], opts);
  if (right > 0.01) b.box(mat, [right, thickness, d], [w / 2 - right / 2, y, centerZ], [0, 0, 0], opts);
  const spanW = hole.x1 - hole.x0, cx = (hole.x0 + hole.x1) / 2;
  const frontEdge = centerZ + d / 2, backEdge = centerZ - d / 2;
  const front = frontEdge - hole.z1, back = hole.z0 - backEdge;
  if (front > 0.01) b.box(mat, [spanW, thickness, front], [cx, y, frontEdge - front / 2], [0, 0, 0], opts);
  if (back > 0.01) b.box(mat, [spanW, thickness, back], [cx, y, backEdge + back / 2], [0, 0, 0], opts);
}

/* ------------------------------------------------------------- basement */

export function buildGarage(
  b: Batcher, m: MatLib, p: BuildingParams, g: GaragePlan, rng: RNG, anchors: Anchor[],
  plotW: number, plotD: number,
): number {
  const high = p.lod === 'high', low = p.lod === 'low';
  const halfW = g.width / 2;
  const wallMid = halfW + g.wallT / 2;

  /* ---- sloped running surface + level landing, as one solid deck */
  addPrism(b, m.asphalt, [
    [g.topZ, 0], [g.slopeEndZ, g.floorY], [g.botZ, g.floorY],
    [g.botZ, g.floorY - g.slabT], [g.slopeEndZ, g.floorY - g.slabT], [g.topZ, -g.slabT],
  ], g.width, g.x, { cast: false, receive: true });

  /* ---- retaining walls: level coping at grade, underside following the slope */
  const wallProfile = (z0: number, z1: number): [number, number][] => {
    const pts: [number, number][] = [[z0, g.floorY - g.slabT]];
    if (z1 > g.slopeEndZ) {
      pts.push([Math.min(z1, g.slopeEndZ), g.floorY - g.slabT]);
      pts.push([z1, Math.min(0, -g.slabT + (z1 - g.slopeEndZ) * g.slope)]);
    } else {
      pts.push([z1, g.floorY - g.slabT]);
    }
    pts.push([z1, 0], [z0, 0]);
    return pts;
  };
  // east wall is continuous; west wall is split around the basement portal
  addPrism(b, m.stone, wallProfile(g.botZ, g.topZ), g.wallT, g.x + wallMid);
  addPrism(b, m.stone, wallProfile(g.portal.z1, g.topZ), g.wallT, g.x - wallMid);
  addPrism(b, m.stone, wallProfile(g.botZ, g.portal.z0), g.wallT, g.x - wallMid);

  for (const sx of [-1, 1]) {
    // coping kerb and a safety rail around the open trough
    b.box(m.stone, [g.wallT + 0.16, 0.16, g.topZ - g.botZ], [g.x + sx * wallMid, 0.08, (g.topZ + g.botZ) / 2], [0, 0, 0], { cast: false });
    if (low) continue;
    const railZ0 = g.botZ + 0.4, railZ1 = g.topZ - 0.3;
    for (const y of [0.52, 1.02]) {
      b.pipe(m.metal, [[g.x + sx * wallMid, y, railZ0], [g.x + sx * wallMid, y, railZ1]], 0.028, 5);
    }
    for (let z = railZ0; z <= railZ1; z += 1.9) {
      b.cylinder(m.metal, 0.032, 0.032, 1.08, 6, [g.x + sx * wallMid, 0.54, z]);
    }
    // wall washers down the trough
    for (let z = g.slopeEndZ + 1.5; z < g.topZ - 1; z += 4.4) {
      const y = Math.min(-0.45, g.floorY + (z - g.slopeEndZ) * g.slope + 2.05);
      b.box(m.metalDark, [0.16, 0.12, 0.3], [g.x + sx * (halfW - 0.06), y, z], [0, 0, 0], { cast: false });
      b.box(m.garageLight, [0.07, 0.07, 0.24], [g.x + sx * (halfW - 0.15), y - 0.02, z], [0, 0, 0], { cast: false });
    }
  }

  /* ---- closed end wall and the cut earth around the excavation */
  b.box(m.stone, [g.width + g.wallT * 2, -g.floorY + g.slabT, g.wallT],
    [g.x, (g.floorY - g.slabT) / 2, g.botZ - g.wallT / 2], [0, 0, 0], { cast: false });
  const bankBottom = g.floorY - g.slabT - 0.5;
  const bank = (x0: number, x1: number, z0: number, z1: number) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    b.box(m.soil, [x1 - x0, -bankBottom, z1 - z0], [(x0 + x1) / 2, bankBottom / 2, (z0 + z1) / 2], [0, 0, 0], { cast: false, receive: true });
  };
  bank(g.cut.x1, plotW / 2, -plotD / 2, g.cut.z1);                       // between the trough and the east boundary
  bank(g.cut.x0, g.cut.x1, -plotD / 2, g.cut.z0 - g.wallT);              // behind the end wall
  bank(g.room.x1 - 1.4, g.cut.x0, g.room.z1, g.cut.z1);                  // north of the basement box, west of the trough

  /* ---- lane edge paint and transverse grip bands on the slope */
  for (const sx of [-1, 1]) {
    addPrism(b, m.lineMark, [
      [g.topZ, 0.02], [g.slopeEndZ, g.floorY + 0.02], [g.botZ, g.floorY + 0.02],
      [g.botZ, g.floorY], [g.slopeEndZ, g.floorY], [g.topZ, 0],
    ], 0.1, g.x + sx * (halfW - 0.25), { cast: false });
  }
  if (!low) for (const t of [0.13, 0.17, 0.83, 0.87]) {
    const z = g.slopeEndZ + g.run * t;
    const y = g.floorY + g.run * t * g.slope;
    // Dark narrow anti-skid joints near the ends; no repeated white ladder across the drive.
    b.box(m.metalDark, [g.width - 0.7, 0.012, 0.035], [g.x, y + 0.015, z], [Math.atan(g.slope), 0, 0], { cast: false });
  }

  /* ---- ramp head: apron, boom barrier, height gantry and signs */
  b.box(m.asphalt, [g.width + 2.6, 0.1, 4.2], [g.x - 0.3, 0.04, g.topZ + 2.1], [0, 0, 0], { cast: false, receive: true });
  b.box(m.hazard, [g.width, 0.02, 0.48], [g.x, 0.11, g.topZ + 0.3], [0, 0, 0], { cast: false });
  const gantryY = 2.35;
  for (const sx of [-1, 1]) {
    b.cylinder(m.metalDark, 0.07, 0.08, gantryY, 8, [g.x + sx * (halfW + 0.35), gantryY / 2, g.topZ + 0.55]);
  }
  b.box(m.metalDark, [g.width + 0.9, 0.1, 0.12], [g.x, gantryY, g.topZ + 0.55], [0, 0, 0], { cast: false });
  b.box(m.hazard, [g.width + 0.3, 0.3, 0.06], [g.x, gantryY - 0.22, g.topZ + 0.55], [0, 0, 0], { cast: false });
  b.plane(m.wayfinding, [0.95, 0.32], [g.x, gantryY - 0.22, g.topZ + 0.59], [0, 0, 0], { uvRect: [0.01, 0.06, 0.31, 0.84], receive: false });
  if (!low) {
    // boom barrier beside the entry lane
    const bx = g.x + halfW + 0.55;
    b.box(m.metalDark, [0.34, 1.0, 0.3], [bx, 0.5, g.topZ + 1.5]);
    b.box(m.enamel, [0.26, 0.3, 0.24], [bx, 1.12, g.topZ + 1.5], [0, 0, 0], { cast: false });
    b.pipe(m.hazard, [[bx - 0.1, 1.05, g.topZ + 1.5], [bx - g.width - 0.5, 1.05, g.topZ + 1.5]], 0.055, 6);
    b.cylinder(m.metalDark, 0.05, 0.05, 0.9, 6, [bx - g.width - 0.5, 0.6, g.topZ + 1.5]);
    // entry pedestal with a card reader
    b.box(m.metalDark, [0.22, 1.15, 0.22], [g.x - halfW - 0.6, 0.57, g.topZ + 1.2]);
    b.box(m.enamel, [0.2, 0.26, 0.14], [g.x - halfW - 0.6, 1.2, g.topZ + 1.3], [0, 0, 0], { cast: false });
    b.box(m.garageLight, [0.08, 0.05, 0.02], [g.x - halfW - 0.6, 1.24, g.topZ + 1.38], [0, 0, 0], { cast: false });
    // free-standing P sign at the kerb
    const signX = g.x + halfW + 0.5;
    b.cylinder(m.metalDark, 0.045, 0.05, 2.3, 6, [signX, 1.15, g.topZ + 3.1]);
    b.box(m.panel, [0.62, 0.62, 0.06], [signX, 2.4, g.topZ + 3.1], [0, 0, 0], { cast: false });
    b.plane(m.wayfinding, [0.5, 0.5], [signX, 2.4, g.topZ + 3.14], [0, 0, 0], { uvRect: [0.02, 0.1, 0.29, 0.76], receive: false });
  }
  if (p.dayNight !== 'day') anchors.push({ position: [g.x, 2.1, g.topZ + 1.2], kind: 'garage-entry' });

  /* ---- foot of the ramp: drainage channel and portal */
  b.box(m.metalDark, [g.width, 0.06, 0.46], [g.x, g.floorY + 0.03, g.slopeEndZ - 0.5], [0, 0, 0], { cast: false });
  for (let i = 0; i < 9; i++) {
    b.box(m.metal, [g.width - 0.1, 0.02, 0.035], [g.x, g.floorY + 0.07, g.slopeEndZ - 0.7 + i * 0.045], [0, 0, 0], { cast: false });
  }
  const portalCz = (g.portal.z0 + g.portal.z1) / 2;
  const portalW = g.portal.z1 - g.portal.z0;
  const headH = -g.portal.head;
  b.box(m.stone, [g.wallT, headH, portalW], [g.portal.x, g.portal.head + headH / 2, portalCz]);
  b.box(m.hazard, [0.1, 0.22, portalW], [g.portal.x - g.wallT / 2, g.portal.head - 0.11, portalCz], [0, 0, 0], { cast: false });
  b.box(m.panel, [0.14, 0.26, portalW + 0.5], [g.portal.x + 0.1, g.portal.head + 0.14, portalCz], [0, 0, 0], { cast: false });

  /* ---- the basement itself, visible through the portal */
  const spaces = buildGarageInterior(b, m, p, g, rng, anchors);
  if (p.dayNight !== 'day' || high) {
    anchors.push({ position: [g.portal.x - 1.6, g.floorY + g.clearance - 0.3, portalCz], kind: 'garage' });
  }

  // The turn from the centred gate to this apron is joined separately in the
  // site plan. Drawing it here made two coincident asphalt surfaces flicker.
  return spaces;
}

function buildGarageInterior(b: Batcher, m: MatLib, p: BuildingParams, g: GaragePlan, rng: RNG, anchors: Anchor[]): number {
  const r = g.room;
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const ceil = g.floorY + g.clearance;
  if (!p.garageInterior || w < 4 || d < 4) {
    // Still close the hole so the portal does not look into empty space.
    b.plane(m.reveal, [6, 3], [g.portal.x - 0.3, g.floorY + 1.4, (g.portal.z0 + g.portal.z1) / 2], [0, Math.PI / 2, 0], { receive: false });
    return 0;
  }
  const low = p.lod === 'low', high = p.lod === 'high';

  b.box(m.concrete, [w, 0.3, d], [cx, g.floorY - 0.15, cz], [0, 0, 0], { cast: false, receive: true });
  b.box(m.panel, [w + 0.6, g.slabT, d + 0.6], [cx, ceil + g.slabT / 2, cz], [0, 0, 0], { cast: false, receive: false });
  // perimeter walls (the east side is the ramp wall, already built)
  b.box(m.concrete, [w, g.clearance, 0.3], [cx, g.floorY + g.clearance / 2, r.z0 - 0.15], [0, 0, 0], { cast: false });
  b.box(m.concrete, [w, g.clearance, 0.3], [cx, g.floorY + g.clearance / 2, r.z1 + 0.15], [0, 0, 0], { cast: false });
  b.box(m.concrete, [0.3, g.clearance, d], [r.x0 - 0.15, g.floorY + g.clearance / 2, cz], [0, 0, 0], { cast: false });

  // Lay out bays before columns: the previous fixed grid placed columns and
  // the exit stair directly inside parking spaces.
  const bayW = 2.55, bayD = 4.9;
  const bayCount = Math.max(2, Math.min(8, Math.floor((w - 1.4) / bayW)));
  const rear = g.bayRow === 'rear';
  const bayZ = rear ? r.z0 + 0.4 + bayD / 2 : r.z1 - 0.4 - bayD / 2;
  const doorX = Math.min(r.x1 - 3.2, 1.5);
  const stairX = r.x0 + 2.2, stairZ = r.z0 + 2.6;
  g.stair = low ? null : { x0: stairX - 1.05, x1: stairX + 1.05, z0: stairZ - 0.35, z1: stairZ + 2.95 };
  const slots: { x: number; z: number; rot: number }[] = [];
  for (let i = 0; i < bayCount; i++) {
    const bx = r.x0 + 0.8 + bayW * (i + 0.5);
    if (bx + bayW / 2 > r.x1 - 0.7) continue;
    if (rear && (i === 0 || bx > r.x1 - 4.05)) continue; // stair and portal turning space
    if (!rear && Math.abs(bx - doorX) < 1.5) continue;   // lobby door
    g.bays.push({ x0: bx - bayW / 2, x1: bx + bayW / 2, z0: bayZ - bayD / 2, z1: bayZ + bayD / 2 });
    bayMarking(b, m, bx, bayZ, bayW, bayD, g.floorY + 0.022, g.bayMarking);
    if (!low) {
      const stopZ = rear ? bayZ - bayD / 2 + 0.55 : bayZ + bayD / 2 - 0.55;
      b.box(m.tyre, [1.5, 0.11, 0.16], [bx, g.floorY + 0.055, stopZ], [0, 0, 0], { cast: false });
    }
    slots.push({ x: bx, z: bayZ, rot: rear ? Math.PI : 0 });
  }
  const accessible = slots.length > 2 && !low ? 0 : -1;
  if (accessible >= 0) {
    const ax = slots[accessible].x;
    b.box(m.accessPaint, [0.85, 0.012, 0.95], [ax, g.floorY + 0.032, bayZ], [0, 0, 0], { cast: false });
    for (let i = 0; i < 4; i++) b.box(m.lineMark, [0.07, 0.015, 0.64], [ax - 0.5 + i * 0.32, g.floorY + 0.038, bayZ + 1.2], [0, 0.4, 0], { cast: false });
  }
  const spaces = slots.filter((_, i) => i !== accessible);

  // Put columns on bay division lines, beyond the vehicle envelope and clear of the portal aisle.
  const columnZ = rear ? bayZ + bayD / 2 + 1.1 : bayZ - bayD / 2 - 1.1;
  for (let i = 1; i < bayCount; i += low ? 3 : 2) {
    const px = r.x0 + 0.8 + i * bayW;
    if (px > r.x1 - 4.0) continue;
    g.columns.push({ x0: px - 0.3, x1: px + 0.3, z0: columnZ - 0.3, z1: columnZ + 0.3 });
    b.box(m.concrete, [0.55, g.clearance, 0.55], [px, g.floorY + g.clearance / 2, columnZ]);
    if (!low) b.box(m.hazard, [0.57, 0.34, 0.57], [px, g.floorY + 0.48, columnZ], [0, 0, 0], { cast: false });
  }
  if (!low) b.box(m.panel, [w - 0.5, 0.25, 0.35], [cx, ceil - 0.125, columnZ], [0, 0, 0], { cast: false });

  // lane arrows guiding traffic back to the ramp
  if (!low) {
    for (let i = 0; i < 3; i++) {
      const az = r.z0 + 5.5 + i * 4.5;
      if (az > r.z1 - 1) break;
      b.box(m.lineMark, [0.14, 0.02, 1.1], [r.x1 - 2.4, g.floorY + 0.015, az], [0, 0, 0], { cast: false });
      b.box(m.lineMark, [0.5, 0.02, 0.14], [r.x1 - 2.4, g.floorY + 0.015, az - 0.5], [0, 0.78, 0], { cast: false });
      b.box(m.lineMark, [0.5, 0.02, 0.14], [r.x1 - 2.4, g.floorY + 0.015, az - 0.5], [0, -0.78, 0], { cast: false });
    }
  }

  // ceiling light strips, services and wall equipment
  const strips = low ? 2 : Math.min(6, Math.floor(d / 3.4));
  for (let i = 0; i < strips; i++) {
    const lz = r.z0 + 2.2 + (i * (d - 4.4)) / Math.max(1, strips - 1);
    b.box(m.metalDark, [1.32, 0.09, 0.2], [cx + 0.6, ceil - 0.1, lz], [0, 0, 0], { cast: false });
    b.box(m.garageLight, [1.2, 0.04, 0.14], [cx + 0.6, ceil - 0.16, lz], [0, 0, 0], { cast: false });
    if (i % 2 === 0) anchors.push({ position: [cx + 0.6, ceil - 0.35, lz], kind: 'garage' });
  }
  if (!low) {
    b.pipe(m.pipe, [[r.x0 + 0.6, ceil - 0.42, r.z0 + 1], [r.x0 + 0.6, ceil - 0.42, r.z1 - 1]], 0.07, 6);
    b.pipe(m.tank, [[r.x0 + 1.0, ceil - 0.5, r.z0 + 1], [r.x0 + 1.0, ceil - 0.5, r.z1 - 1]], 0.045, 6);
    b.box(m.enamel, [0.26, 0.8, 0.6], [r.x0 + 0.35, g.floorY + 1.15, r.z0 + 2.2], [0, 0, 0], { cast: false });
    b.box(m.metalDark, [0.22, 0.9, 0.5], [r.x0 + 0.35, g.floorY + 1.2, r.z0 + 3.6], [0, 0, 0], { cast: false });
    b.box(m.garageLight, [0.04, 0.22, 0.42], [g.portal.x - 0.5, g.portal.head - 0.3, g.portal.z1 + 0.3], [0, 0, 0], { cast: false });
  }
  // EV charge points on the end wall
  if (p.evCharging && high) {
    for (let i = 0; i < 2; i++) {
      const ex = r.x0 + 1.4 + i * bayW;
      b.box(m.enamel, [0.3, 0.72, 0.2], [ex, g.floorY + 1.15, r.z0 + 0.22], [0, 0, 0], { cast: false });
      b.box(m.garageLight, [0.16, 0.1, 0.03], [ex, g.floorY + 1.38, r.z0 + 0.33], [0, 0, 0], { cast: false });
      b.pipe(m.tyre, [[ex + 0.14, g.floorY + 1.3, r.z0 + 0.3], [ex + 0.42, g.floorY + 0.95, r.z0 + 0.42], [ex + 0.2, g.floorY + 0.6, r.z0 + 0.3]], 0.022, 5);
    }
  }

  // Way out on foot: a door through to the building's lift lobby, and a fire stair
  // rising into a bulkhead in the rear yard. Both are what makes a basement usable.
  if (!low) {
    b.box(m.panel, [1.5, g.clearance - 0.25, 0.14], [doorX, g.floorY + (g.clearance - 0.25) / 2, r.z1 - 0.1], [0, 0, 0], { cast: false });
    b.box(m.door, [1.25, 2.1, 0.07], [doorX, g.floorY + 1.05, r.z1 - 0.19], [0, 0, 0], { cast: false });
    b.box(m.stainless, [0.05, 0.5, 0.04], [doorX + 0.45, g.floorY + 1.05, r.z1 - 0.25], [0, 0, 0], { cast: false });
    b.plane(m.wayfinding, [0.62, 0.24], [doorX, g.floorY + 2.35, r.z1 - 0.2], [0, Math.PI, 0], { uvRect: [0.35, 0.06, 0.29, 0.84], receive: false });
    b.box(m.garageLight, [0.5, 0.07, 0.03], [doorX, g.floorY + 2.2, r.z1 - 0.21], [0, 0, 0], { cast: false });
    anchors.push({ position: [doorX, g.floorY + 2.0, r.z1 - 1.0], kind: 'garage' });

    const sx = stairX, sz = stairZ;
    const steps = 9, rise = -g.floorY / steps;
    for (let i = 0; i < steps; i++) {
      b.box(m.concrete, [1.3, rise * (i + 1), 0.3], [sx, g.floorY + (rise * (i + 1)) / 2, sz + i * 0.3], [0, 0, 0], { cast: false });
    }
    b.pipe(m.metal, [[sx + 0.72, g.floorY + 1.0, sz], [sx + 0.72, 0.95, sz + steps * 0.3]], 0.025, 5);
    // bulkhead at grade, so the stair arrives somewhere real
    b.box(m.wallAccent, [2.1, 2.45, 2.7], [sx, 1.22, sz + 1.1]);
    b.box(m.stone, [2.3, 0.14, 2.9], [sx, 2.52, sz + 1.1], [0, 0, 0], { cast: false });
    b.box(m.enamel, [1.0, 2.05, 0.08], [sx, 1.02, sz + 2.46], [0, 0, 0], { cast: false });
    b.box(m.metal, [0.04, 0.22, 0.03], [sx + 0.35, 1.05, sz + 2.52], [0, 0, 0], { cast: false });
    b.plane(m.wayfinding, [0.6, 0.22], [sx, 2.2, sz + 2.46], [0, 0, 0], { uvRect: [0.68, 0.06, 0.3, 0.84], receive: false });
  }

  // Seeded occupancy rather than filling the same end of the same row every time.
  for (const slot of rng.shuffle(spaces).slice(0, Math.min(p.parkedVehicles, spaces.length))) {
    const x = slot.x + rng.float(-0.06, 0.06), z = slot.z + rng.float(-0.1, 0.1);
    car(b, m, rng, x, z, slot.rot, false, g.floorY);
    g.vehicles.push({ x0: x - 0.98, x1: x + 0.98, z0: z - 2.31, z1: z + 2.31 });
  }
  if (!low) scooter(b, m, rng, r.x1 - 1.35, r.z1 - 1.25, Math.PI / 2, g.floorY);
  return g.bays.length;
}

/* -------------------------------------------------------- surface lot */

export function buildSurfaceLot(
  b: Batcher, m: MatLib, p: BuildingParams, W: number, D: number, plotW: number, backZ: number,
  arrivalZ: number, rng: RNG, anchors: Anchor[],
): SurfacePlan {
  const low = p.lod === 'low';
  const bayW = 2.6, bayD = 4.85;
  const aisleX = Math.min(W / 2 + 4.7, plotW / 2 - 2.1);
  const aisleLeft = aisleX - 1.9;
  const lotX = rng.float(-0.65, 0.65);
  const maxBays = Math.max(2, Math.floor(((aisleLeft - 0.95 - Math.abs(lotX)) * 2) / bayW));
  const count = Math.min(maxBays, 5 + rng.int(0, 2));
  const lotW = count * bayW;
  const lotZ = -D / 2 - 3.45;
  const rowRear = lotZ - bayD / 2;
  const marking: SurfacePlan['marking'] = rng.bool() ? 'lines' : 'corners';
  const canopy: SurfacePlan['canopy'] = !p.carport ? 'none' : rng.bool() ? 'linear' : 'solar';
  const plan: SurfacePlan = {
    capacity: count, marking, canopy, bays: [], vehicles: [],
    aisle: { x0: aisleX - 1.9, x1: aisleX + 1.9, z0: backZ + 1.1, z1: arrivalZ + 1.6 },
  };

  // The rear yard is deep enough for a full 4.2 m manoeuvring aisle. It overlaps
  // the row apron and the side lane; there is no isolated parking rectangle.
  b.box(m.asphalt, [3.8, 0.1, arrivalZ + 1.6 - (backZ + 1.1)], [aisleX, 0.04, (arrivalZ + 1.6 + backZ + 1.1) / 2], [0, 0, 0], { cast: false });
  const crossLeft = lotX - lotW / 2 - 0.45;
  const crossRight = aisleLeft;
  const crossTop = rowRear - 0.55;
  const crossBottom = Math.max(backZ + 1.1, crossTop - 4.3);
  b.box(m.asphalt, [crossRight - crossLeft, 0.1, crossTop - crossBottom], [(crossRight + crossLeft) / 2, 0.04, (crossTop + crossBottom) / 2], [0, 0, 0], { cast: false });
  b.box(m.asphalt, [lotW + 0.8, 0.1, bayD + 1.1], [lotX, 0.04, lotZ], [0, 0, 0], { cast: false });

  const slots: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x = lotX - lotW / 2 + bayW * (i + 0.5);
    plan.bays.push({ x0: x - bayW / 2, x1: x + bayW / 2, z0: rowRear, z1: rowRear + bayD });
    bayMarking(b, m, x, lotZ, bayW, bayD, 0.106, marking);
    if (!low) b.box(m.tyre, [1.45, 0.11, 0.15], [x, 0.14, lotZ + bayD / 2 - 0.48], [0, 0, 0], { cast: false });
    if (i !== count - 1) slots.push({ x, z: lotZ }); // keep one accessible bay free
  }
  if (!low) {
    const x = lotX + lotW / 2 - bayW / 2;
    b.box(m.accessPaint, [0.62, 0.012, 0.72], [x, 0.103, lotZ], [0, 0, 0], { cast: false });
    for (let i = 0; i < 4; i++) b.box(m.lineMark, [0.07, 0.013, 0.6], [x - 0.5 + i * 0.32, 0.114, lotZ - 1.1], [0, 0.4, 0], { cast: false });
  }

  const islandX = lotX - lotW / 2 - 1.15; // opposite the vehicle aisle
  if (!low) {
    if (rng.bool()) {
      b.box(m.stone, [1.2, 0.26, 3.1], [islandX, 0.13, lotZ], [0, 0, 0], { cast: false });
      b.box(m.ground, [1.0, 0.05, 2.9], [islandX, 0.29, lotZ], [0, 0, 0], { cast: false });
      for (const dz of [-0.82, 0, 0.82]) {
        const leaves = new THREE.IcosahedronGeometry(1, 0);
        b.add(leaves, m.foliage, [islandX, 0.58, lotZ + dz], [0, rng.float(0, Math.PI), 0],
          { scale: [0.36, 0.36 + rng.float(0, 0.12), 0.4], cast: false });
        leaves.dispose();
      }
    } else {
      b.box(m.pavement, [1.65, 0.09, 3.2], [islandX, 0.05, lotZ], [0, 0, 0], { cast: false });
      for (let i = 0; i < 2; i++) scooter(b, m, rng, islandX, lotZ - 0.8 + i * 1.6, Math.PI);
    }
  }

  // A drainage channel belongs between the bay row and the cross-aisle.
  b.box(m.metalDark, [lotW, 0.04, 0.2], [lotX, 0.095, rowRear - 0.28], [0, 0, 0], { cast: false });
  if (!low) for (let i = 0; i < Math.floor(lotW / 0.55); i++) {
    b.box(m.metalDark, [0.16, 0.012, 0.12], [lotX - lotW / 2 + 0.275 + i * 0.55, 0.122, rowRear - 0.28], [0, 0, 0], { cast: false });
  }

  if (canopy !== 'none') {
    const covered = canopy === 'linear' ? count : Math.max(2, count - 2);
    const coverW = covered * bayW;
    const coverX = lotX - lotW / 2 + coverW / 2;
    const roofY = 3.05;
    b.box(m.panel, [coverW + 0.34, 0.14, bayD * 0.88], [coverX, roofY, lotZ + 0.06]);
    if (canopy === 'solar' && !low) for (let i = 0; i < covered; i++) {
      const px = lotX - lotW / 2 + bayW * (i + 0.5);
      b.box(m.solar, [bayW - 0.13, 0.025, bayD * 0.73], [px, roofY + 0.084, lotZ + 0.03], [0, 0, 0], { cast: false });
    }
    const posts = Math.max(2, Math.ceil(coverW / 5));
    for (let i = 0; i <= posts; i++) {
      const px = coverX - coverW / 2 + (coverW * i) / posts;
      b.box(m.metalDark, [0.14, roofY - 0.08, 0.14], [px, (roofY - 0.08) / 2, lotZ + bayD * 0.4]);
      if (!low) b.box(m.stone, [0.35, 0.09, 0.35], [px, 0.045, lotZ + bayD * 0.4], [0, 0, 0], { cast: false });
    }
    if (p.dayNight !== 'day') for (let i = 0; i < Math.min(3, posts); i++) {
      const lx = coverX - coverW / 2 + coverW * (i + 0.5) / Math.min(3, posts);
      b.box(m.garageLight, [0.9, 0.04, 0.14], [lx, roofY - 0.1, lotZ + 0.06], [0, 0, 0], { cast: false });
      anchors.push({ position: [lx, roofY - 0.35, lotZ + 0.06], kind: 'carport' });
    }
  }

  if (p.evCharging && !low) for (let i = 0; i < Math.min(2, count - 1); i++) {
    const x = lotX - lotW / 2 + bayW * (i + 0.5);
    b.box(m.enamel, [0.22, 0.75, 0.18], [x, 1.14, lotZ + bayD / 2 + 0.12], [0, 0, 0], { cast: false });
    b.box(m.garageLight, [0.1, 0.09, 0.02], [x, 1.35, lotZ + bayD / 2 + 0.22], [0, 0, 0], { cast: false });
  }
  if (!low) for (const sx of [-1, 1]) {
    const x = lotX + sx * (lotW / 2 + 0.7);
    b.cylinder(m.metalDark, 0.07, 0.09, 4.2, 8, [x, 2.1, lotZ - 0.2]);
    b.box(m.metalDark, [0.65, 0.08, 0.18], [x - sx * 0.28, 4.16, lotZ - 0.2], [0, 0, 0], { cast: false });
    if (p.dayNight !== 'day') anchors.push({ position: [x - sx * 0.5, 4.0, lotZ - 0.2], kind: 'parking' });
  }

  for (const slot of rng.shuffle(slots).slice(0, Math.min(p.parkedVehicles, slots.length))) {
    const x = slot.x + rng.float(-0.07, 0.07), z = slot.z + rng.float(-0.1, 0.1);
    car(b, m, rng, x, z, 0, p.dayNight !== 'day');
    plan.vehicles.push({ x0: x - 0.98, x1: x + 0.98, z0: z - 2.31, z1: z + 2.31 });
  }
  return plan;
}
