# Lokam Apartment Studio

A procedural Three.js apartment generator and a standalone React inspection studio.
The generator does not import React, create lights or controls, or modify an existing scene.

## Run

```sh
npm install
npm run dev
npm run build
```

## This Revision

- Clean plaster, stone, powder-coated metal and timber finishes. Continuous plot-space
  noise replaces per-module texture tiles, fake panel joints and baked weathering.
- Sliding, casement and fixed windows with layered frames, seals, tracks, sills,
  handles, hinge hardware, view-angle-dependent glazing and recessed interiors.
- Sixteen deterministic furnished interiors in a shared atlas, plus a night atlas.
  Curtains, interior furnishings and night occupancy vary independently by window.
- Glazed, timber and painted-metal entrance doors with sidelights, transoms,
  pull handles, hinges, kick plates, thresholds and an intercom.
- Rounded AC housings, shared fan/grille atlas, support brackets, isolation feet,
  insulated refrigerant runs, condensate lines and rooftop penetrations.
- Downpipes with individually sampled elbows, mounting collars and drain grates.
  Ribbed or stainless tanks with plinths, lids, inlet/outlet pipework, valves and ladders.
- Overview, facade, entrance, parking and rooftop inspection cameras; day/dusk/night;
  wireframe; deterministic seed control; exportable JSON presets.
- Massing options: slab, tower + podium, stepped setbacks, podium, twin towers on a
  shared podium (with skybridge), L-shaped, T-shaped, U-shaped court, enclosed
  courtyard and staggered setback blocks — each with seeded mirrors, splits, gaps and
  height variation via `massingVariation`, without touching any other layout.
- Per-bay spatial analysis: exact 3D exposure queries ensure all wings and stems of
  L, T, U, Courtyard, Twin and Stepped buildings receive complete window layouts, slab bands,
  and curtains on every exposed facade, while automatically suppressing projecting balconies
  and AC units near inside (re-entrant) corners to guarantee zero clipping.
- Seeded roof plans: membrane deck, parapet, stair core, tanks and a distinct
  solar, residents' terrace, planted or mechanical composition. Each object is
  reserved in a clear rectangle, with a path from the service door.
- Dedicated shared-lobby parallax with reception counter, lift doors, mailboxes,
  directory, tiled floor, planter and entrance threshold details — never bedroom assets.
- Arrival sequence with separate pedestrian and vehicle gates, paved lobby approach,
  entrance steps and a graded side route when frontage allows.

## Laundry

