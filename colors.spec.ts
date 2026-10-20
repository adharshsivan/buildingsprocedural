import { expect, test } from '@playwright/test';

const STYLES = ['modern', 'glassTower', 'minimal', 'luxury', 'indian', 'kerala', 'brutalist', 'mediterranean'];

test('seeded palettes follow the rules that make colour look natural', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const rows = await page.evaluate(async (styles) => {
    const { resolveColors, toHsl } = await import('/src/generator/colors.ts');
    const chroma = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    const out: any[] = [];
    for (const style of styles) for (let seed = 500; seed < 640; seed++) {
      const { palette: p, plan } = resolveColors({ seed, style, palette: 'auto', colorShift: 0.6, colorVariation: 0, colorScheme: 'auto' } as any, seed % 2 ? 2 : 1);
      const hsl = Object.fromEntries(Object.entries({
        wall: p.wall, accent: p.wallAccent, deep: p.wallDeep, panel: p.panel, stone: p.stone,
        ground: p.ground, paving: p.paving, roof: p.roof, membrane: p.membrane, glass: p.glassTint,
      }).map(([k, v]) => [k, toHsl(v as string)]));
      out.push({
        style, seed, family: p.family, scheme: plan.scheme, undertone: p.undertone, wall: p.wall, hsl,
        chroma: { wall: chroma(p.wall), deep: chroma(p.wallDeep), accent: chroma(p.wallAccent) },
        // Neutrals that carry enough chroma to have a measurable hue.
        neutralHues: ['panel', 'ground', 'paving', 'roof', 'membrane'].map(k => {
          const hex = (p as any)[k] as string;
          return { c: chroma(hex), h: toHsl(hex)[0] };
        }),
      });
    }
    return out;
  }, STYLES);

  const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  for (const r of rows) {
    const at = `${r.style}/${r.seed} (${r.family})`;
    // Painted walls are never vivid, and never pure white or black.
    expect(r.chroma.wall, `${at} wall chroma`).toBeLessThanOrEqual(0.4);
    expect(r.hsl.wall[2], `${at} wall lightness`).toBeGreaterThan(0.24);
    expect(r.hsl.wall[2], `${at} wall lightness`).toBeLessThan(0.94);
    // The accent band is one gentle step from the wall; the second tone is a clear, muted step.
    expect(Math.abs(r.hsl.accent[2] - r.hsl.wall[2]), `${at} accent step`).toBeGreaterThanOrEqual(0.04);
    expect(Math.abs(r.hsl.accent[2] - r.hsl.wall[2]), `${at} accent step`).toBeLessThanOrEqual(0.11);
    expect(Math.abs(r.hsl.deep[2] - r.hsl.wall[2]), `${at} second tone step`).toBeGreaterThanOrEqual(0.13);
    expect(Math.abs(r.hsl.deep[2] - r.hsl.wall[2]), `${at} second tone step`).toBeLessThanOrEqual(0.56);
    expect(r.chroma.deep, `${at} second tone chroma`).toBeLessThanOrEqual(0.4);
    // Cladding is a dark, near-neutral tone, and glass is a cool dark blue-green.
    expect(r.hsl.panel[2], `${at} cladding`).toBeLessThanOrEqual(0.27);
    expect(r.hsl.panel[1], `${at} cladding saturation`).toBeLessThanOrEqual(0.14);
    expect(r.hsl.glass[0], `${at} glass hue`).toBeGreaterThan(180);
    expect(r.hsl.glass[0], `${at} glass hue`).toBeLessThan(235);
    // Every neutral on a building leans the same way, measured against the panel.
    const ref = r.neutralHues[0];
    for (const n of r.neutralHues.slice(1)) {
      if (n.c > 0.05 && ref.c > 0.05) expect(hueGap(n.h, ref.h), `${at} shared undertone`).toBeLessThanOrEqual(26);
    }
  }

  // Style character is preserved: glass towers and concrete stay quiet, Kerala stays light.
  for (const r of rows.filter(x => x.style === 'glassTower')) expect(r.chroma.wall).toBeLessThanOrEqual(0.12);
  for (const r of rows.filter(x => x.style === 'brutalist')) expect(r.chroma.wall).toBeLessThanOrEqual(0.12);
  for (const r of rows.filter(x => x.style === 'kerala')) expect(r.hsl.wall[2]).toBeGreaterThan(0.7);

  // Real variety, not a handful of presets: many distinct walls, several families, several designs.
  for (const style of STYLES) {
    const set = rows.filter(x => x.style === style);
    expect(new Set(set.map(x => x.wall)).size, `${style} unique walls`).toBeGreaterThan(set.length * 0.8);
    expect(new Set(set.map(x => x.family)).size, `${style} families`).toBeGreaterThanOrEqual(4);
    expect(new Set(set.map(x => x.scheme)).size, `${style} two-tone designs`).toBeGreaterThanOrEqual(3);
  }
});

