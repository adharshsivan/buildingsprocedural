import { PALETTES, type BuildingParams, type ColorScheme, type Palette, type Style } from './types';
import { RNG, moduleSeed } from './rng';

/**
 * Natural colour for buildings.
 *
 * Random RGB looks artificial because real buildings are not random: paint comes from a
 * small family of low-chroma tones, every neutral on one building leans the same way
 * (a shared warm or cool undertone), and secondary tones are chosen a deliberate step away
 * from the main one, like moving along a paint card. This module encodes those rules.
 *
 *   family  → wall tone (sampled inside a real-world range for the architectural style)
 *   derive  → accent, plinth stone, trim, cladding panel, window finish, paving, roof
 *   plan    → where a deeper second tone is used (stair-core stripe, crown, massing blocks)
 */

export type HSL = [number, number, number];
export type Tone = 'main' | 'deep';
export type ColorInputs = Pick<BuildingParams, 'seed' | 'style' | 'palette' | 'colorShift' | 'colorVariation' | 'colorScheme'>;

export interface ResolvedPalette extends Palette {
  wallDeep: string;     // deliberate second tone for stripes, crowns and massing blocks
  membrane: string;     // roof membrane
  paving: string;       // pedestrian paving
  timber: string;       // door and joinery
  family: string;
  undertone: 'warm' | 'cool';
  finish: string;       // window and metal finish
  id: string;           // stable cache key for the whole colour set
}

export interface ColorPlan {
  scheme: Exclude<ColorScheme, 'auto'>;
  /** Normalised positions (0..1) across the front and back elevations. */
  stripeAt: number[];
  stripeSides: number[];
  crownFloors: number;
  blockTone: Tone[];
}

export interface ResolvedColors { palette: ResolvedPalette; plan: ColorPlan }

/* ----------------------------------------------------------------------- colour maths */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrap = (h: number) => ((h % 360) + 360) % 360;

