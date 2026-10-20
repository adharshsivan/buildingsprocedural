import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('geometry is deterministic, finite, and responds to quality and service controls', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const results = await page.evaluate(async () => {
    // These imports run inside the browser, exercising real Canvas textures as well as geometry.
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS, STYLE_PROFILES } = await import('/src/generator/types.ts');
    const { disposeMaterialCache } = await import('/src/generator/materials.ts');
    const { disposeDetailTextures } = await import('/src/generator/detailTextures.ts');
    const { disposeGeometryCache } = await import('/src/generator/batcher.ts');
    const snapshot = (patch = {}) => {
      const group = generateBuilding({ ...DEFAULT_PARAMS, ...patch });
      let hash = 2166136261;
      let valid = true;
      for (const mesh of group.children) {
        const geometry = mesh.geometry;
        for (const attribute of Object.values(geometry.attributes)) {
          const values = attribute.array;
          for (let i = 0; i < values.length; i++) {
            valid &&= Number.isFinite(values[i]);
          }
          const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
          for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
        }
        for (const index of geometry.index.array) {
          valid &&= index >= 0 && index < geometry.attributes.position.count;
          hash = Math.imul(hash ^ index, 16777619);
        }
        geometry.dispose();
      }
      return { hash, valid, ...group.userData.stats };
    };
    const a = snapshot({ seed: 7042 });
    const b = snapshot({ seed: 7042 });
    const other = snapshot({ seed: 7043 });
    const withoutAC = snapshot({ acUnits: false });
    const withoutPipes = snapshot({ facadePipes: false });
    const base = snapshot();
    const low = snapshot({ lod: 'low' });
    const medium = snapshot({ lod: 'medium' });
    const styles = Object.keys(STYLE_PROFILES).map(style => ({ style, ...snapshot({ style }) }));
    const massing = ['slab', 'tower', 'stepped', 'podium', 'twin'].map(massing => ({ massing, ...snapshot({ massing }) }));
    const extreme = snapshot({ floors: 24, width: 10, depth: 8, massing: 'twin', lod: 'low' });
    const invalid = snapshot({ seed: NaN, floors: NaN, bay: 0, windowRecess: Infinity, parkedVehicles: NaN, surfaceVariation: NaN });
    // Clear the caches and compare actual buffers, not just triangle counts.
    disposeMaterialCache(); disposeDetailTextures(); disposeGeometryCache();
    const cold = snapshot({ seed: 7042 });
    return { a, b, other, base, cold, low, medium, withoutAC, withoutPipes, styles, massing, extreme, invalid };
  });
  expect(results.a.hash).toBe(results.b.hash);
  expect(results.a.hash).toBe(results.cold.hash);
  expect(results.a.hash).not.toBe(results.other.hash);
  expect(results.low.triangles).toBeLessThan(results.medium.triangles);
  expect(results.medium.triangles).toBeLessThan(results.base.triangles);
  expect(results.withoutAC.triangles).toBeLessThan(results.base.triangles);
  expect(results.withoutPipes.triangles).toBeLessThan(results.base.triangles);
  expect(results.base.drawCalls).toBeLessThan(60);
  expect(results.invalid.valid).toBe(true);
  expect(results.extreme.valid).toBe(true);
  for (const style of [...results.styles, ...results.massing]) {
    expect(style.valid).toBe(true);
    expect(style.triangles).toBeGreaterThan(1000);
  }
  console.log('Verified geometry:', JSON.stringify({ high: results.base, balanced: results.medium, mobile: results.low, extreme: results.extreme }));
});

test('studio controls, close-up views, lighting, integration, and preset download work', async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.text().includes('GL_INVALID')) errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.screenshot({ path: 'artifacts/studio-overview.png' });
  for (const view of ['Facade', 'Entrance', 'Parking', 'Rooftop']) {
    const button = page.getByRole('button', { name: view, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `artifacts/studio-${view.toLowerCase()}.png` });
  }
  await page.getByRole('tab', { name: 'Details', exact: true }).click();
  await page.getByLabel('Window assembly').selectOption('casement');
  await page.getByLabel('Entrance doors').selectOption('timber');
  await page.getByLabel('Water tank', { exact: true }).selectOption('stainless');
  const pipes = page.getByRole('switch', { name: 'Pipework & drainage' });
  await pipes.click();
  await expect(pipes).toHaveAttribute('aria-checked', 'false');
  await pipes.click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  for (const time of ['Dusk', 'Night', 'Day']) {
    await page.getByRole('button', { name: time, exact: true }).click();
    await expect(page.locator('.status-bar')).toContainText('Model ready');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `artifacts/studio-${time.toLowerCase()}.png` });
  }
  const seed = page.getByLabel('Generation seed');
  const oldSeed = await seed.inputValue();
  await page.getByRole('button', { name: 'Generate variation' }).click();
  await expect(seed).not.toHaveValue(oldSeed);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export preset', exact: true }).click();
  const download = await downloadEvent;
  const data = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(data.version).toBe(3);
  expect(data.params.seed).toBe(Number(await seed.inputValue()));
  expect(data.params.entranceStyle).toBe('timber');
  await page.getByRole('button', { name: 'Integration', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.locator('#seed')).toHaveValue('20260418');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  expect(errors).toEqual([]);
});

