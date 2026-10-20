export type Style =
  | 'modern'        // contemporary mid-rise, slab bands + mixed balconies
  | 'glassTower'    // curtain-wall high-rise
  | 'minimal'       // white minimalist, punched openings, deep reveals
  | 'luxury'        // premium: stone base, bronze fins, wide glass balconies
  | 'indian'        // modern Indian apartment block
  | 'kerala'        // dense Kerala residential
  | 'brutalist'     // exposed concrete
  | 'mediterranean';

export type Massing = 'auto' | 'slab' | 'tower' | 'stepped' | 'podium' | 'twin' | 'L' | 'T' | 'U' | 'courtyard' | 'staggered';
export type TimeOfDay = 'day' | 'dusk' | 'night';
export type Lod = 'high' | 'medium' | 'low';
export type WindowLayout = 'grid' | 'staggered' | 'random' | 'vertical' | 'ribbon';
export type BalconyStyle = 'glass' | 'railing' | 'solid' | 'mixed' | 'none';
export type GroundFloor = 'auto' | 'lobby' | 'shops' | 'stilts';
export type WindowStyle = 'sliding' | 'casement' | 'fixed';
export type EntranceStyle = 'glass' | 'timber' | 'metal';
export type TankStyle = 'ribbed' | 'stainless';
export type LobbyStyle = 'warm' | 'minimal' | 'stone';
export type ParkingSide = 'auto' | 'left' | 'right';
export type ColorScheme = 'auto' | 'single' | 'stripe' | 'crown' | 'blocks';
export type HoardingStyle = 'auto' | 'single' | 'double' | 'v-shape';

export interface BuildingParams {
  seed: number;
  style: Style;
  massing: Massing;
  floors: number;
  width: number;          // bays across the front
  depth: number;          // bays along the side
  bay: number;            // metres per bay
  floorHeight: number;
  /** 'auto' draws a natural palette from the seed; or the key of a named palette. */
  palette: string;
  colorShift: number;        // 0..1 how far a palette may drift from its centre, naturally
  colorVariation: number;    // re-roll index for colour only, independent of every layout
  colorScheme: ColorScheme;  // where a deliberate second tone is used
  surfaceVariation: number;
  windowStyle: WindowStyle;
  entranceStyle: EntranceStyle;
  facadePipes: boolean;
  acDensity: number;
  tankStyle: TankStyle;
  lobbyDetails: boolean;
  lobbyStyle: LobbyStyle;
  undergroundParking: boolean;
  garageInterior: boolean;
  evCharging: boolean;
  accessibleEntry: boolean;

  windowLayout: WindowLayout;
  windowRecess: number;   // metres of fake-interior depth
  balconyStyle: BalconyStyle;
  balconyChance: number;

  parallaxWindows: boolean;
  interiors: boolean;
  curtains: boolean;
  warmLights: boolean;
  litWindowRatio: number;

  slabBands: boolean;
  verticalFins: boolean;
  acUnits: boolean;
  roofFeatures: boolean;
  roofStyle: 'mixed' | 'planters' | 'solar' | 'mechanical' | 'terrace';
  roofClutter: number;
  roofVariation: number;     // independent seeded roof composition
  massingVariation: number;  // independent seeded massing layout (splits, mirrors, gaps, bridges)
  roofHoarding: boolean;     // prominent rooftop billboard / advertising hoarding
  hoardingStyle: HoardingStyle;
  groundFloor: GroundFloor;
  signage: boolean;

  compoundWall: boolean;
  gate: boolean;
  guardCabin: boolean;
  parking: boolean;
  parkingSide: ParkingSide;
  parkingVariation: number;  // independent seeded parking composition
  parkedVehicles: number;
  carport: boolean;
  streetProps: boolean;

  hangingClothes: boolean;
  laundryLines: boolean;
  laundryDensity: number;      // 0..1 share of households drying clothes
  laundryWind: number;         // 0..1 static breeze lift on hanging garments
  laundryFrontFacade: boolean; // allow laundry on the street-facing elevation
  dryingRacks: boolean;        // foldable floor racks on balconies
  railingDrapes: boolean;      // towels/sheets folded over balcony railings
  pottedPlants: boolean;
  balconyPlanters: boolean;

  dayNight: TimeOfDay;
  lod: Lod;
}

export interface Palette {
  name: string;
  wall: string;
  wallAccent: string;
  panel: string;      // dark cladding panel
  trim: string;
  stone: string;      // base / plinth
  glassTint: string;
  frame: string;
  metal: string;
  door: string;
  roof: string;
  ground: string;
}

