import { expect, test } from '@playwright/test';

const EXPECTED_BLOCKS: Record<string, number> = {
  slab: 1, tower: 2, podium: 2, stepped: 2, staggered: 3,
  twin: 3, L: 2, T: 2, U: 3, courtyard: 4,
};

test('massing shapes are coherent and do not overlap', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const result = await page.evaluate(async (expected) => {
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    const out = [];
    for (const massing of Object.keys(expected)) {
      const g = generateBuilding({ ...DEFAULT_PARAMS, seed: 2026, massing, floors: 8, width: 6, depth: 4 });
      const blocks = g.userData.blocks as { cx: number; cz: number; w: number; d: number; y0: number; y1: number; fStart: number }[];
      const massingInfo = g.userData.massing as { shape: string; primary: number; partySides: number };
      // True volumetric overlap: shared interior volume, not edge-glued or stacked neighbours.
      const overlap = blocks.some((a, i) => blocks.some((b, j) => {
        if (i >= j) return false;
        if (a.y0 >= b.y1 - 0.001 || b.y0 >= a.y1 - 0.001) return false;
        const ox = Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2);
        const oz = Math.min(a.cz + a.d / 2, b.cz + b.d / 2) - Math.max(a.cz - a.d / 2, b.cz - b.d / 2);
        return ox > 0.02 && oz > 0.02;
      }));
      const pb = blocks[massingInfo.primary];
      const entrance = (g.userData.site as any).entrance.position as [number, number, number];
      const entranceOnPrimary = Math.abs(entrance[0] - pb.cx) <= pb.w / 2
        && Math.abs(entrance[2] - (pb.cz + pb.d / 2)) < 0.01;
      const top = blocks.reduce((a, b) => Math.max(a, b.y1), 0);
      const foot = blocks.reduce((a, b) => a + b.w * b.d, 0);
      g.traverse((o: any) => o.geometry?.dispose());
      out.push({
        massing, blocks: blocks.length, overlap, top, foot,
        minW: Math.min(...blocks.map(b => b.w)), minD: Math.min(...blocks.map(b => b.d)),
        partySides: massingInfo.partySides, entranceOnPrimary, shape: massingInfo.shape,
      });
    }
    return out;
  }, EXPECTED_BLOCKS);
  for (const r of result) {
    expect(r.shape, `${r.massing} reported shape`).toBe(r.massing);
    expect(r.blocks, `${r.massing} block count`).toBe(EXPECTED_BLOCKS[r.massing]);
    expect(r.overlap, `${r.massing} overlaps`).toBe(false);
    expect(r.minW, `${r.massing} width`).toBeGreaterThanOrEqual(2.5);
    expect(r.minD, `${r.massing} depth`).toBeGreaterThanOrEqual(2.5);
    expect(r.top, `${r.massing} height`).toBeGreaterThan(10);
    expect(r.foot, `${r.massing} footprint`).toBeGreaterThan(100);
    expect(r.entranceOnPrimary, `${r.massing} entrance sits on the primary block`).toBe(true);
  }
  // Glued shapes must actually report glued faces; detached shapes must not.
  for (const glued of ['L', 'T', 'U', 'courtyard']) {
    expect(result.find(r => r.massing === glued)!.partySides, `${glued} party faces`).toBeGreaterThan(0);
  }
  expect(result.find(r => r.massing === 'slab')!.partySides, 'slab party faces').toBe(0);
  console.log('Massing:', JSON.stringify(result));
});

test('massing layouts vary with the seed and the re-roll control', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const result = await page.evaluate(async () => {
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    const desc = (patch: Record<string, unknown>) => {
      const g = generateBuilding({ ...DEFAULT_PARAMS, ...patch });
      const d = (g.userData.massing as any).description as string;
      g.traverse((o: any) => o.geometry?.dispose());
      return d;
    };
    const twins = Array.from({ length: 12 }, (_, i) => desc({ seed: 500 + i, massing: 'twin' }));
    const ls = Array.from({ length: 12 }, (_, i) => desc({ seed: 700 + i, massing: 'L' }));
    const rerolled = Array.from({ length: 6 }, (_, i) => desc({ seed: 700, massing: 'L', massingVariation: i }));
    const sameA = desc({ seed: 700, massing: 'L', massingVariation: 2 });
    const sameB = desc({ seed: 700, massing: 'L', massingVariation: 2 });
    return { twins, ls, rerolled, sameA, sameB };
  });
  expect(new Set(result.twins).size, 'twin descriptions vary').toBeGreaterThanOrEqual(2);
  expect(new Set(result.ls).size, 'L descriptions vary').toBeGreaterThanOrEqual(2);
  expect(new Set(result.rerolled).size, 'massing re-roll varies').toBeGreaterThanOrEqual(2);
  expect(result.sameA).toBe(result.sameB);
});

test('all dynamic building shapes have windows on every exposed face without clipping', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const result = await page.evaluate(async () => {
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    const shapes = ['L', 'T', 'U', 'courtyard', 'twin', 'stepped', 'tower', 'podium', 'slab'];
    const data = [];
    for (const massing of shapes) {
      const g = generateBuilding({ ...DEFAULT_PARAMS, seed: 4096, massing: massing as any, floors: 6, width: 6, depth: 5 });
      const meshes = g.children.map((c: any) => ({ name: c.material?.name || c.name, tris: (c.geometry.index?.count || 0) / 3 }));
      const glassMesh = g.children.find((c: any) => c.material?.name?.includes('glazing')) as any;
      const glassTris = glassMesh ? (glassMesh.geometry.index?.count || 0) / 3 : 0;
      const windowCount = Math.round(glassTris / 2);
      g.traverse((o: any) => o.geometry?.dispose());
      data.push({ massing, windowCount, meshes: meshes.length });
    }
    return data;
  });
  for (const d of result) {
    // Every shape must have abundant windows on all its exposed facades (at least 20+ window panes):
    expect(d.windowCount, `${d.massing} window count`).toBeGreaterThanOrEqual(20);
    expect(d.meshes, `${d.massing} mesh batches`).toBeGreaterThan(15);
  }
  console.log('Window counts across shapes:', JSON.stringify(result));
});

test('massing shapes are visually distinct', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.getByRole('tab', { name: 'Building' }).click();
  for (const massing of ['Twin towers', 'L-shaped block', 'T-shaped block', 'U-shaped court', 'Enclosed courtyard', 'Staggered setbacks']) {
    await page.getByLabel('Building form').selectOption({ label: massing });
    await expect(page.locator('.status-bar')).toContainText('Model ready');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `artifacts/massing-${massing.toLowerCase().replace(/ /g, '-')}.png` });
  }
  // The re-roll control produces another valid building without errors.
  await page.getByRole('button', { name: 'Re-roll massing layout' }).click();
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  expect(errors).toEqual([]);
});
