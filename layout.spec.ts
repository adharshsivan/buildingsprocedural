import { expect, test } from '@playwright/test';

test('independent seeds create distinct coherent roof and parking layouts', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const results = await page.evaluate(async () => {
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    const snapshot = (seed: number, patch: Record<string, unknown> = {}) => {
      const g = generateBuilding({ ...DEFAULT_PARAMS, seed, ...patch });
      const data = { site: g.userData.site, roofs: g.userData.roofs, triangles: g.userData.stats.triangles };
      g.traverse((o: any) => o.geometry?.dispose());
      return data;
    };
    const seeds = Array.from({ length: 16 }, (_, i) => snapshot(13000 + i));
    const surfaces = Array.from({ length: 10 }, (_, i) => snapshot(17200 + i, { undergroundParking: false }));
    const left = snapshot(13000, { parkingSide: 'left' });
    const right = snapshot(13000, { parkingSide: 'right' });
    const roofOnly = snapshot(13000, { roofVariation: 5 });
    const parkingOnly = snapshot(13000, { parkingVariation: 8 });
    const tiny = snapshot(13332, { width: 3, depth: 2 });
    const allRoofStyles = ['solar', 'terrace', 'planters', 'mechanical'].map(roofStyle => snapshot(13700, { roofStyle }));
    const otherSizes = [
      snapshot(211, { width: 3, depth: 5, roofStyle: 'solar' }),
      snapshot(212, { width: 8, depth: 6, roofStyle: 'terrace', massing: 'twin' }),
      snapshot(213, { width: 10, depth: 8, roofStyle: 'mechanical', parkingSide: 'left' }),
    ];
    return { seeds, surfaces, left, right, roofOnly, parkingOnly, tiny, allRoofStyles, otherSizes };
  });

  const intersects = (a: any, b: any) => a.x0 < b.x1 - 0.001 && a.x1 > b.x0 + 0.001 && a.z0 < b.z1 - 0.001 && a.z1 > b.z0 + 0.001;
  const check = (sample: typeof results.seeds[number]) => {
    expect(sample.triangles).toBeGreaterThan(1000);
    for (const roof of sample.roofs) {
      for (const { rect } of roof.placements) {
        expect(rect.x0).toBeGreaterThanOrEqual(roof.bounds.x0 - 0.001);
        expect(rect.x1).toBeLessThanOrEqual(roof.bounds.x1 + 0.001);
        expect(rect.z0).toBeGreaterThanOrEqual(roof.bounds.z0 - 0.001);
        expect(rect.z1).toBeLessThanOrEqual(roof.bounds.z1 + 0.001);
      }
      for (let i = 0; i < roof.placements.length; i++) for (let j = i + 1; j < roof.placements.length; j++) {
        expect(intersects(roof.placements[i].rect, roof.placements[j].rect),
          `roof ${roof.style}: ${roof.placements[i].kind} overlaps ${roof.placements[j].kind}`).toBe(false);
      }
    }
    const parking = sample.site.parkingLayout;
    const restricted = [sample.site.garage?.excavation, parking?.entryLane, parking?.aisle, parking?.stair, sample.site.gradedApproach].filter(Boolean);
    for (const [x, z] of sample.site.plantCenters) {
      const pot = { x0: x - 0.27, x1: x + 0.27, z0: z - 0.27, z1: z + 0.27 };
      for (const lane of restricted) expect(intersects(pot, lane), 'a pot blocks a route').toBe(false);
    }
    for (const planter of sample.site.frontPlanters) for (const lane of restricted) {
      expect(intersects(planter, lane), 'a raised planter blocks a route').toBe(false);
    }
    if (parking) {
      for (const vehicle of parking.vehicles) {
        for (const column of parking.columns) expect(intersects(vehicle, column), 'vehicle intersects column').toBe(false);
        if (parking.stair) expect(intersects(vehicle, parking.stair), 'vehicle intersects fire stair').toBe(false);
        if (parking.aisle) expect(intersects(vehicle, parking.aisle), 'vehicle blocks surface drive aisle').toBe(false);
        if (parking.entryLane) expect(intersects(vehicle, parking.entryLane), 'vehicle blocks entry turning lane').toBe(false);
      }
      for (const bay of parking.bays) {
        for (const column of parking.columns) expect(intersects(bay, column), 'column inside marked bay').toBe(false);
        if (parking.stair) expect(intersects(bay, parking.stair), 'marked bay overlaps fire stair').toBe(false);
      }
    }
  };
  [...results.seeds, ...results.surfaces, results.tiny, ...results.allRoofStyles, ...results.otherSizes].forEach(check);
  const signs = results.seeds.map(s => `${s.site.parkingLayout?.side}/${s.site.parkingLayout?.bayRow}/${s.site.parkingLayout?.marking}`);
  expect(new Set(signs).size).toBeGreaterThanOrEqual(4);
  expect(new Set(results.seeds.map(s => JSON.stringify(s.roofs))).size).toBeGreaterThanOrEqual(8);
  expect(new Set(results.surfaces.map(s => `${s.site.parkingLayout?.side}/${s.site.parkingLayout?.marking}/${s.site.parkingLayout?.canopy}`)).size).toBeGreaterThanOrEqual(4);
  expect(results.left.site.parkingLayout.side).toBe('left');
  expect(results.right.site.parkingLayout.side).toBe('right');
  expect(results.left.site.garage.rampTop[0]).toBeLessThan(0);
  expect(results.right.site.garage.rampTop[0]).toBeGreaterThan(0);
  expect(results.tiny.site.parking).toBe('surface');
  expect(results.roofOnly.site).toEqual(results.seeds[0].site);
  expect(results.parkingOnly.roofs).toEqual(results.seeds[0].roofs);
  expect(results.roofOnly.roofs).not.toEqual(results.seeds[0].roofs);
  expect(results.parkingOnly.site).not.toEqual(results.seeds[0].site);
  for (const s of results.surfaces) expect(s.site.bounds.z0).toBeLessThanOrEqual(-12 - 4 * 3.2 / 2);
});