export const PALETTES: Record<string, Palette> = {
  'ivory-bronze':  { name:'Ivory / Bronze',  wall:'#ece5da', wallAccent:'#d8cdbc', panel:'#4a4136', trim:'#8c7a5e', stone:'#b9ad9b', glassTint:'#243242', frame:'#3a3a3c', metal:'#8d7a57', door:'#4a3524', roof:'#8a8378', ground:'#9c978e' },
  'white-graphite':{ name:'White / Graphite',wall:'#f3f3f1', wallAccent:'#e3e3e0', panel:'#34373b', trim:'#9aa0a6', stone:'#c9c9c6', glassTint:'#1d2a36', frame:'#2b2d31', metal:'#9aa0a6', door:'#2b2d31', roof:'#8c8f94', ground:'#a3a5a8' },
  'glass-azure':   { name:'Glass / Azure',   wall:'#cdd7e0', wallAccent:'#b4c2cf', panel:'#2a3542', trim:'#7d8da0', stone:'#aab5c0', glassTint:'#16303f', frame:'#262b31', metal:'#8e9aa6', door:'#232a31', roof:'#767f8a', ground:'#9aa1a8' },
  'warm-sand':     { name:'Warm Sand',       wall:'#e6d4b4', wallAccent:'#d4bd97', panel:'#5b4a35', trim:'#9c7f52', stone:'#c3ae8c', glassTint:'#22303c', frame:'#3b3630', metal:'#a08a60', door:'#5a3f24', roof:'#9b8b70', ground:'#b0a287' },
  'terracotta':    { name:'Terracotta',      wall:'#dba784', wallAccent:'#c88f6d', panel:'#6b3f2c', trim:'#8a4f33', stone:'#b98a67', glassTint:'#2a2430', frame:'#44332a', metal:'#8d6a4c', door:'#4c2d1c', roof:'#8d5a3c', ground:'#ab8266' },
  'kerala-white':  { name:'Kerala White',    wall:'#f4f1e7', wallAccent:'#e7e0cf', panel:'#6a5a3f', trim:'#8a7550', stone:'#cfc4ab', glassTint:'#1d2a34', frame:'#3e342a', metal:'#7d6c50', door:'#4a3520', roof:'#8d8470', ground:'#bdb49c' },
  'charcoal-teal': { name:'Charcoal / Teal', wall:'#4e565c', wallAccent:'#3d4449', panel:'#23292d', trim:'#5f8f8a', stone:'#6b7378', glassTint:'#122028', frame:'#1d2225', metal:'#7f8a8f', door:'#1d2225', roof:'#4a5155', ground:'#787f84' },
  'pastel-mint':   { name:'Pastel Mint',     wall:'#e3ece3', wallAccent:'#cfdfd3', panel:'#3f514a', trim:'#86a596', stone:'#c1cdc2', glassTint:'#1c2e30', frame:'#33403c', metal:'#8ea79a', door:'#3b4a44', roof:'#8b9a92', ground:'#a4ada6' },
};

export const DEFAULT_PARAMS: BuildingParams = {
  seed: 20260418,
  style: 'modern',
  massing: 'auto',
  floors: 6,
  width: 5,
  depth: 4,
  bay: 3.2,
  floorHeight: 3.1,
  palette: 'auto',
  colorShift: 0.6,
  colorVariation: 0,
  colorScheme: 'auto',
  surfaceVariation: 0.35,
  windowStyle: 'sliding',
  entranceStyle: 'glass',
  facadePipes: true,
  acDensity: 0.5,
  tankStyle: 'ribbed',
  lobbyDetails: true,
  lobbyStyle: 'warm',
  undergroundParking: true,
  garageInterior: true,
  evCharging: true,
  accessibleEntry: true,

  windowLayout: 'grid',
  windowRecess: 0.62,
  balconyStyle: 'glass',
  balconyChance: 0.7,

  parallaxWindows: true,
  interiors: true,
  curtains: true,
  warmLights: true,
  litWindowRatio: 0.55,

  slabBands: true,
  verticalFins: true,
  acUnits: true,
  roofFeatures: true,
  roofStyle: 'mixed',
  roofClutter: 0.55,
  roofVariation: 0,
  massingVariation: 0,
  roofHoarding: false,
  hoardingStyle: 'auto',
  groundFloor: 'auto',
  signage: true,

  compoundWall: true,
  gate: true,
  guardCabin: false,
  parking: true,
  parkingSide: 'auto',
  parkingVariation: 0,
  parkedVehicles: 3,
  carport: false,
  streetProps: false,

  hangingClothes: true,
  laundryLines: false,
  laundryDensity: 0.3,
  laundryWind: 0.25,
  laundryFrontFacade: false,
  dryingRacks: true,
  railingDrapes: true,
  pottedPlants: true,
  balconyPlanters: true,

  dayNight: 'day',
  lod: 'high',
};

export interface StyleProfile {
  slabBands: boolean;
  fins: boolean;
  curtainWall: number;   // 0..1 chance a bay is full-height glazing
  ribbonGlazing: boolean;
  chajja: boolean;       // projecting sunshades
  pilasters: boolean;
  roughWall: boolean;
  parapetSolid: boolean;
  balconyBias: number;
  windowWide: number;    // width fraction of bay
  windowTall: number;    // height fraction of floor
  stoneBase: boolean;
  defaultMassing: Massing;
  defaultPalette: string;
}

