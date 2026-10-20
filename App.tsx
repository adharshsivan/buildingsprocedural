import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PARAMS, PALETTES, PRESETS, type BuildingParams, type ColorScheme, type Style } from './generator/types';
import { resolveColors } from './generator/colors';
import BuildingViewport, { type BuildingStats, type ViewMode, type ViewportHandle } from './ui/BuildingViewport';
import Icon, { type IconName } from './ui/Icon';
import { Panel, Segmented, Select, Slider, Toggle } from './ui/controls';

const styles: { value: Style; label: string; title: string }[] = [
  { value: 'modern', label: 'Contemporary mid-rise', title: 'Metro Residences' },
  { value: 'glassTower', label: 'Glass tower', title: 'The Skyline' },
  { value: 'minimal', label: 'Minimal white', title: 'The White House' },
  { value: 'luxury', label: 'Luxury residences', title: 'The Observatory' },
  { value: 'indian', label: 'Modern Indian', title: 'Urban Courtyard' },
  { value: 'kerala', label: 'Kerala residential', title: 'Kochi Residences' },
  { value: 'brutalist', label: 'Sculpted concrete', title: 'The Monolith' },
  { value: 'mediterranean', label: 'Mediterranean', title: 'Casa Terra' },
];
const cameraViews: { id: ViewMode; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'cube' },
  { id: 'facade', label: 'Facade', icon: 'facade' },
  { id: 'entrance', label: 'Entrance', icon: 'door' },
  { id: 'parking', label: 'Parking', icon: 'parking' },
  { id: 'roof', label: 'Rooftop', icon: 'roof' },
];
const percent = (v: number) => `${Math.round(v * 100)}%`;

function Logo() {
  return <div className="brand" aria-label="Lokam world tools">
    <svg className="brand-mark" viewBox="0 0 30 34" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M2 30V10l8-5v25M10 30V5l8 5v20M18 30V2l10 6v22M2 30h26M5 14v2m0 4v2m8-7v2m0 4v2m9-10v2m0 4v2"/></svg>
    <span className="brand-name">lokam<span style={{ color: 'var(--accent)' }}>.</span></span>
  </div>;
}