export function hsl(h: number, s: number, l: number): string {
  const hh = wrap(h) / 360, ss = clamp(s, 0, 1), ll = clamp(l, 0, 1);
  const f = (n: number) => {
    const k = (n + hh * 12) % 12;
    const a = ss * Math.min(ll, 1 - ll);
    return ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

export function toHsl(hex: string): HSL {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [wrap(h * 60), s, l];
}

const lerpHue = (a: number, b: number, t: number) => wrap(a + (((b - a + 540) % 360) - 180) * t);

function pickWeighted<T>(rng: RNG, items: [T, number][]): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = rng.float(0, total);
  for (const [item, w] of items) { r -= w; if (r <= 0) return item; }
  return items[items.length - 1][0];
}

/* ----------------------------------------------------------------------- families */

interface Family {
  id: string; label: string;
  h: [number, number]; s: [number, number]; l: [number, number];
  tone: 'warm' | 'cool' | 'neutral';
}

// Ranges are HSL in sRGB. Saturation stays low: painted walls are almost never vivid.
const FAMILIES: Family[] = [
  { id: 'chalk',      label: 'Chalk white',   h: [38, 52],   s: [0.12, 0.30], l: [0.86, 0.92], tone: 'warm' },
  { id: 'limestone',  label: 'Limestone',     h: [36, 48],   s: [0.16, 0.30], l: [0.76, 0.84], tone: 'warm' },
  { id: 'sandstone',  label: 'Sandstone',     h: [30, 40],   s: [0.30, 0.45], l: [0.70, 0.78], tone: 'warm' },
  { id: 'greige',     label: 'Warm greige',   h: [30, 42],   s: [0.08, 0.16], l: [0.70, 0.78], tone: 'neutral' },
  { id: 'putty',      label: 'Putty taupe',   h: [24, 34],   s: [0.07, 0.14], l: [0.58, 0.68], tone: 'neutral' },
  { id: 'ochre',      label: 'Pale ochre',    h: [40, 48],   s: [0.42, 0.58], l: [0.76, 0.83], tone: 'warm' },
  { id: 'peach',      label: 'Soft peach',    h: [16, 26],   s: [0.38, 0.52], l: [0.76, 0.82], tone: 'warm' },
  { id: 'terracotta', label: 'Terracotta',    h: [12, 20],   s: [0.34, 0.46], l: [0.62, 0.69], tone: 'warm' },
  { id: 'dustyrose',  label: 'Dusty rose',    h: [5, 15],    s: [0.24, 0.34], l: [0.82, 0.87], tone: 'warm' },
  { id: 'cream',      label: 'Buttercream',   h: [46, 56],   s: [0.34, 0.48], l: [0.86, 0.91], tone: 'warm' },
  { id: 'sage',       label: 'Sage',          h: [85, 110],  s: [0.10, 0.20], l: [0.72, 0.80], tone: 'neutral' },
  { id: 'mint',       label: 'Mint grey',     h: [140, 165], s: [0.10, 0.18], l: [0.78, 0.86], tone: 'cool' },
  { id: 'bluegrey',   label: 'Blue grey',     h: [200, 215], s: [0.10, 0.20], l: [0.76, 0.84], tone: 'cool' },
  { id: 'coolgrey',   label: 'Cool grey',     h: [205, 225], s: [0.03, 0.08], l: [0.62, 0.72], tone: 'cool' },
  { id: 'concrete',   label: 'Concrete',      h: [40, 60],   s: [0.02, 0.05], l: [0.56, 0.66], tone: 'neutral' },
  { id: 'slate',      label: 'Slate',         h: [200, 215], s: [0.08, 0.14], l: [0.30, 0.42], tone: 'cool' },
  { id: 'charcoal',   label: 'Charcoal teal', h: [175, 190], s: [0.06, 0.12], l: [0.28, 0.36], tone: 'cool' },
];

// Which families each architectural style draws from, and how often.
const STYLE_FAMILIES: Record<Style, Record<string, number>> = {
  modern:        { greige: 3, limestone: 3, chalk: 2, putty: 2, sandstone: 1.5, sage: 1, coolgrey: 1, bluegrey: 1, concrete: 1 },
  glassTower:    { coolgrey: 3, bluegrey: 3, concrete: 2, chalk: 1, slate: 1.2 },
  minimal:       { chalk: 4, limestone: 2, coolgrey: 2, concrete: 1.5, greige: 1 },
  luxury:        { slate: 2, charcoal: 2, greige: 2, putty: 1.5, limestone: 1.5, sandstone: 1 },
  indian:        { sandstone: 2, ochre: 2.5, peach: 2, terracotta: 1.5, limestone: 1.5, dustyrose: 1, mint: 0.8, chalk: 1, sage: 0.6 },
  kerala:        { chalk: 3, cream: 2.5, limestone: 1.5, ochre: 1.5, mint: 1.5, dustyrose: 1, bluegrey: 0.8, peach: 1, sage: 0.8 },
  brutalist:     { concrete: 4, coolgrey: 2, putty: 1.5, greige: 1.5, slate: 1 },
  mediterranean: { terracotta: 2.5, sandstone: 2.5, ochre: 2, chalk: 2, peach: 1.5, limestone: 1 },
};

// Window frame and metal finishes, harmonised with the undertone.
const FINISHES: Record<string, { label: string; frame: string; metal: string }> = {
  graphite:  { label: 'graphite',  frame: '#2c2f33', metal: '#7d858a' },
  bronze:    { label: 'bronze',    frame: '#3b332b', metal: '#8d7a57' },
  black:     { label: 'black',     frame: '#1f2124', metal: '#5d6368' },
  champagne: { label: 'champagne', frame: '#4a4640', metal: '#b5a888' },
  silver:    { label: 'silver',    frame: '#6b7176', metal: '#b8bec2' },
};

function pickFinish(tone: 'warm' | 'cool', style: Style, rng: RNG): string {
  const luxe = style === 'luxury' ? 1.6 : 1;
  const table: [string, number][] = tone === 'warm'
    ? [['bronze', 3 * luxe], ['champagne', 2 * luxe], ['graphite', 2], ['black', 1]]
    : [['graphite', 3], ['black', 2], ['silver', style === 'glassTower' ? 3 : 1.5], ['bronze', 0.5 * luxe]];
  return pickWeighted(rng, table);
}

/* ----------------------------------------------------------------------- derived colours */

function undertoneHue(tone: 'warm' | 'cool', rng: RNG): number {
  return tone === 'warm' ? 34 + rng.float(-6, 8) : 212 + rng.float(-8, 8);
}

/** Neutrals share the building's undertone, so nothing looks like it belongs to another palette. */
function neutrals(hue: number, tone: 'warm' | 'cool', dark: boolean, rng: RNG) {
  const sat = tone === 'warm' ? [0.05, 0.11] : [0.05, 0.09];
  return {
    panel: hsl(hue + rng.float(-6, 6), rng.float(sat[0], sat[1]), dark ? rng.float(0.10, 0.17) : rng.float(0.15, 0.26)),
    ground: hsl(hue, rng.float(0.04, 0.09), rng.float(0.55, 0.64)),
    paving: hsl(hue, rng.float(0.03, 0.07), rng.float(0.68, 0.75)),
    roof: hsl(hue, rng.float(0.03, 0.06), rng.float(0.60, 0.70)),
    membrane: hsl(hue, rng.float(0.03, 0.07), rng.float(0.54, 0.62)),
  };
}

/**
 * A deliberate second tone. It must sit a clear lightness step from the wall: two tones that
 * are almost the same read as a painting mistake rather than a design decision.
 */
function deepTone(wall: HSL, style: Style, tone: 'warm' | 'cool', rng: RNG): string {
  const [h, s, l] = wall;
  let out: HSL;
  if (l < 0.5) {
    // Dark main tone: the second tone is a pale stone, as limestone against slate.
    out = [h + rng.float(-8, 8), clamp(s + 0.02, 0.04, 0.2), rng.float(0.66, 0.78)];
  } else {
    const contrast = style === 'kerala' || style === 'indian' ? 2.5 : style === 'mediterranean' ? 2 : style === 'minimal' || style === 'glassTower' ? 0.6 : 1.2;
    const mode = pickWeighted<'tonal' | 'analogous' | 'contrast'>(rng, [['tonal', 3], ['analogous', 2], ['contrast', contrast]]);
    if (mode === 'tonal') {
      out = [h + rng.float(-5, 5), clamp(s + rng.float(0.04, 0.12), 0, 0.55), clamp(l - rng.float(0.15, 0.26), 0.3, 0.8)];
    } else if (mode === 'analogous') {
      const dir = rng.bool() ? 1 : -1;
      out = [h + dir * rng.float(14, 26), clamp(s + rng.float(0, 0.08), 0, 0.5), clamp(l - rng.float(0.1, 0.18), 0.32, 0.82)];
    } else if (tone === 'warm') {
      out = [rng.float(14, 30), rng.float(0.20, 0.32), rng.float(0.42, 0.54)];   // weathered clay / umber
    } else {
      out = [rng.float(205, 220), rng.float(0.10, 0.20), rng.float(0.32, 0.44)]; // slate blue-grey
    }
  }
  // Guarantee a readable step in lightness, never a near-miss.
  const gap = out[2] - l;
  if (Math.abs(gap) < 0.14) out[2] = clamp(l + (gap >= 0 && l < 0.78 ? 0.14 : -0.14), 0.2, 0.9);
  // Painted accents are muted: cap perceived chroma so a stripe never looks like signage.
  const room = 1 - Math.abs(2 * out[2] - 1);
  if (room > 0 && room * out[1] > 0.28) out[1] = 0.28 / room;
  return hsl(out[0], out[1], out[2]);
}

/* ----------------------------------------------------------------------- palettes */

function paletteId(p: Omit<ResolvedPalette, 'id'>): string {
  return [p.wall, p.wallAccent, p.wallDeep, p.panel, p.trim, p.stone, p.glassTint, p.frame, p.metal,
    p.door, p.roof, p.ground, p.membrane, p.paving, p.timber].join('');
}

function composeAuto(p: ColorInputs, rng: RNG, shift: number): ResolvedPalette {
  const weights = STYLE_FAMILIES[p.style] ?? STYLE_FAMILIES.modern;
  const fam = pickWeighted(rng, FAMILIES.filter(f => weights[f.id]).map(f => [f, weights[f.id]] as [Family, number]));
  // shift = 0 sits at the centre of the family; shift = 1 explores its whole real-world range.
  const draw = (r: [number, number]) => { const c = (r[0] + r[1]) / 2; return c + (r[0] + (r[1] - r[0]) * rng.next() - c) * shift; };
  const wall: HSL = [wrap(draw(fam.h)), clamp(draw(fam.s), 0, 0.6), clamp(draw(fam.l), 0.24, 0.93)];
  // 'Neutral' families inherit their undertone from the wall's own hue: a putty wall with cool
  // neutrals reads as two unrelated paint jobs.
    const tone: 'warm' | 'cool' = fam.tone === 'neutral' ? (wall[0] < 75 || wall[0] > 330 ? 'warm' : 'cool') : fam.tone;
  const dark = wall[2] < 0.5;
  const hue = undertoneHue(tone, rng);

  // One step along a paint card from the wall; lighter on dark buildings, darker on light ones.
  const accent = hsl(wall[0] + rng.float(-6, 6), wall[1] + rng.float(0, 0.05), wall[2] + (dark ? 1 : -1) * rng.float(0.05, 0.09));
  const arc = Math.abs(((hue - wall[0] + 540) % 360) - 180);
  const stone = hsl(lerpHue(wall[0], hue, arc <= 70 ? 0.4 : 0), wall[1] * rng.float(0.45, 0.75),
    clamp(wall[2] + (dark ? 0.14 : -rng.float(0.1, 0.2)), 0.2, 0.86));
  const trim = hsl(wall[0], wall[1] * 0.6, dark ? clamp(wall[2] + 0.25, 0.4, 0.7) : clamp(wall[2] - 0.28, 0.22, 0.5));
  const finishKey = pickFinish(tone, p.style, rng);
  const finish = FINISHES[finishKey];
  const n = neutrals(hue, tone, dark, rng);
  const timberHue = rng.float(22, 32);
  const timber = hsl(timberHue, rng.float(0.34, 0.48), rng.float(0.30, 0.42));
  const base: Omit<ResolvedPalette, 'id'> = {
    name: `${fam.label}, ${finish.label}`, family: fam.label, undertone: tone, finish: finish.label,
    wall: hsl(...wall), wallAccent: accent, wallDeep: deepTone(wall, p.style, tone, rng),
    panel: n.panel, trim, stone,
    glassTint: hsl(rng.float(198, 216), rng.float(0.30, 0.42), rng.float(0.10, 0.17)),
    frame: finish.frame, metal: finish.metal,
    door: hsl(timberHue, 0.3, 0.2), roof: n.roof, ground: n.ground,
    membrane: n.membrane, paving: n.paving, timber,
  };
  return { ...base, id: paletteId(base) };
}

/** A named palette with small, correlated, per-building drift: wall, accent and plinth move together. */
function fromNamed(base: Palette, rng: RNG, shift: number, p: ColorInputs): ResolvedPalette {
  const wall0 = toHsl(base.wall);
  const tone: 'warm' | 'cool' = wall0[0] >= 170 && wall0[0] <= 260 && wall0[1] > 0.04 ? 'cool' : 'warm';
  const dH = rng.float(-1, 1) * 9 * shift, dS = rng.float(-1, 1) * 0.06 * shift;
  const dL = rng.float(-1, 1) * 0.04 * shift, dN = rng.float(-1, 1) * 0.025 * shift;
  const wallish = (hex: string) => {
    if (shift === 0) return hex;
    const [h, s, l] = toHsl(hex);
    return hsl(h + dH, s > 0.03 ? s + dS : s, clamp(l + dL, 0.06, 0.94));
  };
  const neutral = (hex: string) => {
    if (shift === 0) return hex;
    const [h, s, l] = toHsl(hex);
    return hsl(h, s, clamp(l + dN, 0.06, 0.94));
  };
  const wall = wallish(base.wall);
  const wallHsl = toHsl(wall);
  const hue = undertoneHue(tone, rng);
  const n = neutrals(hue, tone, wallHsl[2] < 0.5, rng);
  const timber = hsl(rng.float(22, 32), rng.float(0.34, 0.48), rng.float(0.30, 0.42));
  const out: Omit<ResolvedPalette, 'id'> = {
    ...base,
    wall, wallAccent: wallish(base.wallAccent), stone: wallish(base.stone), trim: wallish(base.trim),
    panel: neutral(base.panel), roof: neutral(base.roof), ground: neutral(base.ground),
    wallDeep: deepTone(wallHsl, p.style, tone, rng),
    membrane: n.membrane, paving: n.paving, timber,
    family: base.name, undertone: tone, finish: 'as palette',
  };
  return { ...out, id: paletteId(out) };
}

/* ----------------------------------------------------------------------- composition plan */

function composePlan(p: ColorInputs, rng: RNG, blockCount: number): ColorPlan {
  const regional = p.style === 'indian' || p.style === 'kerala';
  const auto = pickWeighted<Exclude<ColorScheme, 'auto'>>(rng, [
    ['single', p.style === 'minimal' ? 5 : p.style === 'glassTower' ? 4 : 2.5],
    ['stripe', regional ? 3.2 : 1.8],
    ['crown', p.style === 'luxury' || p.style === 'modern' ? 2 : 1],
    ['blocks', blockCount > 1 ? 3 : 0],
  ]);
  const requested = p.colorScheme === 'auto' ? auto : p.colorScheme;
  const scheme = requested === 'blocks' && blockCount < 2 ? 'stripe' : requested;

  // A stair-core stripe sits at an off-centre column, and usually runs through the building so
  // the front and back line up.
  // Stripes stay inside the elevation: on an end bay the corner pilaster hides them, and an
  // accent nobody can see is not a design decision.
  const stripeAt = rng.bool(0.28) ? [0.16, 0.84] : [rng.float(0.2, 0.8)];
  const stripeSides = rng.bool(0.7) ? [0, 2] : [0];
  const crownFloors = rng.int(1, 2);
  const blockTone: Tone[] = Array.from({ length: blockCount }, (_, i) => scheme === 'blocks' && i % 2 === 1 ? 'deep' : 'main');
  return { scheme, stripeAt, stripeSides, crownFloors, blockTone };
}

/** Which wall tone a bay uses. Pure and deterministic, so facade and roof agree. */
export function wallTone(
  plan: ColorPlan,
  c: { block: number; side: number; floor: number; bay: number; bays: number; floors: number },
): Tone {
  switch (plan.scheme) {
    case 'blocks': return plan.blockTone[c.block] ?? 'main';
    case 'crown': {
      const crown = Math.min(plan.crownFloors, Math.max(1, c.floors - 3));
      return c.floor >= c.floors - crown ? 'deep' : 'main';
    }
    case 'stripe': {
      if (!plan.stripeSides.includes(c.side)) return 'main';
      for (const u of plan.stripeAt) {
        const idx = Math.round(u * (c.bays - 1));
        if ((c.side === 2 ? c.bays - 1 - idx : idx) === c.bay) return 'deep';
      }
      return 'main';
    }
    default: return 'main';
  }
}

export function roofTone(plan: ColorPlan, block: number): Tone {
  if (plan.scheme === 'crown') return 'deep';
  if (plan.scheme === 'blocks') return plan.blockTone[block] ?? 'main';
  return 'main';
}

/* ----------------------------------------------------------------------- entry points */

export function resolveColors(p: ColorInputs, blockCount = 1): ResolvedColors {
  const shift = clamp(Number.isFinite(p.colorShift) ? p.colorShift : 0.6, 0, 1);
  // Independent sub-streams: re-rolling the colour mix never moves any other layout, and
  // choosing a composition never changes the palette.
  const paletteRng = new RNG(moduleSeed(p.seed, p.colorVariation, 0xc0102e));
  const planRng = new RNG(moduleSeed(p.seed, p.colorVariation, 0x9a7e51));
  const named = p.palette !== 'auto' ? PALETTES[p.palette] : undefined;
  return {
    palette: named ? fromNamed(named, paletteRng, shift, p) : composeAuto(p, paletteRng, shift),
    plan: composePlan(p, planRng, blockCount),
  };
}

export function colorSummary(colors: ResolvedColors) {
  const { palette: p, plan } = colors;
  return {
    name: p.name, family: p.family, undertone: p.undertone, finish: p.finish, scheme: plan.scheme,
    swatches: { wall: p.wall, wallDeep: p.wallDeep, wallAccent: p.wallAccent, stone: p.stone, panel: p.panel, frame: p.frame, metal: p.metal },
    plan,
  };
}