export const STYLE_PROFILES: Record<Style, StyleProfile> = {
  modern:       { slabBands:true,  fins:true,  curtainWall:0.25, ribbonGlazing:false, chajja:false, pilasters:false, roughWall:false, parapetSolid:true,  balconyBias:0.55, windowWide:0.72, windowTall:0.62, stoneBase:true,  defaultMassing:'stepped', defaultPalette:'ivory-bronze' },
  glassTower:   { slabBands:true,  fins:true,  curtainWall:0.85, ribbonGlazing:true,  chajja:false, pilasters:false, roughWall:false, parapetSolid:false, balconyBias:0.25, windowWide:0.88, windowTall:0.80, stoneBase:true,  defaultMassing:'tower',   defaultPalette:'glass-azure' },
  minimal:      { slabBands:false, fins:false, curtainWall:0.10, ribbonGlazing:false, chajja:false, pilasters:false, roughWall:false, parapetSolid:true,  balconyBias:0.35, windowWide:0.52, windowTall:0.66, stoneBase:false, defaultMassing:'slab',    defaultPalette:'white-graphite' },
  luxury:       { slabBands:true,  fins:true,  curtainWall:0.55, ribbonGlazing:false, chajja:false, pilasters:false, roughWall:false, parapetSolid:true,  balconyBias:0.75, windowWide:0.80, windowTall:0.74, stoneBase:true,  defaultMassing:'podium',  defaultPalette:'charcoal-teal' },
  indian:       { slabBands:true,  fins:false, curtainWall:0.05, ribbonGlazing:false, chajja:true,  pilasters:true,  roughWall:false, parapetSolid:true,  balconyBias:0.8,  windowWide:0.58, windowTall:0.56, stoneBase:false, defaultMassing:'slab',    defaultPalette:'warm-sand' },
  kerala:       { slabBands:false, fins:false, curtainWall:0.0,  ribbonGlazing:false, chajja:true,  pilasters:true,  roughWall:true,  parapetSolid:true,  balconyBias:0.7,  windowWide:0.5,  windowTall:0.52, stoneBase:false, defaultMassing:'slab',    defaultPalette:'kerala-white' },
  brutalist:    { slabBands:true,  fins:false, curtainWall:0.0,  ribbonGlazing:false, chajja:false, pilasters:false, roughWall:true,  parapetSolid:true,  balconyBias:0.45, windowWide:0.6,  windowTall:0.5,  stoneBase:false, defaultMassing:'stepped', defaultPalette:'white-graphite' },
  mediterranean:{ slabBands:false, fins:false, curtainWall:0.0,  ribbonGlazing:false, chajja:true,  pilasters:false, roughWall:true,  parapetSolid:true,  balconyBias:0.6,  windowWide:0.48, windowTall:0.6,  stoneBase:false, defaultMassing:'slab',    defaultPalette:'terracotta' },
};

export interface Preset {
  id: string;
  label: string;
  patch: Partial<BuildingParams>;
}

export const PRESETS: Preset[] = [
  { id:'metro', label:'Metro Residences', patch:{ style:'modern', massing:'stepped', floors:9, width:6, depth:4, balconyStyle:'mixed', groundFloor:'lobby', undergroundParking:true, hangingClothes:false } },
  { id:'skyglass', label:'Skyline Glass Tower', patch:{ style:'glassTower', massing:'tower', floors:16, width:5, depth:4, balconyStyle:'glass', windowLayout:'ribbon', groundFloor:'lobby', undergroundParking:true, signage:true, roofHoarding:true, hoardingStyle:'v-shape', hangingClothes:false } },
  { id:'nordic', label:'Minimal White Block', patch:{ style:'minimal', massing:'slab', floors:6, width:6, depth:3, balconyStyle:'solid', windowLayout:'staggered', undergroundParking:false, hangingClothes:false } },
  { id:'luxe', label:'Luxury Podium Tower', patch:{ style:'luxury', massing:'podium', floors:13, width:6, depth:4, balconyStyle:'glass', groundFloor:'lobby', undergroundParking:true, carport:false } },
  { id:'blr', label:'Modern Indian Flats', patch:{ style:'indian', massing:'slab', floors:7, width:7, depth:4, balconyStyle:'railing', undergroundParking:false, hangingClothes:true, laundryLines:true, laundryDensity:0.5, laundryFrontFacade:true, groundFloor:'stilts' } },
  { id:'kochi', label:'Kerala Dense Block', patch:{ style:'kerala', massing:'slab', floors:5, width:5, depth:3, balconyStyle:'railing', undergroundParking:false, hangingClothes:true, laundryLines:true, laundryDensity:0.55, laundryFrontFacade:true, groundFloor:'shops', windowLayout:'grid' } },
];
