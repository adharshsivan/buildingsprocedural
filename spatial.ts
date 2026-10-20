import type { Block } from './building';

export interface BaySpatialInfo {
  /** Is this bay glued to another block (no exterior view, interior party wall)? */
  isParty: boolean;
  /** Can a 1.5m projecting balcony fit here without hitting an adjacent wall or inside corner? */
  canBalcony: boolean;
  /** Can an AC condenser unit fit here without clipping? */
  canAC: boolean;
  /** Is this bay near a narrow lightwell gap (< 4m to opposing wall)? */
  isNarrowGap: boolean;
  /** Distance in meters to the nearest perpendicular wall in front of this bay. */
  frontClearance: number;
}

const SIDES = [
  { ux: 1, uz: 0, nx: 0, nz: 1 },
  { ux: 0, uz: -1, nx: 1, nz: 0 },
  { ux: -1, uz: 0, nx: 0, nz: -1 },
  { ux: 0, uz: 1, nx: -1, nz: 0 },
];

/** Check if point (x, z) is inside or near block's horizontal AABB. */
function pointInAABB(x: number, z: number, b: Block, margin = 0): boolean {
  return (
    x >= b.cx - b.w / 2 - margin &&
    x <= b.cx + b.w / 2 + margin &&
    z >= b.cz - b.d / 2 - margin &&
    z <= b.cz + b.d / 2 + margin
  );
}

/**
 * Perform exact 3D spatial queries for a single bay on a block's face.
 */
export function analyzeBay(
  blocks: Block[],
  blockIndex: number,
  side: number,
  floor: number,
  u: number,
  bw: number,
): BaySpatialInfo {
  const blk = blocks[blockIndex];
  const s = SIDES[side];
  const halfN = (side === 0 || side === 2 ? blk.d : blk.w) / 2;

  // World coordinates of bay centre on wall surface:
  const wx = blk.cx + s.ux * u + s.nx * halfN;
  const wz = blk.cz + s.uz * u + s.nz * halfN;

  // 1. Party Wall Check:
  // Test a probe point 0.08m outside the wall in the outward normal direction.
  const probeX = wx + s.nx * 0.08;
  const probeZ = wz + s.nz * 0.08;

  let isParty = false;
  let frontClearance = 50.0;
  let isNarrowGap = false;

  for (let j = 0; j < blocks.length; j++) {
    if (j === blockIndex) continue;
    const other = blocks[j];
    // Check if other block exists at this vertical floor level:
    if (other.fStart > floor || other.fStart + other.fCount <= floor) continue;

    // If the probe point is inside the other block, this bay is glued to it:
    if (pointInAABB(probeX, probeZ, other, 0.02)) {
      isParty = true;
      break;
    }

    // Measure clearance in the outward normal direction from this bay:
    // If other block is in front of our face:
    const otherMinX = other.cx - other.w / 2;
    const otherMaxX = other.cx + other.w / 2;
    const otherMinZ = other.cz - other.d / 2;
    const otherMaxZ = other.cz + other.d / 2;

    // Raycast in outward normal direction:
    if (s.nx !== 0) {
      // Facing along X axis (+X or -X)
      // Check if other block overlaps our bay's Z span:
      const bayMinZ = Math.min(wz - (bw / 2) * Math.abs(s.uz), wz + (bw / 2) * Math.abs(s.uz));
      const bayMaxZ = Math.max(wz - (bw / 2) * Math.abs(s.uz), wz + (bw / 2) * Math.abs(s.uz));
      if (Math.max(bayMinZ, otherMinZ) < Math.min(bayMaxZ, otherMaxZ) + 0.1) {
        const dist = s.nx > 0 ? otherMinX - wx : wx - otherMaxX;
        if (dist > 0 && dist < frontClearance) {
          frontClearance = dist;
        }
      }
    } else {
      // Facing along Z axis (+Z or -Z)
      const bayMinX = Math.min(wx - (bw / 2) * Math.abs(s.ux), wx + (bw / 2) * Math.abs(s.ux));
      const bayMaxX = Math.max(wx - (bw / 2) * Math.abs(s.ux), wx + (bw / 2) * Math.abs(s.ux));
      if (Math.max(bayMinX, otherMinX) < Math.min(bayMaxX, otherMaxX) + 0.1) {
        const dist = s.nz > 0 ? otherMinZ - wz : wz - otherMaxZ;
        if (dist > 0 && dist < frontClearance) {
          frontClearance = dist;
        }
      }
    }
  }

  if (isParty) {
    return {
      isParty: true,
      canBalcony: false,
      canAC: false,
      isNarrowGap: false,
      frontClearance: 0,
    };
  }

  if (frontClearance < 4.2) {
    isNarrowGap = true;
  }

  // 2. Balcony collision & re-entrant corner check:
  // Balcony projects outward by bd = 1.5m, width = bw * 0.96.
  const bd = 1.5;
  let canBalcony = frontClearance >= bd + 0.5;

  if (canBalcony) {
    // Check if the balcony envelope penetrates any other block:
    const halfBw = (bw * 0.95) / 2;
    const testPoints: [number, number][] = [
      // Left and right outer corners of balcony:
      [wx + s.ux * -halfBw + s.nx * bd, wz + s.uz * -halfBw + s.nz * bd],
      [wx + s.ux * halfBw + s.nx * bd, wz + s.uz * halfBw + s.nz * bd],
      // Mid outward point:
      [wx + s.nx * bd, wz + s.nz * bd],
      // Near-wall side clearance (prevents touching a perpendicular wall at an inside corner):
      [wx + s.ux * (-halfBw - 0.4) + s.nx * (bd * 0.5), wz + s.uz * (-halfBw - 0.4) + s.nz * (bd * 0.5)],
      [wx + s.ux * (halfBw + 0.4) + s.nx * (bd * 0.5), wz + s.uz * (halfBw + 0.4) + s.nz * (bd * 0.5)],
    ];

    for (let j = 0; j < blocks.length; j++) {
      if (j === blockIndex) continue;
      const other = blocks[j];
      if (other.fStart > floor || other.fStart + other.fCount <= floor) continue;

      for (const [tx, tz] of testPoints) {
        if (pointInAABB(tx, tz, other, 0.15)) {
          canBalcony = false;
          break;
        }
      }
      if (!canBalcony) break;
    }
  }

  // 3. AC Unit collision check:
  // AC projects 0.5m outward.
  let canAC = frontClearance >= 1.0;
  if (canAC) {
    const acPoints: [number, number][] = [
      [wx + s.nx * 0.55, wz + s.nz * 0.55],
      [wx + s.ux * -0.6 + s.nx * 0.5, wz + s.uz * -0.6 + s.nz * 0.5],
      [wx + s.ux * 0.6 + s.nx * 0.5, wz + s.uz * 0.6 + s.nz * 0.5],
    ];
    for (let j = 0; j < blocks.length; j++) {
      if (j === blockIndex) continue;
      const other = blocks[j];
      if (other.fStart > floor || other.fStart + other.fCount <= floor) continue;

      for (const [tx, tz] of acPoints) {
        if (pointInAABB(tx, tz, other, 0.1)) {
          canAC = false;
          break;
        }
      }
      if (!canAC) break;
    }
  }

  return {
    isParty: false,
    canBalcony,
    canAC,
    isNarrowGap,
    frontClearance,
  };
}
