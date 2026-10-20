import { expect, test } from '@playwright/test';

test('rooftop hoarding generates single, double, and v-shape styles with collision-free footprints', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const results = await page.evaluate(async () => {
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');

    const inspect = (patch: Record<string, unknown>) => {
      const g = generateBuilding({ ...DEFAULT_PARAMS, ...patch });
      const allMeshes = g.children.map((c: any) => ({ meshName: c.name, matName: c.material?.name, tris: (c.geometry.index?.count || 0) / 3 }));
      const hoardingMeshes = g.children.filter((c: any) => (c.name || '').toLowerCase().includes('hoarding') || (c.material?.name || '').toLowerCase().includes('hoarding')) as any[];
      const hoardingTris = hoardingMeshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count || 0) / 3, 0);
      const roofs = g.userData.roofs as any[];
      const hoardingPlacement = roofs.flatMap(r => r.placements).find((p: any) => p.kind === 'hoarding');
      const anchors = (g.userData.lightAnchors || []) as { position: [number, number, number]; kind: string }[];
      const hoardingAnchors = anchors.filter(a => a.kind === 'hoarding');
      const stats = g.userData.stats;
      g.traverse((o: any) => o.geometry?.dispose());
      return { hoardingTris, hoardingPlacement, hoardingAnchors, stats, roofsCount: roofs.length, allMeshes, roofs };
    };

    return {
      off: inspect({ roofHoarding: false }),
      single: inspect({ roofHoarding: true, hoardingStyle: 'single', seed: 4096 }),
      double: inspect({ roofHoarding: true, hoardingStyle: 'double', seed: 4096 }),
      vshape: inspect({ roofHoarding: true, hoardingStyle: 'v-shape', seed: 4096 }),
      auto: inspect({ roofHoarding: true, hoardingStyle: 'auto', seed: 4096 }),
      night: inspect({ roofHoarding: true, hoardingStyle: 'v-shape', dayNight: 'night', seed: 4096 }),
      twinWithHoarding: inspect({ roofHoarding: true, hoardingStyle: 'double', massing: 'twin', seed: 5020 }),
      lWithHoarding: inspect({ roofHoarding: true, hoardingStyle: 'v-shape', massing: 'L', seed: 7010 }),
    };
  });

  // When disabled: zero hoarding triangles and no placement
  expect(results.off.hoardingTris).toBe(0);
  expect(results.off.hoardingPlacement).toBeUndefined();

  // When enabled: produces authentic hoarding geometry with reserved placement
  expect(results.single.hoardingTris).toBeGreaterThan(0);
  expect(results.single.hoardingPlacement).toBeDefined();

  // Double-sided hoarding has more panels/trusses than single
  expect(results.double.hoardingTris).toBeGreaterThan(results.single.hoardingTris);
  expect(results.double.hoardingPlacement).toBeDefined();
  expect(results.double.stats.triangles).toBeGreaterThan(results.single.stats.triangles);

  // V-shape has dual angled wing panels
  expect(results.vshape.hoardingTris).toBeGreaterThan(results.single.hoardingTris);
  expect(results.vshape.hoardingPlacement).toBeDefined();

  // Auto style works cleanly
  expect(results.auto.hoardingTris).toBeGreaterThan(0);
  expect(results.auto.hoardingPlacement).toBeDefined();

  // Night mode adds floodlight anchors
  expect(results.night.hoardingAnchors.length).toBeGreaterThanOrEqual(2);

  // Multi-block shapes (twin, L) support rooftop hoardings without issues
  expect(results.twinWithHoarding.hoardingTris).toBeGreaterThan(0);
  expect(results.lWithHoarding.hoardingTris).toBeGreaterThan(0);

  // The reserved hoarding footprint must not overlap any other roof service footprint.
  const overlaps = (a: any, b: any) => a.x0 < b.x1 - 0.001 && a.x1 > b.x0 + 0.001 && a.z0 < b.z1 - 0.001 && a.z1 > b.z0 + 0.001;
  for (const sample of [results.single, results.double, results.vshape, results.twinWithHoarding, results.lWithHoarding]) {
    expect(sample.roofs.flatMap((r: any) => r.placements).filter((p: any) => p.kind === 'hoarding').length).toBe(1);
    for (const roof of sample.roofs) {
      const hoarding = roof.placements.find((p: any) => p.kind === 'hoarding');
      if (!hoarding) continue;
      for (const other of roof.placements) {
        if (other === hoarding) continue;
        expect(overlaps(hoarding.rect, other.rect), `hoarding overlaps ${other.kind}`).toBe(false);
      }
    }
  }

  console.log('Hoarding stats:', JSON.stringify({
    single: results.single.hoardingTris,
    double: results.double.hoardingTris,
    vshape: results.vshape.hoardingTris,
    nightAnchors: results.night.hoardingAnchors.length,
  }));
});

test('hoarding controls in Studio UI work and render without WebGL errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(m.text()); });

  await page.goto('/');
  await expect(page.locator('.status-bar')).toContainText('Model ready');

  // Navigate to Rooftop view
  await page.getByRole('button', { name: 'Rooftop', exact: true }).click();
  await page.waitForTimeout(1000);

  // Open Details tab
  await page.getByRole('tab', { name: 'Details' }).click();

  // Toggle Skyline hoarding ON
  const hoardingToggle = page.getByRole('switch', { name: 'Skyline hoarding' });
  await expect(hoardingToggle).toBeVisible();
  await hoardingToggle.click();
  await expect(hoardingToggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'artifacts/hoarding-single.png' });

  // Change to Double-sided
  const hoardingSelect = page.getByLabel('Hoarding style');
  await expect(hoardingSelect).toBeVisible();
  await hoardingSelect.selectOption({ label: 'Double-sided (two-way)' });
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'artifacts/hoarding-double.png' });

  // Change to V-shaped (corner angle)
  await hoardingSelect.selectOption({ label: 'V-shaped (corner angle)' });
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'artifacts/hoarding-vshape.png' });

  // Night mode with floodlights
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'artifacts/hoarding-night.png' });

  // Overview view with illuminated billboard on skyline
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'artifacts/hoarding-skyline-overview.png' });

  expect(errors).toEqual([]);
});
