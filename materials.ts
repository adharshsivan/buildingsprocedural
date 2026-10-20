import * as THREE from 'three';
import { STYLE_PROFILES, type Style, type TimeOfDay } from './types';
import type { ResolvedPalette } from './colors';
import * as T from './textures';
import { cleanSurface } from './surfaces';
import { equipmentAtlas, garmentAtlas, hoardingAtlas, lobbyAtlas, residenceSign, roomAtlas, shopAtlas, wayfindingAtlas } from './detailTextures';

export interface MatLib {
  wall: THREE.MeshStandardMaterial;
  wallAccent: THREE.MeshStandardMaterial;
  wallDeep: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  slab: THREE.MeshStandardMaterial;
  soffit: THREE.MeshStandardMaterial;
  reveal: THREE.MeshStandardMaterial;
  frame: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  glassSpandrel: THREE.MeshStandardMaterial;
  railGlass: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  metalDark: THREE.MeshStandardMaterial;
  accentMetal: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
  roofDeck: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  pavement: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  lineMark: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  pot: THREE.MeshStandardMaterial;
  interiors: THREE.MeshStandardMaterial[];
  interiorsLit: THREE.MeshStandardMaterial[];
  lobbies: THREE.MeshStandardMaterial[];
  lobbiesLit: THREE.MeshStandardMaterial[];
  shops: THREE.MeshStandardMaterial[];
  shopsLit: THREE.MeshStandardMaterial[];
  curtains: THREE.MeshStandardMaterial[];
  clothes: THREE.MeshStandardMaterial[];
  signage: THREE.MeshStandardMaterial;
  emissiveWarm: THREE.MeshStandardMaterial;
  emissiveCool: THREE.MeshStandardMaterial;
  carBodies: THREE.MeshStandardMaterial[];
  carGlass: THREE.MeshStandardMaterial;
  tyre: THREE.MeshStandardMaterial;
  solar: THREE.MeshStandardMaterial;
  equipment: THREE.MeshStandardMaterial;
  enamel: THREE.MeshStandardMaterial;
  pipe: THREE.MeshStandardMaterial;
  tank: THREE.MeshStandardMaterial;
  stainless: THREE.MeshStandardMaterial;
  nameplate: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  wayfinding: THREE.MeshStandardMaterial;
  hazard: THREE.MeshStandardMaterial;
  accessPaint: THREE.MeshStandardMaterial;
  garageLight: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  membrane: THREE.MeshStandardMaterial;
  planter: THREE.MeshStandardMaterial;
  hoarding: THREE.MeshStandardMaterial;
  all(): THREE.Material[];
}

const libCache = new Map<string, MatLib>();

function std(opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(opts);
  m.envMapIntensity = opts.envMapIntensity ?? 0.85;
  return m;
}

// Browsing many seeds creates many colour sets. Keep the newest few; evicted materials are
// disposed and simply re-initialise if a still-visible building uses them again.
const MAX_CACHED_LIBS = 24;
export function materialCacheSize() { return libCache.size; }

