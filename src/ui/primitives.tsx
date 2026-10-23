/**
 * Shared presentation primitives for direction C ("restrained workshop terminal").
 * Rules: radius 0, 1px rules, no icons (a key hint in amber stands where an icon
 * would), no shadows or motion. Colours only through `term-*` Tailwind classes.
 */
import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FILTER_ATTR } from './keys';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ key hints */

/** An amber key glyph followed by its label: `space Pause`, `/ Filter`. */
export const KeyHint: React.FC<{ k: string; children?: React.ReactNode; className?: string }> = ({ k, children, className }) => (
  <span className={cn('whitespace-nowrap', className)}>
    <span className="text-term-amber">{k}</span>
    {children !== undefined && <> {children}</>}
  </span>
);

/* ------------------------------------------------------------------ buttons */

export interface TermButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Key hint shown in amber before the label. */
  hotkey?: string;
  /** 1px rule-hi frame (primary action of a group, e.g. `space Pause`, `Arm`). */
  boxed?: boolean;
  /** On/off button: shows an amber `[x]` (on) or a faint `[ ]` (off) before the label. */
  toggled?: boolean;
}

/** Text button: no fill, frame only on hover or when `boxed`. */
export const TermButton = React.forwardRef<HTMLButtonElement, TermButtonProps>(
  ({ hotkey, boxed, toggled, className, children, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={toggled}
      className={cn(
        'inline-flex items-center gap-[1ch] whitespace-nowrap border px-2 leading-[22px] text-term-fg',
        boxed ? 'border-term-ruleHi' : 'border-transparent hover:border-term-ruleHi',
        toggled && 'text-term-hi',
        'disabled:cursor-not-allowed disabled:text-term-faint disabled:hover:border-transparent',
        className
      )}
      {...rest}
    >
      {toggled !== undefined && (toggled ? <span className="text-term-amber">[x]</span> : <span className="text-term-faint">[ ]</span>)}
      {hotkey && <span className="text-term-amber">{hotkey}</span>}
      {children !== undefined && <span>{children}</span>}
    </button>
  )
);
TermButton.displayName = 'TermButton';

/* ------------------------------------------------------------------ choice */

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  title?: string;
  disabled?: boolean;
}

interface ChoiceProps<T extends string | number> {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  /** Optional key hint shown after the options (e.g. `M` cycles the mode). */
  hotkey?: string;
  className?: string;
}

/** Segmented choice: `[overwrite] scroll log M`. Selected in fg-hi with brackets, others dim. */
export function Segmented<T extends string | number>({ options, value, onChange, label, hotkey, className }: ChoiceProps<T>) {
  return (
    <span role="radiogroup" aria-label={label} className={cn('inline-flex items-center whitespace-nowrap', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn('px-[2px]', on ? 'text-term-hi' : 'text-term-dim hover:text-term-fg', 'disabled:text-term-faint')}
          >
            {on ? <>[{o.label}]</> : <>&nbsp;{o.label}&nbsp;</>}
          </button>
        );
      })}
      {hotkey && <span className="ml-1 text-term-amber">{hotkey}</span>}
    </span>
  );
}

/** Radio list: `● Virtual bus  ○ Log replay`. Selected fg-hi with amber dot, others dim. */
export function RadioList<T extends string | number>({ options, value, onChange, label, className }: Omit<ChoiceProps<T>, 'hotkey'>) {
  return (
    <span role="radiogroup" aria-label={label} className={cn('inline-flex items-center whitespace-nowrap', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn('px-[6px] leading-[20px]', on ? 'text-term-hi' : 'text-term-dim hover:text-term-fg')}
          >
            <span className={on ? 'text-term-amber' : 'text-term-faint'}>{on ? '●' : '○'}</span>&nbsp;{o.label}
          </button>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ meters */

export interface TextMeterProps {
  label?: React.ReactNode;
  /** 0..100; null or undefined shows an empty track and an en dash. */
  pct: number | null | undefined;
  /** Number of cells in the bar. */
  cells?: number;
  title?: string;
  className?: string;
}

/** htop-style bar: `platform [||··················] 3.9%`. Fill fg, track faint. */
export const TextMeter: React.FC<TextMeterProps> = ({ label, pct, cells = 20, title, className }) => {
  const known = typeof pct === 'number' && Number.isFinite(pct);
  const clamped = known ? Math.min(100, Math.max(0, pct)) : 0;
  // Any non-zero load shows at least one bar.
  const filled = known ? Math.min(cells, clamped > 0 ? Math.max(1, Math.round((clamped / 100) * cells)) : 0) : 0;
  return (
    <span className={cn('inline-flex items-center gap-[6px] whitespace-pre', className)} title={title}>
      {label !== undefined && <span className="text-term-dim">{label}</span>}
      <span className="text-term-faint" aria-hidden="true">
        [<span className="text-term-fg">{'|'.repeat(filled)}</span>
        {'·'.repeat(cells - filled)}]
      </span>
      <span className={cn('text-term-hi', !known && 'text-term-faint')}>{known ? `${clamped.toFixed(1)}%` : '–'}</span>
    </span>
  );
};

/* ------------------------------------------------------------------ layout */

/** Side-panel pane: a block separated from the next by one rule, not a card. */
export const Pane: React.FC<{
  title: React.ReactNode;
  /** Right side of the title row (ids, a verdict). Rendered dim, weight 400. */
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ title, aside, children, className }) => (
  <section className={cn('border-b border-term-rule px-[14px] pb-3 pt-[10px]', className)}>
    <h2 className="mb-2 flex justify-between gap-3 font-semibold text-term-hi">
      <span>{title}</span>
      {aside !== undefined && <span className="font-normal text-term-dim">{aside}</span>}
    </h2>
    {children}
  </section>
);

/** 32px toolbar under the tab row: items separated by space, a rule underneath. */
export const Toolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('flex h-tool shrink-0 items-center gap-[22px] whitespace-nowrap border-b border-term-rule px-[14px]', className)}>
    {children}
  </div>
);