test('parking and roof re-roll controls change only their own layouts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.getByRole('tab', { name: 'Surroundings' }).click();
  const rerollParking = page.getByRole('button', { name: 'Re-roll parking layout' });
  await expect(rerollParking).toBeVisible();
  await rerollParking.click();
  await expect(page.locator('.variation-control').filter({ has: rerollParking })).toContainText('#01');
  await page.getByLabel('Vehicle approach').selectOption('left');
  await page.getByRole('button', { name: 'Parking', exact: true }).click();
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.getByRole('tab', { name: 'Details' }).click();
  const rerollRoof = page.getByRole('button', { name: 'Re-roll roof layout' });
  await expect(rerollRoof).toBeVisible();
  await rerollRoof.click();
  await expect(page.locator('.variation-control').filter({ has: rerollRoof })).toContainText('#01');
  await page.getByRole('button', { name: 'Rooftop', exact: true }).click();
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  expect(errors).toEqual([]);
});

test('mirrored ramps remain drivable, raycastable and open to sky', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const runs = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    return ['left', 'right'].map(parkingSide => {
      const g = generateBuilding({ ...DEFAULT_PARAMS, seed: 3402, parkingSide: parkingSide as any });
      const garage = g.userData.site.garage;
      const ray = new THREE.Raycaster();
      const depths: number[] = [];
      for (let i = 0; i <= 8; i++) {
        const z = garage.rampTop[2] - (garage.rampTop[2] - garage.portal[2]) * i / 8;
        ray.set(new THREE.Vector3(garage.rampTop[0], 70, z), new THREE.Vector3(0, -1, 0));
        depths.push(ray.intersectObject(g, true)[0]?.point.y ?? NaN);
      }
      g.traverse((o: any) => o.geometry?.dispose());
      return { parkingSide, depths, floor: garage.floorLevel };
    });
  });
  for (const run of runs) {
    expect(run.depths.every(Number.isFinite)).toBe(true);
    expect(run.depths[0]).toBeGreaterThan(-0.2);
    expect(run.depths[run.depths.length - 1]).toBeCloseTo(run.floor, 1);
    for (let i = 1; i < run.depths.length; i++) expect(run.depths[i]).toBeLessThanOrEqual(run.depths[i - 1] + 0.05);
  }
});