export default function App() {
  const [params, setParams] = useState<BuildingParams>({ ...DEFAULT_PARAMS });
  const [tab, setTab] = useState('building');
  const [view, setView] = useState<ViewMode>('overview');
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<BuildingStats>({ drawCalls: 0, triangles: 0, elements: 0 });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState('');
  const viewport = useRef<ViewportHandle>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const presetsMenu = useRef<HTMLDetailsElement>(null);
  const style = styles.find(s => s.value === params.style)!;
  // Swatches come from the same pure resolver the generator uses, so they update instantly.
  const resolved = resolveColors(params, 2).palette;
  const report = stats.colors;
  const swatches = report?.swatches ?? { wall: resolved.wall, wallDeep: resolved.wallDeep, wallAccent: resolved.wallAccent, stone: resolved.stone, panel: resolved.panel, frame: resolved.frame, metal: resolved.metal };
  const schemeLabel: Record<string, string> = { single: 'single tone', stripe: 'stair-core accent', crown: 'crown accent', blocks: 'block tones' };
  const hasResidentialLobby = params.groundFloor === 'lobby' || (params.groundFloor === 'auto' && params.style !== 'kerala');
  const update = useCallback((patch: Partial<BuildingParams>) => {
    if (['style', 'massing', 'massingVariation', 'floors', 'width', 'depth', 'bay', 'floorHeight'].some(key => key in patch)) {
      setView('overview'); setAutoRotate(false);
    }
    setParams(current => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const changeView = (mode: ViewMode) => { setView(mode); setAutoRotate(false); viewport.current?.focus(mode); };
  const randomize = () => {
    const seed = new Uint32Array(1);
    crypto.getRandomValues(seed);
    update({ seed: seed[0] % 100000000 });
  };
  const reset = () => {
    setParams({ ...DEFAULT_PARAMS }); setView('overview'); setAutoRotate(false);
    viewport.current?.focus('overview'); setToast('Default building restored.');
  };
  const exportPreset = () => {
    const blob = new Blob([JSON.stringify({ generator: 'lokam-apartments', version: 3, params }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `lokam-apartment-${params.seed}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('Building preset exported as JSON.');
  };
  const snippet = `import { generateBuilding } from './generator';\nimport preset from './lokam-apartment-${params.seed}.json';\n\nconst building = generateBuilding(preset.params);\nbuilding.position.set(x, 0, z);\nscene.add(building);\n\n// Your camera, controls, lights and world stay untouched.`;
  const copySnippet = async () => {
    try { await navigator.clipboard.writeText(snippet); setToast('Integration snippet copied.'); }
    catch { setToast('Clipboard unavailable. Select the snippet to copy it.'); }
  };

  return <div className="app-shell">
    <header className="app-header">
      <Logo/><span className="header-divider"/>
      <div className="header-title">Apartment studio <span>WORLD TOOLS / 03</span></div>
      <div className="header-actions">
        <details className="preset-menu" ref={presetsMenu}>
          <summary><Icon name="layers" size={16}/>Presets<Icon name="chevron" size={13}/></summary>
          <div className="preset-list"><span>START WITH A COLLECTION</span>
            {PRESETS.map((preset, i) => <button key={preset.id} onClick={() => {
              setParams({ ...DEFAULT_PARAMS, ...preset.patch, seed: params.seed, dayNight: params.dayNight });
              setView('overview'); setAutoRotate(false); if (presetsMenu.current) presetsMenu.current.open = false;
            }}><span>0{i + 1}</span>{preset.label}</button>)}
          </div>
        </details>
        <button className="text-button" onClick={() => dialog.current?.showModal()}><Icon name="code" size={16}/>Integration</button>
        <button className="export-button" onClick={exportPreset}><Icon name="download" size={16}/>Export preset</button>
      </div>
    </header>

    <main className="workspace">
      <section className={`viewer ${params.dayNight}`} aria-label="Building preview">
        <BuildingViewport ref={viewport} params={params} view={view} autoRotate={autoRotate} wireframe={wireframe} onStats={setStats} onReady={setReady}/>
        <div className={`viewer-heading ${view !== 'overview' ? 'inspection-heading' : ''}`}>
          <div className="eyebrow">RESIDENTIAL COLLECTION / 001</div>
          <h1>{style.title}</h1>
          <p>{params.floors} storeys. A little more life in every detail.</p>
        </div>
        <div className="time-switch" aria-label="Preview lighting">
          {(['day', 'dusk', 'night'] as const).map(time => <button key={time} onClick={() => update({ dayNight: time })} aria-pressed={params.dayNight === time}>
            <Icon name={time === 'day' ? 'sun' : time === 'dusk' ? 'sunset' : 'moon'} size={14}/>{time[0].toUpperCase() + time.slice(1)}
          </button>)}
        </div>
        <div className="viewer-tools" aria-label="Viewport tools">
          <button title="Zoom in" aria-label="Zoom in" onClick={() => viewport.current?.zoom(1)}><Icon name="plus" size={17}/></button>
          <button title="Zoom out" aria-label="Zoom out" onClick={() => viewport.current?.zoom(-1)}><Icon name="minus" size={17}/></button>
          <button title="Frame building" aria-label="Frame building" onClick={() => changeView('overview')}><Icon name="expand" size={16}/></button>
          <button title="Toggle wireframe" aria-label="Toggle wireframe" aria-pressed={wireframe} onClick={() => setWireframe(v => !v)}><Icon name="grid" size={16}/></button>
        </div>
        <div className="view-caption">
          <svg className="mini-axis" viewBox="0 0 34 36" fill="none" aria-hidden="true"><path d="M15 24V5m0 19 16 6m-16-6L3 31" stroke="currentColor" strokeWidth="1"/><circle cx="15" cy="24" r="2" fill="currentColor"/><text x="13" y="7" transform="translate(4 -4)" fill="currentColor" fontSize="6">Y</text><text x="28" y="27" fill="currentColor" fontSize="6">X</text><text x="0" y="27" fill="currentColor" fontSize="6">Z</text></svg>
          <span>PERSPECTIVE<br/><span style={{ opacity: .6, fontSize: 8 }}>1 UNIT = 1 METRE</span></span>
        </div>
        <nav className="view-controls" aria-label="Inspect building">
          {cameraViews.map(item => <button key={item.id} onClick={() => changeView(item.id)} aria-pressed={view === item.id && !autoRotate}><Icon name={item.icon} size={15}/>{item.label}</button>)}
          <span className="tool-divider"/>
          <button title="Auto orbit" aria-label="Auto orbit" aria-pressed={autoRotate} onClick={() => setAutoRotate(v => !v)}><Icon name="orbit" size={17}/></button>
        </nav>
      </section>

      <button className="mobile-toggle" onClick={() => setMobileOpen(o => !o)} aria-expanded={mobileOpen} aria-controls="building-settings"><Icon name={mobileOpen ? 'close' : 'sliders'} size={15}/>{mobileOpen ? 'Close' : 'Settings'}</button>
      <aside className={`inspector ${mobileOpen ? 'mobile-open' : ''}`} id="building-settings" aria-label="Building settings">
        <div className="inspector-header"><h2>Make it your own</h2><span><i className={`live-dot ${ready ? '' : 'loading'}`}/>LIVE PREVIEW</span></div>
        <div className="settings-tabs" role="tablist" aria-label="Settings category">
          {[['building', 'Building'], ['details', 'Details'], ['site', 'Surroundings']].map(([id, label], index) => <button key={id} role="tab" tabIndex={tab === id ? 0 : -1} id={`tab-${id}`} aria-controls="settings-panel" aria-selected={tab === id} onClick={() => setTab(id)} onKeyDown={event => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const next = ['building', 'details', 'site'][(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
            setTab(next); document.getElementById(`tab-${next}`)?.focus();
          }}>{label}</button>)}
        </div>
        <div className="inspector-scroll" id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          <div className="tab-content" key={tab}>
            {tab === 'building' && <>
              <Panel title="Architecture" right={<span className="section-number">01</span>}>
                <Select label="Architectural style" value={params.style} options={styles} onChange={v => { update({ style: v }); setView('overview'); }}/>
                <Select label="Building form" value={params.massing} options={[
                  { value: 'auto', label: 'Style default' }, { value: 'slab', label: 'Linear block' }, { value: 'stepped', label: 'Stepped terraces' }, { value: 'tower', label: 'Tower + podium' }, { value: 'podium', label: 'Wide podium' }, { value: 'twin', label: 'Twin towers' }, { value: 'L', label: 'L-shaped block' }, { value: 'T', label: 'T-shaped block' }, { value: 'U', label: 'U-shaped court' }, { value: 'courtyard', label: 'Enclosed courtyard' }, { value: 'staggered', label: 'Staggered setbacks' },
                ]} onChange={v => { update({ massing: v }); setView('overview'); }}/>
                <VariationControl label="Massing layout" value={params.massingVariation} onChange={v => update({ massingVariation: v })}/>
              </Panel>
              <Panel title="Proportions" right={<span className="section-number">02</span>}>
                <Slider label="Number of floors" value={params.floors} min={2} max={24} onChange={v => { update({ floors: v }); setView('overview'); }}/>
                <div className="control-grid">
                  <Slider label="Width" value={params.width} min={3} max={10} format={v => `${v} bays`} onChange={v => update({ width: v })}/>
                  <Slider label="Depth" value={params.depth} min={2} max={8} format={v => `${v} bays`} onChange={v => update({ depth: v })}/>
                </div>
              </Panel>
              <Panel title="Colour" right={<span className="section-number">03</span>}>
                <div className="palette-label"><span>{report?.name ?? resolved.name}</span><span>{params.palette === 'auto' ? 'seeded' : 'named'}</span></div>
                <div className="colour-strip" role="img" aria-label={`Resolved colours: ${report?.name ?? resolved.name}`}>
                  {([['Wall', swatches.wall], ['Second tone', swatches.wallDeep], ['Accent band', swatches.wallAccent], ['Plinth stone', swatches.stone], ['Cladding', swatches.panel], ['Window frame', swatches.frame], ['Metalwork', swatches.metal]] as const)
                    .map(([label, color]) => <i key={label} title={`${label} ${color}`} style={{ background: color }}/>)}
                </div>
                <p className="helper-text">{report ? `${schemeLabel[report.scheme] ?? report.scheme}. ${report.undertone} undertone, ${report.finish} frames.` : 'Resolving colours...'}</p>
                <div className="palette-swatches">
                  <button title="Seeded natural palette" aria-label="Seeded natural palette" aria-pressed={params.palette === 'auto'}
                    style={{ background: `linear-gradient(135deg,${resolved.wall} 0%,${resolved.wall} 55%,${resolved.wallDeep} 55%)` }}
                    onClick={() => update({ palette: 'auto' })}>{params.palette === 'auto' ? <Icon name="check" size={14}/> : <Icon name="shuffle" size={13}/>}</button>
                  {Object.entries(PALETTES).map(([key, pal]) => <button key={key} title={pal.name} aria-label={pal.name} aria-pressed={params.palette === key} style={{ background: `linear-gradient(135deg,${pal.wall} 0%,${pal.wall} 60%,${pal.panel} 60%)` }} onClick={() => update({ palette: key })}>{params.palette === key && <Icon name="check" size={14}/>}</button>)}
                </div>
                <Slider label="Natural drift" value={params.colorShift} min={0} max={1} step={0.05} format={v => v < 0.05 ? 'None' : percent(v)} onChange={v => update({ colorShift: v })}/>
                <Select label="Two-tone design" value={params.colorScheme} options={[
                  { value: 'auto', label: 'Chosen from seed' }, { value: 'single', label: 'Single tone' }, { value: 'stripe', label: 'Stair-core accent' },
                  { value: 'crown', label: 'Crown on top floors' }, { value: 'blocks', label: 'Different tone per block' },
                ] as { value: ColorScheme; label: string }[]} onChange={v => update({ colorScheme: v })}/>
                <VariationControl label="Colour mix" value={params.colorVariation} onChange={v => update({ colorVariation: v })}/>
                <div className="finish-note"><Icon name="check" size={13}/><span>Real paint tones with a shared warm or cool undertone.<br/>Clean finishes, no dirt or repeating tiles.</span></div>
              </Panel>
              <Panel title="Balconies" right={<span className="section-number">04</span>}>
                <Select label="Balustrade" value={params.balconyStyle} options={[
                  { value: 'glass', label: 'Frameless glass' }, { value: 'railing', label: 'Powder-coated metal' }, { value: 'solid', label: 'Solid parapet' }, { value: 'mixed', label: 'Mixed materials' }, { value: 'none', label: 'No balconies' },
                ]} onChange={v => update({ balconyStyle: v })}/>
                <Slider label="Balcony density" value={params.balconyChance} min={0} max={1} step={0.05} format={percent} onChange={v => update({ balconyChance: v })}/>
              </Panel>
              <details className="advanced-controls"><summary>Advanced proportions & quality<Icon name="chevron" size={13}/></summary><div>
                <Slider label="Bay width" value={params.bay} min={2.6} max={4.4} step={0.1} format={v => `${v.toFixed(1)} m`} onChange={v => update({ bay: v })}/>
                <Slider label="Floor height" value={params.floorHeight} min={2.6} max={4} step={0.1} format={v => `${v.toFixed(1)} m`} onChange={v => update({ floorHeight: v })}/>
                <Select label="Geometry quality" value={params.lod} options={[{ value: 'high', label: 'High detail' }, { value: 'medium', label: 'Balanced' }, { value: 'low', label: 'Mobile / low detail' }]} onChange={v => update({ lod: v })}/>
              </div></details>
            </>}

            {tab === 'details' && <>
              <Panel title="Windows & doors" right={<Icon name="facade" size={15}/>}>
                <Select label="Window assembly" value={params.windowStyle} options={[{ value: 'sliding', label: 'Sliding aluminium' }, { value: 'casement', label: 'Casement frames' }, { value: 'fixed', label: 'Fixed picture windows' }]} onChange={v => update({ windowStyle: v })}/>
                <Select label="Window arrangement" value={params.windowLayout} options={[{ value: 'grid', label: 'Aligned grid' }, { value: 'staggered', label: 'Staggered' }, { value: 'vertical', label: 'Vertical strips' }, { value: 'ribbon', label: 'Full-height glazing' }, { value: 'random', label: 'Random variation' }]} onChange={v => update({ windowLayout: v })}/>
                <Select label="Entrance doors" value={params.entranceStyle} options={[{ value: 'glass', label: 'Glazed double doors' }, { value: 'timber', label: 'Warm timber doors' }, { value: 'metal', label: 'Painted metal doors' }]} onChange={v => update({ entranceStyle: v })}/>
                <Slider label="Window depth" value={params.windowRecess} min={0.2} max={1.1} step={0.05} format={v => `${v.toFixed(2)} m`} onChange={v => update({ windowRecess: v })}/>
                <Toggle label="Parallax depth" value={params.parallaxWindows} onChange={v => update({ parallaxWindows: v })}/>
                <Toggle label="Furnished interiors" value={params.interiors} onChange={v => update({ interiors: v })}/>
                <Toggle label="Curtains" value={params.curtains} onChange={v => update({ curtains: v })}/>
                <Toggle label="Warm interior lights" value={params.warmLights} onChange={v => update({ warmLights: v })}/>
                <Slider label="Lit windows at night" value={params.litWindowRatio} min={0} max={1} step={0.05} format={percent} onChange={v => update({ litWindowRatio: v })}/>
              </Panel>
              <Panel title="Exterior services" right={<Icon name="layers" size={15}/>}>
                <Toggle label="Air-conditioning units" value={params.acUnits} onChange={v => update({ acUnits: v })}/>
                <Slider label="AC unit density" value={params.acDensity} min={0} max={1} step={0.05} format={percent} onChange={v => update({ acDensity: v })}/>
                <Toggle label="Pipework & drainage" value={params.facadePipes} onChange={v => update({ facadePipes: v })}/>
                <Toggle label="Rooftop equipment" value={params.roofFeatures} onChange={v => update({ roofFeatures: v })}/>
                <Select label="Water tank" value={params.tankStyle} options={[{ value: 'ribbed', label: 'Ribbed polyethylene' }, { value: 'stainless', label: 'Brushed stainless steel' }]} onChange={v => update({ tankStyle: v })}/>
                <p className="helper-text">Fans, mounting brackets, insulated lines, pipe collars and tank valves. Inspect them in Rooftop view.</p>
              </Panel>
              {params.roofFeatures && <Panel title="Rooftop composition" right={<Icon name="roof" size={15}/>}>
                <Select label="Roof use" value={params.roofStyle} options={[
                  { value: 'mixed', label: 'Seeded by building' }, { value: 'terrace', label: 'Residents terrace' },
                  { value: 'solar', label: 'Solar roof' }, { value: 'planters', label: 'Planted roof' },
                  { value: 'mechanical', label: 'Mechanical roof' },
                ]} onChange={v => update({ roofStyle: v })}/>
                <Slider label="Roof activity" value={params.roofClutter} min={0} max={1} step={0.05} format={percent} onChange={v => update({ roofClutter: v })}/>
                <VariationControl label="Roof layout" value={params.roofVariation} onChange={v => update({ roofVariation: v })}/>
                <Toggle label="Skyline hoarding" value={params.roofHoarding} onChange={v => update({ roofHoarding: v })}/>
                {params.roofHoarding && (
                  <Select label="Hoarding style" value={params.hoardingStyle} options={[
                    { value: 'auto', label: 'Auto (building choice)' },
                    { value: 'single', label: 'Single-sided (front)' },
                    { value: 'double', label: 'Double-sided (two-way)' },
                    { value: 'v-shape', label: 'V-shaped (corner angle)' },
                  ]} onChange={v => update({ hoardingStyle: v })}/>
                )}
                <p className="helper-text">{params.roofHoarding ? 'Large commercial advertising hoarding with heavy structural steel space-frame truss, catwalk, safety railings and spotlight illumination.' : 'Equipment reserves its own space and leaves a clear path from the roof door. Re-roll without changing the facade or parking.'}</p>
              </Panel>}
              <Panel title="Facade finish">
                <Slider label="Surface variation" value={params.surfaceVariation} min={0} max={1} step={0.05} format={percent} onChange={v => update({ surfaceVariation: v })}/>
                <Toggle label="Horizontal slab bands" value={params.slabBands} onChange={v => update({ slabBands: v })}/>
                <Toggle label="Vertical fins" value={params.verticalFins} onChange={v => update({ verticalFins: v })}/>
              </Panel>
            </>}

            {tab === 'site' && <>
              <Panel title="Ground level">
                <Select label="Ground floor" value={params.groundFloor} options={[{ value: 'auto', label: 'Style default' }, { value: 'lobby', label: 'Residential lobby' }, { value: 'shops', label: 'Neighbourhood shops' }, { value: 'stilts', label: 'Open stilt parking' }]} onChange={v => update({ groundFloor: v })}/>
                {hasResidentialLobby && <>
                  <Toggle label="Detailed lobby interior" value={params.lobbyDetails} onChange={v => update({ lobbyDetails: v })}/>
                  <Select label="Lobby finish" value={params.lobbyStyle} options={[{ value: 'warm', label: 'Warm reception' }, { value: 'minimal', label: 'Minimal stone' }, { value: 'stone', label: 'Stone & metal' }]} onChange={v => update({ lobbyStyle: v })}/>
                  <Toggle label="Graded side approach" value={params.accessibleEntry} onChange={v => update({ accessibleEntry: v })}/>
                </>}
                <Toggle label="Compound wall" value={params.compoundWall} onChange={v => update({ compoundWall: v })}/>
                <Toggle label="Entrance gate" value={params.gate} onChange={v => update({ gate: v })}/>
                <Toggle label="Guard cabin" value={params.guardCabin} onChange={v => update({ guardCabin: v })}/>
                <Toggle label="Building signage" value={params.signage} onChange={v => update({ signage: v })}/>
              </Panel>
              <Panel title="Parking & streets">
                <Toggle label="Parking area" value={params.parking} onChange={v => update({ parking: v })}/>
                {params.parking && <>
                  <Toggle label="Underground parking" value={params.undergroundParking} onChange={v => update({ undergroundParking: v })}/>
                  <Select label="Vehicle approach" value={params.parkingSide} options={[{ value: 'auto', label: 'Choose from seed' }, { value: 'left', label: 'Left side' }, { value: 'right', label: 'Right side' }]} onChange={v => update({ parkingSide: v })}/>
                  <VariationControl label="Parking layout" value={params.parkingVariation} onChange={v => update({ parkingVariation: v })}/>
                  {params.undergroundParking
                    ? <Toggle label="Basement level interior" value={params.garageInterior} onChange={v => update({ garageInterior: v })}/>
                    : <Toggle label="Carport canopy" value={params.carport} onChange={v => update({ carport: v })}/>}
                  <Toggle label="EV charge points" value={params.evCharging} onChange={v => update({ evCharging: v })}/>
                  <Slider label="Parked vehicles" value={params.parkedVehicles} min={0} max={10} onChange={v => update({ parkedVehicles: v })}/>
                  <p className="helper-text">{params.undergroundParking
                    ? 'Seed changes approach side, bay row, markings and vehicle occupancy. The ramp is excavated; columns, stair and turning space stay clear of cars.'
                    : 'A full-depth rear manoeuvring aisle reaches every bay. Seed changes the drive side, corner or full markings, canopy and occupied spaces.'}</p>
                </>}
                <Toggle label="Street & lighting" value={params.streetProps} onChange={v => update({ streetProps: v })}/>
              </Panel>
              <Panel title="Everyday details">
                <Toggle label="Potted plants" value={params.pottedPlants} onChange={v => update({ pottedPlants: v })}/>
                <Toggle label="Balcony planters" value={params.balconyPlanters} onChange={v => update({ balconyPlanters: v })}/>
                <p className="helper-text">Only architecture and everyday objects. No people or trees.</p>
              </Panel>
              <Panel title="Laundry" right={<span className="section-number">{params.hangingClothes ? 'ON' : 'OFF'}</span>}>
                <Toggle label="Hanging clothes" value={params.hangingClothes} onChange={v => update({ hangingClothes: v })}/>
                {params.hangingClothes && <>
                  <Slider label="Households drying clothes" value={params.laundryDensity} min={0} max={1} step={0.05} format={percent} onChange={v => update({ laundryDensity: v })}/>
                  <Slider label="Breeze" value={params.laundryWind} min={0} max={1} step={0.05} format={v => v < 0.15 ? 'Still' : v < 0.5 ? 'Light' : v < 0.8 ? 'Breezy' : 'Windy'} onChange={v => update({ laundryWind: v })}/>
                  <Toggle label="Floor drying racks" value={params.dryingRacks} onChange={v => update({ dryingRacks: v })}/>
                  <Toggle label="Towels over railings" value={params.railingDrapes} onChange={v => update({ railingDrapes: v })}/>
                  <Toggle label="Allow on street-facing side" value={params.laundryFrontFacade} onChange={v => update({ laundryFrontFacade: v })}/>
                </>}
                <Toggle label="Rooftop clothes lines" value={params.laundryLines} onChange={v => update({ laundryLines: v })}/>
                <p className="helper-text">Clothes appear only on balconies and open terraces, never on the street, shopfronts or plain windows. Ceiling rails are added only where a balcony above provides a ceiling. Laundry is most common on Kerala and Indian blocks, rare on luxury and glass towers, and thins out at night.</p>
              </Panel>
              <Panel title="Performance"><Segmented value={params.lod} options={[{ value: 'high', label: 'High detail' }, { value: 'medium', label: 'Balanced' }, { value: 'low', label: 'Mobile' }]} onChange={v => update({ lod: v })}/><p className="helper-text">Static geometry is merged by material. Room interiors and equipment use shared texture atlases.</p></Panel>
            </>}
          </div>
        </div>
        <div className="inspector-footer">
          <div className="seed-row"><label htmlFor="seed">SEED</label><input id="seed" aria-label="Generation seed" type="number" min="0" max="4294967295" value={params.seed} onChange={e => update({ seed: Math.min(4294967295, Math.max(0, Math.trunc(Number(e.target.value)))) })}/><button title="Reset to defaults" aria-label="Reset to defaults" onClick={reset}><Icon name="reset" size={15}/></button></div>
          <button className="generate-button" onClick={randomize}><Icon name="shuffle" size={16}/>Generate variation<Icon name="arrow" size={16}/></button>
        </div>
      </aside>
    </main>

    <footer className="status-bar">
      <div role="status"><i className={`live-dot ${ready ? '' : 'loading'}`}/>{ready ? 'Model ready' : 'Generating geometry...'}<span style={{ opacity: .45 }}> / </span>Deterministic generation</div>
      <span className="status-hint">Drag to orbit <span style={{ margin: '0 8px' }}>/</span> Scroll to zoom <span style={{ margin: '0 8px' }}>/</span> Right-drag to pan</span>
      <div className="statistics"><span><b>{(stats.triangles / 1000).toFixed(1)}k</b> tris</span><span><b>{stats.drawCalls}</b> batches</span><span className="modules-stat"><b>Y</b> up</span></div>
    </footer>

    <dialog className="integration-dialog" ref={dialog} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className="dialog-title"><span>LOKAM / INTEGRATION</span><button aria-label="Close integration guide" onClick={() => dialog.current?.close()}><Icon name="close"/></button></div>
      <h2>Made for your world.</h2>
      <p>Copy <code>src/generator/</code> into your Three.js project, export your preset, and add the returned group to your existing scene. One unit is one metre; the building sits on Y = 0.</p>
      <pre>{snippet}</pre>
      <p>The generator creates geometry and materials only. It adds no camera, controls, lights, renderer or animation loop. Your existing environment map supplies reflections.</p>
      <p>Use <code>building.userData.blocks</code> for coarse collision bounds and <code>lightAnchors</code> for optional lights. Clean finishes use a WebGL material shader; port that shader if you use another renderer.</p>
      <div className="dialog-actions"><button className="export-button" onClick={copySnippet}><Icon name="copy" size={15}/>Copy integration</button><button className="text-button" onClick={exportPreset}><Icon name="download" size={15}/>Download preset</button></div>
    </dialog>
    {toast && <div className="toast" role="status"><Icon name="check" size={16}/>{toast}</div>}
  </div>;
}

function VariationControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <div className="variation-control">
    <label>{label}<span>#{value.toString().padStart(2, '0')}</span></label>
    <button type="button" onClick={() => onChange((value + 1) % 10000)} aria-label={`Re-roll ${label.toLowerCase()}`} title={`Re-roll ${label.toLowerCase()}`}>
      <Icon name="shuffle" size={15}/> New layout
    </button>
  </div>;
}