test('colour is deterministic and fully independent of every layout seed', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const r = await page.evaluate(async () => {
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { resolveColors } = await import('/src/generator/colors.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    const snap = (patch: Record<string, unknown>) => {
      const g = generateBuilding({ ...DEFAULT_PARAMS, seed: 4242, ...patch });
      const data = {
        colors: JSON.stringify(g.userData.colors), site: JSON.stringify(g.userData.site),
        roofs: JSON.stringify(g.userData.roofs), laundry: JSON.stringify(g.userData.laundry),
        triangles: g.userData.stats.triangles,
      };
      g.traverse((o: any) => o.geometry?.dispose());
      return data;
    };
    const base = snap({});
    const again = snap({});
    const rerolled = snap({ colorVariation: 3 });
    const otherScheme = snap({ colorScheme: 'single' });
    const named0 = resolveColors({ seed: 9, style: 'modern', palette: 'terracotta', colorShift: 0, colorVariation: 0, colorScheme: 'auto' } as any).palette;
    const named6 = resolveColors({ seed: 9, style: 'modern', palette: 'terracotta', colorShift: 0.6, colorVariation: 0, colorScheme: 'auto' } as any).palette;
    const { PALETTES } = await import('/src/generator/types.ts');
    return { base, again, rerolled, otherScheme, named0, named6, ref: PALETTES['terracotta'] };
  });
  expect(r.again).toEqual(r.base);
  expect(r.rerolled.colors).not.toBe(r.base.colors);
  // Re-rolling colour changes nothing about where things are.
  expect(r.rerolled.site).toBe(r.base.site);
  expect(r.rerolled.roofs).toBe(r.base.roofs);
  expect(r.rerolled.laundry).toBe(r.base.laundry);
  expect(r.rerolled.triangles).toBe(r.base.triangles);
  expect(r.otherScheme.triangles).toBe(r.base.triangles);
  // Choosing a composition never changes the palette itself.
  expect(JSON.parse(r.otherScheme.colors).swatches).toEqual(JSON.parse(r.base.colors).swatches);
  // Named palettes are untouched at zero drift, and drift stays small otherwise.
  for (const k of ['wall', 'wallAccent', 'panel', 'stone', 'frame', 'metal', 'ground']) expect(r.named0[k]).toBe(r.ref[k]);
  expect(r.named6.wall).not.toBe(r.ref.wall);
});

test('the two-tone plan reaches the geometry and stripes run through the floors', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const r = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    const run = (patch: Record<string, unknown>) => {
      const g = generateBuilding({ ...DEFAULT_PARAMS, seed: 77, floors: 8, ...patch });
      const accent = g.children.filter((c: any) => c.material.name === 'Lokam / Accent plaster') as any[];
      let box: any = null;
      for (const mesh of accent) {
        mesh.geometry.computeBoundingBox();
        box = box ? box.union(mesh.geometry.boundingBox) : mesh.geometry.boundingBox.clone();
      }
      const out = {
        count: accent.length, y0: box?.min.y ?? 0, y1: box?.max.y ?? 0,
        scheme: g.userData.colors.scheme, floorHeight: g.userData.params.floorHeight,
        floors: g.userData.params.floors, triangles: g.userData.stats.triangles,
      };
      g.traverse((o: any) => o.geometry?.dispose());
      void THREE;
      return out;
    };
    return {
      single: run({ colorScheme: 'single' }),
      stripe: run({ colorScheme: 'stripe', massing: 'slab' }),
      crown: run({ colorScheme: 'crown', massing: 'slab' }),
      blocks: run({ colorScheme: 'blocks', massing: 'stepped' }),
      blocksOnSlab: run({ colorScheme: 'blocks', massing: 'slab' }),
    };
  });
  expect(r.single.count).toBe(0);
  const H = r.stripe.floorHeight, F = r.stripe.floors;
  // A stripe starts above the ground floor and climbs to the roof: one continuous element.
  expect(r.stripe.count).toBe(1);
  expect(r.stripe.y0).toBeLessThanOrEqual(H * 1.05);
  expect(r.stripe.y1).toBeGreaterThanOrEqual(H * (F - 0.05));
  // A crown only occupies the top floors.
  expect(r.crown.count).toBeGreaterThanOrEqual(1);
  expect(r.crown.y0).toBeGreaterThanOrEqual(H * (F - 2) - 0.05);
  // Block tones need more than one block; a single slab falls back to a stripe instead of nothing.
  expect(r.blocks.count).toBeGreaterThanOrEqual(1);
  expect(r.blocksOnSlab.scheme).toBe('stripe');
  expect(r.blocksOnSlab.count).toBe(1);
  for (const k of ['stripe', 'crown', 'blocks'] as const) expect(r[k].triangles).toBeGreaterThan(5000);
});

test('browsing many colours does not grow the material cache without bound', async ({ page }) => {
  await page.goto('/tests/fixtures/generator.html');
  const size = await page.evaluate(async () => {
    const { generateBuilding } = await import('/src/generator/building.ts');
    const { materialCacheSize } = await import('/src/generator/materials.ts');
    const { DEFAULT_PARAMS } = await import('/src/generator/types.ts');
    for (let seed = 9000; seed < 9060; seed++) {
      const g = generateBuilding({ ...DEFAULT_PARAMS, seed, floors: 3, width: 3, depth: 2, parking: false, lod: 'low' });
      g.traverse((o: any) => o.geometry?.dispose());
    }
    return materialCacheSize();
  });
  expect(size).toBeLessThanOrEqual(24);
});

test('colour controls update the preview without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  const strip = page.locator('.colour-strip');
  const before = await strip.innerHTML();
  await page.getByRole('button', { name: 'Re-roll colour mix' }).click();
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await expect.poll(async () => strip.innerHTML()).not.toBe(before);
  await page.getByLabel('Two-tone design').selectOption('stripe');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await expect(page.getByText('stair-core accent').first()).toBeVisible();
  await page.getByRole('button', { name: 'Terracotta', exact: true }).click();
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  await page.getByRole('button', { name: 'Seeded natural palette' }).click();
  await page.getByLabel('Architectural style').selectOption('kerala');
  await expect(page.getByRole('button', { name: 'Seeded natural palette' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.status-bar')).toContainText('Model ready');
  expect(errors).toEqual([]);
});
