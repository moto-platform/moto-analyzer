/**
 * Small shared parts for the restyled panels (oscilloscope, UDS, health, defs).
 * Same rules as primitives.tsx: radius 0, 1px rules, colours only via `term-*` classes
 * or `themeColor`. The only literal colours are the scope trace hues below, which have
 * no Tailwind token because they exist only on the canvas.
 */
import React from 'react';
import { cn } from './primitives';
import { themeColor, type Theme } from './theme';

/* ------------------------------------------------------------------ tables */

/** Table head cell: lowercase dim label, rule-hi underline (as the trace mockup). */
export const TH = 'h-6 whitespace-nowrap border-b border-term-ruleHi px-2 text-left font-normal text-term-dim';
/** Table data cell: 3px 8px, rule underneath. */
export const TD = 'whitespace-nowrap border-b border-term-rule px-2 py-[3px] align-top';

/**
 * Narrow gutter in front of a row: amber `›` for the keyboard cursor, red `■` for a
 * fault, empty otherwise. Fault wins over the cursor mark.
 */
export const GutterMark: React.FC<{ cursor?: boolean; fault?: boolean; className?: string }> = ({ cursor, fault, className }) => (
  <span aria-hidden="true" className={cn('inline-block w-[1.5ch]', fault ? 'text-term-red' : 'text-term-amber', className)}>
    {fault ? '■' : cursor ? '›' : ''}
  </span>
);

/** Dim lowercase section head inside a list column, with an optional count. */
export const ListHead: React.FC<{ children: React.ReactNode; aside?: React.ReactNode; className?: string }> = ({ children, aside, className }) => (
  <div className={cn('flex h-6 items-center justify-between gap-3 border-b border-term-ruleHi px-[14px] text-term-dim', className)}>
    <span>{children}</span>
    {aside !== undefined && <span className="text-term-faint">{aside}</span>}
  </div>
);

/** Centered faint placeholder for an empty list or table. */
export const Empty: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('px-[14px] py-6 text-term-faint', className)}>{children}</div>
);

/* ------------------------------------------------------------------ scope traces */

/**
 * Muted trace hues beyond the two token colours (fg-hi, amber): teal, blue-grey,
 * violet, olive. Dark variants are lifted for >= 6.5:1 on #171614; light variants are
 * darkened for >= 4.5:1 on #f4f1ea. Red is reserved for faults and is never a trace.
 */
const TRACE_HUES: Record<Theme, readonly string[]> = {
  dark: ['#6fb3a8', '#8ea4c4', '#a993c9', '#a9b27a'],
  light: ['#2b7a6e', '#41608c', '#6d4e99', '#64702a'],
};

/** Trace colours for the active theme, in assignment order. Re-read after a theme switch. */
export function scopePalette(theme: Theme): string[] {
  return [themeColor('hi'), themeColor('amber'), ...TRACE_HUES[theme]];
}

/**
 * DOM swatch for a trace slot (legend dot, readout label). The two token slots use
 * classes so they follow the theme at once; the other hues come from the theme table.
 */
export function traceSwatch(theme: Theme, slot: number): { className?: string; style?: React.CSSProperties } {
  const i = slot % (2 + TRACE_HUES[theme].length);
  if (i === 0) return { className: 'text-term-hi' };
  if (i === 1) return { className: 'text-term-amber' };
  return { style: { color: TRACE_HUES[theme][i - 2] } };
}

/** Theme currently applied to <html> (the source of truth for `themeColor`). */
export function documentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
