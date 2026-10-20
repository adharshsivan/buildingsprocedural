import * as THREE from 'three';
import type { Batcher, Vec3 } from './batcher';
import type { MatLib } from './materials';
import { RNG } from './rng';

// Six flat-shaded glazing faces replace the stacked opaque cabin boxes.
function cabinGeometry(width: number, height: number, length: number, baseY: number): THREE.BufferGeometry {
  const bottomW = width * 0.49, topW = width * 0.44;
  const front = length * 0.5, roofFront = length * 0.29;
  const back = -length * 0.5, roofBack = -length * 0.31;
  const p: [number, number, number][] = [
    [-bottomW, baseY, front], [bottomW, baseY, front],
    [bottomW, baseY, back], [-bottomW, baseY, back],
    [-topW, baseY + height, roofFront], [topW, baseY + height, roofFront],
    [topW, baseY + height, roofBack], [-topW, baseY + height, roofBack],
  ];
  const faces = [[0, 1, 5, 0, 5, 4], [1, 2, 6, 1, 6, 5],
    [2, 3, 7, 2, 7, 6], [3, 0, 4, 3, 4, 7]];
  const coords: number[] = [], uv: number[] = [];
  for (const face of faces) for (let i = 0; i < face.length; i++) {
    coords.push(...p[face[i]]);
    uv.push(i % 3 === 0 ? 0 : 1, i < 3 ? 0 : 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Shared vehicle builders so both the plot and the parking module can place cars. */
export function car(b: Batcher, m: MatLib, rng: RNG, x: number, z: number, rotY: number, lightsOn: boolean, y = 0) {
  const body = m.carBodies[rng.int(0, m.carBodies.length - 1)];
  const suv = rng.next() > 0.68;
  const L = suv ? 4.6 : 4.15;
  const Wd = suv ? 1.92 : 1.78;
  const hBase = suv ? 0.78 : 0.62;
  const cabH = suv ? 0.82 : 0.68;
  const pos = (dx: number, dy: number, dz: number): Vec3 => {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    return [x + dx * c + dz * s, y + dy, z - dx * s + dz * c];
  };
  b.box(body, [Wd, hBase, L], pos(0, hBase / 2 + 0.26, 0), [0, rotY, 0]);
  b.box(body, [Wd * 0.95, 0.12, L * 0.97], pos(0, hBase + 0.28, 0), [0, rotY, 0], { cast: false });
  const cabZ = suv ? -0.14 : -0.25;
  const cabLen = L * (suv ? 0.54 : 0.49);
  const cabBase = hBase + 0.31;
  const glazing = cabinGeometry(Wd * 0.9, cabH, cabLen, cabBase);
  b.add(glazing, m.carGlass, pos(0, 0, cabZ), [0, rotY, 0], { cast: false });
  glazing.dispose();
  b.box(body, [Wd * 0.83, 0.09, cabLen * 0.62], pos(0, cabBase + cabH + 0.045, cabZ), [0, rotY, 0], { cast: false });
  for (const sx of [-1, 1]) {
    b.box(body, [0.04, cabH, 0.045], pos(sx * Wd * 0.415, cabBase + cabH / 2, cabZ - cabLen * 0.1), [0, rotY, 0], { cast: false });
    b.box(m.metalDark, [0.22, 0.09, 0.26], pos(sx * (Wd / 2 + 0.09), cabBase + 0.16, cabZ + cabLen * 0.3), [0, rotY, 0], { cast: false });
  }
  b.box(m.metalDark, [Wd * 0.88, 0.11, 0.13], pos(0, 0.4, L / 2 - 0.03), [0, rotY, 0], { cast: false });
  b.box(m.metalDark, [Wd * 0.88, 0.11, 0.13], pos(0, 0.4, -L / 2 + 0.03), [0, rotY, 0], { cast: false });
  const headMat = lightsOn ? m.emissiveCool : m.metal;
  b.box(headMat, [0.31, 0.105, 0.045], pos(-Wd / 2 + 0.3, 0.76, L / 2 - 0.02), [0, rotY, 0], { cast: false });
  b.box(headMat, [0.31, 0.105, 0.045], pos(Wd / 2 - 0.3, 0.76, L / 2 - 0.02), [0, rotY, 0], { cast: false });
  b.box(m.emissiveWarm, [0.28, 0.1, 0.04], pos(-Wd / 2 + 0.28, 0.77, -L / 2 + 0.02), [0, rotY, 0], { cast: false });
  b.box(m.emissiveWarm, [0.28, 0.1, 0.04], pos(Wd / 2 - 0.28, 0.77, -L / 2 + 0.02), [0, rotY, 0], { cast: false });
  const wz = L * 0.3, wx = Wd / 2 - 0.08;
  for (const [dx, dz] of [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]]) {
    b.cylinder(m.tyre, 0.33, 0.33, 0.22, 10, pos(dx, 0.33, dz), [0, rotY, Math.PI / 2]);
    b.cylinder(m.metal, 0.17, 0.17, 0.24, 8, pos(dx, 0.33, dz), [0, rotY, Math.PI / 2], { cast: false });
  }
}

export function scooter(b: Batcher, m: MatLib, rng: RNG, x: number, z: number, rotY = 0, y = 0) {
  const body = m.carBodies[rng.int(0, m.carBodies.length - 1)];
  const pos = (dx: number, dy: number, dz: number): Vec3 => {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    return [x + dx * c + dz * s, y + dy, z - dx * s + dz * c];
  };
  b.box(body, [0.42, 0.34, 1.15], pos(0, 0.62, 0), [0, rotY, 0]);
  b.box(m.metalDark, [0.1, 0.55, 0.1], pos(0, 0.95, 0.5), [0, rotY - 0.1, 0], { cast: false });
  b.box(m.metalDark, [0.58, 0.07, 0.07], pos(0, 1.2, 0.52), [0, rotY, 0], { cast: false });
  b.box(m.tyre, [0.12, 0.44, 0.44], pos(0, 0.22, 0.52), [0, rotY, 0], { cast: false });
  b.box(m.tyre, [0.14, 0.46, 0.46], pos(0, 0.23, -0.5), [0, rotY, 0], { cast: false });
  b.box(body, [0.46, 0.14, 0.5], pos(0, 0.84, -0.25), [0, rotY, 0], { cast: false });
}
