import type { CockpitTab } from '../types/can';

/** localStorage key for the last view and the HUD layout. */
export const LAYOUT_STORAGE_KEY = 'vehicle-analyzer.layout';

export interface LayoutState {
  view: CockpitTab;
  hud: boolean;
}

const VIEWS: readonly CockpitTab[] = ['trace', 'sniffer', 'oscilloscope', 'uds', 'health', 'cluster', 'sync', 'session', 'compare'];

/** The analyzer's original startup state. */
export const DEFAULT_LAYOUT: LayoutState = { view: 'trace', hud: true };

const isView = (value: unknown): value is CockpitTab => typeof value === 'string' && (VIEWS as readonly string[]).includes(value);

/** Parses a stored value; unknown fields keep their defaults. Never throws. */
export function parseLayout(raw: string | null): LayoutState {
  if (raw === null) return { ...DEFAULT_LAYOUT };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ...DEFAULT_LAYOUT };
    const value = parsed as Record<string, unknown>;
    return {
      view: isView(value.view) ? value.view : DEFAULT_LAYOUT.view,
      hud: typeof value.hud === 'boolean' ? value.hud : DEFAULT_LAYOUT.hud,
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

/** Reads the saved layout; blocked or unavailable storage behaves like a first visit. */
export function readLayout(): LayoutState {
  try {
    return parseLayout(window.localStorage.getItem(LAYOUT_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

/** Writes the layout; a blocked storage must never break the app. */
export function writeLayout(layout: LayoutState): void {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // storage blocked (private window etc.): the layout lasts for this page only
  }
}
