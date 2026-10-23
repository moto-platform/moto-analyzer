/**
 * Presentation parts shared by the trace-like panels (CAN trace, sniffer) in direction C.
 * Colours only through `term-*` classes; no icons, no motion.
 */
import React from 'react';
import { cn } from './primitives';

/** Left gutter glyph: amber `›` for the keyboard cursor, red `■` for a fault, else empty. */
export const GutterMark: React.FC<{ cursor?: boolean; fault?: boolean }> = ({ cursor, fault }) =>
  cursor ? (
    <span className="text-term-amber" aria-label="cursor">
      ›
    </span>
  ) : fault ? (
    <span className="text-term-red" aria-label="fault">
      ■
    </span>
  ) : null;

/**
 * One decoded signal as plain text: `KEY=VALUE unit`, key dim, value fg, unit faint.
 * `untrusted` drops everything to faint (fault rows).
 */
export const SignalText: React.FC<{ name: string; value: string; unit?: string; untrusted?: boolean; className?: string }> = ({
  name,
  value,
  unit,
  untrusted,
  className,
}) => (
  <span className={cn('mr-[14px] inline-block whitespace-nowrap', untrusted ? 'text-term-faint' : 'text-term-fg', className)}>
    <span className={untrusted ? 'text-term-faint' : 'text-term-dim'}>{name}=</span>
    {value}
    {unit ? <span className="text-term-faint"> {unit}</span> : null}
  </span>
);

export interface PanelKey {
  k: string;
  label: string;
}

/** One-line footer under a panel table: panel key hints on the left, a legend on the right. */
export const PanelFooter: React.FC<{ keys: PanelKey[]; legend?: React.ReactNode; className?: string }> = ({ keys, legend, className }) => (
  <div
    className={cn(
      'flex h-keybar shrink-0 items-center gap-[18px] overflow-hidden whitespace-nowrap border-t border-term-rule px-[14px] text-term-faint',
      className
    )}
  >
    {keys.map((h) => (
      <span key={h.k + h.label}>
        <span className="mr-1 text-term-amber">{h.k}</span>
        <span className="text-term-dim">{h.label}</span>
      </span>
    ))}
    {legend !== undefined && <span className="ml-auto flex gap-[18px]">{legend}</span>}
  </div>
);

/** The standard trace legend: changed byte, attention, fault. */
export const TraceLegend: React.FC = () => (
  <>
    <span>
      <span className="byte-changed px-[2px]">0D</span> byte changed since last frame
    </span>
    <span>
      <span className="text-term-amber">!</span> needs attention
    </span>
    <span>
      <span className="text-term-red">■</span> fault, E2E or timeout
    </span>
  </>
);
