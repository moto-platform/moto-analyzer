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
      colors: { term },
      fontSize: {
        base: ['12.5px', '18px'],
        big: ['34px', '36px'],
      },
      // Only the caret moves: pulse/ping/bounce are no-ops.
      animation: { pulse: 'none', ping: 'none', bounce: 'none' },
      height: { strip: '34px', tabs: '28px', tool: '32px', keybar: '24px' },
      width: { hud: '330px' },
    },
  },
  plugins: [],
};
