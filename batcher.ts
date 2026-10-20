import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Vec3 = [number, number, number];
export type UVRect = [number, number, number, number];
export interface BatchOptions {
  cast?: boolean;
  receive?: boolean;
  scale?: Vec3;
  uvRect?: UVRect;
  tint?: number;
  color?: [number, number, number];
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const cylinders = new Map<string, THREE.CylinderGeometry>();

export class Batcher {
  private buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  private mirrorX = false;
  private matrix = new THREE.Matrix4();
  private rotation = new THREE.Quaternion();
  private euler = new THREE.Euler();
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();
  stats = { elements: 0 };

  // Mirror one complete module without doubling the material batches. Geometry
  // winding is reversed after reflection, keeping face culling and raycasts valid.
  withMirrorX<T>(enabled: boolean, build: () => T): T {
    const previous = this.mirrorX;
    this.mirrorX = enabled;
    try { return build(); }
    finally { this.mirrorX = previous; }
  }

  add(geo: THREE.BufferGeometry, mat: THREE.Material, pos: Vec3, rot: Vec3 = [0, 0, 0], opts: BatchOptions = {}) {
    const g = geo.clone();
    this.rotation.setFromEuler(this.euler.fromArray(rot));
    this.matrix.compose(this.position.fromArray(pos), this.rotation, this.scale.fromArray(opts.scale ?? [1, 1, 1]));
    g.applyMatrix4(this.matrix);
    if (this.mirrorX) {
      g.applyMatrix4(this.matrix.makeScale(-1, 1, 1));
      if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
      const index = g.getIndex()!;
      for (let i = 0; i < index.count; i += 3) {
        const second = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, second);
      }
      index.needsUpdate = true;
    }
    const positions = g.getAttribute('position');
    const normals = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    if (!g.index) g.setIndex(Array.from({ length: positions.count }, (_, i) => i));
    if (uv && opts.uvRect) {
      const [x, y, w, h] = opts.uvRect;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, x + uv.getX(i) * w, y + uv.getY(i) * h);
    } else if (uv && mat.userData.metersPerTile) {
      const size = mat.userData.metersPerTile as number;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i));
        const nz = Math.abs(normals.getZ(i));
        uv.setXY(i,
          (nx > ny && nx > nz ? positions.getZ(i) : positions.getX(i)) / size,
          (ny > nx && ny > nz ? positions.getZ(i) : positions.getY(i)) / size);
      }
    }
    if (mat.vertexColors) {
      const colors = new Float32Array(positions.count * 3);
      const c = opts.color ?? [opts.tint ?? 1, opts.tint ?? 1, opts.tint ?? 1];
      for (let i = 0; i < positions.count; i++) colors.set(c, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    let bucket = this.buckets.get(mat);
    if (!bucket) {
      bucket = { geos: [], cast: false, receive: false };
      this.buckets.set(mat, bucket);
    }
    bucket.geos.push(g);
    bucket.cast ||= opts.cast ?? true;
    bucket.receive ||= opts.receive ?? true;
    this.stats.elements++;
    return this;
  }

  box(mat: THREE.Material, size: Vec3, pos: Vec3, rot: Vec3 = [0, 0, 0], opts: BatchOptions = {}) {
    return this.add(unitBox, mat, pos, rot, { ...opts, scale: size });
  }

  plane(mat: THREE.Material, size: [number, number], pos: Vec3, rot: Vec3 = [0, 0, 0], opts: BatchOptions = {}) {
    return this.add(unitPlane, mat, pos, rot, { cast: false, ...opts, scale: [size[0], size[1], 1] });
  }

  cylinder(mat: THREE.Material, rTop: number, rBottom: number, height: number, seg: number, pos: Vec3, rot: Vec3 = [0, 0, 0], opts: BatchOptions = {}) {
    const ratio = Math.round((rTop / Math.max(rBottom, 0.001)) * 10000) / 10000;
    const key = `${ratio.toFixed(4)}-${seg}`;
    let geometry = cylinders.get(key);
    if (!geometry) {
      geometry = new THREE.CylinderGeometry(ratio, 1, 1, seg);
      cylinders.set(key, geometry);
    }
    return this.add(geometry, mat, pos, rot, { ...opts, scale: [rBottom, height, rBottom] });
  }

  pipe(mat: THREE.Material, points: Vec3[], radius: number, detail = 6) {
    if (points.length < 2) return;
    const vectors = points.map(p => new THREE.Vector3(...p));
    const curves: { curve: THREE.Curve<THREE.Vector3>; steps: number }[] = [];
    let previous = vectors[0];
    for (let i = 1; i < vectors.length - 1; i++) {
      const corner = vectors[i], next = vectors[i + 1];
      const elbow = Math.min(radius * 3, previous.distanceTo(corner) * 0.4, corner.distanceTo(next) * 0.4);
      const before = corner.clone().add(previous.clone().sub(corner).normalize().multiplyScalar(elbow));
      const after = corner.clone().add(next.clone().sub(corner).normalize().multiplyScalar(elbow));
      if (previous.distanceTo(before) > 0.00001) curves.push({ curve: new THREE.LineCurve3(previous, before), steps: 1 });
      if (before.distanceTo(after) > 0.00001) curves.push({ curve: new THREE.QuadraticBezierCurve3(before, corner, after), steps: 4 });
      previous = after;
    }
    if (previous.distanceTo(vectors[vectors.length - 1]) > 0.00001) curves.push({ curve: new THREE.LineCurve3(previous, vectors[vectors.length - 1]), steps: 1 });
    // Sample each elbow independently so a tall riser cannot flatten a small bend.
    for (const { curve, steps } of curves) {
      const geometry = new THREE.TubeGeometry(curve, steps, radius, detail, false);
      this.add(geometry, mat, [0, 0, 0], [0, 0, 0], { cast: false });
      geometry.dispose();
    }
  }

  build(name = 'generated'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    let triangles = 0;
    for (const [mat, bucket] of this.buckets) {
      const merged = mergeGeometries(bucket.geos, false);
      bucket.geos.forEach(g => g.dispose());
      if (!merged) throw new Error(`Unable to merge ${mat.name || mat.type}`);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = mat.name || 'Architectural component';
      mesh.castShadow = bucket.cast && !mat.transparent;
      mesh.receiveShadow = bucket.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (mat.transparent) mesh.renderOrder = mat.name.includes('Railing') ? 3 : 2;
      triangles += (merged.index?.count ?? merged.attributes.position.count) / 3;
      group.add(mesh);
    }
    group.userData.stats = { drawCalls: group.children.length, triangles: Math.round(triangles), elements: this.stats.elements };
    this.buckets.clear();
    return group;
  }
}

export function disposeGeometryCache() {
  unitBox.dispose();
  unitPlane.dispose();
  cylinders.forEach(g => g.dispose());
  cylinders.clear();
}