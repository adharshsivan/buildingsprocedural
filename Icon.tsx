import type { CSSProperties } from 'react';

export type IconName = 'cube' | 'sun' | 'moon' | 'sunset' | 'chevron' | 'shuffle' | 'download' | 'code' | 'close' | 'reset' | 'orbit' | 'facade' | 'door' | 'roof' | 'parking' | 'check' | 'arrow' | 'sliders' | 'copy' | 'expand' | 'layers' | 'grid' | 'plus' | 'minus';

const paths: Record<IconName, React.ReactNode> = {
  cube: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
  moon: <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>,
  sunset: <><path d="M3 16h18M5 20h14M7 16a5 5 0 0 1 10 0M12 2v5M4 7l2 2m14-2-2 2M2 12h2m16 0h2"/></>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  shuffle: <><path d="M3 5h3c5 0 7 14 12 14h3m-4-4 4 4-4 3M3 19h3c2 0 3-3 4-5m4-5c1-3 2-4 4-4h3m-4-3 4 3-4 4"/></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/></>,
  code: <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  reset: <><path d="M3 10a9 9 0 1 1 1 7M3 3v7h7"/></>,
  orbit: <><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/></>,
  facade: <><path d="M4 21V3h16v18M2 21h20M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3"/></>,
  door: <><path d="M4 21V3h16v18M2 21h20M8 21V6h8v15M13 13h.01"/></>,
  roof: <><path d="m3 12 9-9 9 9M5 10v11h14V10M3 21h18M10 21v-6h4v6"/></>,
  parking: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h3.2a3 3 0 0 1 0 6H9m0-6v10"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  sliders: <><path d="M3 6h6m4 0h8M3 12h12m4 0h2M3 18h2m4 0h12"/><circle cx="11" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="7" cy="18" r="2"/></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></>,
  grid: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/></>,
  plus: <path d="M12 4v16M4 12h16"/>,
  minus: <path d="M4 12h16"/>,
};

export default function Icon({ name, size = 18, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}