Individual cut-out garments (t-shirts, shirts, trousers, shorts, towels, saree/
dupatta/mundu, kids' frocks, socks) with gravity folds, pegs and wire hangers,
sharing one atlas material (colour via vertex colours).

| Parameter | Default | Meaning |
| --- | --- | --- |
| `hangingClothes` | `true` | Master switch for balcony laundry. |
| `laundryDensity` | `0.3` | Share of households drying clothes, 0 to 1. |
| `laundryWind` | `0.25` | Static breeze lift/lean on hanging cloth (no animation cost). |
| `dryingRacks` | `true` | Foldable floor racks on the side away from planters. |
| `railingDrapes` | `true` | Towels/sheets folded over metal railings or parapets. |
| `laundryFrontFacade` | `false` | Allow laundry on the street-facing elevation. |
| `laundryLines` | `false` | Rooftop wire lines in a free terrace zone. |

Placement rules: balconies and open terraces only, never ground floor, shopfronts,
curtain walls or plain windows. Ceiling rails only under a balcony slab above, with
no drapes over frameless glass. Garments are clamped clear of the floor. Frequency
follows region (Kerala/Indian high, luxury/glass towers rare) and drops at night.
`group.userData.laundry` lists every placement `{ kind, side, floor, garments }`.

## Parking

Parking is generated as a route rather than a decorative pad: vehicle gate → forecourt →
side drive → ramp head → trough → basement portal.

**Underground.** The site slab is genuinely cut open and the ramp is a solid extruded deck,
so the descent is an excavation rather than a sloped plane laid over the ground. The gradient
is held at or below 1:6.5 (~15%), with a level landing at the foot. It includes retaining
walls with level coping, edge kerbs, safety railing, lane paint and transverse grip bands,
a height gantry, boom barrier and card pedestal, wall washers, a drainage grate, and a portal
into a lit basement: concrete floor and soffit, columns with impact bands, down-stand beams,
marked bays with wheel stops, an accessible bay, lane arrows, ceiling light strips, services,
optional EV points, a lift-lobby door and a fire stair rising to a bulkhead in the rear yard.
The building seed chooses the approach side, bay row (rear or front), full-line or corner
markings, ramp placement and occupied bays. Columns sit outside marked spaces; the
fire stair and the vehicle turning zone remain unoccupied. Signs and planters are kept
off the turning path.

If a plot is too short for a safe gradient the generator **falls back to a surface lot** and
reports `parking: 'surface'`; it does not fake a ramp.

**Surface.** A side aisle leads to a full-depth rear manoeuvring aisle. Bays, wheel
stops, an empty accessible space, subtle drainage channel, lights and either a small
planting island or a scooter strip occupy separate zones. A carport is optional;
when enabled it may be a linear or a partly covered solar canopy. The rear plot
grows to accommodate the turn, rather than hiding a disconnected row of cars.

| Parameter | Default | Meaning |
| --- | --- | --- |
| `parking` | `true` | Master switch for all parking. |
| `undergroundParking` | `true` | Prefer a basement ramp; falls back to a surface lot on short plots. |
| `parkingSide` | `auto` | Seeded side, or force `left` / `right`. |
| `parkingVariation` | `0` | Re-roll parking composition without changing the building or roof. |
| `garageInterior` | `true` | Build the basement level behind the portal. |
| `evCharging` | `true` | EV charge points in the basement or the surface lot. |
| `carport` | `false` | Optional canopy over some or all surface bays. |
| `parkedVehicles` | `3` | Cars in seeded available bays, 0 to 10. The accessible bay is left empty. |

### Roof Variations

| Parameter | Default | Meaning |
| --- | --- | --- |
| `roofStyle` | `mixed` | Seed-select solar, terrace, planters or mechanical. Or choose one explicitly. |
| `roofVariation` | `0` | Re-roll roof composition independently of parking and facade. |
| `roofClutter` | `0.55` | Roof activity level (0 to 1). Equipment omitted if no clear space remains. |

Roof placement is deterministic but not random scatter. The planner reserves a rear
stair core, an access route from its door, then non-overlapping footprints for tanks,
AC units and the selected roof use. `group.userData.roofs` contains style, bounds
and reserved placement rectangles for each exposed roof. Re-running with identical
parameters reproduces the same placements.

> **Terrain:** the generator cuts its own site slab, so a host world must cut its terrain to
> match or the trough will simply be covered over. The rectangle and depth are published as
> `userData.site.garage.excavation`, and `src/ui/BuildingViewport.tsx` shows the preview doing
> exactly this. Basements receive no daylight: use `userData.lightAnchors` entries of kind
> `garage` to place your own lamps, as the generator still adds no lights itself.

## Rooftop Hoardings

Large commercial advertising hoardings are optional and are generated only on a
highest exposed roof that can safely carry their complete structural footprint.
The roof planner reserves the sign before tanks, AC units, solar panels or terrace
furniture, so services cannot clip through the sign.

| Parameter | Default | Meaning |
| --- | --- | --- |
| `roofHoarding` | `false` | Enable one skyline hoarding on the building. |
| `hoardingStyle` | `auto` | `auto`, `single`, `double`, or `v-shape`. |

- **Single-sided:** one street-facing poster on a clean A-frame with hidden rear
  braces, a slim maintenance walk, side ladder and compact LED wash lights.
- **Double-sided:** compact parallel faces for two-way visibility, tied by crossed
  steel braces. Front and rear can use different ad artwork.
- **V-shaped:** two correctly angled faces opening toward the street, sharing one
  centre mast and restrained rear braces. If a tower roof is too narrow for safe
  footings, it falls back to a compact single face instead of clipping or disappearing.

The procedural ad atlas includes airline, watch, fibre broadband and residential
campaigns. At dusk/night the poster material becomes emissive and
`userData.lightAnchors` adds `hoarding` anchors for optional preview/world lights.
The returned roof metadata contains a `hoarding` placement rectangle.

## Colour

Colour is decided per building from its seed. `palette: 'auto'` (the default) draws a wall
tone from a table of real paint and cladding families (limestone, greige, putty, sage, pale
ochre, terracotta, slate and so on), weighted by architectural style, so glass towers stay
quiet, Kerala blocks stay light and Mediterranean blocks lean warm.

Rules that keep it from looking artificial:

- **Low chroma.** Walls are muted, never pure white or black.
- **One undertone per building.** Panel, plinth, paving, roof membrane and ground all lean the
  same warm or cool way; hue-neutral families take their undertone from the wall hue.
- **Paint-card steps.** The accent band is one gentle lightness step from the wall; the plinth
  is the same pigment, desaturated. The second tone is a clear, muted step (at least 0.14
  lightness) so it reads as a decision rather than a mistake.
- **Designed two-tone moves,** chosen from the seed: `stripe` (stair-core accent running
  through the floors, kept inside the elevation), `crown` (top floors), `blocks` (a different
  tone per massing block) or `single`.
- Frame and metal finish (graphite, bronze, black, champagne, silver) follows the undertone.

| Parameter | Default | Meaning |
| --- | --- | --- |
| `palette` | `auto` | `auto`, or the key of a named palette. |
| `colorShift` | `0.6` | How far a palette may drift naturally. `0` reproduces a named palette exactly. |
| `colorScheme` | `auto` | `auto`, `single`, `stripe`, `crown`, `blocks`. |
| `colorVariation` | `0` | Re-roll colour only. Changes no layout, roof or parking. |

Named palettes still work, and now also drift slightly per building (wall, accent and plinth
shift together). Set `colorShift: 0` for the exact original values. `userData.colors` reports
the resolved name, undertone, scheme and swatches. `resolveColors(params)` is a pure function,
so a UI can preview colours without generating geometry. Palette colours tint shared neutral
textures and the material cache is capped (24 colour sets), so browsing many seeds does not
grow memory without bound.

## Integrate

Copy `src/generator/` into your Three.js project. This implementation targets
Three.js WebGLRenderer (developed against r186), with Y up and one unit per metre.

```ts
import { generateBuilding, DEFAULT_PARAMS } from './generator';

const building = generateBuilding({
  ...DEFAULT_PARAMS,
  seed: 7042,
  style: 'modern',
  floors: 6,
  palette: 'ivory-bronze',
  windowStyle: 'sliding',
  entranceStyle: 'glass',
  facadePipes: true,
  acDensity: 0.5,
  tankStyle: 'ribbed',
  surfaceVariation: 0.35,
  lod: 'medium',
});

building.position.set(worldX, 0, worldZ);
scene.add(building);
```

The exported preset has the shape `{ generator, version, params }`:

```ts
import preset from './lokam-apartment-20260418.json';
const building = generateBuilding(preset.params);
scene.add(building);
```

`generateBuilding` accepts a partial parameter set and fills omitted values from
`DEFAULT_PARAMS`. Dimensions and numeric densities are bounded. Use the exported
TypeScript types for supported string values.

There is no requirement to replace your scene, camera, input, world streaming or
lighting system. Use your existing `scene.environment` for metal and glass
reflections. `dayNight` changes the generated materials, not the world's lights.
Rebuild a group when changing generation parameters; dispose its old geometry.
This sandbox does not contain the existing Lokam game, so integration into its
specific architecture still needs to be checked there.

### Returned Metadata

- `userData.params`: resolved generation parameters.
- `userData.stats`: model geometry triangle count, merged material batches and element count.
- `userData.blocks`: massing AABBs in local coordinates, for coarse collision proxies.
- `userData.massing`: planned shape, primary (entrance) block, glued-face count and description.
- `userData.lightAnchors`: optional light positions in building-local coordinates.
- `userData.site`: arrival threshold, parking type, bay count and, when a basement is built,
  ramp geometry (`rampTop`, `rampCenter`, `portal`, `slope`, `clearance`) plus the
  `excavation` rectangle your terrain must respect.
- `userData.site.parkingLayout`: approach side, bay marking type, car and bay footprints,
  column/stair clearances and the entry aisle. `userData.site.bounds` is the full plot
  footprint; surface parking can require a deeper rear yard.
- `userData.roofs`: planned rooftop styles and non-overlapping service footprints.

Coarse AABBs are not a walkable interior or detailed collision mesh. Transform local
anchors with `building.localToWorld` before adding lights to your world.

### New Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `surfaceVariation` | `0.35` | Subtle, clean material variation, 0 to 1. Does not introduce dirt. |
| `windowStyle` | `sliding` | `sliding`, `casement`, `fixed`. Balcony doors remain sliding. |
| `entranceStyle` | `glass` | `glass`, `timber`, `metal`. Applies to residential lobbies. |
| `facadePipes` | `true` | AC pipework, downpipes, tank connections and fittings. |
| `acDensity` | `0.5` | Seeded AC density on eligible facade bays; reduced on primary elevations. |
| `tankStyle` | `ribbed` | `ribbed` polyethylene or `stainless`. Requires rooftop equipment. |
| `lobbyDetails` | `true` | Reception counter, mailboxes, directory and planter inside a dedicated lobby atlas. |
| `lobbyStyle` | `warm` | `warm`, `minimal` or `stone` shared-lobby finish. |
| `undergroundParking` | `true` | Connected vehicle court, retaining-walled descent, garage portal and separate pedestrian egress. |
| `accessibleEntry` | `true` | Adds a graded side route only where the facade has enough real frontage. |

All original styles, massing options, palettes, window layouts, balcony options,
compound walls, parking, vehicles, laundry and plant controls remain available.
There are no generated trees or people.

## Modular Components

`src/generator/components.ts` exports reusable window, lobby interior, entrance,
entrance approach, shopfront, service-door, air-conditioner, downpipe, tank and potted-plant
builders; `src/generator/parking.ts` exports `planGarage`, `buildGarage`, `buildSurfaceLot`
and `groundWithOpening`; `src/generator/roof.ts` plans reserved roof zones;
`src/generator/vehicles.ts` exports low-poly `car` and `scooter`. Each accepts a
`DetailFrame` containing a batcher, local origin and yaw. Components add geometry
to the batcher; call `batch.build()` to receive the merged `THREE.Group`.

The main public API remains `src/generator/index.ts`. Surface shading is in
`surfaces.ts`, equipment/room atlases in `detailTextures.ts`, and massing/facade
composition in `building.ts`. The viewer and all camera animation live separately
in `src/ui/BuildingViewport.tsx` and are not required by the generator.

## Rendering And Performance

Geometry is merged by material. The studio reports **model batches**, not total
renderer calls: shadow and transparent passes can add draws. Geometry remains
low-poly, but high-detail large towers can be expensive. Use `lod: 'low'` for mobile
and stream/cache buildings rather than regenerating each frame. Medium omits some
hardware, plant leaves and tank ladders; low omits inner sash detail, curtains and
most small fittings.

Room and equipment atlases share materials. Box and plane prototypes are unit-sized
and scaled per use, avoiding an unbounded cache of randomly sized box geometries.
Paving UVs use physical metre scale; fine wall variation has no repeating UV tile.
The studio renders on demand when idle and refreshes shadow maps only when the
model or lighting changes. Actual mobile frame rate depends on the scene/device.

For the default six-storey preset, the geometry tests measure approximately
83k triangles / 50 material batches at high detail, 74k / 50 at balanced detail,
and 33k / 42 at low detail. A maximum-size low-detail twin tower is still about
323k triangles, so use smaller presets or your game's distance-based asset
streaming for constrained devices. These are geometry counts, not FPS guarantees.

Clean finishes and glass Fresnel use `onBeforeCompile` with standard PBR materials.
They preserve normal Three.js scene lighting, but these custom shader hooks are
**not serialized by glTF/JSON mesh exporters** and need porting to WebGPU or other
engines. JSON preset export preserves all generation settings instead. Canvas 2D
is required at generation time for the atlases; no external texture fetches are used.

### Disposal

```ts
building.removeFromParent();
building.traverse(object => {
  if (object.isMesh) object.geometry.dispose();
});
```

Do not dispose shared materials/textures when unloading a single building. After
all generated buildings have been removed, `disposeMaterialCache()`,
`disposeTextureCache()`, `disposeDetailTextures()` and `disposeGeometryCache()`
release the generator's shared resources.

## Verification

```sh
npx tsc --noEmit
npx playwright install --with-deps chromium
npx playwright test
npm run build
```

Browser tests check geometry-buffer determinism, finite attributes and valid
indices, all architectural styles and massing options, extreme dimensions, detail
reduction, equipment toggles, laundry placement, lobby/parking layouts, lighting modes,
inspection cameras, mobile controls, integration modal and JSON downloads. They run real Canvas and WebGL rendering;
software-renderer results are not mobile hardware performance benchmarks.

The studio uses the system UI and monospace stacks, so it needs no runtime font download.