/** Key / value rows: key dim on the left, value right-aligned. */
export const KeyValues: React.FC<{ rows: [React.ReactNode, React.ReactNode][]; className?: string }> = ({ rows, className }) => (
  <dl className={cn('grid grid-cols-[auto_1fr] gap-x-4', className)}>
    {rows.map(([k, v], i) => (
      <React.Fragment key={i}>
        <dt className="text-term-dim">{k}</dt>
        <dd className="text-right">{v}</dd>
      </React.Fragment>
    ))}
  </dl>
);

/** Italic explanatory note (dim, so it stays readable). */
export const Note: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <p className={cn('mt-2 italic text-term-dim', className)}>{children}</p>
);

/* ------------------------------------------------------------------ states */

/** Not available / not applicable: an en dash in faint. */
export const Na: React.FC<{ title?: string }> = ({ title }) => (
  <span className="text-term-faint" title={title}>
    –
  </span>
);

export type StatusLevel = 'ok' | 'warn' | 'fault' | 'na';

/**
 * State text per the token rules: ok plain, warn amber with a leading `!`, fault red
 * with a leading `■`, na faint. `quiet` renders ok in fg-dim (e.g. E2E `ok`).
 */
export const Status: React.FC<{ level: StatusLevel; children: React.ReactNode; quiet?: boolean; title?: string; className?: string }> = ({
  level,
  children,
  quiet,
  title,
  className,
}) => {
  const tone =
    level === 'warn' ? 'text-term-amber' : level === 'fault' ? 'text-term-red' : level === 'na' ? 'text-term-faint' : quiet ? 'text-term-dim' : 'text-term-fg';
  const mark = level === 'warn' ? '! ' : level === 'fault' ? '■ ' : '';
  return (
    <span className={cn(tone, className)} title={title}>
      {mark}
      {children}
    </span>
  );
};

/** Failing cell: red text on red-bg (`WRONG_CRC`). */
export const FaultCell: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => (
  <span className="-ml-1 bg-term-redBg px-1 text-term-red" title={title}>
    {children}
  </span>
);

/* ------------------------------------------------------------------ inputs */

export interface TermInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Key hint before the field (`/`). */
  hotkey?: string;
  /** Mark as the panel filter so the global `/` key focuses it. */
  filter?: boolean;
  /** Classes for the wrapping label. */
  wrapClassName?: string;
}

/** Underlined text field with an optional amber key hint, e.g. `/ id, name, bus or signal`. */
export const TermInput = React.forwardRef<HTMLInputElement, TermInputProps>(
  ({ hotkey, filter, wrapClassName, className, ...rest }, ref) => (
    <label className={cn('inline-flex items-center gap-[6px]', wrapClassName)}>
      {hotkey && <span className="text-term-amber">{hotkey}</span>}
      <input ref={ref} {...(filter ? { [FILTER_ATTR]: '' } : {})} className={cn('term-input min-w-[220px]', className)} {...rest} />
    </label>
  )
);
TermInput.displayName = 'TermInput';

/* ------------------------------------------------------------------ hex bytes */

/**
 * One CAN data byte cell: unchanged in faint, changed in fg-hi on bg-row with a 1px
 * fg-dim underline (same look as the `.byte-changed` CSS class).
 */
export const ByteCell: React.FC<{ value: number; changed?: boolean; className?: string }> = ({ value, changed, className }) => (
  <span
    className={cn(
      'mr-[3px] inline-block w-[2.1ch] text-center',
      changed ? 'byte-changed' : 'text-term-faint',
      className
    )}
  >
    {value.toString(16).toUpperCase().padStart(2, '0')}
  </span>
);
