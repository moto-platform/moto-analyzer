/**
 * Direction C, "restrained workshop terminal". Colours live as CSS custom properties
 * (RGB triplets) in src/index.css, one set per `data-theme` on <html>; Tailwind only
 * references them, so every colour class follows the active theme.
 */
const v = (name) => `rgb(var(--t-${name}) / <alpha-value>)`;

const term = {
  bg: v('bg'),
  raise: v('raise'),
  row: v('row'),
  rule: v('rule'),
  ruleHi: v('rule-hi'),
  fg: v('fg'),
  hi: v('hi'),
  dim: v('dim'),
  faint: v('faint'),
  amber: v('amber'),
  amberBg: v('amber-bg'),
  red: v('red'),
  redBg: v('red-bg'),
};

/** Build a full 50..950 Tailwind scale from a shade -> token map. */
const scale = (map) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => [shade, term[map(shade)]])
  );

/*
 * LEGACY BRIDGE (temporary): the panels not yet restyled still use the old palette
 * (bg-surface, border-surface-border, text-slate-400, text-cyan-400, emerald/rose/purple
 * accents ...). These keys are remapped onto the new tokens so the app stays coherent
 * while the panels are restyled. Remove this whole block (and the overridden default
 * scales) once no component uses them; new code must use `term-*` only.
 */
const neutral = (s) => (s <= 200 ? 'hi' : s <= 300 ? 'fg' : s <= 400 ? 'dim' : s <= 500 ? 'faint' : s <= 700 ? 'ruleHi' : s <= 800 ? 'row' : s <= 900 ? 'raise' : 'bg');
const accent = (s) => (s <= 600 ? 'amber' : s <= 800 ? 'ruleHi' : 'amberBg');
const fault = (s) => (s <= 600 ? 'red' : s <= 800 ? 'red' : 'redBg');
const ok = (s) => (s <= 200 ? 'hi' : s <= 600 ? 'fg' : s <= 800 ? 'ruleHi' : 'row');
const legacy = {
  background: term.bg,
  surface: term.raise,
  'surface-elevated': term.row,
  'surface-border': term.rule,
  primary: { DEFAULT: term.amber, hover: term.amber },
  accent: term.amber,
  danger: term.red,
  success: term.fg,
  slate: scale(neutral),
  gray: scale(neutral),
  zinc: scale(neutral),
  cyan: scale(accent),
  sky: scale(ok),
  amber: scale(accent),
  yellow: scale(accent),
  orange: scale(accent),
  emerald: scale(ok),
  green: scale(ok),
  purple: scale(ok),
  pink: scale(ok),
  rose: scale(fault),
  red: scale(fault),
};

const mono = ['Iosevka', '"DejaVu Sans Mono"', 'monospace'];

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    // Radius 0 everywhere, no shadows, no gradients, one family.
    borderRadius: { none: '0', DEFAULT: '0', sm: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0', full: '0' },
    boxShadow: { none: 'none', DEFAULT: 'none', sm: 'none', md: 'none', lg: 'none', xl: 'none', '2xl': 'none', inner: 'none' },
    backgroundImage: {},
    fontFamily: { mono, sans: mono, serif: mono },
    extend: {
      colors: { term, ...legacy },
      fontSize: {
        base: ['12.5px', '18px'],
        big: ['34px', '36px'],
      },
      // Only the caret moves; the legacy pulse/ping/bounce utilities become no-ops.
      animation: { pulse: 'none', ping: 'none', bounce: 'none' },
      height: { strip: '34px', tabs: '28px', tool: '32px', keybar: '24px' },
      width: { hud: '330px' },
    },
  },
  plugins: [],
};