test('mobile settings do not obscure the preview until opened', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/studio-mobile.png' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('.inspector')).toHaveClass(/mobile-open/);
  await page.getByRole('tab', { name: 'Surroundings', exact: true }).click();
  await page.getByRole('switch', { name: 'Compound wall' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.inspector')).not.toHaveClass(/mobile-open/);
  await page.getByRole('button', { name: 'Entrance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrance', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Integration', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close integration guide' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('laundry follows realistic placement rules and responds to its settings', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const r = await page.evaluate(async () => {
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    const run = (patch: Record<string, unknown>) => {
      const g = generateBuilding({ ...DEFAULT_PARAMS, ...patch });
      const fabric = g.children.find(c => c.name === 'Lokam / Laundry fabric') as any;
      const tris = fabric ? fabric.geometry.index.count / 3 : 0;
      g.children.forEach((c: any) => c.geometry.dispose());
      return { log: g.userData.laundry as { kind: string; side: number; floor: number; garments: number }[], tris };
    };
    const kerala = { style: 'kerala', balconyStyle: 'railing', floors: 6, laundryLines: true };
    return {
      off: run({ ...kerala, hangingClothes: false, laundryLines: false }),
      low: run({ ...kerala, laundryDensity: 0.15 }),
      high: run({ ...kerala, laundryDensity: 0.9 }),
      noFront: run({ ...kerala, laundryDensity: 1, laundryFrontFacade: false }),
      front: run({ ...kerala, laundryDensity: 1, laundryFrontFacade: true }),
      luxury: run({ style: 'luxury', laundryDensity: 0.3 }),
      glass: run({ ...kerala, balconyStyle: 'glass', laundryDensity: 1 }),
      noRacks: run({ ...kerala, laundryDensity: 1, dryingRacks: false, railingDrapes: false }),
      night: run({ ...kerala, laundryDensity: 0.5, dayNight: 'night' }),
      day: run({ ...kerala, laundryDensity: 0.5 }),
      again: run({ ...kerala, laundryDensity: 0.5 }),
    };
  });
  const garments = (x: { log: { garments: number }[] }) => x.log.reduce((a, b) => a + b.garments, 0);
  expect(r.off.tris).toBe(0);
  expect(garments(r.high)).toBeGreaterThan(garments(r.low));
  // never on the ground floor; never on the street side unless allowed
  for (const set of [r.low, r.high, r.noFront, r.front]) for (const rec of set.log) expect(rec.floor).toBeGreaterThan(0);
  expect(r.noFront.log.filter(x => x.side === 0).length).toBe(0);
  expect(r.front.log.filter(x => x.side === 0).length).toBeGreaterThan(0);
  // no drapes over frameless glass; settings disable racks and drapes
  expect(r.glass.log.filter(x => x.kind === 'drape').length).toBe(0);
  expect(r.noRacks.log.filter(x => x.kind === 'rack' || x.kind === 'drape').length).toBe(0);
  // regional habit and time of day
  expect(garments(r.luxury)).toBeLessThan(garments(r.high));
  expect(garments(r.night)).toBeLessThan(garments(r.day));
  expect(r.again.tris).toBe(r.day.tris);
  console.log('Laundry:', JSON.stringify({ low: garments(r.low), high: garments(r.high), luxury: garments(r.luxury), night: garments(r.night), day: garments(r.day), trisHigh: r.high.tris }));
});

test('laundry close-up renders cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.locator('.preset-menu summary').click();
  await page.getByRole('button', { name: /Kerala Dense Block/ }).click();
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/laundry-overview.png' });
  await page.getByRole('button', { name: 'Facade', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/laundry-facade.png' });
  await page.getByRole('tab', { name: 'Surroundings', exact: true }).click();
  await page.getByLabel('Households drying clothes').fill('0.8');
  await page.getByLabel('Breeze').fill('0.7');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/laundry-breezy.png' });
  await page.getByRole('button', { name: 'Rooftop', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/laundry-roof.png' });
  expect(errors).toEqual([]);
});

test('the basement ramp is a real graded excavation, not a flat pad', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const r = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');

    const build = (patch: Record<string, unknown>) => generateBuilding({ ...DEFAULT_PARAMS, ...patch });
    const g = build({ parking: true, undergroundParking: true });
    const site = g.userData.site;
    // Probe the running surface straight down the ramp centreline.
    const ray = new THREE.Raycaster();
    const samples: { z: number; y: number }[] = [];
    const top = site.garage.rampTop[2], portalZ = site.garage.portal[2];
    for (let i = 0; i <= 10; i++) {
      const z = top - ((top - portalZ) * i) / 10;
      ray.set(new THREE.Vector3(site.garage.rampTop[0], 80, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(g, true)[0];
      samples.push({ z, y: hit ? hit.point.y : NaN });
    }
    // The site slab must be open above the ramp: a ray from the sky has to reach below grade.
    const midDepth = samples[5].y;
    const names = g.children.map((c: any) => c.material.name);
    const stats = g.userData.stats;
    g.children.forEach((c: any) => c.geometry.dispose());

    const small = build({ width: 3, depth: 2, undergroundParking: true });
    const smallSite = small.userData.site;
    small.children.forEach((c: any) => c.geometry.dispose());

    const flat = build({ parking: true, undergroundParking: false });
    const flatSite = flat.userData.site;
    const flatTris = flat.userData.stats.triangles;
    flat.children.forEach((c: any) => c.geometry.dispose());

    const noInterior = build({ undergroundParking: true, garageInterior: false });
    const noInteriorTris = noInterior.userData.stats.triangles;
    noInterior.children.forEach((c: any) => c.geometry.dispose());

    return { site, samples, midDepth, names, stats, smallSite, flatSite, flatTris, noInteriorTris };
  });

  const { garage } = r.site;
  // A ramp that reads as a ramp: continuous descent, no flat pad pretending to be one.
  expect(r.samples.every(s => Number.isFinite(s.y))).toBe(true);
  expect(r.samples[0].y).toBeGreaterThan(-0.2);
  expect(r.midDepth).toBeLessThan(-1);
  expect(r.samples[r.samples.length - 1].y).toBeCloseTo(garage.floorLevel, 1);
  for (let i = 1; i < r.samples.length; i++) expect(r.samples[i].y).toBeLessThanOrEqual(r.samples[i - 1].y + 1e-6);
  // Gradient stays within a drivable range and the basement has real headroom.
  expect(garage.slope).toBeGreaterThan(0.08);
  expect(garage.slope).toBeLessThanOrEqual(1 / 6);
  expect(garage.floorLevel).toBeLessThan(-2.5);
  expect(garage.clearance).toBeGreaterThan(2);
  expect(garage.excavation.x1 - garage.excavation.x0).toBeGreaterThan(garage.rampWidth);
  expect(r.site.parking).toBe('underground');
  expect(r.site.parkingSpaces).toBeGreaterThan(2);
  expect(r.names).toContain('Lokam / Basement concrete');
  // A plot too short for a safe gradient must fall back honestly rather than fake a ramp.
  expect(r.smallSite.parking).toBe('surface');
  expect(r.smallSite.garage).toBeUndefined();
  expect(r.flatSite.parking).toBe('surface');
  expect(r.flatSite.parkingSpaces).toBeGreaterThan(2);
  expect(r.noInteriorTris).toBeLessThan(r.stats.triangles);
  console.log('Ramp:', JSON.stringify({
    slope: +garage.slope.toFixed(3), run: +garage.rampRun.toFixed(1),
    floor: +garage.floorLevel.toFixed(2), clearance: +garage.clearance.toFixed(2),
    spaces: r.site.parkingSpaces, surfaceSpaces: r.flatSite.parkingSpaces, tris: r.stats.triangles,
  }));
});

test('lobby interior and ground-floor modes stay distinct', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const r = await page.evaluate(async () => {
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    const inspect = (patch: Record<string, unknown>) => {
      const g = generateBuilding({ ...DEFAULT_PARAMS, ...patch });
      const names = g.children.map((c: any) => c.material.name);
      const stats = g.userData.stats;
      g.children.forEach((c: any) => c.geometry.dispose());
      return { names, stats };
    };
    return {
      lobby: inspect({ groundFloor: 'lobby', lobbyDetails: true }),
      plain: inspect({ groundFloor: 'lobby', lobbyDetails: false }),
      shops: inspect({ groundFloor: 'shops' }),
      stilts: inspect({ groundFloor: 'stilts' }),
    };
  });
  const lobbyMat = (n: string[]) => n.some(x => x.includes('Lobby interior') || x.includes('Lit lobby interior'));
  expect(lobbyMat(r.lobby.names)).toBe(true);
  expect(r.shops.names.some(n => n.toLowerCase().includes('retail interior'))).toBe(true);
  expect(lobbyMat(r.shops.names)).toBe(false);
  expect(r.lobby.stats.triangles).toBeGreaterThan(r.plain.stats.triangles);
  expect(r.stilts.stats.triangles).toBeGreaterThan(1000);
});

test('lobby and underground parking settings render without WebGL errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.text().includes('GL_INVALID')) errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.getByRole('button', { name: 'Entrance', exact: true }).click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: 'artifacts/lobby-entrance.png' });
  await page.getByRole('tab', { name: 'Surroundings', exact: true }).click();
  await page.getByLabel('Lobby finish').selectOption('stone');
  await page.getByRole('switch', { name: 'Detailed lobby interior' }).click();
  await page.getByRole('switch', { name: 'Detailed lobby interior' }).click();
  const underground = page.getByRole('switch', { name: 'Underground parking', exact: true });
  await underground.click();
  await expect(underground).toHaveAttribute('aria-checked', 'false');
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Parking', exact: true }).click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: 'artifacts/surface-parking.png' });
  await underground.click();
  await expect(underground).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'artifacts/underground-parking.png' });
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  expect(errors).toEqual([]);
});
