import { useId, type CSSProperties, type ReactNode } from 'react';
import Icon from './Icon';

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return <section className="control-section"><header><h3>{title}</h3>{right}</header><div className="control-stack">{children}</div></section>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="control-row"><span>{label}</span><div>{children}</div></div>;
}

export function Slider({ label, value, min, max, step = 1, onChange, format }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const id = useId();
  return <div className="slider-control">
    <div><label htmlFor={id}>{label}</label><output htmlFor={id}>{format ? format(value) : value}</output></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
      style={{ '--range': `${((value - min) / (max - min)) * 100}%` } as CSSProperties}/>
  </div>;
}

export function Select<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const id = useId();
  return <div className="select-control"><label htmlFor={id}>{label}</label><div className="select-wrap">
    <select id={id} value={value} onChange={e => onChange(e.target.value as T)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    <Icon name="chevron" size={15}/>
  </div></div>;
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={value} className="toggle-control" onClick={() => onChange(!value)}>
    <span>{label}</span><span className={`switch-track ${value ? 'on' : ''}`}><span/></span>
  </button>;
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return <div className="segmented">{options.map(o => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}