export function getMaterials(p: ResolvedPalette, time: TimeOfDay, style: Style, variation = 0.35): MatLib {
  const key = `${p.id}|${time}|${style}|${variation}`;
  const hit = libCache.get(key);
  if (hit) { libCache.delete(key); libCache.set(key, hit); return hit; }
  const prof = STYLE_PROFILES[style];
  const night = time === 'night';
  const dusk = time === 'dusk';

  const wall = cleanSurface(p.wall, 'plaster', variation, prof.roughWall ? 0.88 : 0.74);
  const wallAccent = cleanSurface(p.wallAccent, 'plaster', variation, 0.76);
  const wallDeep = cleanSurface(p.wallDeep, 'plaster', variation, 0.78);
  wallDeep.name = 'Lokam / Accent plaster';
  const panel = cleanSurface(p.panel, 'metal', variation, 0.42, 0.18);
  const stone = cleanSurface(p.stone, 'stone', variation, 0.63);
  const trim = std({ color: p.trim, roughness: 0.55, metalness: 0.2 });
  const slab = cleanSurface(p.wall, 'plaster', variation, 0.72);
  const soffit = std({ color: new THREE.Color(p.wallAccent).multiplyScalar(0.72), roughness: 0.9 });
  const reveal = std({ color: new THREE.Color(p.wall).multiplyScalar(0.55), roughness: 0.95 });
  const frame = std({ color: p.frame, roughness: 0.38, metalness: 0.65 });

  const glass = std({
    color: '#93abb3',
    roughness: 0.09,
    metalness: 0.48,
    transparent: true,
    opacity: night ? 0.18 : 0.52,
    depthWrite: false,
    vertexColors: true,
    envMapIntensity: night ? 0.7 : 2.3,
  });
  glass.name = 'Lokam / Architectural glazing';
  glass.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float edgeReflection = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 4.0);
      diffuseColor.a = clamp(opacity + edgeReflection * 0.42, 0.0, 0.92);
      #include <opaque_fragment>
    `);
  };
  glass.customProgramCacheKey = () => 'lokam-fresnel-glass-v3';
  const glassSpandrel = std({ color: new THREE.Color(p.glassTint).multiplyScalar(1.1), roughness: 0.25, metalness: 0.5, envMapIntensity: 1.1 });
  const railGlass = std({ color: '#a5bbc0', roughness: 0.14, metalness: 0.15, transparent: true, opacity: 0.25, depthWrite: false, envMapIntensity: 1.3, side: THREE.DoubleSide });
  railGlass.name = 'Lokam / Railing glass';
  railGlass.forceSinglePass = true;

  const metal = std({ color: '#bbc1bd', roughness: 0.29, metalness: 0.72 });
  const metalDark = std({ color: '#363e3b', roughness: 0.45, metalness: 0.35 });
  // Mostly-painted aluminium, not mirror metal: it should read as the palette's finish, not as a reflection.
  const accentMetal = std({ color: p.metal, roughness: 0.46, metalness: 0.5, envMapIntensity: 0.8 });
  const door = cleanSurface(p.timber, 'timber', 0.8, 0.48);
  const roofDeck = cleanSurface(p.roof, 'stone', variation, 0.88);
  // One neutral paving texture for every building; the palette supplies the tint.
  const ground = std({ map: T.pavementTexture('#ffffff'), color: p.ground, roughness: 0.95 });
  const pavement = std({ map: T.pavementTexture('#ffffff'), color: p.paving, roughness: 0.95 });
  const asphalt = std({ map: T.asphaltTexture(), color: '#ffffff', roughness: 0.98 });
  ground.userData.metersPerTile = 5.6;
  pavement.userData.metersPerTile = 5.6;
  asphalt.userData.metersPerTile = 3;
  const lineMark = std({ color: '#e8e4d8', roughness: 0.8, emissive: new THREE.Color(night ? '#6a6450' : '#000000'), emissiveIntensity: night ? 0.25 : 0 });
  const foliage = std({ map: T.foliageTexture(), color: '#ffffff', roughness: 0.85 });
  const pot = std({ color: '#9c6a4c', roughness: 0.8 });

  const mkInterior = (lit: boolean) => {
    const base: THREE.MeshStandardMaterialParameters = {
      map: roomAtlas(lit),
      color: lit ? '#ffffff' : '#60717a',
      roughness: 1,
      emissive: new THREE.Color(lit ? '#ffddaa' : '#d3d5ce'),
      emissiveMap: roomAtlas(lit),
      emissiveIntensity: lit ? (night ? 1.35 : dusk ? 0.9 : 0.25) : (night ? 0.018 : 0.035),
    };
    return std(base);
  };

  const interiors = Array<THREE.MeshStandardMaterial>(16).fill(mkInterior(false));
  const interiorsLit = Array<THREE.MeshStandardMaterial>(16).fill(mkInterior(true));

  const mkLobby = (lit: boolean) => std({
    map: lobbyAtlas(lit),
    color: lit ? '#ffffff' : '#738186',
    roughness: 0.95,
    emissive: new THREE.Color(lit ? '#ffdda0' : '#6d7c82'),
    emissiveMap: lobbyAtlas(lit),
    emissiveIntensity: lit ? (night ? 1.4 : dusk ? 0.8 : 0.3) : (night ? 0.04 : 0.08),
  });
  const lobbyDay = mkLobby(false);
  lobbyDay.name = 'Lokam / Lobby interior';
  const lobbyNight = mkLobby(true);
  lobbyNight.name = 'Lokam / Lit lobby interior';
  const lobbies = Array<THREE.MeshStandardMaterial>(4).fill(lobbyDay);
  const lobbiesLit = Array<THREE.MeshStandardMaterial>(4).fill(lobbyNight);
  const mkShop = (lit: boolean) => std({
    map: shopAtlas(lit), color: lit ? '#ffffff' : '#6e7d81', roughness: 0.92,
    emissive: new THREE.Color(lit ? '#ffdc9c' : '#66757b'), emissiveMap: shopAtlas(lit),
    emissiveIntensity: lit ? (night ? 1.3 : dusk ? 0.8 : 0.2) : 0.03,
  });
  const shopDay = mkShop(false); shopDay.name = 'Lokam / Retail interior';
  const shopNight = mkShop(true); shopNight.name = 'Lokam / Lit retail interior';
  const shops = Array<THREE.MeshStandardMaterial>(4).fill(shopDay);
  const shopsLit = Array<THREE.MeshStandardMaterial>(4).fill(shopNight);

  const curtainColors = ['#e8ded0', '#d9c9b4', '#cdd6dd', '#e6d9e0', '#cfd8cb'];
  const curtains = curtainColors.map(c =>
    std({ map: T.curtainTexture(c), color: '#ffffff', roughness: 0.95, side: THREE.DoubleSide })
  );

  const clothes = [0, 1, 2].map(v =>
    std({ map: T.clothesTexture(v), color: '#ffffff', roughness: 0.95, side: THREE.DoubleSide, transparent: true, alphaTest: 0.35 })
  );

  const signage = std({
    map: T.signageTexture(1, night || dusk),
    color: '#ffffff',
    roughness: 0.5,
    emissive: new THREE.Color(night || dusk ? '#ffffff' : '#000000'),
    emissiveMap: T.signageTexture(1, true),
    emissiveIntensity: night ? 1.1 : dusk ? 0.5 : 0,
  });

  const emissiveWarm = std({ color: '#ffd9a0', emissive: new THREE.Color('#ffb257'), emissiveIntensity: night ? 2.4 : dusk ? 1.1 : 0.15, roughness: 0.4 });
  const emissiveCool = std({ color: '#dfefff', emissive: new THREE.Color('#9fd0ff'), emissiveIntensity: night ? 1.8 : dusk ? 0.8 : 0.1, roughness: 0.4 });

  const carBodies = ['#b7bdbe', '#333b40', '#723635', '#364f61', '#dbdedc', '#606a68'].map(c =>
    std({ color: c, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.4 })
  );
  const carGlass = std({ color: '#1b2730', roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.75, envMapIntensity: 1.4 });
  const tyre = std({ color: '#17191c', roughness: 0.95 });
  const solar = std({ color: '#16233a', roughness: 0.18, metalness: 0.6, envMapIntensity: 1.3 });
  const equipment = std({ map: equipmentAtlas(), roughness: 0.65 });
  equipment.name = 'Lokam / Equipment atlas';
  const enamel = std({ color: '#e7e9df', roughness: 0.38, metalness: 0.12 });
  const pipe = std({ color: '#b8bdb4', roughness: 0.53, metalness: 0.1 });
  const tank = std({ color: '#3e4945', roughness: 0.49 });
  const stainless = std({ color: '#c5ccc9', roughness: 0.29, metalness: 0.82 });
  const nameplate = std({ map: residenceSign(), roughness: 0.56, metalness: 0.25 });
  // One cut-out material for all laundry; colour per garment comes from vertex colours.
  const fabric = std({ map: garmentAtlas(), vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.94, envMapIntensity: 0.35 });
  fabric.name = 'Lokam / Laundry fabric';
  const wayfinding = std({ map: wayfindingAtlas(), roughness: 0.58, metalness: 0.18, emissive: new THREE.Color(night || dusk ? '#ffffff' : '#000000'), emissiveMap: wayfindingAtlas(), emissiveIntensity: night ? 0.55 : dusk ? 0.2 : 0 });
  const hazard = std({ color: '#d2a128', roughness: 0.62, metalness: 0.08 });
  const accessPaint = std({ color: '#456985', roughness: 0.84 });
  // A basement needs light whatever the time of day, so this one is not tied to dayNight.
  const garageLight = std({ color: '#eef4ff', emissive: new THREE.Color('#d6e6ff'), emissiveIntensity: 2.1, roughness: 0.4 });
  // Cut earth behind the retaining walls, so an excavation is not an object floating over a void.
  const soil = std({ color: '#5f5950', roughness: 1 });
  // Bare structural concrete for basement floors, walls and soffits.
  const concrete = cleanSurface('#8a8880', 'stone', variation, 0.95);
  concrete.name = 'Lokam / Basement concrete';
  const membrane = cleanSurface(p.membrane, 'plaster', variation, 0.95);
  membrane.name = 'Lokam / Roof membrane';
  const planter = cleanSurface('#8c7d69', 'stone', variation, 0.85);
  planter.name = 'Lokam / Roof planter';
  const hoarding = std({
    map: hoardingAtlas(night || dusk),
    color: '#ffffff',
    roughness: 0.45,
    metalness: 0.08,
    emissive: new THREE.Color(night ? '#ffffff' : dusk ? '#cccccc' : '#000000'),
    emissiveMap: hoardingAtlas(true),
    emissiveIntensity: night ? 1.25 : dusk ? 0.6 : 0,
  });
  hoarding.name = 'Lokam / Rooftop hoarding';

  const lib: MatLib = {
    wall, wallAccent, wallDeep, panel, stone, trim, slab, soffit, reveal, frame, glass, glassSpandrel, railGlass,
    metal, metalDark, accentMetal, door, roofDeck, ground, pavement, asphalt, lineMark, foliage, pot,
    interiors, interiorsLit, lobbies, lobbiesLit, shops, shopsLit, curtains, clothes, signage, emissiveWarm, emissiveCool,
    carBodies, carGlass, tyre, solar, equipment, enamel, pipe, tank, stainless, nameplate, fabric, wayfinding, hazard, accessPaint, garageLight, soil, concrete, membrane, planter, hoarding,
    all() {
      const out: THREE.Material[] = [];
      for (const v of Object.values(this as unknown as Record<string, unknown>)) {
        if (v instanceof THREE.Material) out.push(v);
        else if (Array.isArray(v)) v.forEach(x => { if (x instanceof THREE.Material) out.push(x); });
      }
      return [...new Set(out)];
    },
  };

  libCache.set(key, lib);
  while (libCache.size > MAX_CACHED_LIBS) {
    const oldest = libCache.keys().next().value as string;
    libCache.get(oldest)?.all().forEach(mat => mat.dispose());
    libCache.delete(oldest);
  }
  return lib;
}

export function disposeMaterialCache() {
  libCache.forEach(lib => lib.all().forEach(m => m.dispose()));
  libCache.clear();
}
