import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateBuilding } from '../generator/building';
import { skyEquirect } from '../generator/textures';
import type { BuildingParams } from '../generator/types';

export type ViewMode = 'overview' | 'facade' | 'entrance' | 'parking' | 'roof';
export interface ColorReport {
  name: string; family: string; scheme: string; undertone: string; finish: string;
  swatches: { wall: string; wallDeep: string; wallAccent: string; stone: string; panel: string; frame: string; metal: string };
}
export interface BuildingStats { drawCalls: number; triangles: number; elements: number; colors?: ColorReport }
export interface ViewportHandle { focus: (mode: ViewMode) => void; zoom: (direction: number) => void }
interface Context {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  floor: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  pmrem: THREE.PMREMGenerator;
  env: THREE.WebGLRenderTarget | null;
  group: THREE.Group | null;
  practicals: THREE.PointLight[];
  dirty: boolean;
}

/**
 * Surrounding ground. A host world must cut its terrain wherever the generator excavates,
 * otherwise the ramp trough is simply covered over; this mirrors that requirement.
 */
function surroundGeometry(cut: { x0: number; x1: number; z0: number; z1: number } | null) {
  const r = 600;
  const shape = new THREE.Shape();
  shape.moveTo(-r, -r); shape.lineTo(r, -r); shape.lineTo(r, r); shape.lineTo(-r, r); shape.closePath();
  if (cut) {
    const hole = new THREE.Path();
    hole.moveTo(cut.x0, -cut.z1); hole.lineTo(cut.x1, -cut.z1);
    hole.lineTo(cut.x1, -cut.z0); hole.lineTo(cut.x0, -cut.z0); hole.closePath();
    shape.holes.push(hole);
  }
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function disposeGroup(group: THREE.Group | null) {
  group?.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  group?.removeFromParent();
}

const BuildingViewport = forwardRef<ViewportHandle, {
  params: BuildingParams;
  view: ViewMode;
  autoRotate: boolean;
  wireframe: boolean;
  onStats: (stats: BuildingStats) => void;
  onReady: (ready: boolean) => void;
}>(function BuildingViewport({ params, view, autoRotate, wireframe, onStats, onReady }, ref) {
  const mount = useRef<HTMLDivElement>(null);
  const context = useRef<Context | null>(null);
  const latest = useRef(params);
  latest.current = params;
  const viewRef = useRef(view);
  viewRef.current = view;
  const wireRef = useRef(wireframe);
  wireRef.current = wireframe;
  const [error, setError] = useState('');
  const flight = useRef<{ from: THREE.Vector3; to: THREE.Vector3; targetFrom: THREE.Vector3; targetTo: THREE.Vector3; start: number; duration: number } | null>(null);

  function focus(mode: ViewMode, instant = false) {
    const c = context.current;
    if (!c) return;
    const p = latest.current;
    const height = p.floors * p.floorHeight, w = p.width * p.bay, d = p.depth * p.bay;
    let target = new THREE.Vector3(0, height * 0.39, 0);
    let position: THREE.Vector3;
    c.camera.fov = mode === 'parking' ? 44 : 38;
    c.camera.updateProjectionMatrix();
    if (mode === 'facade') {
      target.set(w * 0.17, Math.max(5, height * 0.48), d / 2);
      position = target.clone().add(new THREE.Vector3(7.3, 2.2, 15));
    } else if (mode === 'entrance') {
      const door = (c.group?.userData.site as { entrance?: { position: [number, number, number] } } | undefined)?.entrance?.position;
      target.set(door?.[0] ?? 0, 1.65, door?.[2] ?? d / 2);
      position = target.clone().add(new THREE.Vector3(3.3, 1.8, 8.4));
    } else if (mode === 'roof') {
      const topY = height + (p.roofHoarding ? 2.5 : 0.7);
      target.set(0, topY, -d * 0.1);
      position = target.clone().add(new THREE.Vector3(w * 0.68, p.roofHoarding ? 14.2 : 12.5, d * 0.95));
    } else if (mode === 'parking') {
      const site = c.group?.userData.site as {
        garage?: { rampCenter: [number, number, number]; rampTop: [number, number, number] };
      } | undefined;
      if (site?.garage) {
        // Stand at the ramp head and look down the slope, so the descent is read end-on.
        const [rx, ry, rz] = site.garage.rampCenter;
        target.set(rx, ry - 0.6, rz);
        position = new THREE.Vector3(site.garage.rampTop[0] + 0.65, 7.1, site.garage.rampTop[2] + 6.4);
      } else {
        const lotZ = -d / 2 - 3.45;
        target.set(0, 0.6, lotZ);
        const lot = (c.group?.userData.site as { parkingLayout?: { side: string; canopy?: string } } | undefined)?.parkingLayout;
        const side = lot?.side === 'left' ? -1 : 1;
        position = lot?.canopy && lot.canopy !== 'none'
          ? new THREE.Vector3(side * Math.min(5.5, w / 2), 2.35, lotZ - 6.5)
          : new THREE.Vector3(side * Math.min(8.8, w / 2 + 2), 9.5, lotZ - 7.2);
      }
    } else {
      const fov = Math.tan(THREE.MathUtils.degToRad(c.camera.fov / 2));
      const distance = Math.max((height + 8) / (2 * fov), (w * 0.9 + d * 0.65 + 6) / (2 * fov * c.camera.aspect)) * 1.28;
      position = target.clone().add(new THREE.Vector3(0.82, 0.6, 1).normalize().multiplyScalar(distance));
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant || reduce) {
      c.camera.position.copy(position);
      c.controls.target.copy(target);
      c.controls.update();
      c.dirty = true;
      flight.current = null;
    } else {
      flight.current = { from: c.camera.position.clone(), to: position, targetFrom: c.controls.target.clone(), targetTo: target, start: performance.now(), duration: 760 };
    }
  }

  useImperativeHandle(ref, () => ({ focus, zoom(direction) {
    const c = context.current;
    if (!c) return;
    const offset = c.camera.position.clone().sub(c.controls.target).multiplyScalar(direction > 0 ? 0.83 : 1.2);
    const position = offset.add(c.controls.target);
    flight.current = { from: c.camera.position.clone(), to: position, targetFrom: c.controls.target.clone(), targetTo: c.controls.target.clone(), start: performance.now(), duration: 280 };
  } }));

  useEffect(() => {
    const element = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setError('This preview needs WebGL 2. Enable hardware acceleration and reload to view the building.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setSize(element.clientWidth, element.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D apartment building. Drag to orbit, scroll to zoom.');
    renderer.domElement.setAttribute('role', 'img');
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, element.clientWidth / element.clientHeight, 0.08, 500);
    camera.position.set(32, 26, 40);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 3;
    controls.maxDistance = 220;
    controls.autoRotateSpeed = 0.35;
    const sun = new THREE.DirectionalLight('#fff3d9', 3.3);
    sun.position.set(-28, 52, 36);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    const sc = sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 45; sc.bottom = -35; sc.far = 220;
    sc.updateProjectionMatrix();
    const hemi = new THREE.HemisphereLight('#e8edef', '#b5b0a4', 1.15);
    const fill = new THREE.DirectionalLight('#e4edf4', 0.6);
    fill.position.set(25, 22, -20);
    scene.add(sun, sun.target, hemi, fill);
    // Surrounding ground is a ring: the generator paves the plot itself, and a solid
    // plane here would cover any excavation such as the basement ramp.
    const floor = new THREE.Mesh(surroundGeometry(null), new THREE.MeshStandardMaterial({ color: '#c6c9bf', roughness: 1 }));
    floor.position.y = -0.006;
    floor.receiveShadow = true;
    scene.add(floor);
    const pmrem = new THREE.PMREMGenerator(renderer);
    context.current = { scene, renderer, camera, controls, sun, hemi, fill, floor, pmrem, env: null, group: null, practicals: [], dirty: true };
    focus('overview', true);
    controls.addEventListener('start', () => { flight.current = null; });
    let raf = 0, previous = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const c = context.current;
      if (!c) return;
      const now = performance.now();
      const elapsed = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      if (flight.current) {
        const f = flight.current;
        const t = Math.min(1, (now - f.start) / f.duration);
        const ease = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(f.from, f.to, ease);
        controls.target.lerpVectors(f.targetFrom, f.targetTo, ease);
        c.dirty = true;
        if (t === 1) flight.current = null;
      }
      if (controls.update(elapsed) || c.dirty || controls.autoRotate) {
        renderer.render(scene, camera);
        c.dirty = false;
      }
    };
    tick();
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      if (context.current) context.current.dirty = true;
    });
    resize.observe(element);
    const onLost = (event: Event) => { event.preventDefault(); setError('The graphics context was interrupted. Reload the preview to continue.'); };
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      context.current?.practicals.forEach(light => light.removeFromParent());
      disposeGroup(context.current?.group ?? null);
      context.current?.env?.dispose();
      floor.geometry.dispose(); floor.material.dispose();
      sun.shadow.map?.dispose();
      pmrem.dispose(); renderer.dispose();
      element.removeChild(renderer.domElement);
      context.current = null;
    };
  }, []);

  useEffect(() => {
    const c = context.current;
    if (!c) return;
    const night = params.dayNight === 'night', dusk = params.dayNight === 'dusk';
    const color = night ? '#141f29' : dusk ? '#b4b0ae' : '#e6e7e0';
    c.scene.background = new THREE.Color(color);
    c.scene.fog = new THREE.Fog(color, 90, 260);
    c.floor.material.color.set(night ? '#46525a' : dusk ? '#a9a49c' : '#c6c9bf');
    c.env?.dispose();
    c.env = c.pmrem.fromEquirectangular(skyEquirect(params.dayNight));
    c.scene.environment = c.env.texture;
    c.scene.environmentIntensity = night ? 0.35 : 0.52;
    c.sun.color.set(night ? '#a4bfea' : dusk ? '#ffd2a5' : '#fff4e2');
    c.sun.intensity = night ? 0.42 : dusk ? 2.1 : 3.3;
    c.sun.position.set(-28, dusk ? 30 : 52, 36);
    c.hemi.intensity = night ? 0.35 : dusk ? 0.75 : 1.15;
    c.fill.intensity = night ? 0.23 : 0.6;
    c.renderer.toneMappingExposure = night ? 1.1 : 0.96;
    c.renderer.shadowMap.needsUpdate = true;
    c.dirty = true;
  }, [params.dayNight]);

  useEffect(() => {
    onReady(false);
    const timer = window.setTimeout(() => {
      const c = context.current;
      if (!c) return;
      try {
        const group = generateBuilding(params);
        group.traverse(o => {
          if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) o.material.wireframe = wireRef.current;
        });
        disposeGroup(c.group);
        c.practicals.forEach(light => light.removeFromParent());
        c.practicals = [];
        c.group = group;
        c.scene.add(group);
        if (viewRef.current === 'parking') focus('parking');
        // Preview-only practicals from the generator's anchors. The basement is lit at every
        // time of day because an underground level never receives daylight.
        const anchors = (group.userData.lightAnchors ?? []) as { position: [number, number, number]; kind: string }[];
        const wanted = anchors.filter(a => a.kind === 'garage').slice(0, 4);
        if (params.dayNight !== 'day') {
          wanted.push(...anchors.filter(a => a.kind === 'entrance' || a.kind === 'garage-entry' || a.kind === 'hoarding').slice(0, 4));
        }
        for (const a of wanted) {
          const isHoarding = a.kind === 'hoarding';
          const light = new THREE.PointLight(
            a.kind === 'garage' ? '#cddff5' : isHoarding ? '#fff0cf' : '#ffb871',
            a.kind === 'garage' ? 3.0 : isHoarding ? 22 : 16,
            a.kind === 'garage' ? 11 : isHoarding ? 14 : 22,
            2,
          );
          light.position.set(...a.position);
          c.scene.add(light);
          c.practicals.push(light);
        }
        c.sun.target.position.set(0, params.floors * params.floorHeight * 0.35, 0);
        c.sun.position.y = Math.max(52, params.floors * params.floorHeight + 28);
        c.sun.shadow.camera.top = Math.max(45, params.floors * params.floorHeight + 15);
        c.sun.shadow.camera.updateProjectionMatrix();
        const excavation = (group.userData.site as { garage?: { excavation: { x0: number; x1: number; z0: number; z1: number } } }).garage?.excavation ?? null;
        c.floor.geometry.dispose();
        c.floor.geometry = surroundGeometry(excavation);
        c.renderer.setPixelRatio(Math.min(window.devicePixelRatio, params.lod === 'low' ? 1.2 : 1.7));
        c.renderer.shadowMap.needsUpdate = true;
        c.dirty = true;
        setError('');
        onStats({ ...(group.userData.stats as BuildingStats), colors: group.userData.colors as ColorReport });
        onReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The building could not be generated.');
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [params, onStats, onReady]);

  useEffect(() => { focus('overview'); }, [params.floors, params.width, params.depth, params.bay, params.floorHeight, params.massing, params.style]);
  useEffect(() => { if (context.current) context.current.controls.autoRotate = autoRotate; }, [autoRotate]);
  useEffect(() => {
    const c = context.current;
    c?.group?.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) o.material.wireframe = wireframe; });
    if (c) c.dirty = true;
  }, [wireframe]);

  return <><div className="render-mount" ref={mount}/>{error && <div className="render-error" role="alert"><h3>Preview unavailable</h3><p>{error}</p><button onClick={() => window.location.reload()}>Reload preview</button></div>}</>;
});

export default BuildingViewport;